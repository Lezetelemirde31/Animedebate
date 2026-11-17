import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Flame, Gavel, Sparkles, Swords, TrendingUp, Users, Zap } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/server";
import { getServerTranslations } from "@/lib/i18n-server";
import { RARITY_INFO } from "@/game/rarity";
import { POWER_TIER_INFO, formatPowerTier } from "@/game/power-tier";
import { getCharacterScaling } from "@/data/characters";
import { CharacterArt } from "@/components/character/CharacterArt";
import { AnimeBadge, RarityBadge } from "@/components/character/badges";
import { StatTile } from "@/components/ui/primitives";
import { Avatar } from "@/components/ui/Avatar";
import { SetAvatarButton } from "@/components/SetAvatarButton";
import { FavoriteButton } from "@/components/community/FavoriteButton";
import { CommentSection, type CommentItemDTO } from "@/components/community/CommentSection";
import { timeAgo } from "@/lib/utils";
import { localizeCharacter } from "@/lib/character-text";

async function load(id: string) {
  return prisma.character.findFirst({
    where: { id, enabled: true, anime: { enabled: true } },
    include: { anime: true },
  });
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const c = await load(id);
  return { title: c ? `${c.name} (${c.anime.shortName})` : "Karakter" };
}

export default async function CharacterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [loaded, { locale, t }] = await Promise.all([load(id), getServerTranslations()]);
  if (!loaded) notFound();
  const character = localizeCharacter(loaded, locale);
  const user = await getCurrentUser();
  const info = RARITY_INFO[character.rarity];
  const scaling = getCharacterScaling(character.id);
  const tierMeta = scaling ? POWER_TIER_INFO[scaling.tierCode] : null;

  const [sales, stats, owners, mine, me, myFav, comparisons, relatedDebates, commentsRaw, myCommentReactions] = await Promise.all([
    prisma.auctionLot.findMany({
      where: { characterId: id, status: "SOLD" },
      orderBy: { endedAt: "desc" },
      take: 8,
      include: {
        winner: { select: { username: true, avatarStyle: true, avatarCustomUrl: true, avatarCharacter: { select: { imageUrl: true } } } },
        _count: { select: { bids: true } },
      },
    }),
    prisma.auctionLot.aggregate({
      where: { characterId: id, status: "SOLD" },
      _count: { _all: true },
      _avg: { finalPrice: true },
      _max: { finalPrice: true },
    }),
    prisma.ownedCharacter.count({ where: { characterId: id } }),
    user ? prisma.ownedCharacter.findUnique({ where: { userId_characterId: { userId: user.id, characterId: id } } }) : null,
    user ? prisma.user.findUnique({ where: { id: user.id }, select: { avatarCharacterId: true } }) : null,
    user ? prisma.favorite.findUnique({ where: { userId_characterId: { userId: user.id, characterId: id } } }) : null,
    prisma.characterComparison.findMany({
      where: { status: { not: "HIDDEN" }, OR: [{ characterAId: id }, { characterBId: id }] },
      orderBy: { createdAt: "desc" },
      take: 4,
      include: { characterA: { select: { name: true } }, characterB: { select: { name: true } } },
    }),
    prisma.debate.findMany({
      where: { characterId: id, status: { not: "HIDDEN" } },
      orderBy: { createdAt: "desc" },
      take: 4,
    }),
    prisma.comment.findMany({
      where: { characterId: id, isDeleted: false },
      orderBy: { createdAt: "asc" },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            role: true,
            level: true,
            avatarStyle: true,
            avatarCustomUrl: true,
            avatarCharacter: { select: { imageUrl: true } },
          },
        },
      },
    }),
    user ? prisma.reaction.findMany({ where: { userId: user.id, commentId: { not: null } }, select: { commentId: true, value: true } }) : [],
  ]);

  const reactionByComment = new Map(myCommentReactions.map((r) => [r.commentId!, r.value]));
  const comments: CommentItemDTO[] = commentsRaw.map((c) => ({
    id: c.id,
    authorId: c.authorId,
    parentId: c.parentId,
    body: c.body,
    likesCount: c.likesCount,
    dislikesCount: c.dislikesCount,
    editedAt: c.editedAt ? c.editedAt.toISOString() : null,
    createdAt: c.createdAt.toISOString(),
    userReaction: reactionByComment.get(c.id) ?? null,
    author: {
      id: c.author.id,
      username: c.author.username,
      role: c.author.role,
      level: c.author.level,
      avatarStyle: c.author.avatarStyle,
      avatarImage: c.author.avatarCustomUrl ?? c.author.avatarCharacter?.imageUrl ?? null,
    },
  }));

  return (
    <div className="space-y-10">
      <div>
        <Link href="/characters" className="mb-6 inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> {t.characters.backToDb}
        </Link>
        <div className="grid gap-8 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <div className="relative mx-auto max-w-sm animate-card-enter">
              <div className="absolute -inset-6 rounded-[2.5rem] animate-pulse-glow" style={{ background: info.glow }} />
              <div className="shine relative aspect-[3/4] overflow-hidden rounded-3xl border-2 bg-ink-900" style={{ borderColor: info.color }}>
                <CharacterArt name={character.name} animeId={character.animeId} imageUrl={character.imageUrl} eager />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                <div className="absolute left-4 top-4">
                  <RarityBadge rarity={character.rarity} size="md" locale={locale} />
                </div>
              </div>
            </div>
          </div>
          <div className="space-y-6 lg:col-span-3 animate-slide-up">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <AnimeBadge animeId={character.animeId} />
                <div className="flex flex-wrap items-center gap-2">
                  <FavoriteButton
                    targetType="CHARACTER"
                    targetId={character.id}
                    initialFavorited={Boolean(myFav)}
                    signedIn={Boolean(user)}
                  />
                  <Link href={`/debates/new?character=${character.id}`} className="btn btn-ghost !px-3 !py-1.5 !text-xs">
                    <Flame className="h-3.5 w-3.5 text-rose-300" /> {t.characters.debateChar(character.name)}
                  </Link>
                </div>
              </div>
              <h1 className="mt-3 break-words font-display text-4xl font-bold text-white md:text-5xl">{character.name}</h1>
              <p className="mt-1 text-lg font-medium" style={{ color: info.color }}>
                {character.title}
              </p>
              <p className="mt-4 leading-relaxed text-zinc-300">{character.description}</p>
            </div>

            <div className="glass rounded-2xl p-5">
              <h2 className="mb-3 flex items-center gap-2 font-display text-xs font-semibold uppercase tracking-widest text-zinc-400">
                <Sparkles className="h-4 w-4 text-purple-300" /> {t.characters.abilities}
              </h2>
              <div className="flex flex-wrap gap-2">
                {character.abilities.map((a) => (
                  <span key={a} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-zinc-100">
                    {a}
                  </span>
                ))}
              </div>
              {scaling && tierMeta && (
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">{t.characters.primeFormLabel}</div>
                    <div className="mt-0.5 text-sm font-semibold text-white">{scaling.primeForm}</div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">{t.characters.powerTierLabel}</div>
                    <div className="mt-0.5 text-sm font-semibold" style={{ color: tierMeta.color }}>
                      {formatPowerTier(scaling.tierCode, locale)}
                    </div>
                  </div>
                </div>
              )}
              {character.powerLevel !== null && (
                <div className="mt-5">
                  <div className="mb-1 flex justify-between text-xs text-zinc-400">
                    <span className="flex items-center gap-1">
                      <Zap className="h-3.5 w-3.5 text-amber-300" /> {t.characters.powerLevel}
                    </span>
                    <span className="font-display font-semibold text-white">{character.powerLevel} / 100</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-white/5">
                    <div className="h-full rounded-full" style={{ width: `${character.powerLevel}%`, background: `linear-gradient(90deg, #7c3aed, ${info.color})` }} />
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatTile label={t.characters.opensAt} value={`$${info.startingPrice}`} icon={Gavel} accent="purple" hint={t.characters.scorePointsHint(info.points)} />
              <StatTile label={t.characters.timesSold} value={stats._count._all} icon={TrendingUp} accent="sky" />
              <StatTile label={t.characters.avgPrice} value={stats._avg.finalPrice ? `$${stats._avg.finalPrice.toFixed(1)}` : "—"} accent="amber" />
              <StatTile label={t.characters.collectors} value={owners} icon={Users} accent="green" />
            </div>

            {mine && (
              <div className="glass flex flex-col gap-4 rounded-2xl border-purple-500/40 p-5 neon-border sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="font-display font-semibold text-white">{t.characters.inYourCollection} {mine.copies > 1 && `· ×${mine.copies}`}</div>
                  <div className="text-sm text-zinc-400">
                    {t.characters.lastWonFor(mine.lastPrice, timeAgo(mine.lastAcquiredAt, locale))}
                  </div>
                </div>
                <SetAvatarButton characterId={character.id} active={me?.avatarCharacterId === character.id} />
              </div>
            )}

            {(comparisons.length > 0 || relatedDebates.length > 0) && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="glass rounded-2xl p-4">
                  <h2 className="mb-2 flex items-center gap-1.5 font-display text-xs font-semibold uppercase tracking-widest text-purple-300">
                    <Swords className="h-3.5 w-3.5" /> {t.characters.vsMatchups}
                  </h2>
                  {comparisons.length === 0 ? (
                    <p className="text-xs text-zinc-500">{t.characters.noVsYet}</p>
                  ) : (
                    <ul className="space-y-1.5 text-sm">
                      {comparisons.map((c) => (
                        <li key={c.id}>
                          <Link href={`/comparisons/${c.slug}`} className="text-zinc-200 hover:text-purple-200 hover:underline">
                            {c.characterA.name} vs {c.characterB.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="glass rounded-2xl p-4">
                  <h2 className="mb-2 flex items-center gap-1.5 font-display text-xs font-semibold uppercase tracking-widest text-rose-300">
                    <Flame className="h-3.5 w-3.5" /> {t.characters.relatedDebates}
                  </h2>
                  {relatedDebates.length === 0 ? (
                    <p className="text-xs text-zinc-500">{t.characters.noDebatesTagged}</p>
                  ) : (
                    <ul className="space-y-1.5 text-sm">
                      {relatedDebates.map((d) => (
                        <li key={d.id}>
                          <Link href={`/debates/${d.slug}`} className="line-clamp-1 text-zinc-200 hover:text-rose-200 hover:underline">
                            {d.title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}

            <div className="glass rounded-2xl p-5">
              <h2 className="mb-3 font-display text-xs font-semibold uppercase tracking-widest text-zinc-400">{t.characters.recentSales}</h2>
              {sales.length === 0 ? (
                <p className="text-sm text-zinc-500">{t.characters.neverSold(character.name)}</p>
              ) : (
                <ul className="divide-y divide-white/5">
                  {sales.map((s) => (
                    <li key={s.id} className="flex items-center gap-3 py-2.5">
                      {s.winner ? (
                        <Avatar username={s.winner.username} style={s.winner.avatarStyle} imageUrl={s.winner.avatarCustomUrl ?? s.winner.avatarCharacter?.imageUrl} size={30} />
                      ) : null}
                      <Link href={s.winner ? `/profile/${s.winner.username}` : "#"} className="flex-1 text-sm text-zinc-200 hover:text-white">
                        {s.winner?.username ?? t.characters.deletedUser}
                      </Link>
                      <span className="text-xs text-zinc-500">
                        {t.characters.bidsCount(s._count.bids)} · {s.endedAt ? timeAgo(s.endedAt, locale) : ""}
                      </span>
                      <span className="font-display font-bold text-white">${s.finalPrice}</span>
                    </li>
                  ))}
                </ul>
              )}
              {stats._max.finalPrice ? <p className="mt-3 text-xs text-zinc-500">{t.characters.recordPrice(stats._max.finalPrice)}</p> : null}
            </div>
          </div>
        </div>
      </div>

      <CommentSection targetType="CHARACTER" targetId={character.id} initialComments={comments} />
    </div>
  );
}
