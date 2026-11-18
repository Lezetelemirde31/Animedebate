/**
 * In-memory relational store used ONLY when DATABASE_URL is not configured
 * (e.g. initial preview environment before Supabase/PostgreSQL env vars are set).
 * Whenever DATABASE_URL is provided, src/lib/db.ts uses the real PrismaClient.
 */
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import type { PrismaClient } from "@prisma/client";
import { ANIME } from "@/data/anime";
import { BADGES } from "@/data/badges";
import { getCatalog } from "@/data/characters";
import images from "@/data/character-images.json";

type Row = Record<string, any>;

interface StoreTables {
  user: Row[];
  session: Row[];
  anime: Row[];
  character: Row[];
  match: Row[];
  matchPlayer: Row[];
  auctionLot: Row[];
  bid: Row[];
  ownedCharacter: Row[];
  debate: Row[];
  characterComparison: Row[];
  comparisonVote: Row[];
  comment: Row[];
  reaction: Row[];
  favorite: Row[];
  badge: Row[];
  userBadge: Row[];
  notification: Row[];
  xpEvent: Row[];
  coinEvent: Row[];
  season: Row[];
  gameRating: Row[];
  gameMatch: Row[];
  gameMatchPlayer: Row[];
  moderationLog: Row[];
  matchSpectator: Row[];
  queueEntry: Row[];
  arenaRoom: Row[];
}

const g = globalThis as unknown as { __aaPreviewTables?: StoreTables };

function cuid(): string {
  return `prev_${crypto.randomBytes(8).toString("hex")}`;
}

