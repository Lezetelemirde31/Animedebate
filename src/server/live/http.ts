import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { ErrorCode } from "@/game/types";
import { getCurrentUser } from "@/lib/auth/server";
import type { SessionUser } from "@/lib/auth/session-store";
import { isSameOrigin } from "@/lib/http";
import { LANG_COOKIE_NAME, normalizeLocale, type Locale } from "@/lib/i18n";
import { EngineError } from "./room";

/** Messages for live-auction errors, by `EngineError.key`. `{name}` is filled from params. */
const MESSAGES: Record<Locale, Record<string, string>> = {
  tr: {
    UNAUTHORIZED: "Oynamak için giriş yapmalısın.",
    FORBIDDEN: "Bu işlem için yetkin yok.",
    CROSS_SITE: "Güvenlik doğrulaması başarısız. Sayfayı yenileyip tekrar dene.",
    RATE_LIMITED: "Çok hızlı gidiyorsun. Biraz bekleyip tekrar dene.",
    SERVER_ERROR: "Bir şeyler ters gitti. Lütfen tekrar dene.",
    INVALID_INPUT: "Gönderilen bilgi geçersiz.",
    INVALID_STATE: "Bu işlem şu an yapılamaz.",
    NOT_FOUND: "Aradığın oda bulunamadı.",
    ROOM_NOT_FOUND: "Bu koda sahip bir oda yok.",
    ROOM_CODE: "Oda kodları 6 karakterdir.",
    ACTIVE_MATCH: "{code} odasındaki maçın hâlâ devam ediyor.",
    NOT_A_PLAYER: "Yalnızca odadaki oyuncular bunu yapabilir.",
    NOT_BIDDING: "Şu an teklif verilemiyor.",
    LOT_MISMATCH: "Bu lot kapandı.",
    TIME_UP: "Bu lot için süre doldu.",
    INVALID_AMOUNT: "Teklifler tam dolar tutarında olmalı.",
    ALREADY_HIGHEST: "En yüksek teklif zaten sende.",
    TEAM_FULL: "Takımın dolu ({size} karakter). Rakibin takımını tamamlamasını bekle.",
    SKIP_AFTER_BID: "Teklif verildikten sonra karakter atlanamaz.",
    BELOW_OPENING: "Açılış teklifi en az ${min} olmalı.",
    BELOW_MINIMUM: "Teklif ${current} tutarını en az ${increment} aşmalı (en az ${min}).",
    INSUFFICIENT_BALANCE: "Yalnızca ${balance} bakiyen var.",
    NO_CHARACTERS: "Seçilen animelerde kullanılabilir karakter yok.",
    NOT_ENOUGH_CHARACTERS: "Seçilen animelerde iki takımı dolduracak kadar karakter yok.",
    ALREADY_STARTED: "Maç çoktan başladı.",
    NOT_FINISHED: "Maç henüz bitmedi.",
    OPPONENT_LEFT: "Rakibin odadan ayrıldı.",
    LOTS_INVALID: "Geçersiz tur sayısı.",
    TIMER_INVALID: "Geçersiz teklif süresi.",
    ANIME_REQUIRED: "En az bir anime seçmelisin.",
    ANIME_UNSUPPORTED: "Desteklenmeyen bir anime seçildi.",
    VERSUS_NOT_FOUND: "Bu koda sahip bir 1v1 maçı yok.",
    VERSUS_ACTIVE: "Devam eden bir 1v1 maçın var ({code}). Önce onu bitir.",
    VERSUS_NOT_PICKING: "Karakter seçimi bitti.",
    VERSUS_ALREADY_PICKED: "Karakterini zaten seçtin.",
    VERSUS_BAD_PICK: "Bu karakter seçilemez.",
    VERSUS_NOT_BATTLE: "Şu an hamle yapılamaz.",
    VERSUS_TURN_OVER: "Bu tur bitti; yeni tur başladı.",
    VERSUS_ALREADY_MOVED: "Bu tur için hamleni zaten seçtin.",
    VERSUS_BAD_MOVE: "Geçersiz hamle.",
    VERSUS_NO_ENERGY: "Bu yetenek için yeterli enerjin yok.",
    VERSUS_ON_COOLDOWN: "Bu yetenek henüz hazır değil.",
  },
  en: {
    UNAUTHORIZED: "Please sign in to play.",
    FORBIDDEN: "You are not allowed to do that.",
    CROSS_SITE: "Cross-site request blocked.",
    RATE_LIMITED: "You're going too fast. Please wait a moment.",
    SERVER_ERROR: "Something went wrong. Please try again.",
    INVALID_INPUT: "The submitted data is invalid.",
    INVALID_STATE: "That can't be done right now.",
    NOT_FOUND: "Room not found.",
    ROOM_NOT_FOUND: "No room with that code exists.",
    ROOM_CODE: "Room codes are 6 characters.",
    ACTIVE_MATCH: "You are still playing in room {code}.",
    NOT_A_PLAYER: "Only seated players can do that.",
    NOT_BIDDING: "Bidding is not open right now.",
    LOT_MISMATCH: "That lot has already closed.",
    TIME_UP: "Time is up for this lot.",
    INVALID_AMOUNT: "Bids must be whole dollar amounts.",
    ALREADY_HIGHEST: "You already hold the highest bid.",
    TEAM_FULL: "Your team is full ({size} characters). Wait for your opponent to complete theirs.",
    SKIP_AFTER_BID: "A character can't be skipped once someone has bid.",
    BELOW_OPENING: "The opening bid is at least ${min}.",
    BELOW_MINIMUM: "Bids must beat ${current} by at least ${increment} (minimum ${min}).",
    INSUFFICIENT_BALANCE: "You only have ${balance} available.",
    NO_CHARACTERS: "No characters are available for the selected anime.",
    NOT_ENOUGH_CHARACTERS: "The selected anime don't have enough characters to fill both teams.",
    ALREADY_STARTED: "The match has already started.",
    NOT_FINISHED: "The match is not finished.",
    OPPONENT_LEFT: "Your opponent has left the room.",
    LOTS_INVALID: "Invalid number of lots.",
    TIMER_INVALID: "Invalid bid timer.",
    ANIME_REQUIRED: "Pick at least one anime.",
    ANIME_UNSUPPORTED: "Unsupported anime selected.",
    VERSUS_NOT_FOUND: "No 1v1 match with that code exists.",
    VERSUS_ACTIVE: "You have a 1v1 match in progress ({code}). Finish it first.",
    VERSUS_NOT_PICKING: "The draft is over.",
    VERSUS_ALREADY_PICKED: "You already picked your fighter.",
    VERSUS_BAD_PICK: "That character can't be picked.",
    VERSUS_NOT_BATTLE: "You can't make a move right now.",
    VERSUS_TURN_OVER: "That turn is over; a new turn has started.",
    VERSUS_ALREADY_MOVED: "You already chose your move this turn.",
    VERSUS_BAD_MOVE: "Invalid move.",
    VERSUS_NO_ENERGY: "Not enough energy for that technique.",
    VERSUS_ON_COOLDOWN: "That technique isn't ready yet.",
  },
};

