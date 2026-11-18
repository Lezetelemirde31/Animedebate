/**
 * Anime 1v1 — fighter kits.
 *
 * Every character gets a fighting style (archetype), stats and three
 * abilities. Stats come from the archetype and are nudged by the
 * character's power (±10 %), so stronger characters have an edge but the
 * fight is decided by decisions, not by the character list.
 */

export type Archetype = "TANK" | "BLITZ" | "POWER" | "TACTIC";

export type AbilityKind =
  /** Plain damage. */
  | "STRIKE"
  /** Damage that ignores Defend; breaking a guard stuns the target next turn. */
  | "GUARD_BREAK"
  /** Absorbs damage this turn and next. */
  | "SHIELD"
  /** Dodges all damage this turn; a successful dodge powers up your next hit. */
  | "EVADE"
  /** Your next damaging action this or next turn deals +60 %. */
  | "EMPOWER"
  /** Damage and steals energy. */
  | "DRAIN"
  /** Damage; if you are faster it interrupts the target's action this turn, otherwise it stuns them next turn. */
  | "STUN_STRIKE"
  /** Restores health. */
  | "HEAL";

export interface AbilityDef {
  id: "a1" | "a2" | "a3";
  /** The character's own technique name (English; localized in the UI). */
  name: string;
  /** Index into the character's ability list (for the localized name). */
  nameIndex: number;
  kind: AbilityKind;
  cost: number;
  /** Turns before it can be used again. */
  cooldown: number;
  /** Damage multiplier (0 for non-damaging). */
  power: number;
  /** Acts before normal moves when both sides are equally fast. */
  priority?: boolean;
  /** Ultimate: the character's signature move. */
  ultimate?: boolean;
}

export interface FighterKit {
  characterId: string;
  name: string;
  animeId: string;
  imageUrl: string | null;
  archetype: Archetype;
  maxHp: number;
  atk: number;
  def: number;
  spd: number;
  abilities: AbilityDef[];
}

export interface CharacterInput {
  id: string;
  name: string;
  animeId: string;
  imageUrl?: string | null;
  title?: string;
  description?: string;
  abilities: string[];
  powerLevel: number | null;
}

export const ARCHETYPES: Record<Archetype, { hp: number; atk: number; def: number; spd: number }> = {
  TANK: { hp: 405, atk: 48, def: 46, spd: 3 },
  BLITZ: { hp: 310, atk: 56, def: 31, spd: 9 },
  POWER: { hp: 345, atk: 62, def: 35, spd: 5 },
  TACTIC: { hp: 330, atk: 55, def: 38, spd: 6 },
};

type Template = Omit<AbilityDef, "id" | "name" | "nameIndex">;

/** Ability slots per archetype: a1 is always the signature ultimate. */
const TEMPLATES: Record<Archetype, [Template, Template, Template]> = {
  TANK: [
    { kind: "STRIKE", cost: 6, cooldown: 3, power: 2.4, ultimate: true },
    { kind: "SHIELD", cost: 3, cooldown: 2, power: 0 },
    { kind: "GUARD_BREAK", cost: 3, cooldown: 2, power: 1.2 },
  ],
  BLITZ: [
    { kind: "STRIKE", cost: 5, cooldown: 3, power: 2.2, ultimate: true },
    { kind: "EVADE", cost: 2, cooldown: 2, power: 0 },
    { kind: "STRIKE", cost: 2, cooldown: 1, power: 1.5, priority: true },
  ],
  POWER: [
    { kind: "STRIKE", cost: 7, cooldown: 3, power: 2.8, ultimate: true },
    { kind: "EMPOWER", cost: 2, cooldown: 2, power: 0 },
    { kind: "GUARD_BREAK", cost: 4, cooldown: 2, power: 1.4 },
  ],
  TACTIC: [
    { kind: "STUN_STRIKE", cost: 6, cooldown: 4, power: 1.8, ultimate: true },
    { kind: "DRAIN", cost: 3, cooldown: 2, power: 0.9 },
    { kind: "HEAL", cost: 4, cooldown: 3, power: 0 },
  ],
};

const KEYWORDS: Record<Archetype, RegExp> = {
  TANK: /armor|armou?r|shield|defen[cs]e|iron|harden|barrier|durab|wall|regenerat|endur|immortal|toughness|fortress|tolerance|body|absolute defense|tank/i,
  BLITZ: /speed|flash|lightning|light speed|shunpo|sonído|sonido|raij|teleport|agility|kick|blitz|swift|vanish|step|wind|dash|thunder|gate/i,
  POWER: /fist|punch|strength|bomb|destroy|cannon|explo|smash|crush|impact|brute|giant|beast|rampage|haymaker|quake|eruption|flame|fire|magma|devil|demon|slash|blade|sword|tailed/i,
  TACTIC: /genjutsu|illusion|strateg|tactic|mind|shadow|poison|venom|seal|sens|observation|puppet|control|hypno|future|foresight|time|space|string|thread|mirror|gravity|curse|knowledge|manipulat|heal|medical|summon/i,
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Fighting style from the character's own techniques and description. */
export function archetypeFor(c: CharacterInput): Archetype {
  const text = [c.title ?? "", ...c.abilities, c.abilities.join(" "), c.description ?? ""].join(" ");
  const scores = (Object.keys(KEYWORDS) as Archetype[]).map((a) => {
    const re = new RegExp(KEYWORDS[a].source, "gi");
    // Ability names weigh more than the description.
    const inAbilities = (c.abilities.join(" ").match(re) ?? []).length * 2;
    const inRest = (text.match(re) ?? []).length;
    return { a, score: inAbilities + inRest };
  });
  const best = Math.max(...scores.map((s) => s.score));
  const top = scores.filter((s) => s.score === best).map((s) => s.a);
  return top[hash(c.id) % top.length];
}

/** 0.9 … 1.1 from the character's power level. */
export function powerFactor(powerLevel: number | null): number {
  const p = Math.min(99, Math.max(20, powerLevel ?? 50));
  return 0.9 + (0.2 * (p - 20)) / 79;
}

export function buildKit(c: CharacterInput): FighterKit {
  const archetype = archetypeFor(c);
  const base = ARCHETYPES[archetype];
  const f = powerFactor(c.powerLevel);
  const names = c.abilities.length > 0 ? c.abilities : ["Signature Move", "Technique", "Technique"];
  const abilities = TEMPLATES[archetype].map((tpl, i) => {
    const nameIndex = Math.min(i, names.length - 1);
    return { ...tpl, id: (["a1", "a2", "a3"] as const)[i], name: names[nameIndex], nameIndex };
  });
  return {
    characterId: c.id,
    name: c.name,
    animeId: c.animeId,
    imageUrl: c.imageUrl ?? null,
    archetype,
    maxHp: Math.round(base.hp * f),
    atk: Math.round(base.atk * f),
    def: Math.round(base.def * f),
    spd: base.spd,
    abilities,
  };
}