function buildInitialTables(): StoreTables {
  const now = new Date();
  const imageMap = images as Record<string, { url: string }>;

  const anime = ANIME.map((a) => ({ ...a }));
  const character = getCatalog().map((c) => ({
    id: c.id,
    name: c.name,
    title: c.title,
    animeId: c.animeId,
    imageUrl: imageMap[c.id]?.url ?? null,
    description: c.description,
    abilities: [...c.abilities],
    rarity: c.rarity,
    powerLevel: c.powerLevel ?? null,
    score: c.score ?? null,
    enabled: true,
    createdAt: now,
    updatedAt: now,
  }));
  const badge = BADGES.map((b) => ({ ...b, createdAt: now }));

  // Demo preview accounts (only created in memory when DATABASE_URL is unset)
  const adminHash = bcrypt.hashSync("Admin1234!", 8);
  const userHash = bcrypt.hashSync("Demo1234!", 8);
  const adminId = "prev_admin_1";
  const userId = "prev_user_1";

  const user: Row[] = [
    {
      id: adminId,
      username: "Admin",
      usernameKey: "admin",
      passwordHash: adminHash,
      role: "ADMIN",
      bio: "Platform administrator & anime lore moderator.",
      avatarStyle: "crimson",
      avatarCharacterId: null,
      avatarCustomUrl: null,
      xp: 380,
      level: 3,
      debatesCount: 1,
      comparisonsCount: 1,
      commentsCount: 1,
      likesReceived: 4,
      isBanned: false,
      bannedReason: null,
      usernameChangedAt: null,
      auctionWins: 2,
      auctionLosses: 1,
      matchesPlayed: 1,
      matchesWon: 1,
      totalSpent: 14,
      createdAt: new Date(now.getTime() - 86_400_000 * 14),
      updatedAt: now,
    },
    {
      id: userId,
      username: "LeafShinobi",
      usernameKey: "leafshinobi",
      passwordHash: userHash,
      role: "USER",
      bio: "Naruto & One Piece power-scaling enjoyer.",
      avatarStyle: "violet",
      avatarCharacterId: null,
      avatarCustomUrl: null,
      xp: 145,
      level: 2,
      debatesCount: 1,
      comparisonsCount: 1,
      commentsCount: 1,
      likesReceived: 3,
      isBanned: false,
      bannedReason: null,
      usernameChangedAt: null,
      auctionWins: 1,
      auctionLosses: 2,
      matchesPlayed: 1,
      matchesWon: 0,
      totalSpent: 11,
      createdAt: new Date(now.getTime() - 86_400_000 * 7),
      updatedAt: now,
    },
  ];

  const debateId1 = "prev_debate_1";
  const debateId2 = "prev_debate_2";
  const debate: Row[] = [
    {
      id: debateId1,
      slug: "prime-itachi-vs-pain-tactical-matchup-a1b2c3",
      authorId: adminId,
      animeId: "naruto",
      characterId: "naruto-itachi-uchiha",
      title: "Healthy Itachi vs Six Paths of Pain: Who wins a blind encounter?",
      content:
        "Assuming neither side has prior intel beyond village rumors, can Itachi decipher the shared Rinnegan vision and Chibaku Tensei fast enough before chakra exhaustion sets in, or does Nagato's sheer stamina overwhelm him?",
      category: "POWER_SCALING",
      status: "OPEN",
      isPinned: true,
      likesCount: 3,
      dislikesCount: 0,
      commentsCount: 1,
      viewsCount: 42,
      createdAt: new Date(now.getTime() - 3_600_000 * 10),
      updatedAt: now,
    },
    {
      id: debateId2,
      slug: "best-written-shonen-antagonist-arc-d4e5f6",
      authorId: userId,
      animeId: "bleach",
      characterId: null,
      title: "Which Big Three antagonist had the most impactful narrative reveal?",
      content:
        "From Aizen's Soul Society betrayal to Pain's cycle of hatred and Doflamingo's Dressrosa monologue — which villain elevated their series' writing the most?",
      category: "LORE",
      status: "OPEN",
      isPinned: false,
      likesCount: 2,
      dislikesCount: 0,
      commentsCount: 1,
      viewsCount: 27,
      createdAt: new Date(now.getTime() - 3_600_000 * 4),
      updatedAt: now,
    },
  ];

  const compId1 = "prev_comp_1";
  const compId2 = "prev_comp_2";
  const characterComparison: Row[] = [
    {
      id: compId1,
      slug: "naruto-uzumaki-vs-monkey-d-luffy-112233",
      authorId: userId,
      characterAId: "naruto-naruto-uzumaki",
      characterBId: "one-piece-monkey-d-luffy",
      title: "Baryon / Six Paths Naruto vs Gear 5 Luffy",
      description: "Compare peak versatility, hax resistance, AP, and combat IQ between the two iconic shonen protagonists.",
      criteria: "COMBAT",
      status: "OPEN",
      votesACount: 14,
      votesBCount: 13,
      likesCount: 2,
      dislikesCount: 0,
      commentsCount: 0,
      createdAt: new Date(now.getTime() - 3_600_000 * 8),
      updatedAt: now,
    },
    {
      id: compId2,
      slug: "itachi-uchiha-vs-sosuke-aizen-445566",
      authorId: adminId,
      characterAId: "naruto-itachi-uchiha",
      characterBId: "bleach-sosuke-aizen",
      title: "Itachi Uchiha vs Sosuke Aizen — Writing & Mastermind Aura",
      description: "Who embodies the better illusionist & strategic genius in anime storytelling?",
      criteria: "WRITING",
      status: "OPEN",
      votesACount: 9,
      votesBCount: 12,
      likesCount: 1,
      dislikesCount: 0,
      commentsCount: 0,
      createdAt: new Date(now.getTime() - 3_600_000 * 3),
      updatedAt: now,
    },
  ];

  const comment: Row[] = [
    {
      id: "prev_comment_1",
      authorId: userId,
      debateId: debateId1,
      comparisonId: null,
      characterId: null,
      parentId: null,
      body: "Totsuka Blade + Yata Mirror gives Itachi incredible burst defense, but Pain having six separate bodies makes Tsukuyomi far harder to end the fight instantly.",
      likesCount: 1,
      dislikesCount: 0,
      isDeleted: false,
      editedAt: null,
      createdAt: new Date(now.getTime() - 3_600_000 * 2),
      updatedAt: now,
    },
    {
      id: "prev_comment_2",
      authorId: adminId,
      debateId: debateId2,
      comparisonId: null,
      characterId: null,
      parentId: null,
      body: "Aizen's 'Since when were you under the impression...' twist still sets the bar for antagonist reveals.",
      likesCount: 1,
      dislikesCount: 0,
      isDeleted: false,
      editedAt: null,
      createdAt: new Date(now.getTime() - 3_600_000),
      updatedAt: now,
    },
  ];

  const userBadge: Row[] = [
    { id: "prev_ub_1", userId: adminId, badgeId: "badge-first-debate", awardedAt: now },
    { id: "prev_ub_2", userId: adminId, badgeId: "badge-vs-challenger", awardedAt: now },
    { id: "prev_ub_3", userId: adminId, badgeId: "badge-rising-star", awardedAt: now },
    { id: "prev_ub_4", userId: userId, badgeId: "badge-first-debate", awardedAt: now },
  ];

  return {
    user,
    session: [],
    anime,
    character,
    match: [],
    matchPlayer: [],
    auctionLot: [],
    bid: [],
    ownedCharacter: [],
    debate,
    characterComparison,
    comparisonVote: [],
    comment,
    reaction: [],
    favorite: [],
    badge,
    userBadge,
    notification: [],
    xpEvent: [],
    coinEvent: [],
    season: [],
    gameRating: [],
    gameMatch: [],
    gameMatchPlayer: [],
    moderationLog: [],
    matchSpectator: [],
    queueEntry: [],
    arenaRoom: [],
  };
}

