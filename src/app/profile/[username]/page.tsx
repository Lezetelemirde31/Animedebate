import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Award,
  CalendarDays,
  Coins,
  Flame,
  Gem,
  Heart,
  Library,
  MessageSquare,
  Percent,
  Shield,
  Swords,
  Trophy,
  Wallet,
  XCircle,
  Zap,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/server";
import { enabledCharacterWhere, toCharacterDTO } from "@/lib/characters";
import { xpBoundsForLevel } from "@/lib/gamification";
import { BADGE_TEXT } from "@/lib/i18n";
import { getServerTranslations } from "@/lib/i18n-server";
import { getPlayerStats, winRate } from "@/lib/stats";
import { GAME_RULES } from "@/game/config";
import { rankProgress } from "@/game/ranks";
import { RankBadge } from "@/components/progression/RankBadge";
import { rarityRank } from "@/game/rarity";
import { Avatar } from "@/components/ui/Avatar";
import { AvatarPicker } from "@/components/AvatarPicker";
import { ProfileSettingsPanel } from "@/components/ProfileSettingsPanel";
import { BadgePill } from "@/components/community/BadgePill";
import { CharacterCard } from "@/components/character/CharacterCard";
import { StatTile } from "@/components/ui/primitives";
import { cn, timeAgo } from "@/lib/utils";

async function loadUser(username: string) {
  return prisma.user.findUnique({
    where: { usernameKey: username.toLowerCase() },
    select: {
      id: true,
      username: true,
      role: true,
      bio: true,
      coins: true,
      xp: true,
      level: true,
      debatesCount: true,
      comparisonsCount: true,
      commentsCount: true,
      likesReceived: true,
      avatarStyle: true,
      avatarCharacterId: true,
      avatarCustomUrl: true,
      avatarCharacter: { select: { imageUrl: true } },
      createdAt: true,
    },
  });
}

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
  const { username } = await params;
  return { title: decodeURIComponent(username) };
}