const STATUS: Partial<Record<ErrorCode, number>> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  SERVER_ERROR: 500,
};

function message(locale: Locale, key: string, params?: Record<string, string | number>): string {
  const text = MESSAGES[locale][key] ?? MESSAGES[locale][key.split(".")[0]] ?? MESSAGES[locale].SERVER_ERROR;
  return text.replace(/\{(\w+)\}/g, (m, name: string) => (params && name in params ? String(params[name]) : m));
}

export function ok<D>(data?: D) {
  return NextResponse.json({ ok: true, serverNow: Date.now(), ...(data === undefined ? {} : { data }) });
}

export interface LiveCtx {
  locale: Locale;
  user: SessionUser | null;
  requireUser(): SessionUser;
}

/** Wraps a live API handler: cross-site check, user + language, uniform `{ ok:false, code, message }` errors. */
export async function handleLive(req: NextRequest, fn: (ctx: LiveCtx) => Promise<NextResponse>): Promise<NextResponse> {
  const locale = normalizeLocale(req.cookies.get(LANG_COOKIE_NAME)?.value);
  const fail = (code: ErrorCode, key: string, params?: Record<string, string | number>, data?: unknown) =>
    NextResponse.json(
      { ok: false, code, message: message(locale, key, params), serverNow: Date.now(), ...(data ? { data } : {}) },
      { status: STATUS[code] ?? 200 },
    );
  try {
    if (req.method !== "GET" && !isSameOrigin(req)) return fail("FORBIDDEN", "CROSS_SITE");
    const user = await getCurrentUser();
    if (user?.isBanned) return fail("FORBIDDEN", "FORBIDDEN");
    return await fn({
      locale,
      user,
      requireUser() {
        if (!user) throw new EngineError("UNAUTHORIZED");
        return user;
      },
    });
  } catch (err) {
    if (err instanceof EngineError) return fail(err.code, err.key, err.params, err.data);
    console.error(`[live] ${req.method} ${req.nextUrl.pathname} failed`, err);
    return fail("SERVER_ERROR", "SERVER_ERROR");
  }
}