function getTables(): StoreTables {
  if (!g.__aaPreviewTables) {
    g.__aaPreviewTables = buildInitialTables();
  }
  // Tables added after the store was first created (e.g. across hot reloads).
  g.__aaPreviewTables.matchSpectator ??= [];
  g.__aaPreviewTables.queueEntry ??= [];
  g.__aaPreviewTables.arenaRoom ??= [];
  g.__aaPreviewTables.coinEvent ??= [];
  g.__aaPreviewTables.season ??= [];
  g.__aaPreviewTables.gameRating ??= [];
  g.__aaPreviewTables.gameMatch ??= [];
  g.__aaPreviewTables.gameMatchPlayer ??= [];
  return g.__aaPreviewTables;
}

function matchScalar(val: any, cond: any): boolean {
  if (cond === undefined) return true;
  if (cond === null || typeof cond !== "object" || cond instanceof Date) {
    if (val instanceof Date && cond instanceof Date) return val.getTime() === cond.getTime();
    return val === cond;
  }
  if ("has" in cond) return Array.isArray(val) && val.includes(cond.has);
  if ("in" in cond) return (cond.in as any[]).includes(val);
  if ("notIn" in cond) return !(cond.notIn as any[]).includes(val);
  if ("not" in cond) {
    if (cond.not === null) return val !== null && val !== undefined;
    return val !== cond.not;
  }
  if ("gte" in cond) return val >= cond.gte;
  if ("gt" in cond) return val > cond.gt;
  if ("lte" in cond) return val <= cond.lte;
  if ("lt" in cond) return val < cond.lt;
  if ("contains" in cond) {
    const s = String(val ?? "");
    const q = String(cond.contains);
    return cond.mode === "insensitive" ? s.toLowerCase().includes(q.toLowerCase()) : s.includes(q);
  }
  return true;
}

