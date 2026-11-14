import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, Coins, Gem, Library, Percent, Swords, Trophy, Wallet, XCircle } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/server";
import { enabledCharacterWhere, toCharacterDTO } from "@/lib/characters";
import { getPlayerStats, winRate } from "@/lib/stats";
import { GAME_RULES } from "@/game/config";
import { rarityRank } from "@/game/rarity";
import { Avatar } from "@/components/ui/Avatar";
import { AvatarPicker } from "@/components/AvatarPicker";
import { CharacterCard } from "@/components/character/CharacterCard";
import { StatTile } from "@/components/ui/primitives";
import { cn, timeAgo } from "@/lib/utils";

async function loadUser(username: string) {
  return prisma.user.findUnique({
    where: { usernameKey: username.toLowerCase() },
    select: {
      id: true,
      username: true,
      avatarStyle: true,
      avatarCharacterId: true,
      avatarCharacter: { select: { imageUrl: true } },
      createdAt: true,
    },
  });
}

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
  const { username } = await params;
  return { title: `${decodeURIComponent(username)}'s profile` };
}

export default async function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const profile = await loadUser(decodeURIComponent(username));
  if (!profile) notFound();
  const viewer = await getCurrentUser();
  const isMe = viewer?.id === profile.id;

  const [[stats], owned, recent] = await Promise.all([
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
  ]);

  const showcase = owned
    .map((o) => toCharacterDTO(o.character))
    .sort((a, b) => rarityRank(b.rarity) - rarityRank(a.rarity) || (b.powerLevel ?? 0) - (a.powerLevel ?? 0))
    .slice(0, 6);
  const wr = stats ? winRate(stats.auctionWins, stats.auctionLosses) : null;

  return (
    <div className="space-y-8">
      <div className="glass-strong relative overflow-hidden rounded-3xl p-6 md:p-8 neon-border animate-slide-up">
        <div className="pointer-events-none absolute -left-20 -top-24 h-72 w-72 rounded-full bg-purple-600/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 right-0 h-72 w-72 rounded-full bg-rose-600/20 blur-3xl" />
        <div className="relative flex flex-col gap-6 md:flex-row md:items-center">
          <Avatar username={profile.username} style={profile.avatarStyle} imageUrl={profile.avatarCharacter?.imageUrl} size={112} ring="purple" />
          <div className="flex-1">
            <p className="font-display text-xs font-semibold uppercase tracking-[0.3em] text-purple-300/80">{isMe ? "Your profile" : "Bidder profile"}</p>
            <h1 className="mt-1 font-display text-4xl font-bold text-white md:text-5xl">{profile.username}</h1>
            <p className="mt-2 flex items-center gap-2 text-sm text-zinc-400">
              <CalendarDays className="h-4 w-4" /> Joined {profile.createdAt.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
            </p>
          </div>
          {isMe && (
            <div className="md:max-w-md md:flex-1">
              <AvatarPicker
                currentStyle={profile.avatarStyle}
                currentCharacterId={profile.avatarCharacterId}
                owned={owned.map((o) => ({ id: o.characterId, name: o.character.name, imageUrl: o.character.imageUrl }))}
              />
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Virtual balance" value={`$${GAME_RULES.startingBalance}`} icon={Wallet} accent="green" hint="Fresh $20 every match" />
        <StatTile label="Characters" value={stats?.characters ?? 0} icon={Library} accent="purple" hint={`${owned.reduce((s, o) => s + o.copies, 0)} copies total`} />
        <StatTile label="Auction wins" value={stats?.auctionWins ?? 0} icon={Trophy} accent="amber" />
        <StatTile label="Auction losses" value={stats?.auctionLosses ?? 0} icon={XCircle} accent="red" />
        <StatTile label="Win rate" value={wr === null ? "—" : `${Math.round(wr * 100)}%`} icon={Percent} accent="sky" hint="Of contested auctions" />
        <StatTile label="Matches won" value={`${stats?.matchesWon ?? 0}/${stats?.matchesPlayed ?? 0}`} icon={Swords} accent="purple" />
        <StatTile label="Collection score" value={stats?.collectionScore ?? 0} icon={Gem} accent="amber" />
        <StatTile label="Virtual $ spent" value={`$${stats?.totalSpent ?? 0}`} icon={Coins} accent="red" />
      </div>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-white">Showcase</h2>
          {isMe && owned.length > 0 && (
            <Link href="/collection" className="text-sm text-purple-300 hover:text-purple-200">
              Full collection →
            </Link>
          )}
        </div>
        {showcase.length === 0 ? (
          <div className="glass rounded-2xl px-6 py-10 text-center text-sm text-zinc-400">
            {isMe ? "Win your first character to start your showcase." : `${profile.username} hasn't won any characters yet.`}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {showcase.map((c) => (
              <CharacterCard key={c.id} character={c} href={`/characters/${c.id}`} />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-white">Recent auctions</h2>
          {isMe && (
            <Link href="/history" className="text-sm text-purple-300 hover:text-purple-200">
              Auction history →
            </Link>
          )}
        </div>
        {recent.length === 0 ? (
          <div className="glass rounded-2xl px-6 py-10 text-center text-sm text-zinc-400">No completed matches yet.</div>
        ) : (
          <div className="glass divide-y divide-white/5 overflow-hidden rounded-2xl">
            {recent.map((mp) => {
              const opponent = mp.match.players.find((p) => p.userId !== profile.id)?.user.username ?? "—";
              const label = mp.result === "WIN" ? "Win" : mp.result === "LOSS" ? "Loss" : mp.result === "DRAW" ? "Draw" : "Abandoned";
              return (
                <Link key={mp.id} href={`/history/${mp.match.id}`} className="flex items-center gap-4 px-5 py-3 transition hover:bg-white/[0.03]">
                  <span
                    className={cn(
                      "w-20 rounded-full px-2 py-0.5 text-center font-display text-xs font-semibold uppercase",
                      mp.result === "WIN" ? "bg-emerald-500/15 text-emerald-300" : mp.result === "LOSS" ? "bg-rose-500/15 text-rose-300" : "bg-white/5 text-zinc-400",
                    )}
                  >
                    {label}
                  </span>
                  <span className="flex-1 text-sm text-zinc-200">vs {opponent}</span>
                  <span className="text-sm text-zinc-400">
                    {mp.score} pts · ${mp.match.startingBalance - mp.balance} spent
                  </span>
                  <span className="hidden text-xs text-zinc-500 sm:block">{mp.match.endedAt ? timeAgo(mp.match.endedAt) : ""}</span>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
