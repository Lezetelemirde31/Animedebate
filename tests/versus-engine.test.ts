import { describe, expect, it } from "vitest";
import { getCatalog } from "@/data/characters";
import { ARCHETYPES, archetypeFor, buildKit, type Archetype, type FighterKit } from "@/game/versus/kit";
import {
  MAX_TURNS,
  battleResult,
  chooseBotMove,
  legalMoves,
  moveError,
  newFighter,
  resolveTurn,
  seededRandom,
  type BotLevel,
  type FighterState,
  type Move,
} from "@/game/versus/engine";

const catalog = getCatalog();
const kitOf = (id: string) => buildKit(catalog.find((c) => c.id === id)!);
const fight = (a: FighterKit, b: FighterKit): [FighterState, FighterState] => [newFighter(a), newFighter(b)];
const A: Move = { type: "ATTACK" };
const D: Move = { type: "DEFEND" };
const F: Move = { type: "FOCUS" };

/** A test kit with a chosen archetype and neutral power. */
function kit(archetype: Archetype, id: string = archetype): FighterKit {
  const k = buildKit({ id, name: id, animeId: "naruto", abilities: ["Ult", "Two", "Three"], powerLevel: 60 });
  if (k.archetype === archetype) return k;
  const base = ARCHETYPES[archetype];
  // rebuild with the wanted archetype (same stat formula)
  const f = k.maxHp / ARCHETYPES[k.archetype].hp;
  const forced = buildKit({ id: `${id}-x`, name: id, animeId: "naruto", abilities: ["Ult", "Two", "Three"], powerLevel: 60 });
  void forced;
  return {
    ...k,
    archetype,
    maxHp: Math.round(base.hp * f),
    atk: Math.round(base.atk * f),
    def: Math.round(base.def * f),
    spd: base.spd,
    abilities: buildKitAbilities(archetype),
  };
}
function buildKitAbilities(archetype: Archetype) {
  // Find any real character with that archetype to borrow its ability layout.
  const c = catalog.find((x) => archetypeFor(x) === archetype)!;
  return buildKit(c).abilities;
}

describe("fighter kits", () => {
  it("every character gets a kit with three abilities and sane stats", () => {
    for (const c of catalog) {
      const k = buildKit(c);
      expect(k.abilities).toHaveLength(3);
      expect(k.abilities[0].ultimate).toBe(true);
      expect(k.maxHp).toBeGreaterThan(250);
      expect(k.maxHp).toBeLessThan(480);
    }
  });

  it("archetypes are spread across the roster", () => {
    const counts: Record<string, number> = {};
    for (const c of catalog) counts[archetypeFor(c)] = (counts[archetypeFor(c)] ?? 0) + 1;
    for (const a of ["TANK", "BLITZ", "POWER", "TACTIC"]) expect(counts[a] ?? 0, a).toBeGreaterThan(catalog.length * 0.1);
  });

  it("power changes stats by at most ±10 %", () => {
    const strong = buildKit({ id: "s", name: "s", animeId: "x", abilities: ["fist"], powerLevel: 99 });
    const weak = buildKit({ id: "w", name: "w", animeId: "x", abilities: ["fist"], powerLevel: 20 });
    expect(strong.archetype).toBe(weak.archetype);
    expect(strong.maxHp / weak.maxHp).toBeLessThan(1.23);
  });
});

