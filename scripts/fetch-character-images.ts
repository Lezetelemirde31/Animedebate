/**
 * Looks up official character artwork URLs on AniList (https://anilist.co) and
 * writes them to src/data/character-images.json. Only the CDN URLs are stored —
 * no images are downloaded into the repository.
 *
 * Each match is verified against the anime's title keywords so that e.g. "Yuno"
 * from Black Clover is never confused with a character from another series.
 *
 * Usage: npm run images:fetch            (only missing entries)
 *        npm run images:fetch -- --all   (refresh everything)
 */
import fs from "node:fs";
import path from "node:path";
import { getCatalog } from "../src/data/characters";
import { getAnime } from "../src/data/anime";

const OUT = path.join(__dirname, "..", "src", "data", "character-images.json");
const ENDPOINT = "https://graphql.anilist.co";

type ImageMap = Record<string, { url: string; anilistId?: number; matchedName: string; source?: "manual" }>;

interface AniCharacter {
  id: number;
  name: { full: string; alternative: string[] | null };
  image: { large: string | null } | null;
  media: { nodes: { title: { romaji: string | null; english: string | null } }[] } | null;
}

function deburr(s: string): string {
  return s
    .replace(/ō/g, "ou")
    .replace(/Ō/g, "Ou")
    .replace(/ū/g, "uu")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function simpleDeburr(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function search(term: string): Promise<AniCharacter[]> {
  const query = `query ($search: String) {
    Page(perPage: 8) {
      characters(search: $search) {
        id
        name { full alternative }
        image { large }
        media(perPage: 25) { nodes { title { romaji english } } }
      }
    }
  }`;
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query, variables: { search: term } }),
    });
    if (res.status === 429) {
      const wait = Number(res.headers.get("retry-after") ?? "30");
      console.log(`  rate limited, waiting ${wait}s`);
      await sleep((wait + 1) * 1000);
      continue;
    }
    if (!res.ok) throw new Error(`AniList HTTP ${res.status}`);
    const json = (await res.json()) as { data?: { Page: { characters: AniCharacter[] } } };
    return json.data?.Page.characters ?? [];
  }
  throw new Error("AniList: too many retries");
}

async function byId(id: number): Promise<AniCharacter | null> {
  const query = `query ($id: Int) {
    Character(id: $id) {
      id
      name { full alternative }
      image { large }
      media(perPage: 25) { nodes { title { romaji english } } }
    }
  }`;
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables: { id } }),
  });
  if (!res.ok) throw new Error(`AniList HTTP ${res.status}`);
  const json = (await res.json()) as { data?: { Character: AniCharacter | null } };
  return json.data?.Character ?? null;
}

const norm = (s: string) => simpleDeburr(s).toLowerCase().replace(/[^a-z]/g, "");

/** Prefer an exact (order-insensitive) name match over the first search hit. */
function pick(results: AniCharacter[], term: string, keywords: string[]): AniCharacter | undefined {
  const valid = results.filter((r) => r.image?.large && appearsIn(r, keywords));
  const words = (s: string) => simpleDeburr(s).toLowerCase().split(/\s+/).sort().join(" ");
  const exact = valid.find(
    (r) => words(r.name.full) === words(term) || (r.name.alternative ?? []).some((a) => norm(a) === norm(term)),
  );
  return exact ?? valid.find((r) => norm(r.name.full).includes(norm(term)) || norm(term).includes(norm(r.name.full))) ?? valid[0];
}

function appearsIn(c: AniCharacter, keywords: string[]): boolean {
  return (c.media?.nodes ?? []).some((n) => {
    const titles = [n.title.romaji, n.title.english].filter(Boolean).map((t) => t!.toLowerCase());
    return titles.some((t) => keywords.some((k) => t.includes(k)));
  });
}

async function main() {
  const refreshAll = process.argv.includes("--all");
  const existing: ImageMap = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
  // Images added by hand (files in public/, e.g. "/characters/x.jpg") are always kept.
  const manual = Object.fromEntries(Object.entries(existing).filter(([, v]) => v.url.startsWith("/")));
  const out: ImageMap = refreshAll ? { ...manual } : { ...existing };
  const missing: string[] = [];

  for (const ch of getCatalog()) {
    if (out[ch.id]) continue;
    const anime = getAnime(ch.animeId)!;
    const terms = Array.from(
      new Set([ch.searchName, ch.name, deburr(ch.name), simpleDeburr(ch.name)].filter(Boolean) as string[]),
    );
    let found: AniCharacter | undefined;
    if (ch.anilistId) {
      found = (await byId(ch.anilistId)) ?? undefined;
      await sleep(900);
    }
    for (const term of found ? [] : terms) {
      const results = await search(term);
      await sleep(900);
      found = pick(results, term, anime.mediaKeywords);
      if (found) break;
    }
    if (found?.image?.large && !found.image.large.includes("/default.")) {
      out[ch.id] = { url: found.image.large, anilistId: found.id, matchedName: found.name.full };
      console.log(`✓ ${ch.id} → ${found.name.full}`);
    } else {
      missing.push(ch.id);
      console.log(`✗ ${ch.id} (no verified match)`);
    }
    fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
  }

  console.log(`\nDone. ${Object.keys(out).length} images, ${missing.length} missing.`);
  if (missing.length) console.log("Missing (will use generated card art):", missing.join(", "));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
