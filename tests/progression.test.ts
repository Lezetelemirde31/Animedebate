import { describe, expect, it } from "vitest";
import { RANKS, nextRank, rankForLevel, rankProgress, xpForLevel } from "@/game/ranks";
import { getDatabaseUrl, prisma } from "@/lib/db";
import { BADGE_COINS, LEVEL_UP_COINS, awardXp, levelFromXp } from "@/lib/gamification";

describe("ranks", () => {
  it("has 10 ranks from Beginner to Anime Emperor, in increasing level order", () => {
    expect(RANKS).toHaveLength(10);
    expect(RANKS[0].name.en).toBe("Beginner");
    expect(RANKS[9].name.tr).toBe("Anime İmparatoru");
    for (let i = 1; i < RANKS.length; i++) expect(RANKS[i].minLevel).toBeGreaterThan(RANKS[i - 1].minLevel);
  });

  it("maps levels to ranks", () => {
    expect(rankForLevel(1).id).toBe("beginner");
    expect(rankForLevel(2).id).toBe("beginner");
    expect(rankForLevel(3).id).toBe("novice");
    expect(rankForLevel(41).id).toBe("mythic");
    expect(rankForLevel(42).id).toBe("anime-emperor");
    expect(rankForLevel(99).id).toBe("anime-emperor");
    expect(nextRank(42)).toBeNull();
  });

  it("xpForLevel is the inverse of levelFromXp", () => {
    for (const lv of [1, 2, 5, 16, 42]) {
      expect(levelFromXp(xpForLevel(lv))).toBe(lv);
      expect(levelFromXp(xpForLevel(lv) - 1)).toBe(Math.max(1, lv - 1));
    }
    const p = rankProgress(xpForLevel(3), 3);
    expect(p.rank.id).toBe("novice");
    expect(p.next?.id).toBe("apprentice");
    expect(p.ratio).toBe(0);
  });
});

const dbUrl = getDatabaseUrl();
const remoteDb = !!dbUrl && !/@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(dbUrl);
const suite = remoteDb && process.env.ALLOW_REMOTE_TEST_DB !== "1" ? describe.skip : describe;

suite("Anime Coins", () => {
  const RUN = Math.random().toString(36).slice(2, 7);
  let seq = 0;
  const makeUser = async () => {
    const username = `p_${RUN}_${++seq}`;
    return (await prisma.user.create({ data: { username, usernameKey: username, passwordHash: "x" } })).id;
  };
  const coinsOf = async (id: string) => (await prisma.user.findUnique({ where: { id }, select: { coins: true } }))!.coins;

  it("pays coins per reason, level-ups and rank-ups, and records every change", async () => {
    const id = await makeUser();
    await awardXp({ userId: id, amount: 20, reason: "MATCH_PLAY" }); // 15 AC, still level 1
    expect(await coinsOf(id)).toBe(15);

    // Jump to level 3 (100 XP total → level 2 at 50, 3 at 200): use 200 XP.
    await awardXp({ userId: id, amount: 200, reason: "Posted a community comment" }); // half XP = 100 AC
    const u = await prisma.user.findUnique({ where: { id }, select: { level: true, coins: true } });
    expect(u!.level).toBe(3);
    const novice = RANKS.find((r) => r.id === "novice")!;
    // 15 + 100 + 2 levels × LEVEL_UP_COINS + Novice bonus (+ any badge unlocked on the way)
    const events = await prisma.coinEvent.findMany({ where: { userId: id } });
    const sum = events.reduce((s, e) => s + e.amount, 0);
    expect(sum).toBe(u!.coins);
    expect(events.some((e) => e.reason === "LEVEL_UP" && e.amount === 2 * LEVEL_UP_COINS)).toBe(true);
    expect(events.some((e) => e.reason === "RANK_UP" && e.amount === novice.coinBonus)).toBe(true);
    const badgeCoins = events.filter((e) => e.reason === "BADGE_EARNED").length * BADGE_COINS;
    expect(u!.coins).toBe(15 + 100 + 2 * LEVEL_UP_COINS + novice.coinBonus + badgeCoins);
    const rankNote = await prisma.notification.findFirst({ where: { userId: id, type: "RANK_UP" } });
    expect(rankNote?.params).toMatchObject({ rank: "novice" });
  });

  it("bot duels pay very little", async () => {
    const id = await makeUser();
    await awardXp({ userId: id, amount: 15, reason: "ARENA_BOT_WIN" });
    expect(await coinsOf(id)).toBe(3);
  });

  it("unlocks match achievements with a coin bonus", async () => {
    const id = await makeUser();
    await prisma.user.update({ where: { id }, data: { matchesPlayed: 1, matchesWon: 1 } });
    await awardXp({ userId: id, amount: 60, reason: "MATCH_WIN" });
    const slugs = (await prisma.userBadge.findMany({ where: { userId: id }, include: { badge: true } })).map((b) => b.badge.slug);
    expect(slugs).toEqual(expect.arrayContaining(["first-match", "first-victory"]));
  });
});