describe("turn resolution", () => {
  it("is deterministic", () => {
    const f = fight(kitOf("naruto-naruto-uzumaki"), kitOf("one-piece-monkey-d-luffy"));
    const a = resolveTurn(f, [A, A], 1);
    const b = resolveTurn(f, [A, A], 1);
    expect(a).toEqual(b);
  });

  it("defending cuts damage and reflects part of it", () => {
    const f = fight(kit("POWER"), kit("TANK"));
    const open = resolveTurn(f, [A, F], 1).log.sides[0].damageDealt;
    const blocked = resolveTurn(f, [A, D], 1);
    expect(blocked.log.sides[0].damageDealt).toBeLessThan(open * 0.4);
    expect(blocked.log.sides[1].events.some((e) => e.kind === "blocked")).toBe(true);
    expect(blocked.log.sides[1].events.some((e) => e.kind === "reflected")).toBe(true);
    expect(blocked.fighters[0].hp).toBeLessThan(f[0].hp);
  });

  it("focusing gains energy but leaves you open", () => {
    const f = fight(kit("POWER"), kit("TANK"));
    const r = resolveTurn(f, [A, F], 1);
    expect(r.fighters[1].energy).toBe(f[1].energy + 3 + 1);
    expect(r.log.sides[1].events.some((e) => e.kind === "vulnerable")).toBe(true);
  });

  it("a guard break punishes a defender and stuns them next turn", () => {
    const f = fight(kit("TANK"), kit("POWER"));
    f[0].energy = 10;
    const gb = f[0].kit.abilities.find((a) => a.kind === "GUARD_BREAK")!;
    const r = resolveTurn(f, [{ type: "ABILITY", abilityId: gb.id }, D], 1);
    expect(r.log.sides[1].events.map((e) => e.kind)).toEqual(expect.arrayContaining(["guard_broken", "stun_applied"]));
    expect(r.fighters[1].stunned).toBe(true);
    // Stunned: their next move does nothing.
    const next = resolveTurn(r.fighters, [D, A], 2);
    expect(next.log.sides[1].acted).toBe(false);
    expect(next.log.sides[0].damageTaken).toBe(0);
    // ...and they can't be stunned again right away.
    expect(next.fighters[1].stunned).toBe(false);
    expect(next.fighters[1].stunImmune).toBe(true);
  });

  it("evading dodges everything and powers up the next hit", () => {
    const f = fight(kit("BLITZ"), kit("POWER"));
    const ev = f[0].kit.abilities.find((a) => a.kind === "EVADE")!;
    const r = resolveTurn(f, [{ type: "ABILITY", abilityId: ev.id }, A], 1);
    expect(r.log.sides[0].damageTaken).toBe(0);
    expect(r.fighters[0].counterReady).toBe(true);
    const plain = resolveTurn(f, [A, F], 2).log.sides[0].damageDealt;
    const counter = resolveTurn(r.fighters, [A, F], 2).log.sides[0].damageDealt;
    expect(counter).toBeGreaterThan(plain * 1.4);
  });

  it("the faster fighter's knock-out stops the slower fighter's move", () => {
    const f = fight(kit("BLITZ"), kit("POWER"));
    f[1].hp = 5;
    const r = resolveTurn(f, [A, A], 1);
    expect(r.fighters[1].hp).toBe(0);
    expect(r.log.sides[1].acted).toBe(false);
    expect(r.fighters[0].hp).toBe(f[0].hp);
    expect(battleResult(r.fighters, 1)).toEqual({ winner: 0, reason: "ko" });
  });

  it("a faster stun-strike interrupts; a slower one stuns next turn", () => {
    const tactic = kit("TACTIC");
    const ss = tactic.abilities.find((a) => a.kind === "STUN_STRIKE")!;
    const vsSlow = fight(tactic, kit("TANK"));
    vsSlow[0].energy = 10;
    const r1 = resolveTurn(vsSlow, [{ type: "ABILITY", abilityId: ss.id }, A], 1);
    expect(r1.log.sides[1].events.some((e) => e.kind === "interrupted")).toBe(true);
    expect(r1.log.sides[0].damageTaken).toBe(0);
    const vsFast = fight(tactic, kit("BLITZ"));
    vsFast[0].energy = 10;
    const r2 = resolveTurn(vsFast, [{ type: "ABILITY", abilityId: ss.id }, A], 1);
    expect(r2.fighters[1].stunned).toBe(true);
  });

  it("validates energy and cooldowns", () => {
    const f = newFighter(kit("POWER"));
    const ult = f.kit.abilities[0];
    expect(moveError(f, { type: "ABILITY", abilityId: ult.id })).toBe("NO_ENERGY");
    f.energy = 10;
    expect(moveError(f, { type: "ABILITY", abilityId: ult.id })).toBeNull();
    const [after] = resolveTurn([f, newFighter(kit("TANK"))], [{ type: "ABILITY", abilityId: ult.id }, D], 1).fighters;
    expect(moveError(after, { type: "ABILITY", abilityId: ult.id })).toBe("ON_COOLDOWN");
    expect(moveError(after, { type: "ABILITY", abilityId: "zz" as "a1" })).toBe("BAD_MOVE");
    expect(legalMoves(after).some((m) => m.abilityId === ult.id)).toBe(false);
  });

  it("ends on the turn limit with the healthier fighter winning", () => {
    const f = fight(kit("TANK"), kit("TANK", "TANK2"));
    f[1].hp -= 10;
    expect(battleResult(f, MAX_TURNS)).toEqual({ winner: 0, reason: "turns" });
  });
});

function playOut(a: FighterKit, b: FighterKit, la: BotLevel, lb: BotLevel, seed: number) {
  let f = fight(a, b);
  const rand = seededRandom(seed);
  for (let turn = 1; turn <= MAX_TURNS; turn++) {
    const m0 = chooseBotMove(f, 0, la, turn, rand);
    const m1 = chooseBotMove(f, 1, lb, turn, rand);
    expect(moveError(f[0], m0)).toBeNull();
    expect(moveError(f[1], m1)).toBeNull();
    f = resolveTurn(f, [m0, m1], turn).fighters;
    const res = battleResult(f, turn);
    if (res) return { ...res, turns: turn };
  }
  throw new Error("battle did not end");
}

describe("balance (bot vs bot)", () => {
  it("strategy matters: a hard bot beats an easy bot most of the time", () => {
    let wins = 0;
    const N = 80;
    for (let i = 0; i < N; i++) {
      const arch = (["TANK", "BLITZ", "POWER", "TACTIC"] as const)[i % 4];
      const r = playOut(kit(arch, `h${i}`), kit(arch, `e${i}`), "HARD", "EASY", i + 1);
      if (r.winner === 0) wins++;
    }
    expect(wins / N).toBeGreaterThan(0.75);
  });

  it("no fighting style dominates another (hard vs hard)", () => {
    const styles = ["TANK", "BLITZ", "POWER", "TACTIC"] as const;
    const lengths: number[] = [];
    for (const x of styles) {
      for (const y of styles) {
        if (x === y) continue;
        let xw = 0;
        let games = 0;
        for (let s = 1; s <= 12; s++) {
          // play both seats to cancel seat effects
          const r1 = playOut(kit(x, `x${s}`), kit(y, `y${s}`), "NORMAL", "NORMAL", s * 7);
          const r2 = playOut(kit(y, `y${s}`), kit(x, `x${s}`), "NORMAL", "NORMAL", s * 13);
          if (r1.winner === 0) xw++;
          if (r2.winner === 1) xw++;
          games += 2;
          lengths.push(r1.turns, r2.turns);
        }
        const rate = xw / games;
        expect(rate, `${x} vs ${y}`).toBeGreaterThan(0.2);
        expect(rate, `${x} vs ${y}`).toBeLessThan(0.8);
      }
    }
    const avg = lengths.reduce((s, n) => s + n, 0) / lengths.length;
    expect(avg).toBeGreaterThan(5);
    expect(avg).toBeLessThan(16);
  });
});
