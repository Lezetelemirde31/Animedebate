import { describe, expect, it } from "vitest";
import { eloChange, leagueFor, seasonWindow, START_RATING } from "@/game/platform";
import { getDatabaseUrl, prisma } from "@/lib/db";
import { currentSeason, recordGameResult } from "@/server/platform/results";

describe("ratings and seasons", () => {
  it("Elo: wins against stronger players pay more; placement moves faster", () => {
    expect(eloChange(1000, 1000, "WIN", 20)).toBe(16);
    expect(eloChange(1000, 1000, "LOSS", 20)).toBe(-16);
    expect(eloChange(1000, 1000, "DRAW", 20)).toBe(0);
    expect(eloChange(1000, 1400, "WIN", 20)).toBeGreaterThan(eloChange(1400, 1000, "WIN", 20));
    expect(eloChange(1000, 1000, "WIN", 0)).toBe(24); // placement K=48
  });

  it("seasons are calendar quarters", () => {
    const w = seasonWindow(new Date(Date.UTC(2026, 10, 18)));
    expect(w.startsAt.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(w.endsAt.toISOString()).toBe("2027-01-01T00:00:00.000Z");
    expect(w.quarter).toBe(4);
  });

  it("leagues", () => {
    expect(leagueFor(START_RATING).name.tr).toBe("Bronz");
    expect(leagueFor(1500).name.tr).toBe("Platin");
    expect(leagueFor(2100).name.tr).toBe("Efsane");
  });
});

const dbUrl = getDatabaseUrl();
const remoteDb = !!dbUrl && !/@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(dbUrl);
const suite = remoteDb && process.env.ALLOW_REMOTE_TEST_DB !== "1" ? describe.skip : describe;

suite("shared match history", () => {
  const RUN = Math.random().toString(36).slice(2, 7);
  let n = 0;
  const user = async () => {
    const u = `g_${RUN}_${++n}`;
    return (await prisma.user.create({ data: { username: u, usernameKey: u, passwordHash: "x" } })).id;
  };

  it("ranked head-to-head: ratings move, record and history are written once", async () => {
    const [a, b] = [await user(), await user()];
    const season = await currentSeason();
    const ref = `test-${RUN}-1`;
    const input = {
      game: "AUCTION" as const,
      mode: "ranked",
      ranked: true,
      refId: ref,
      players: [
        { userId: a, result: "WIN" as const, score: 30, xp: 60, reason: "MATCH_WIN" },
        { userId: b, result: "LOSS" as const, score: 20, xp: 20, reason: "MATCH_PLAY" },
      ],
    };
    const id = await recordGameResult(input);
    expect(id).toBeTruthy();
    expect(await recordGameResult(input)).toBeNull(); // idempotent

    const ra = await prisma.gameRating.findUnique({ where: { userId_game_seasonId: { userId: a, game: "AUCTION", seasonId: season.id } } });
    const rb = await prisma.gameRating.findUnique({ where: { userId_game_seasonId: { userId: b, game: "AUCTION", seasonId: season.id } } });
    expect(ra).toMatchObject({ rating: 1024, wins: 1, played: 1, streak: 1 });
    expect(rb).toMatchObject({ rating: 976, losses: 1, played: 1, streak: 0 });
    const rows = await prisma.gameMatchPlayer.findMany({ where: { matchId: id! } });
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.userId === a)).toMatchObject({ ratingBefore: 1000, ratingAfter: 1024, xp: 60, coins: 50 });
    const ua = await prisma.user.findUnique({ where: { id: a }, select: { xp: true, coins: true } });
    expect(ua!.xp).toBe(60);
    expect(ua!.coins).toBeGreaterThanOrEqual(50);
  });

  it("friendly matches count in the record but never move the rating; bot games stay off the ladder", async () => {
    const [a, b] = [await user(), await user()];
    const season = await currentSeason();
    await recordGameResult({
      game: "CARD_DUEL",
      mode: "friendly",
      ranked: false,
      refId: `test-${RUN}-2`,
      players: [
        { userId: a, result: "WIN", xp: 35, reason: "ARENA_PVP_WIN" },
        { userId: b, result: "LOSS", xp: 15, reason: "ARENA_PVP_PLAY" },
      ],
    });
    const ra = await prisma.gameRating.findUnique({ where: { userId_game_seasonId: { userId: a, game: "CARD_DUEL", seasonId: season.id } } });
    expect(ra).toMatchObject({ rating: 1000, wins: 1, played: 1 });

    await recordGameResult({ game: "CARD_DUEL", mode: "bot", ranked: false, players: [{ userId: a, result: "WIN", xp: 15, reason: "ARENA_BOT_WIN" }] });
    const again = await prisma.gameRating.findUnique({ where: { userId_game_seasonId: { userId: a, game: "CARD_DUEL", seasonId: season.id } } });
    expect(again?.played).toBe(1);
    expect(await prisma.gameMatchPlayer.count({ where: { userId: a } })).toBe(2);
  });

  it("a player who walked out gets no reward", async () => {
    const [a, b] = [await user(), await user()];
    await recordGameResult({
      game: "AUCTION",
      mode: "ranked",
      ranked: true,
      refId: `test-${RUN}-3`,
      players: [
        { userId: a, result: "WIN", xp: 60, reason: "MATCH_WIN" },
        { userId: b, result: "LOSS", xp: 0, reason: "MATCH_PLAY" },
      ],
    });
    const ub = await prisma.user.findUnique({ where: { id: b }, select: { xp: true, coins: true } });
    expect(ub).toMatchObject({ xp: 0, coins: 0 });
  });
});
