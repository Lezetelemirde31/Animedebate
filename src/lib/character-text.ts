import { CHARACTER_TEXT_TR } from "@/data/characters/tr";

interface CharacterTexts {
  id: string;
  title: string;
  description: string;
  abilities: string[];
}

/**
 * Returns the character with its title, description and ability names in the
 * given language. The curated data is English; Turkish comes from
 * `src/data/characters/tr`. Missing translations fall back to English.
 */
export function localizeCharacter<T extends CharacterTexts>(character: T, locale: string): T {
  if (locale !== "tr") return character;
  const tr = CHARACTER_TEXT_TR[character.id];
  if (!tr) return character;
  return {
    ...character,
    title: tr.title,
    description: tr.description,
    abilities: tr.abilities.length === character.abilities.length ? tr.abilities : character.abilities,
  };
}

/** Just the localized epithet, for places that only show a character's title. */
export function characterTitle(id: string, title: string, locale: string): string {
  return locale === "tr" ? CHARACTER_TEXT_TR[id]?.title ?? title : title;
}
