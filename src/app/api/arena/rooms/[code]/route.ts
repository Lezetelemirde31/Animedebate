import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/http";
import type { Locale } from "@/lib/i18n";
import { normalizeRoomCode } from "@/game/rules";
import type { ArenaAction } from "@/game/types";
import { ArenaHttpError, EngineError, getArenaManager } from "@/server/arena-manager";
import { handleLive, ok } from "@/server/live/http";

export const dynamic = "force-dynamic";

const ACTIONS = new Set(["join", "sync", "play", "leave"]);

const DECK_ERRORS: Record<Locale, Record<ArenaHttpError["reason"], string>> = {
  tr: {
    WRONG_SIZE: "Deste tam olarak 5 kart içermelidir.",
    DUPLICATE_CARDS: "Destede aynı karakter birden fazla kez yer alamaz.",
    UNOWNED_CARD: "Seçtiğin bir veya daha fazla karta sahip değilsin.",
    OVER_BUDGET: "Deste toplam gücü 375 sınırını aşıyor.",
  },
  en: {
    WRONG_SIZE: "Deck must contain exactly 5 cards.",
    DUPLICATE_CARDS: "Deck cannot contain duplicate characters.",
    UNOWNED_CARD: "You do not own one or more selected cards.",
    OVER_BUDGET: "Deck power exceeds the 375 cap.",
  },
};

/** Handles join, sync, play, and leave actions for a 1v1 Counter-Pick Arena room. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  return handleLive(req, async (ctx) => {
    const user = ctx.requireUser();
    const code = normalizeRoomCode((await params).code);
    if (!code) throw new EngineError("INVALID_INPUT", "ROOM_CODE");
    const body = (await req.json().catch(() => null)) as ArenaAction | null;
    if (!body || typeof body !== "object" || !ACTIONS.has(body.action)) {
      throw new EngineError("INVALID_INPUT");
    }
    if (!rateLimit(`arena:${user.id}`, 80, 10_000)) {
      throw new EngineError("RATE_LIMITED");
    }

    const manager = await getArenaManager();
    try {
      switch (body.action) {
        case "join": {
          const deckIds = Array.isArray(body.deckIds)
            ? body.deckIds.filter((id): id is string => typeof id === "string")
            : undefined;
          return ok(await manager.joinRoom(code, user.id, deckIds));
        }
        case "sync":
          return ok(await manager.syncRoom(code, user.id));
        case "play":
          if (typeof body.cardId !== "string") throw new EngineError("INVALID_INPUT");
          return ok(await manager.playCard(code, user.id, body.cardId));
        case "leave":
          await manager.leaveRoom(code, user.id);
          return ok();
      }
    } catch (err) {
      if (err instanceof ArenaHttpError) {
        return NextResponse.json({
          ok: false,
          code: err.code,
          message: DECK_ERRORS[ctx.locale][err.reason],
          serverNow: Date.now(),
        });
      }
      throw err;
    }
  });
}
