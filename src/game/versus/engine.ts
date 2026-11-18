/**
 * Anime 1v1 — deterministic battle engine (no dice: every outcome follows
 * from the two players' decisions).
 *
 * Each turn both players secretly choose a move at the same time:
 *   Saldırı (ATTACK)  — basic hit, +1 energy
 *   Savunma (DEFEND)  — takes 35 % damage and reflects 20 % of a blocked hit, +1 energy
 *   Odaklan (FOCUS)   — +3 energy, but takes 25 % more damage this turn
 *   Yetenek (ABILITY) — one of the fighter's three techniques (energy + cooldown)
 * Faster fighters act first: a knock-out stops the slower fighter's move,
 * and a faster stun-strike interrupts it. Every fighter regains 1 energy
 * per turn (max 10). After 20 turns the healthier fighter wins.
 */
import type { AbilityDef, FighterKit } from "./kit";

export type MoveType = "ATTACK" | "DEFEND" | "FOCUS" | "ABILITY";
export interface Move {
  type: MoveType;
  abilityId?: "a1" | "a2" | "a3";
}

export const START_ENERGY = 3;
export const MAX_ENERGY = 10;
export const MAX_TURNS = 20;
const ATTACK_POWER = 1;
const BLOCK_TAKEN = 0.35;
const REFLECT = 0.2;
const FOCUS_TAKEN = 1.25;
const GUARD_BREAK_BONUS = 1.2;
const EMPOWER_BONUS = 1.6;
const COUNTER_BONUS = 1.5;
const SHIELD_SHARE = 0.25;
const HEAL_SHARE = 0.18;
const DRAIN_ENERGY = 2;

export interface FighterState {
  kit: FighterKit;
  hp: number;
  energy: number;
  cooldowns: Record<string, number>;
  shield: number;
  shieldTurns: number;
  /** Turns left in which the next damaging action is empowered. */
  empowered: number;
  /** A successful dodge: the next damaging action deals +50 %. */
  counterReady: boolean;
  /** Can't act this turn. */
  stunned: boolean;
  /** Was stunned last turn: can't be stunned again right away. */
  stunImmune: boolean;
}

export type TurnEventKind =
  | "stunned"
  | "timeout"
  | "blocked"
  | "reflected"
  | "guard_broken"
  | "evaded"
  | "counter"
  | "shield_up"
  | "shield_absorbed"
  | "empower_up"
  | "empowered_hit"
  | "vulnerable"
  | "interrupted"
  | "stun_applied"
  | "drained"
  | "healed"
  | "ko";

export interface TurnEvent {
  kind: TurnEventKind;
  amount?: number;
}

export interface TurnSide {
  /** What the player chose. */
  move: Move;
  /** Whether the move actually happened (stuns, interrupts and knock-outs cancel it). */
  acted: boolean;
  damageDealt: number;
  damageTaken: number;
  hpAfter: number;
  energyAfter: number;
  events: TurnEvent[];
}

export interface TurnLog {
  turn: number;
  sides: [TurnSide, TurnSide];
}

export type BattleResult = { winner: 0 | 1 | null; reason: "ko" | "turns" | "double_ko" } | null;

export function newFighter(kit: FighterKit): FighterState {
  return {
    kit,
    hp: kit.maxHp,
    energy: START_ENERGY,
    cooldowns: {},
    shield: 0,
    shieldTurns: 0,
    empowered: 0,
    counterReady: false,
    stunned: false,
    stunImmune: false,
  };
}

export function abilityOf(f: FighterState, id: string | undefined): AbilityDef | undefined {
  return f.kit.abilities.find((a) => a.id === id);
}

/** Why a move is not allowed right now (null = allowed). */
export function moveError(f: FighterState, move: Move): "BAD_MOVE" | "NO_ENERGY" | "ON_COOLDOWN" | null {
  if (!move || !["ATTACK", "DEFEND", "FOCUS", "ABILITY"].includes(move.type)) return "BAD_MOVE";
  if (move.type !== "ABILITY") return null;
  const ab = abilityOf(f, move.abilityId);
  if (!ab) return "BAD_MOVE";
  if ((f.cooldowns[ab.id] ?? 0) > 0) return "ON_COOLDOWN";
  if (f.energy < ab.cost) return "NO_ENERGY";
  return null;
}