function resolveRow(tables: StoreTables, tableName: keyof StoreTables, row: Row, spec?: { include?: Row; select?: Row }): Row {
  const out: Row = { ...row };
  const inc = spec?.include;
  const sel = spec?.select;

  const attachRelations = (target: Row, relSpec: Row) => {
    for (const [k, v] of Object.entries(relSpec)) {
      if (!v) continue;
      const subSpec = typeof v === "object" ? v : undefined;
      if (tableName === "user") {
        if (k === "avatarCharacter") {
          const ch = tables.character.find((c) => c.id === row.avatarCharacterId) ?? null;
          target[k] = ch ? resolveRow(tables, "character", ch, subSpec) : null;
        } else if (k === "badges") {
          target[k] = tables.userBadge.filter((ub) => ub.userId === row.id).map((ub) => resolveRow(tables, "userBadge", ub, subSpec));
        } else if (k === "_count") {
          target[k] = {
            debates: tables.debate.filter((d) => d.authorId === row.id).length,
            comparisons: tables.characterComparison.filter((c) => c.authorId === row.id).length,
            comments: tables.comment.filter((c) => c.authorId === row.id && !c.isDeleted).length,
          };
        }
      } else if (tableName === "session" && k === "user") {
        const u = tables.user.find((x) => x.id === row.userId) ?? null;
        target[k] = u ? resolveRow(tables, "user", u, subSpec) : null;
      } else if (tableName === "character") {
        if (k === "anime") {
          const a = tables.anime.find((x) => x.id === row.animeId) ?? null;
          target[k] = a ? resolveRow(tables, "anime", a, subSpec) : null;
        }
      } else if (tableName === "ownedCharacter") {
        if (k === "character") {
          const c = tables.character.find((x) => x.id === row.characterId) ?? null;
          target[k] = c ? resolveRow(tables, "character", c, subSpec) : null;
        }
      } else if (tableName === "match") {
        if (k === "players") {
          target[k] = tables.matchPlayer
            .filter((p) => p.matchId === row.id)
            .sort((a, b) => a.seat - b.seat)
            .map((p) => resolveRow(tables, "matchPlayer", p, subSpec));
        } else if (k === "lots") {
          let lots = tables.auctionLot.filter((l) => l.matchId === row.id);
          if (subSpec?.where) lots = lots.filter((l) => matchesWhere(tables, "auctionLot", l, subSpec.where));
          lots = lots.sort((a, b) => a.lotNumber - b.lotNumber);
          target[k] = lots.map((l) => resolveRow(tables, "auctionLot", l, subSpec));
        } else if (k === "_count") {
          target[k] = { lots: tables.auctionLot.filter((l) => l.matchId === row.id).length };
        }
      } else if (tableName === "matchPlayer") {
        if (k === "user") {
          const u = tables.user.find((x) => x.id === row.userId) ?? null;
          target[k] = u ? resolveRow(tables, "user", u, subSpec) : null;
        } else if (k === "match") {
          const m = tables.match.find((x) => x.id === row.matchId) ?? null;
          target[k] = m ? resolveRow(tables, "match", m, subSpec) : null;
        }
      } else if (tableName === "auctionLot") {
        if (k === "character") {
          const c = tables.character.find((x) => x.id === row.characterId) ?? null;
          target[k] = c ? resolveRow(tables, "character", c, subSpec) : null;
        } else if (k === "winner") {
          const u = tables.user.find((x) => x.id === row.winnerId) ?? null;
          target[k] = u ? resolveRow(tables, "user", u, subSpec) : null;
        } else if (k === "bids") {
          target[k] = tables.bid
            .filter((b) => b.lotId === row.id)
            .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
            .map((b) => resolveRow(tables, "bid", b, subSpec));
        } else if (k === "_count") {
          target[k] = { bids: tables.bid.filter((b) => b.lotId === row.id).length };
        }
      } else if ((tableName === "gameRating" || tableName === "gameMatchPlayer") && k === "user") {
        const u = tables.user.find((x) => x.id === row.userId) ?? null;
        target[k] = u ? resolveRow(tables, "user", u, subSpec) : null;
      } else if (tableName === "gameMatchPlayer" && k === "match") {
        const m = tables.gameMatch.find((x) => x.id === row.matchId) ?? null;
        target[k] = m ? resolveRow(tables, "gameMatch", m, subSpec) : null;
      } else if (tableName === "gameMatch" && k === "players") {
        target[k] = tables.gameMatchPlayer.filter((p) => p.matchId === row.id).map((p) => resolveRow(tables, "gameMatchPlayer", p, subSpec));
      } else if (tableName === "bid" && k === "user") {
        const u = tables.user.find((x) => x.id === row.userId) ?? null;
        target[k] = u ? resolveRow(tables, "user", u, subSpec) : null;
      } else if (tableName === "debate") {
        if (k === "author") {
          const u = tables.user.find((x) => x.id === row.authorId) ?? null;
          target[k] = u ? resolveRow(tables, "user", u, subSpec) : null;
        } else if (k === "anime") {
          const a = tables.anime.find((x) => x.id === row.animeId) ?? null;
          target[k] = a ? resolveRow(tables, "anime", a, subSpec) : null;
        } else if (k === "character") {
          const c = tables.character.find((x) => x.id === row.characterId) ?? null;
          target[k] = c ? resolveRow(tables, "character", c, subSpec) : null;
        }
      } else if (tableName === "characterComparison") {
        if (k === "author") {
          const u = tables.user.find((x) => x.id === row.authorId) ?? null;
          target[k] = u ? resolveRow(tables, "user", u, subSpec) : null;
        } else if (k === "characterA") {
          const c = tables.character.find((x) => x.id === row.characterAId) ?? null;
          target[k] = c ? resolveRow(tables, "character", c, subSpec) : null;
        } else if (k === "characterB") {
          const c = tables.character.find((x) => x.id === row.characterBId) ?? null;
          target[k] = c ? resolveRow(tables, "character", c, subSpec) : null;
        }
      } else if (tableName === "comment") {
        if (k === "author") {
          const u = tables.user.find((x) => x.id === row.authorId) ?? null;
          target[k] = u ? resolveRow(tables, "user", u, subSpec) : null;
        } else if (k === "debate") {
          const d = tables.debate.find((x) => x.id === row.debateId) ?? null;
          target[k] = d ? resolveRow(tables, "debate", d, subSpec) : null;
        } else if (k === "comparison") {
          const c = tables.characterComparison.find((x) => x.id === row.comparisonId) ?? null;
          target[k] = c ? resolveRow(tables, "characterComparison", c, subSpec) : null;
        } else if (k === "character") {
          const c = tables.character.find((x) => x.id === row.characterId) ?? null;
          target[k] = c ? resolveRow(tables, "character", c, subSpec) : null;
        }
      } else if (tableName === "userBadge" && k === "badge") {
        const b = tables.badge.find((x) => x.id === row.badgeId) ?? null;
        target[k] = b ? resolveRow(tables, "badge", b, subSpec) : null;
      } else if (tableName === "notification" && k === "actor") {
        const u = tables.user.find((x) => x.id === row.actorId) ?? null;
        target[k] = u ? resolveRow(tables, "user", u, subSpec) : null;
      } else if (tableName === "favorite") {
        if (k === "character") {
          const c = tables.character.find((x) => x.id === row.characterId) ?? null;
          target[k] = c ? resolveRow(tables, "character", c, subSpec) : null;
        } else if (k === "debate") {
          const d = tables.debate.find((x) => x.id === row.debateId) ?? null;
          target[k] = d ? resolveRow(tables, "debate", d, subSpec) : null;
        } else if (k === "comparison") {
          const c = tables.characterComparison.find((x) => x.id === row.comparisonId) ?? null;
          target[k] = c ? resolveRow(tables, "characterComparison", c, subSpec) : null;
        }
      } else if (tableName === "moderationLog" && k === "admin") {
        const u = tables.user.find((x) => x.id === row.adminId) ?? null;
        target[k] = u ? resolveRow(tables, "user", u, subSpec) : null;
      }
    }
  };

  if (inc) attachRelations(out, inc);
  if (sel) {
    const picked: Row = {};
    for (const [k, v] of Object.entries(sel)) {
      if (!v) continue;
      if (k in row) {
        picked[k] = row[k];
      } else {
        attachRelations(picked, { [k]: v });
      }
    }
    return picked;
  }
  return out;
}

