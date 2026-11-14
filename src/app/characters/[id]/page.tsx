import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Gavel, Sparkles, TrendingUp, Users, Zap } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/server";
import { RARITY_INFO } from "@/game/rarity";
import { CharacterArt } from "@/components/character/CharacterArt";
import { AnimeBadge, RarityBadge } from "@/components/character/badges";
import { StatTile } from "@/components/ui/primitives";
import { Avatar } from "@/components/ui/Avatar";
import { SetAvatarButton } from "@/components/SetAvatarButton";
import { timeAgo } from "@/lib/utils";

async function load(id: string) {
  return prisma.character.findFirst({
    where: { id, enabled: true, anime: { enabled: true } },
    include: { anime: true },
  });
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const c = await load(id);
  return { title: c ? `${c.name} (${c.anime.shortName})` : "Character" };
}

export default async function CharacterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const character = await load(id);
  if (!character) notFound();
  const user = await getCurrentUser();
  const info = RARITY_INFO[character.rarity];

  const [sales, stats, owners, mine, me] = await Promise.all([
    prisma.auctionLot.findMany({
      where: { characterId: id, status: "SOLD" },
      orderBy: { endedAt: "desc" },
      take: 8,
      include: {
        winner: { select: { username: true, avatarStyle: true, avatarCharacter: { select: { imageUrl: true } } } },
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
  ]);

  return (
    <div>
      <Link href="/characters" className="mb-6 inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Character database
      </Link>
      <div className="grid gap-8 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <div className="relative mx-auto max-w-sm animate-card-enter">
            <div className="absolute -inset-6 rounded-[2.5rem] animate-pulse-glow" style={{ background: info.glow }} />
            <div className="shine relative aspect-[3/4] overflow-hidden rounded-3xl border-2 bg-ink-900" style={{ borderColor: info.color }}>
              <CharacterArt name={character.name} animeId={character.animeId} imageUrl={character.imageUrl} eager />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
              <div className="absolute left-4 top-4">
                <RarityBadge rarity={character.rarity} size="md" />
              </div>
            </div>
          </div>
        </div>
        <div className="space-y-6 lg:col-span-3 animate-slide-up">
          <div>
            <AnimeBadge animeId={character.animeId} />
            <h1 className="mt-3 font-display text-4xl font-bold text-white md:text-5xl">{character.name}</h1>
            <p className="mt-1 text-lg font-medium" style={{ color: info.color }}>
              {character.title}
            </p>
            <p className="mt-4 leading-relaxed text-zinc-300">{character.description}</p>
          </div>

          <div className="glass rounded-2xl p-5">
            <h2 className="mb-3 flex items-center gap-2 font-display text-xs font-semibold uppercase tracking-widest text-zinc-400">
              <Sparkles className="h-4 w-4 text-purple-300" /> Abilities
            </h2>
            <div className="flex flex-wrap gap-2">
              {character.abilities.map((a) => (
                <span key={a} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-zinc-100">
                  {a}
                </span>
              ))}
            </div>
            {character.powerLevel !== null && (
              <div className="mt-5">
                <div className="mb-1 flex justify-between text-xs text-zinc-400">
                  <span className="flex items-center gap-1">
                    <Zap className="h-3.5 w-3.5 text-amber-300" /> Power level
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
            <StatTile label="Opens at" value={`$${info.startingPrice}`} icon={Gavel} accent="purple" hint={`${info.points} score points`} />
            <StatTile label="Times sold" value={stats._count._all} icon={TrendingUp} accent="sky" />
            <StatTile label="Avg price" value={stats._avg.finalPrice ? `$${stats._avg.finalPrice.toFixed(1)}` : "—"} accent="amber" />
            <StatTile label="Collectors" value={owners} icon={Users} accent="green" />
          </div>

          {mine && (
            <div className="glass flex flex-col gap-4 rounded-2xl border-purple-500/40 p-5 neon-border sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="font-display font-semibold text-white">In your collection {mine.copies > 1 && `· ×${mine.copies}`}</div>
                <div className="text-sm text-zinc-400">
                  Last won for ${mine.lastPrice} · {timeAgo(mine.lastAcquiredAt)}
                </div>
              </div>
              <SetAvatarButton characterId={character.id} active={me?.avatarCharacterId === character.id} />
            </div>
          )}

          <div className="glass rounded-2xl p-5">
            <h2 className="mb-3 font-display text-xs font-semibold uppercase tracking-widest text-zinc-400">Recent sales</h2>
            {sales.length === 0 ? (
              <p className="text-sm text-zinc-500">
                {character.name} hasn&apos;t been sold yet. Be the first to win them.
              </p>
            ) : (
              <ul className="divide-y divide-white/5">
                {sales.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 py-2.5">
                    {s.winner ? (
                      <Avatar username={s.winner.username} style={s.winner.avatarStyle} imageUrl={s.winner.avatarCharacter?.imageUrl} size={30} />
                    ) : null}
                    <Link href={s.winner ? `/profile/${s.winner.username}` : "#"} className="flex-1 text-sm text-zinc-200 hover:text-white">
                      {s.winner?.username ?? "Deleted user"}
                    </Link>
                    <span className="text-xs text-zinc-500">{s._count.bids} bids · {s.endedAt ? timeAgo(s.endedAt) : ""}</span>
                    <span className="font-display font-bold text-white">${s.finalPrice}</span>
                  </li>
                ))}
              </ul>
            )}
            {stats._max.finalPrice ? <p className="mt-3 text-xs text-zinc-500">Record price: ${stats._max.finalPrice}</p> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