/** Moves a fighter may choose this turn. */
export function legalMoves(f: FighterState): Move[] {
  const moves: Move[] = [{ type: "ATTACK" }, { type: "DEFEND" }, { type: "FOCUS" }];
  for (const ab of f.kit.abilities) {
    const m: Move = { type: "ABILITY", abilityId: ab.id };
    if (!moveError(f, m)) moves.push(m);
  }
  return moves;
}

function clone(f: FighterState): FighterState {
  return { ...f, cooldowns: { ...f.cooldowns } };
}

function damageKind(f: FighterState, move: Move | null): { power: number; ability?: AbilityDef } | null {
  if (!move) return null;
  if (move.type === "ATTACK") return { power: ATTACK_POWER };
  if (move.type !== "ABILITY") return null;
  const ab = abilityOf(f, move.abilityId)!;
  return ab.power > 0 ? { power: ab.power, ability: ab } : null;
}

/**
 * Resolves one turn. `moves[i]` is what player i chose (already validated);
 * `timedOut[i]` marks moves chosen automatically because time ran out.
 */
export function resolveTurn(
  fighters: [FighterState, FighterState],
  moves: [Move, Move],
  turn: number,
  timedOut: [boolean, boolean] = [false, false],
): { fighters: [FighterState, FighterState]; log: TurnLog } {
  const f: [FighterState, FighterState] = [clone(fighters[0]), clone(fighters[1])];
  const sides: [TurnSide, TurnSide] = [0, 1].map((i) => ({
    move: moves[i],
    acted: !f[i].stunned,
    damageDealt: 0,
    damageTaken: 0,
    hpAfter: 0,
    energyAfter: 0,
    events: [] as TurnEvent[],
  })) as [TurnSide, TurnSide];
  const ev = (i: number, kind: TurnEventKind, amount?: number) => sides[i].events.push(amount === undefined ? { kind } : { kind, amount });

  // A stunned fighter does nothing this turn.
  const act: [Move | null, Move | null] = [f[0].stunned ? null : moves[0], f[1].stunned ? null : moves[1]];
  for (const i of [0, 1]) {
    if (timedOut[i]) ev(i, "timeout");
    if (f[i].stunned) ev(i, "stunned");
  }
  const wasStunned: [boolean, boolean] = [f[0].stunned, f[1].stunned];
  const stunNext: [boolean, boolean] = [false, false];

  // 1) Costs, cooldowns and self effects.
  const evading: [boolean, boolean] = [false, false];
  for (const i of [0, 1] as const) {
    const m = act[i];
    if (m?.type !== "ABILITY") continue;
    const ab = abilityOf(f[i], m.abilityId)!;
    f[i].energy -= ab.cost;
    f[i].cooldowns[ab.id] = ab.cooldown + 1; // ticks down at the end of this turn
    if (ab.kind === "EVADE") evading[i] = true;
    if (ab.kind === "SHIELD") {
      f[i].shield = Math.round(f[i].kit.maxHp * SHIELD_SHARE);
      f[i].shieldTurns = 2;
      ev(i, "shield_up", f[i].shield);
    }
    if (ab.kind === "EMPOWER") {
      f[i].empowered = 2;
      ev(i, "empower_up");
    }
  }

  // 2) Who acts first.
  const speed = (i: 0 | 1) => {
    const m = act[i];
    const ab = m?.type === "ABILITY" ? abilityOf(f[i], m.abilityId) : undefined;
    return f[i].kit.spd + (ab?.priority ? 100 : 0);
  };
  const s0 = speed(0);
  const s1 = speed(1);
  const order: (0 | 1)[][] = s0 === s1 ? [[0, 1]] : s0 > s1 ? [[0], [1]] : [[1], [0]];

  // 3) Damage.
  const hit = (i: 0 | 1, interruptAllowed: boolean) => {
    const j = (1 - i) as 0 | 1;
    const dk = damageKind(f[i], act[i]);
    if (!dk) return { damage: 0, reflect: 0, interrupt: false };
    if (evading[j]) {
      ev(j, "evaded");
      f[j].counterReady = true;
      return { damage: 0, reflect: 0, interrupt: false };
    }
    let mult = dk.power;
    if (f[i].empowered > 0) {
      mult *= EMPOWER_BONUS;
      f[i].empowered = 0;
      ev(i, "empowered_hit");
    }
    if (f[i].counterReady) {
      mult *= COUNTER_BONUS;
      f[i].counterReady = false;
      ev(i, "counter");
    }
    let dmg = (mult * f[i].kit.atk * 100) / (100 + f[j].kit.def);
    let reflect = 0;
    const targetMove = act[j];
    if (targetMove?.type === "FOCUS") {
      dmg *= FOCUS_TAKEN;
      ev(j, "vulnerable");
    }
    if (targetMove?.type === "DEFEND") {
      if (dk.ability?.kind === "GUARD_BREAK") {
        dmg *= GUARD_BREAK_BONUS;
        ev(j, "guard_broken");
        if (!f[j].stunImmune && !wasStunned[j]) stunNext[j] = true;
      } else {
        reflect = Math.round(dmg * REFLECT);
        dmg *= BLOCK_TAKEN;
        ev(j, "blocked");
      }
    }
    dmg = Math.round(dmg);
    if (f[j].shield > 0 && dmg > 0) {
      const absorbed = Math.min(f[j].shield, dmg);
      f[j].shield -= absorbed;
      dmg -= absorbed;
      ev(j, "shield_absorbed", absorbed);
    }
    let interrupt = false;
    if (dk.ability?.kind === "STUN_STRIKE") {
      if (interruptAllowed) interrupt = true;
      else if (!f[j].stunImmune && !wasStunned[j]) stunNext[j] = true;
    }
    if (dk.ability?.kind === "DRAIN") {
      const stolen = Math.min(DRAIN_ENERGY, Math.max(0, f[j].energy));
      f[j].energy -= stolen;
      f[i].energy += stolen;
      ev(i, "drained", stolen);
    }
    return { damage: dmg, reflect, interrupt };
  };

  const apply = (i: 0 | 1, r: { damage: number; reflect: number }) => {
    const j = (1 - i) as 0 | 1;
    if (r.damage > 0) {
      f[j].hp -= r.damage;
      sides[i].damageDealt += r.damage;
      sides[j].damageTaken += r.damage;
    }
    if (r.reflect > 0) {
      f[i].hp -= r.reflect;
      sides[j].damageDealt += r.reflect;
      sides[i].damageTaken += r.reflect;
      ev(j, "reflected", r.reflect);
    }
  };

  order.forEach((group, groupIndex) => {
    if (group.length === 2) {
      const r0 = act[0] ? hit(0, false) : null;
      const r1 = act[1] ? hit(1, false) : null;
      if (r0) apply(0, r0);
      if (r1) apply(1, r1);
    } else {
      const i = group[0];
      const j = (1 - i) as 0 | 1;
      if (!act[i] || f[i].hp <= 0) return;
      // Only the fighter who acts first can interrupt; a later stun-strike stuns next turn.
      const r = hit(i, groupIndex === 0);
      apply(i, r);
      if (r.interrupt && act[j] && f[j].hp > 0) {
        act[j] = null;
        sides[j].acted = false;
        ev(j, "interrupted");
      }
      if (f[j].hp <= 0 && act[j]) {
        act[j] = null;
        sides[j].acted = false;
      }
    }
  });

  // 4) Heals and energy.
  for (const i of [0, 1] as const) {
    const m = act[i];
    if (f[i].hp > 0 && m?.type === "ABILITY") {
      const ab = abilityOf(f[i], m.abilityId)!;
      if (ab.kind === "HEAL") {
        const amount = Math.min(f[i].kit.maxHp - f[i].hp, Math.round(f[i].kit.maxHp * HEAL_SHARE));
        f[i].hp += amount;
        ev(i, "healed", amount);
      }
    }
    if (m?.type === "ATTACK" || m?.type === "DEFEND") f[i].energy += 1;
    if (m?.type === "FOCUS") f[i].energy += 3;
    f[i].energy = Math.min(MAX_ENERGY, Math.max(0, f[i].energy + 1));
  }

  // 5) End of turn.
  for (const i of [0, 1] as const) {
    for (const k of Object.keys(f[i].cooldowns)) f[i].cooldowns[k] = Math.max(0, f[i].cooldowns[k] - 1);
    if (f[i].shieldTurns > 0) {
      f[i].shieldTurns -= 1;
      if (f[i].shieldTurns === 0) f[i].shield = 0;
    }
    if (f[i].empowered > 0) f[i].empowered -= 1;
    f[i].stunImmune = wasStunned[i];
    f[i].stunned = stunNext[i];
    if (stunNext[i]) ev(i, "stun_applied");
    if (f[i].hp <= 0) ev(i, "ko");
    sides[i].hpAfter = Math.max(0, f[i].hp);
    sides[i].energyAfter = f[i].energy;
  }
  for (const i of [0, 1] as const) f[i].hp = Math.max(0, f[i].hp);
  return { fighters: f, log: { turn, sides } };
}