function matchesWhere(tables: StoreTables, tableName: keyof StoreTables, row: Row, where?: Row): boolean {
  if (!where) return true;
  for (const [k, v] of Object.entries(where)) {
    if (v === undefined) continue;
    if (k === "OR" && Array.isArray(v)) {
      if (!v.some((sub) => matchesWhere(tables, tableName, row, sub))) return false;
      continue;
    }
    if (k === "AND" && Array.isArray(v)) {
      if (!v.every((sub) => matchesWhere(tables, tableName, row, sub))) return false;
      continue;
    }
    // Compound unique keys e.g. userId_characterId
    if (k.includes("_") && typeof v === "object" && v !== null && !(v instanceof Date)) {
      if (!matchesWhere(tables, tableName, row, v)) return false;
      continue;
    }
    // Relation filters
    if (tableName === "character" && k === "anime" && typeof v === "object") {
      const anime = tables.anime.find((a) => a.id === row.animeId);
      if (!anime || !matchesWhere(tables, "anime", anime, v)) return false;
      continue;
    }
    if (tableName === "ownedCharacter" && k === "character" && typeof v === "object") {
      const ch = tables.character.find((c) => c.id === row.characterId);
      if (!ch || !matchesWhere(tables, "character", ch, v)) return false;
      continue;
    }
    if (tableName === "gameMatchPlayer" && k === "match" && typeof v === "object") {
      const m = tables.gameMatch.find((x) => x.id === row.matchId);
      if (!m || !matchesWhere(tables, "gameMatch", m, v)) return false;
      continue;
    }
    if (tableName === "matchPlayer" && k === "match" && typeof v === "object") {
      const m = tables.match.find((x) => x.id === row.matchId);
      if (!m || !matchesWhere(tables, "match", m, v)) return false;
      continue;
    }
    if (tableName === "characterComparison" && k === "characterA" && typeof v === "object") {
      const ch = tables.character.find((c) => c.id === row.characterAId);
      if (!ch || !matchesWhere(tables, "character", ch, v)) return false;
      continue;
    }
    if (tableName === "characterComparison" && k === "characterB" && typeof v === "object") {
      const ch = tables.character.find((c) => c.id === row.characterBId);
      if (!ch || !matchesWhere(tables, "character", ch, v)) return false;
      continue;
    }

    if (!matchScalar(row[k], v)) return false;
  }
  return true;
}