export default async function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const [{ username }, { locale, t }] = await Promise.all([params, getServerTranslations()]);
  const profile = await loadUser(decodeURIComponent(username));
  if (!profile) notFound();
  const viewer = await getCurrentUser();
  const isMe = viewer?.id === profile.id;

  const [[stats], owned, recent, userBadges, userDebates, userComparisons] = await Promise.all([
    getPlayerStats({ userId: profile.id }),
    prisma.ownedCharacter.findMany({
      where: { userId: profile.id, character: enabledCharacterWhere },
      include: { character: { include: { anime: { select: { name: true, shortName: true } } } } },
    }),
    prisma.matchPlayer.findMany({
      where: { userId: profile.id, match: { status: { in: ["FINISHED", "ABANDONED"] } } },
      orderBy: { match: { endedAt: "desc" } },
      take: 6,
      include: {
        match: {
          select: {
            id: true,
            code: true,
            endedAt: true,
            endReason: true,
            startingBalance: true,
            players: { select: { userId: true, user: { select: { username: true } } } },
          },
        },
      },
    }),
    prisma.userBadge.findMany({
      where: { userId: profile.id },
      include: { badge: true },
      orderBy: { awardedAt: "desc" },
    }),
    prisma.debate.findMany({
      where: { authorId: profile.id, status: { not: "HIDDEN" } },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
    prisma.characterComparison.findMany({
      where: { authorId: profile.id, status: { not: "HIDDEN" } },
      orderBy: { createdAt: "desc" },
      take: 6,
      include: {
        characterA: { select: { name: true } },
        characterB: { select: { name: true } },
      },
    }),
  ]);

  const showcase = owned
    .map((o) => toCharacterDTO(o.character))
    .sort((a, b) => rarityRank(b.rarity) - rarityRank(a.rarity) || (b.powerLevel ?? 0) - (a.powerLevel ?? 0))
    .slice(0, 6);
  const wr = stats ? winRate(stats.auctionWins, stats.auctionLosses) : null;
  const bounds = xpBoundsForLevel(profile.level);
  const rankInfo = rankProgress(profile.xp, profile.level);
  const coinHistory = isMe
    ? await prisma.coinEvent.findMany({ where: { userId: profile.id }, orderBy: { createdAt: "desc" }, take: 12 })
    : [];
  const levelPct = Math.min(
    100,
    Math.max(0, Math.round(((profile.xp - bounds.currentLevelXp) / Math.max(1, bounds.nextLevelXp - bounds.currentLevelXp)) * 100)),
  );
  const avatarImg = profile.avatarCustomUrl ?? profile.avatarCharacter?.imageUrl ?? null;
  const joinedStr = profile.createdAt.toLocaleDateString(locale === "tr" ? "tr-TR" : "en-US", { month: "long", year: "numeric" });

  return (
    <div className="space-y-8">
      <div className="glass-strong relative overflow-hidden rounded-3xl p-6 md:p-8 neon-border animate-slide-up">
        <div className="pointer-events-none absolute -left-20 -top-24 h-72 w-72 rounded-full bg-purple-600/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 right-0 h-72 w-72 rounded-full bg-rose-600/20 blur-3xl" />
        <div className="relative flex flex-col gap-6 md:flex-row md:items-center">
          <Avatar username={profile.username} style={profile.avatarStyle} imageUrl={avatarImg} size={112} ring="purple" />
          <div className="flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-display text-xs font-semibold uppercase tracking-[0.3em] text-purple-300/80">
                {isMe ? t.profile.yourProfile : t.profile.communityProfile}
              </p>
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-500/15 px-2.5 py-0.5 font-display text-xs font-bold text-amber-200">
                <Zap className="h-3 w-3" /> {t.profile.levelLabel(profile.level)} · {profile.xp} XP
              </span>
              <RankBadge level={profile.level} locale={locale} />
              {(profile.role === "ADMIN" || profile.role === "MODERATOR") && (
                <span className="inline-flex items-center gap-1 rounded-full border border-rose-400/40 bg-rose-500/15 px-2.5 py-0.5 font-display text-xs font-bold text-rose-200">
                  <Shield className="h-3 w-3" /> {profile.role}
                </span>
              )}
            </div>
            <h1 className="break-words font-display text-4xl font-bold text-white md:text-5xl">{profile.username}</h1>
            {profile.bio && <p className="max-w-xl text-sm text-zinc-300">{profile.bio}</p>}

            {/* Level XP Bar */}
            <div className="max-w-md pt-1">
              <div className="mb-1 flex justify-between text-[11px] text-zinc-400">
                <span>{t.profile.levelProgress(profile.level)}</span>
                <span>
                  {profile.xp} / {bounds.nextLevelXp} XP
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-purple-500 via-fuchsia-500 to-rose-500"
                  style={{ width: `${levelPct}%` }}
                />
              </div>
            </div>

            <div className="max-w-md">
              <div className="mb-1 flex justify-between gap-2 text-[11px] text-zinc-400">
                <span>{rankInfo.next ? t.progression.nextRank(rankInfo.next.name[locale], rankInfo.xpToNext) : t.progression.maxRank}</span>
                <Link href="/ranks" className="shrink-0 text-purple-300 hover:text-purple-200">
                  {t.progression.ranksLink}
                </Link>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full" style={{ width: `${Math.round(rankInfo.ratio * 100)}%`, background: rankInfo.rank.color }} />
              </div>
            </div>

            <p className="flex items-center gap-2 text-xs text-zinc-400">
              <CalendarDays className="h-4 w-4" /> {t.profile.joinedLabel(joinedStr)}
            </p>
          </div>
          {isMe && (
            <div className="flex flex-col gap-2 md:max-w-md">
              <AvatarPicker
                currentStyle={profile.avatarStyle}
                currentCharacterId={profile.avatarCharacterId}
                owned={owned.map((o) => ({ id: o.characterId, name: o.character.name, imageUrl: o.character.imageUrl }))}
              />
            </div>
          )}
        </div>
      </div>

      {isMe && <ProfileSettingsPanel currentUsername={profile.username} currentBio={profile.bio} />}

      {/* Badges */}
      <section className="glass rounded-3xl p-6">
        <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-widest text-zinc-300">
          <Award className="h-4 w-4 text-amber-300" /> {t.profile.earnedBadges(userBadges.length)}
        </h2>
        {userBadges.length === 0 ? (
          <p className="text-sm text-zinc-500">{t.profile.noBadges}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {userBadges.map((ub) => {
              const locBadge = BADGE_TEXT[locale][ub.badge.slug];
              return (
                <BadgePill
                  key={ub.id}
                  name={locBadge?.name ?? ub.badge.name}
                  description={locBadge?.description ?? ub.badge.description}
                  icon={ub.badge.icon}
                  color={ub.badge.color}
                />
              );
            })}
          </div>
        )}
      </section>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label={t.progression.coins} value={`${profile.coins} ${t.progression.coinsShort}`} icon={Coins} accent="amber" hint={t.progression.coinsHint} />
        <StatTile label={t.profile.debatesStat} value={profile.debatesCount} icon={Flame} accent="red" />
        <StatTile label={t.profile.vsStat} value={profile.comparisonsCount} icon={Swords} accent="purple" />
        <StatTile label={t.profile.commentsStat} value={profile.commentsCount} icon={MessageSquare} accent="sky" />
        <StatTile label={t.profile.likesStat} value={profile.likesReceived} icon={Heart} accent="amber" />
        <StatTile label={t.profile.virtualBalance} value={`$${GAME_RULES.startingBalance}`} icon={Wallet} accent="green" hint={t.profile.virtualBalanceHint} />
        <StatTile label={t.profile.charactersStat} value={stats?.characters ?? 0} icon={Library} accent="purple" hint={t.profile.copiesHint(owned.reduce((s, o) => s + o.copies, 0))} />
        <StatTile label={t.profile.auctionWins} value={stats?.auctionWins ?? 0} icon={Trophy} accent="amber" />
        <StatTile label={t.profile.auctionLosses} value={stats?.auctionLosses ?? 0} icon={XCircle} accent="red" />
        <StatTile label={t.profile.winRate} value={wr === null ? "—" : `${Math.round(wr * 100)}%`} icon={Percent} accent="sky" />
        <StatTile label={t.profile.matchesWon} value={`${stats?.matchesWon ?? 0}/${stats?.matchesPlayed ?? 0}`} icon={Swords} accent="purple" />
        <StatTile label={t.profile.collectionScore} value={stats?.collectionScore ?? 0} icon={Gem} accent="amber" />
        <StatTile label={t.profile.virtualSpent} value={`$${stats?.totalSpent ?? 0}`} icon={Coins} accent="red" />
      </div>

      {isMe && (
        <section className="glass rounded-3xl p-6" data-testid="coin-history">
          <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-widest text-zinc-300">
            <Coins className="h-4 w-4 text-amber-300" /> {t.progression.coinHistory}
          </h2>
          {coinHistory.length === 0 ? (
            <p className="text-sm text-zinc-500">{t.progression.noCoinHistory}</p>
          ) : (
            <ul className="divide-y divide-white/5 text-sm">
              {coinHistory.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="text-zinc-300">{t.progression.reasons[e.reason] ?? t.progression.reasons.COMMUNITY}</span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="text-xs text-zinc-500">{timeAgo(e.createdAt, locale)}</span>
                    <span className={cn("font-display font-bold", e.amount >= 0 ? "text-amber-200" : "text-rose-300")}>
                      {e.amount >= 0 ? "+" : ""}
                      {e.amount} {t.progression.coinsShort}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Created Debates & Comparisons */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-xl font-bold text-white">{t.profile.debatesBy(profile.username)}</h2>
            <Link href="/debates" className="text-sm text-purple-300 hover:text-purple-200">
              {t.profile.allDebatesLink}
            </Link>
          </div>
          {userDebates.length === 0 ? (
            <div className="glass rounded-2xl p-6 text-center text-sm text-zinc-500">{t.profile.noDebatesOpened}</div>
          ) : (
            <div className="space-y-2.5">
              {userDebates.map((d) => (
                <Link key={d.id} href={`/debates/${d.slug}`} className="glass block rounded-2xl p-4 transition hover:border-purple-500/30">
                  <div className="font-display font-semibold text-white">{d.title}</div>
                  <div className="mt-1 text-xs text-zinc-400">
                    {t.profile.likesCount(d.likesCount)} · {t.profile.commentsCount(d.commentsCount)} · {timeAgo(d.createdAt, locale)}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-xl font-bold text-white">{t.profile.vsBy(profile.username)}</h2>
            <Link href="/comparisons" className="text-sm text-purple-300 hover:text-purple-200">
              {t.profile.vsArenaLink}
            </Link>
          </div>
          {userComparisons.length === 0 ? (
            <div className="glass rounded-2xl p-6 text-center text-sm text-zinc-500">{t.profile.noVsCreated}</div>
          ) : (
            <div className="space-y-2.5">
              {userComparisons.map((c) => (
                <Link key={c.id} href={`/comparisons/${c.slug}`} className="glass block rounded-2xl p-4 transition hover:border-purple-500/30">
                  <div className="font-display font-semibold text-white">{c.title}</div>
                  <div className="mt-1 text-xs text-zinc-400">
                    {c.characterA.name} vs {c.characterB.name} · {t.profile.votesCount(c.votesACount + c.votesBCount)}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Showcase */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-white">{t.profile.auctionShowcase}</h2>
          {isMe && owned.length > 0 && (
            <Link href="/collection" className="text-sm text-purple-300 hover:text-purple-200">
              {t.profile.fullCollectionLink}
            </Link>
          )}
        </div>
        {showcase.length === 0 ? (
          <div className="glass rounded-2xl px-6 py-10 text-center text-sm text-zinc-400">
            {isMe ? t.profile.noCharsOwn : t.profile.noCharsOther(profile.username)}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {showcase.map((c) => (
              <CharacterCard key={c.id} character={c} href={`/characters/${c.id}`} locale={locale} />
            ))}
          </div>
        )}
      </section>

      {/* Recent auctions */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-white">{t.profile.recentAuctions}</h2>
          {isMe && (
            <Link href="/history" className="text-sm text-purple-300 hover:text-purple-200">
              {t.profile.auctionHistoryLink}
            </Link>
          )}
        </div>
        {recent.length === 0 ? (
          <div className="glass rounded-2xl px-6 py-10 text-center text-sm text-zinc-400">{t.profile.noMatchesYet}</div>
        ) : (
          <div className="glass divide-y divide-white/5 overflow-hidden rounded-2xl">
            {recent.map((mp) => {
              const opponent = mp.match.players.find((p) => p.userId !== profile.id)?.user.username ?? "—";
              const label = mp.result === "WIN" ? t.profile.win : mp.result === "LOSS" ? t.profile.loss : mp.result === "DRAW" ? t.profile.draw : t.profile.abandoned;
              return (
                <Link key={mp.id} href={`/history/${mp.match.id}`} className="flex items-center gap-4 px-5 py-3 transition hover:bg-white/[0.03]">
                  <span
                    className={cn(
                      "w-24 rounded-full px-2 py-0.5 text-center font-display text-xs font-semibold uppercase",
                      mp.result === "WIN" ? "bg-emerald-500/15 text-emerald-300" : mp.result === "LOSS" ? "bg-rose-500/15 text-rose-300" : "bg-white/5 text-zinc-400",
                    )}
                  >
                    {label}
                  </span>
                  <span className="flex-1 text-sm text-zinc-200">vs {opponent}</span>
                  <span className="text-sm text-zinc-400">{t.profile.ptsSpent(mp.score, mp.match.startingBalance - mp.balance)}</span>
                  <span className="hidden text-xs text-zinc-500 sm:block">{mp.match.endedAt ? timeAgo(mp.match.endedAt, locale) : ""}</span>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
