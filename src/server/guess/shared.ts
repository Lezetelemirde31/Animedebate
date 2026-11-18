import type { Prisma } from "@prisma/client";
import { prisma, dbMode } from "@/lib/db";
import type { AvatarDTO } from "@/game/types";
import { getCatalog } from "../catalog";
import { EngineError, avatarOf } from "../live/room";
import { localLock } from "../live/service";
import { currentSeason } from "../platform/results";

export type Tx = Prisma.TransactionClient;

export const TX_OPTIONS = { maxWait: 8_000, timeout: 15_000 } as const;

/** Runs `fn` in a transaction after taking a row/advisory lock (an in-process lock in preview mode). */
export async function exclusive<T>(key: string, fn: (tx: Tx) => Promise<T>, lockSql: (tx: Tx) => Promise<unknown>): Promise<T> {
  if ((await dbMode()) === "preview") return localLock(key, () => fn(prisma as unknown as Tx));
  return prisma.$transaction(async (tx) => {
    await lockSql(tx);
    return fn(tx);
  }, TX_OPTIONS);
}

export interface GuessCharacter {
  id: string;
  name: string;
  animeId: string;
  rarity: string;
  imageUrl: string | null;
}

/** Every playable character (the answer options and the picture pool). */
export async function guessCharacters(): Promise<{ list: GuessCharacter[]; byId: Map<string, GuessCharacter> }> {
  const catalog = await getCatalog();
  const list = catalog
    .all()
    .map((c) => ({ id: c.id, name: c.name, animeId: c.animeId, rarity: c.rarity, imageUrl: c.imageUrl }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { list, byId: new Map(list.map((c) => [c.id, c])) };
}

export async function profileOf(userId: string): Promise<{ username: string; avatar: AvatarDTO }> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true, avatarStyle: true, avatarCustomUrl: true, avatarCharacter: { select: { imageUrl: true } } },
  });
  if (!u) throw new EngineError("NOT_FOUND", "NOT_FOUND");
  return { username: u.username, avatar: avatarOf(u) };
}

export async function guessRating(userId: string): Promise<number> {
  const season = await currentSeason();
  const r = await prisma.gameRating.findUnique({ where: { userId_game_seasonId: { userId, game: "GUESS", seasonId: season.id } } });
  return r?.rating ?? 1000;
}

/** The answer as shown once a round is over. */
export function answerOf(c: GuessCharacter | undefined) {
  return c ? { id: c.id, name: c.name, animeId: c.animeId, imageUrl: c.imageUrl } : null;
}
export type GuessAnswer = NonNullable<ReturnType<typeof answerOf>>;