function sortRows(rows: Row[], orderBy?: Row | Row[]): Row[] {
  if (!orderBy) return rows;
  const specs = Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...rows].sort((a, b) => {
    for (const spec of specs) {
      for (const [k, dir] of Object.entries(spec)) {
        if (typeof dir === "object") continue;
        const av = a[k] instanceof Date ? a[k].getTime() : a[k] ?? 0;
        const bv = b[k] instanceof Date ? b[k].getTime() : b[k] ?? 0;
        if (av !== bv) {
          return dir === "desc" ? (av < bv ? 1 : -1) : av < bv ? -1 : 1;
        }
      }
    }
    return 0;
  });
}

function applyUpdateData(row: Row, data: Row): void {
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    if (v && typeof v === "object" && !(v instanceof Date) && !Array.isArray(v)) {
      if ("increment" in v) {
        row[k] = (Number(row[k]) || 0) + Number(v.increment);
        continue;
      }
      if ("decrement" in v) {
        row[k] = (Number(row[k]) || 0) - Number(v.decrement);
        continue;
      }
    }
    row[k] = v;
  }
  if ("updatedAt" in row) row.updatedAt = new Date();
}

function applyDefaults(tableName: keyof StoreTables, data: Row): Row {
  const now = new Date();
  const base: Row = { id: data.id ?? cuid(), ...data };
  if (tableName === "user") {
    return {
      role: "USER",
      bio: null,
      avatarStyle: "violet",
      avatarCharacterId: null,
      avatarCustomUrl: null,
      xp: 0,
      level: 1,
      coins: 0,
      debatesCount: 0,
      comparisonsCount: 0,
      commentsCount: 0,
      likesReceived: 0,
      isBanned: false,
      bannedReason: null,
      usernameChangedAt: null,
      auctionWins: 0,
      auctionLosses: 0,
      matchesPlayed: 0,
      matchesWon: 0,
      totalSpent: 0,
      createdAt: now,
      updatedAt: now,
      ...base,
    };
  }
  if (tableName === "debate") {
    return {
      animeId: null,
      characterId: null,
      category: "GENERAL",
      status: "OPEN",
      isPinned: false,
      likesCount: 0,
      dislikesCount: 0,
      commentsCount: 0,
      viewsCount: 0,
      createdAt: now,
      updatedAt: now,
      ...base,
    };
  }
  if (tableName === "characterComparison") {
    return {
      criteria: "OVERALL",
      status: "OPEN",
      votesACount: 0,
      votesBCount: 0,
      likesCount: 0,
      dislikesCount: 0,
      commentsCount: 0,
      createdAt: now,
      updatedAt: now,
      ...base,
    };
  }
  if (tableName === "comment") {
    return {
      debateId: null,
      comparisonId: null,
      characterId: null,
      parentId: null,
      likesCount: 0,
      dislikesCount: 0,
      isDeleted: false,
      editedAt: null,
      createdAt: now,
      updatedAt: now,
      ...base,
    };
  }
  if (tableName === "notification") {
    return { actorId: null, linkUrl: null, isRead: false, createdAt: now, ...base };
  }
  if (tableName === "match") {
    return {
      status: "WAITING",
      isPrivate: true,
      isMatchmade: false,
      hostId: null,
      winnerId: null,
      endReason: null,
      resultDetail: null,
      phase: "LOBBY",
      phaseEndsAt: null,
      pausedPhase: null,
      pausedRemainingMs: null,
      pool: [],
      lotsCompleted: 0,
      version: 0,
      rematchVotes: [],
      rematchCode: null,
      nextOpenerId: null,
      startedAt: null,
      endedAt: null,
      createdAt: now,
      updatedAt: now,
      ...base,
    };
  }
  if (tableName === "matchPlayer") {
    return { score: 0, result: null, ready: false, lastSeenAt: null, joinedAt: now, ...base };
  }
  if (tableName === "auctionLot") {
    return {
      status: "ACTIVE",
      winnerId: null,
      finalPrice: null,
      highestBid: null,
      highestBidderId: null,
      forcedOpenerId: null,
      skipped: false,
      autoAssigned: false,
      skipVotes: [],
      endsAt: null,
      startedAt: now,
      endedAt: null,
      ...base,
    };
  }
  if (tableName === "bid") {
    return { createdAt: now, ...base };
  }
  if (tableName === "matchSpectator") {
    return { lastSeenAt: now, ...base };
  }
  if (tableName === "queueEntry") {
    return { since: now, lastSeenAt: now, matchedCode: null, ...base };
  }
  if (tableName === "gameRating") {
    return { rating: 1000, peak: 1000, played: 0, wins: 0, losses: 0, draws: 0, streak: 0, bestStreak: 0, updatedAt: now, ...base };
  }
  if (tableName === "gameMatch") {
    return { ranked: false, seasonId: null, refId: null, winnerId: null, startedAt: null, endedAt: now, ...base };
  }
  if (tableName === "gameMatchPlayer") {
    return { score: null, ratingBefore: null, ratingAfter: null, xp: 0, coins: 0, endedAt: now, ...base };
  }
  if (tableName === "ownedCharacter") {
    return { copies: 1, acquiredAt: now, lastAcquiredAt: now, sourceMatchId: null, ...base };
  }
  return { createdAt: now, updatedAt: now, ...base };
}

