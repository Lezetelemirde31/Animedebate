import type { CharacterTextTr } from "./types";
import { narutoTr } from "./naruto";
import { borutoTr } from "./boruto";
import { onePieceTr } from "./one-piece";
import { blackCloverTr } from "./black-clover";
import { bleachTr } from "./bleach";
import { tokyoRevengersTr } from "./tokyo-revengers";

export type { CharacterTextTr } from "./types";

/**
 * Turkish titles, descriptions and ability names, keyed by character id
 * (`${animeId}-${slug}`). Characters without an entry fall back to English.
 */
export const CHARACTER_TEXT_TR: Record<string, CharacterTextTr> = {
  ...narutoTr,
  ...borutoTr,
  ...onePieceTr,
  ...blackCloverTr,
  ...bleachTr,
  ...tokyoRevengersTr,
};