/** The battle's outcome after `turn` turns, or null while it goes on. */
export function battleResult(fighters: [FighterState, FighterState], turn: number): BattleResult {
  const [a, b] = fighters;
  if (a.hp <= 0 && b.hp <= 0) return { winner: null, reason: "double_ko" };
  if (a.hp <= 0) return { winner: 1, reason: "ko" };
  if (b.hp <= 0) return { winner: 0, reason: "ko" };
  if (turn >= MAX_TURNS) {
    const ra = a.hp / a.kit.maxHp;
    const rb = b.hp / b.kit.maxHp;
    if (Math.abs(ra - rb) < 1e-9) return { winner: null, reason: "turns" };
    return { winner: ra > rb ? 0 : 1, reason: "turns" };
  }
  return null;
}

// ─── Bot ──────────────────────────────────────────────────────────────────

export type BotLevel = "EASY" | "NORMAL" | "HARD";

/** How likely the opponent is to pick each move, judged from what it can do (not what it chose). */
function opponentModel(opp: FighterState, me: FighterState): { move: Move; weight: number }[] {
  return legalMoves(opp).map((m) => {
    let w = 1;
    if (m.type === "ATTACK") w = 2;
    if (m.type === "DEFEND") w = me.energy >= 5 ? 2.2 : 1.4;
    if (m.type === "FOCUS") w = opp.energy <= 2 ? 2 : 0.6;
    if (m.type === "ABILITY") {
      const ab = abilityOf(opp, m.abilityId)!;
      w = ab.ultimate ? 3 : 1.6;
      if (ab.kind === "HEAL" && opp.hp > opp.kit.maxHp * 0.7) w = 0.2;
    }
    return { move: m, weight: w };
  });
}

