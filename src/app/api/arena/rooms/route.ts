import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/http";
import type { Locale } from "@/lib/i18n";
import { ArenaHttpError, EngineError, getArenaManager } from "@/server/arena-manager";
import { handleLive, ok } from "@/server/live/http";

export const dynamic = "force-dynamic";

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

/** Public 1v1 Counter-Pick Arena rooms waiting for a challenger. */
export async function GET(req: NextRequest) {
  return handleLive(req, async () => {
    const manager = await getArenaManager();
    return ok(manager.listOpenRooms());
  });
}

/** Create a 1v1 Counter-Pick Arena room with a validated 5-card deck. */
export async function POST(req: NextRequest) {
  return handleLive(req, async (ctx) => {
    const user = ctx.requireUser();
    if (!rateLimit(`arena-create:${user.id}:${clientIp(req)}`, 20, 10 * 60_000)) {
      throw new EngineError("RATE_LIMITED");
    }
    const body = (await req.json().catch(() => null)) as { deckIds?: unknown } | null;
    const deckIds = Array.isArray(body?.deckIds)
      ? body.deckIds.filter((id): id is string => typeof id === "string")
      : [];

    const manager = await getArenaManager();
    try {
      const code = await manager.createRoom(user.id, deckIds);
      return ok({ code });
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