function makeDelegate(tables: StoreTables, tableName: keyof StoreTables) {
  const rows = () => tables[tableName];

  return {
    async findUnique(args: { where: Row; include?: Row; select?: Row }) {
      const found = rows().find((r) => matchesWhere(tables, tableName, r, args.where));
      return found ? resolveRow(tables, tableName, found, args) : null;
    },
    async findFirst(args: { where?: Row; include?: Row; select?: Row; orderBy?: Row | Row[] } = {}) {
      let list = rows().filter((r) => matchesWhere(tables, tableName, r, args.where));
      list = sortRows(list, args.orderBy);
      const found = list[0];
      return found ? resolveRow(tables, tableName, found, args) : null;
    },
    async findMany(args: { where?: Row; include?: Row; select?: Row; orderBy?: Row | Row[]; skip?: number; take?: number } = {}) {
      let list = rows().filter((r) => matchesWhere(tables, tableName, r, args.where));
      list = sortRows(list, args.orderBy);
      if (args.skip) list = list.slice(args.skip);
      if (args.take !== undefined) list = list.slice(0, args.take);
      return list.map((r) => resolveRow(tables, tableName, r, args));
    },
    async create(args: { data: Row; include?: Row; select?: Row }) {
      const data = { ...args.data };
      // Support nested players.create on match
      if (tableName === "match" && data.players?.create) {
        const playersInput = data.players.create as Row[];
        delete data.players;
        const created = applyDefaults(tableName, data);
        rows().push(created);
        for (const p of playersInput) {
          tables.matchPlayer.push(applyDefaults("matchPlayer", { ...p, matchId: created.id }));
        }
        return resolveRow(tables, tableName, created, args);
      }
      const created = applyDefaults(tableName, data);
      rows().push(created);
      return resolveRow(tables, tableName, created, args);
    },
    async update(args: { where: Row; data: Row; include?: Row; select?: Row }) {
      const found = rows().find((r) => matchesWhere(tables, tableName, r, args.where));
      if (!found) throw new Error(`Record not found in ${String(tableName)}`);
      applyUpdateData(found, args.data);
      return resolveRow(tables, tableName, found, args);
    },
    async updateMany(args: { where?: Row; data: Row }) {
      const matched = rows().filter((r) => matchesWhere(tables, tableName, r, args.where));
      for (const r of matched) applyUpdateData(r, args.data);
      return { count: matched.length };
    },
    async upsert(args: { where: Row; create: Row; update: Row; include?: Row; select?: Row }) {
      const found = rows().find((r) => matchesWhere(tables, tableName, r, args.where));
      if (found) {
        applyUpdateData(found, args.update);
        return resolveRow(tables, tableName, found, args);
      }
      const created = applyDefaults(tableName, args.create);
      rows().push(created);
      return resolveRow(tables, tableName, created, args);
    },
    async delete(args: { where: Row }) {
      const idx = rows().findIndex((r) => matchesWhere(tables, tableName, r, args.where));
      if (idx === -1) throw new Error(`Record not found in ${String(tableName)}`);
      const [removed] = rows().splice(idx, 1);
      return removed;
    },
    async deleteMany(args: { where?: Row } = {}) {
      const arr = rows();
      let count = 0;
      for (let i = arr.length - 1; i >= 0; i--) {
        if (matchesWhere(tables, tableName, arr[i], args.where)) {
          arr.splice(i, 1);
          count++;
        }
      }
      return { count };
    },
    async count(args: { where?: Row } = {}) {
      return rows().filter((r) => matchesWhere(tables, tableName, r, args.where)).length;
    },
    async groupBy(args: { by: string[]; where?: Row; _count?: { _all?: boolean } }) {
      const filtered = rows().filter((r) => matchesWhere(tables, tableName, r, args.where));
      const map = new Map<string, Row>();
      for (const r of filtered) {
        const key = args.by.map((f) => String(r[f])).join("::");
        const existing = map.get(key);
        if (existing) {
          existing._count._all += 1;
        } else {
          const entry: Row = { _count: { _all: 1 } };
          for (const f of args.by) entry[f] = r[f];
          map.set(key, entry);
        }
      }
      return [...map.values()];
    },
    async aggregate(args: { where?: Row; _count?: { _all?: boolean }; _avg?: Record<string, boolean>; _max?: Record<string, boolean> }) {
      const filtered = rows().filter((r) => matchesWhere(tables, tableName, r, args.where));
      const out: Row = {};
      if (args._count?._all) out._count = { _all: filtered.length };
      if (args._avg) {
        out._avg = {};
        for (const k of Object.keys(args._avg)) {
          const nums = filtered.map((r) => r[k]).filter((n) => typeof n === "number");
          out._avg[k] = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
        }
      }
      if (args._max) {
        out._max = {};
        for (const k of Object.keys(args._max)) {
          const nums = filtered.map((r) => r[k]).filter((n) => typeof n === "number");
          out._max[k] = nums.length ? Math.max(...nums) : null;
        }
      }
      return out;
    },
  };
}