/** Seeded random number generator (bots vary their play; combat itself never rolls dice). */
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * The bot's move for this turn. It only looks at the open state (health,
 * energy, cooldowns) — never at the move the human chose.
 */
export function chooseBotMove(fighters: [FighterState, FighterState], botIndex: 0 | 1, level: BotLevel, turn: number, rand: () => number): Move {
  const me = fighters[botIndex];
  const opp = fighters[1 - botIndex];
  const options = legalMoves(me);
  if (me.stunned) return { type: "DEFEND" };

  if (level === "EASY") {
    // Mostly plain attacks, an occasional technique, rarely defends.
    const r = rand();
    if (r < 0.15) return { type: "DEFEND" };
    const abilities = options.filter((m) => m.type === "ABILITY");
    if (r < 0.45 && abilities.length) return abilities[Math.floor(rand() * abilities.length)];
    if (me.energy <= 1 && r < 0.6) return { type: "FOCUS" };
    return { type: "ATTACK" };
  }

  const model = opponentModel(opp, me);
  const total = model.reduce((s, m) => s + m.weight, 0);
  const scored = options.map((mine) => {
    let value = 0;
    for (const { move: theirs, weight } of model) {
      const pair: [Move, Move] = botIndex === 0 ? [mine, theirs] : [theirs, mine];
      const { fighters: next } = resolveTurn(fighters, pair, turn);
      const meN = next[botIndex];
      const oppN = next[1 - botIndex];
      let v = (opp.hp - oppN.hp) / opp.kit.maxHp - (me.hp - meN.hp) / me.kit.maxHp;
      v += (meN.energy - oppN.energy) * 0.012;
      if (oppN.hp <= 0) v += 2;
      if (meN.hp <= 0) v -= 2;
      if (oppN.stunned) v += 0.15;
      value += (v * weight) / total;
    }
    return { move: mine, value };
  });
  scored.sort((a, b) => b.value - a.value);
  if (level === "HARD") return scored[0].move;
  // NORMAL: usually the best move, sometimes the second best.
  return scored.length > 1 && rand() < 0.3 ? scored[1].move : scored[0].move;
}
