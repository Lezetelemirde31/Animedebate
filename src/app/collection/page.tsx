import type { Metadata } from "next";
import { Coins, Gem, Library, Sparkles } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/server";
import { enabledCharacterWhere, toCharacterDTO } from "@/lib/characters";
import { ENABLED_ANIME } from "@/data/anime";
import { RARITIES, RARITY_INFO } from "@/game/rarity";
import { EmptyState, PageHeader, StatTile } from "@/components/ui/primitives";
import { CharacterBrowser, type BrowserItem } from "@/components/character/CharacterBrowser";

export const metadata: Metadata = { title: "My collection" };

export default async function CollectionPage() {
  const user = await requireUser("/collection");
  const [owned, totalCharacters] = await Promise.all([
    prisma.ownedCharacter.findMany({
      where: { userId: user.id, character: enabledCharacterWhere },
      include: { character: { include: { anime: { select: { name: true, shortName: true } } } } },
    }),
    prisma.character.count({ where: enabledCharacterWhere }),
  ]);

  const items: BrowserItem[] = owned.map((o) => ({
    ...toCharacterDTO(o.character),
    owned: { copies: o.copies, lastPrice: o.lastPrice, totalSpent: o.totalSpent, acquiredAt: o.lastAcquiredAt.getTime() },
  }));
  const spent = owned.reduce((s, o) => s + o.totalSpent, 0);
  const value = owned.reduce((s, o) => s + RARITY_INFO[o.character.rarity].points, 0);
  const byRarity = [...RARITIES].reverse().map((r) => ({ r, n: owned.filter((o) => o.character.rarity === r).length }));
  const byAnime = ENABLED_ANIME.map((a) => ({ a, n: owned.filter((o) => o.character.animeId === a.id).length }));

  return (
    <>
      <PageHeader
        eyebrow="My collection"
        title={<>Your <span className="text-gradient">vault</span></>}
        description="Every character you have won at auction. Win the same character again and it stacks as an extra copy."
      />
      {owned.length === 0 ? (
        <EmptyState
          icon={Library}
          title="Your collection is empty"
          description="Win a character at auction and it will appear here forever. Each match starts you with $20 to spend."
          action={{ href: "/play", label: "Play a match" }}
        />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile label="Unique characters" value={`${owned.length}/${totalCharacters}`} icon={Library} accent="purple" />
            <StatTile label="Total copies" value={owned.reduce((s, o) => s + o.copies, 0)} icon={Sparkles} accent="sky" />
            <StatTile label="Collection score" value={value} icon={Gem} accent="amber" hint="Sum of rarity points" />
            <StatTile label="Virtual $ spent" value={`$${spent}`} icon={Coins} accent="red" />
          </div>
          <div className="mb-8 grid gap-4 md:grid-cols-2">
            <div className="glass rounded-2xl p-5">
              <h3 className="mb-3 font-display text-xs font-semibold uppercase tracking-widest text-zinc-400">By rarity</h3>
              <div className="space-y-2">
                {byRarity.map(({ r, n }) => (
                  <div key={r} className="flex items-center gap-3 text-sm">
                    <span className="w-20" style={{ color: RARITY_INFO[r].color }}>
                      {RARITY_INFO[r].label}
                    </span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
                      <div className="h-full rounded-full" style={{ width: `${(n / owned.length) * 100}%`, background: RARITY_INFO[r].color }} />
                    </div>
                    <span className="w-6 text-right text-zinc-300">{n}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="glass rounded-2xl p-5">
              <h3 className="mb-3 font-display text-xs font-semibold uppercase tracking-widest text-zinc-400">By anime</h3>
              <div className="space-y-2">
                {byAnime.map(({ a, n }) => (
                  <div key={a.id} className="flex items-center gap-3 text-sm">
                    <span className="w-28 truncate" style={{ color: a.color }}>
                      {a.shortName}
                    </span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
                      <div className="h-full rounded-full" style={{ width: `${(n / owned.length) * 100}%`, background: a.color }} />
                    </div>
                    <span className="w-6 text-right text-zinc-300">{n}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <CharacterBrowser items={items} mode="collection" />
        </>
      )}
    </>
  );
}