export function createPreviewPrisma(): PrismaClient {
  const tables = getTables();
  const client: Row = {
    user: makeDelegate(tables, "user"),
    session: makeDelegate(tables, "session"),
    anime: makeDelegate(tables, "anime"),
    character: makeDelegate(tables, "character"),
    match: makeDelegate(tables, "match"),
    matchPlayer: makeDelegate(tables, "matchPlayer"),
    auctionLot: makeDelegate(tables, "auctionLot"),
    bid: makeDelegate(tables, "bid"),
    ownedCharacter: makeDelegate(tables, "ownedCharacter"),
    debate: makeDelegate(tables, "debate"),
    characterComparison: makeDelegate(tables, "characterComparison"),
    comparisonVote: makeDelegate(tables, "comparisonVote"),
    comment: makeDelegate(tables, "comment"),
    reaction: makeDelegate(tables, "reaction"),
    favorite: makeDelegate(tables, "favorite"),
    badge: makeDelegate(tables, "badge"),
    userBadge: makeDelegate(tables, "userBadge"),
    notification: makeDelegate(tables, "notification"),
    xpEvent: makeDelegate(tables, "xpEvent"),
    coinEvent: makeDelegate(tables, "coinEvent"),
    season: makeDelegate(tables, "season"),
    gameRating: makeDelegate(tables, "gameRating"),
    gameMatch: makeDelegate(tables, "gameMatch"),
    gameMatchPlayer: makeDelegate(tables, "gameMatchPlayer"),
    moderationLog: makeDelegate(tables, "moderationLog"),
    matchSpectator: makeDelegate(tables, "matchSpectator"),
    queueEntry: makeDelegate(tables, "queueEntry"),
    arenaRoom: makeDelegate(tables, "arenaRoom"),
    async $transaction(fn: ((tx: any) => Promise<any>) | Promise<any>[]) {
      if (Array.isArray(fn)) return Promise.all(fn);
      return fn(client);
    },
    async $queryRaw() {
      return [{ "?column?": 1 }];
    },
    async $executeRaw() {
      return 0;
    },
    async $disconnect() {
      return undefined;
    },
  };
  return client as unknown as PrismaClient;
}
