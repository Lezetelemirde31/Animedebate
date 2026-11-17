/**
 * Socket.IO transport. Authenticates sockets from the session cookie, routes
 * client intents to the RoomManager / MatchEngine and fans state out to rooms.
 * The client never sends balances or results — only intents (bid X on lot Y),
 * which the engine validates.
 */
import type { Server, Socket } from "socket.io";
import { SESSION_COOKIE, parseCookies } from "@/lib/auth/tokens";
import { getUserBySessionToken, type SessionUser } from "@/lib/auth/session-store";
import { LANG_COOKIE_NAME, normalizeLocale, type Locale } from "@/lib/i18n";
import { createRoomSchema, firstIssue } from "@/lib/validation";
import { normalizeRoomCode } from "@/game/rules";
import type { Ack, ClientToServerEvents, ErrorCode, PresenceStats, ServerToClientEvents } from "@/game/types";
import { EngineError } from "./engine";
import { ArenaManager } from "./arena-manager";
import type { RoomManager, Transport } from "./manager";

export interface SocketData {
  user: SessionUser | null;
  locale: Locale;
  roomCode: string | null;
  arenaCode: string | null;
  bucket: { tokens: number; updatedAt: number };
}

export type IO = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

const roomChannel = (code: string) => `room:${code}`;
const arenaChannel = (code: string) => `arena:${code}`;
const userChannel = (userId: string) => `user:${userId}`;
const ROOM_WATCHERS = "watch:rooms";
const ARENA_WATCHERS = "watch:arena";

// Simple token bucket: 25 actions, refilling 8 per second.
const BUCKET_SIZE = 25;
const BUCKET_REFILL_PER_MS = 8 / 1000;

const SOCKET_TEXT = {
  tr: {
    rateLimited: "Biraz yavaşla.",
    unauthorized: "Oynamak için lütfen giriş yap.",
    serverError: "Bir şeyler ters gitti. Lütfen tekrar dene.",
    invalidCode: "Oda kodları 6 karakterdir.",
    matchEnded: "Bu açık artırma zaten sona ermiş.",
    roomNotFound: "Bu koda sahip bir oda bulunamadı.",
    activeMatch: (code: string) => `Hâlâ ${code} odasında oynuyorsun.`,
    roomMissing: "Oda bulunamadı.",
    missingLot: "Eksik tur bilgisi.",
  },
  en: {
    rateLimited: "Slow down a little.",
    unauthorized: "Please sign in to play.",
    serverError: "Something went wrong. Please try again.",
    invalidCode: "Room codes are 6 characters.",
    matchEnded: "This auction has already ended.",
    roomNotFound: "No room with that code exists.",
    activeMatch: (code: string) => `You are still playing in room ${code}.`,
    roomMissing: "Room not found.",
    missingLot: "Missing lot.",
  },
} as const;

function localizeEngineMessage(locale: Locale, message: string): string {
  if (locale === "en") return message;
  const activeMatch = /^You are already playing in room ([A-Z0-9]+)\.$/.exec(message);
  if (activeMatch) return `Zaten ${activeMatch[1]} odasında oynuyorsun.`;
  const activeArena = /^You are already in arena room ([A-Z0-9]+)\.$/.exec(message);
  if (activeArena) return `Zaten ${activeArena[1]} arena odasındasın.`;
  switch (message) {
    case "Account not found.":
      return "Hesap bulunamadı.";
    case "Not enough characters in the selected anime for that many lots.":
      return "Seçili animelerde bu kadar tur için yeterli karakter yok.";
    case "You are not seated in this room.":
      return "Bu odada oyuncu koltuğunda değilsin.";
    case "The match has already started.":
      return "Maç zaten başladı.";
    case "No characters are available for the selected anime.":
      return "Seçili anime için uygun karakter yok.";
    case "Only players can request a rematch.":
      return "Sadece oyuncular rövanş isteyebilir.";
    case "The match is not finished.":
      return "Maç henüz bitmedi.";
    case "Your opponent has left the room.":
      return "Rakibin odadan ayrıldı.";
    case "Deck must contain exactly 5 cards.":
      return "Destede tam olarak 5 kart olmalıdır.";
    case "Deck cannot contain duplicate characters.":
      return "Aynı karakter destede birden fazla kez yer alamaz.";
    case "You do not own one or more selected cards.":
      return "Seçtiğin kartlardan bir veya birkaçı koleksiyonunda ya da başlangıç havuzunda değil.";
    case "Deck power exceeds the 375 cap.":
      return "Deste toplam gücü 375 sınırını aşıyor.";
    case "Invalid arena room code.":
      return "Geçersiz arena oda kodu.";
    case "Arena room not found.":
      return "Arena odası bulunamadı.";
    case "You are not seated in this arena match.":
      return "Bu arena maçında oyuncu koltuğunda değilsin.";
    case "Cannot play a card in the current phase.":
      return "Şu anki aşamada kart oynanamaz.";
    case "Wait for your turn.":
      return "Sıranı bekle.";
    case "Card is not in your remaining hand.":
      return "Seçilen kart elinde bulunmuyor.";
    default:
      return message;
  }
}

function takeToken(socket: AppSocket): boolean {
  const b = socket.data.bucket;
  const now = Date.now();
  b.tokens = Math.min(BUCKET_SIZE, b.tokens + (now - b.updatedAt) * BUCKET_REFILL_PER_MS);
  b.updatedAt = now;
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  return true;
}

function fail(code: ErrorCode, message: string, data?: { code?: string; matchId?: string }) {
  return { ok: false as const, code, message, ...(data ? { data } : {}) };
}

function throttle(fn: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      fn();
    }, ms);
  };
}

export function attachSocketServer(io: IO, manager: RoomManager, arenaManager?: ArenaManager): void {
  const arena = arenaManager ?? new ArenaManager(manager.catalog);
  const userSockets = new Map<string, Set<string>>();

  const presence = (): PresenceStats => ({ online: userSockets.size, ...manager.stats() });

  const transport: Transport = {
    publishRoom: (code, snapshot) => io.to(roomChannel(code)).emit("room:state", snapshot),
    emitRoom: (code, event) => io.to(roomChannel(code)).emit("room:event", event),
    emitToUser: (userId, event, payload) => io.to(userChannel(userId)).emit(event, payload as never),
    redirectRoom: (from, to) => io.to(roomChannel(from)).emit("room:redirect", { from, to }),
    roomsChanged: throttle(() => io.to(ROOM_WATCHERS).emit("rooms:updated", manager.listOpenRooms()), 300),
    statsChanged: throttle(() => io.emit("presence:stats", presence()), 750),
  };
  manager.setTransport(transport);

  arena.setTransport({
    emitRoomState: (_code, sockets, buildSnapshot) => {
      for (const [socketId, uid] of sockets) {
        io.to(socketId).emit("arena:state", buildSnapshot(uid));
      }
    },
    roomsChanged: throttle(() => io.to(ARENA_WATCHERS).emit("arena:updated", arena.listOpenRooms()), 300),
  });

  io.use(async (socket, next) => {
    const cookies = parseCookies(socket.handshake.headers.cookie);
    socket.data.locale = normalizeLocale(cookies[LANG_COOKIE_NAME]);
    try {
      socket.data.user = await getUserBySessionToken(cookies[SESSION_COOKIE]);
    } catch {
      socket.data.user = null;
    }
    socket.data.roomCode = null;
    socket.data.arenaCode = null;
    socket.data.bucket = { tokens: BUCKET_SIZE, updatedAt: Date.now() };
    next();
  });

  io.on("connection", (socket: AppSocket) => {
    const user = socket.data.user;
    const msg = SOCKET_TEXT[socket.data.locale];
    if (user) {
      socket.join(userChannel(user.id));
      const set = userSockets.get(user.id) ?? new Set();
      const wasOffline = set.size === 0;
      set.add(socket.id);
      userSockets.set(user.id, set);
      if (wasOffline) transport.statsChanged();
      const queued = manager.queueEntry(user.id);
      if (queued) socket.emit("queue:status", { inQueue: true, since: queued.since });
    }
    socket.emit("presence:stats", presence());

    /** Wraps a handler with auth, rate limiting and uniform error handling. */
    function on<E extends keyof ClientToServerEvents>(
      event: E,
      opts: { auth: boolean },
      handler: (user: SessionUser | null, ...args: Parameters<ClientToServerEvents[E]>) => Promise<void> | void,
    ) {
      socket.on(event, (async (...args: unknown[]) => {
        const ack = args[args.length - 1];
        const reply = (res: Ack<unknown>) => {
          if (typeof ack === "function") (ack as (r: Ack<unknown>) => void)(res);
        };
        if (typeof ack !== "function") return;
        if (!takeToken(socket)) return reply(fail("RATE_LIMITED", msg.rateLimited));
        if (opts.auth && !socket.data.user) return reply(fail("UNAUTHORIZED", msg.unauthorized));
        try {
          await handler(socket.data.user, ...(args as Parameters<ClientToServerEvents[E]>));
        } catch (err) {
          if (err instanceof EngineError) {
            return reply(fail(err.code, localizeEngineMessage(socket.data.locale, err.message)));
          }
          console.error(`[socket] ${String(event)} failed`, err);
          reply(fail("SERVER_ERROR", msg.serverError));
        }
      }) as never);
    }

    async function leaveCurrentRoom(): Promise<void> {
      const code = socket.data.roomCode;
      if (!code) return;
      socket.data.roomCode = null;
      socket.leave(roomChannel(code));
      await manager.get(code)?.detachSocket(socket.data.user?.id ?? null, socket.id);
    }

    function leaveCurrentArena(): void {
      const code = socket.data.arenaCode;
      if (!code) return;
      socket.data.arenaCode = null;
      socket.leave(arenaChannel(code));
      arena.detachSocket(code, socket.data.user?.id ?? null, socket.id);
    }

    socket.on("time:sync", (_clientNow, ack) => {
      if (typeof ack === "function") ack(Date.now());
    });

    on("room:create", { auth: true }, async (u, input, ack) => {
      const parsed = createRoomSchema.safeParse(input);
      if (!parsed.success) return ack(fail("INVALID_INPUT", firstIssue(parsed.error)));
      const code = await manager.createRoom(u!.id, parsed.data);
      ack({ ok: true, data: { code } });
    });

    on("room:join", { auth: true }, async (u, input, ack) => {
      const code = normalizeRoomCode(input?.code);
      if (!code) return ack(fail("INVALID_INPUT", msg.invalidCode));
      const engine = manager.get(code);
      if (!engine) {
        const ended = await manager.findEndedMatch(code);
        return ack(
          ended
            ? fail("MATCH_ENDED", msg.matchEnded, { matchId: ended.matchId })
            : fail("NOT_FOUND", msg.roomNotFound),
        );
      }
      if (socket.data.roomCode && socket.data.roomCode !== code) await leaveCurrentRoom();
      if (!engine.hasPlayer(u!.id) && engine.phase === "LOBBY" && engine.playerCount() < 2) {
        const elsewhere = manager.activeEngineOf(u!.id);
        if (elsewhere?.isLive && elsewhere.code !== code) {
          return ack(
            fail("ACTIVE_MATCH", msg.activeMatch(elsewhere.code), { code: elsewhere.code }),
          );
        }
        await manager.freeUpForSeat(u!.id, code);
        await engine.join(await manager.profile(u!.id));
      }
      if (socket.data.roomCode !== code) {
        socket.join(roomChannel(code));
        socket.data.roomCode = code;
        await engine.attachSocket(u!.id, socket.id);
      }
      ack({ ok: true, data: engine.snapshot() });
    });

    on("room:leave", { auth: true }, async (u, input, ack) => {
      const code = normalizeRoomCode(input?.code);
      const engine = code ? manager.get(code) : undefined;
      if (engine?.hasPlayer(u!.id)) await engine.leave(u!.id);
      if (socket.data.roomCode === code) await leaveCurrentRoom();
      ack({ ok: true });
    });

    on("room:ready", { auth: true }, async (u, input, ack) => {
      const code = normalizeRoomCode(input?.code);
      const engine = code ? manager.get(code) : undefined;
      if (!engine) return ack(fail("NOT_FOUND", msg.roomMissing));
      await engine.setReady(u!.id, input?.ready === true);
      ack({ ok: true });
    });

    on("auction:bid", { auth: true }, async (u, input, ack) => {
      const code = normalizeRoomCode(input?.code);
      const engine = code ? manager.get(code) : undefined;
      if (!engine) return ack(fail("NOT_FOUND", msg.roomMissing));
      if (typeof input?.lotId !== "string") return ack(fail("INVALID_INPUT", msg.missingLot));
      const res = await engine.bid(u!.id, input.lotId, input.amount);
      ack({ ok: true, data: res });
    });

    on("room:rematch", { auth: true }, async (u, input, ack) => {
      const code = normalizeRoomCode(input?.code);
      const engine = code ? manager.get(code) : undefined;
      if (!engine) return ack(fail("NOT_FOUND", msg.roomMissing));
      await manager.rematch(engine, u!.id);
      ack({ ok: true });
    });

    on("room:detach", { auth: false }, async (_u, input, ack) => {
      if (socket.data.roomCode && socket.data.roomCode === normalizeRoomCode(input?.code)) await leaveCurrentRoom();
      ack({ ok: true });
    });

    on("queue:join", { auth: true }, async (u, ack) => {
      const code = await manager.joinQueue(u!.id);
      ack({ ok: true, data: { matchedCode: code } });
    });

    on("queue:leave", { auth: true }, async (u, ack) => {
      manager.leaveQueue(u!.id);
      ack({ ok: true });
    });

    on("rooms:list", { auth: false }, async (_u, ack) => {
      socket.join(ROOM_WATCHERS);
      ack({ ok: true, data: manager.listOpenRooms() });
    });

    on("me:active", { auth: false }, async (u, ack) => {
      const engine = u ? manager.activeEngineOf(u.id) : undefined;
      ack({ ok: true, data: { code: engine?.code ?? null, phase: engine?.phase ?? null } });
    });

    on("arena:create", { auth: true }, async (u, input, ack) => {
      const deckIds = Array.isArray(input?.deckIds) ? input.deckIds.map(String) : [];
      const code = await arena.createRoom(u!.id, deckIds);
      ack({ ok: true, data: { code } });
    });

    on("arena:join", { auth: true }, async (u, input, ack) => {
      const code = normalizeRoomCode(input?.code);
      if (!code) return ack(fail("INVALID_INPUT", msg.invalidCode));
      if (socket.data.arenaCode && socket.data.arenaCode !== code) leaveCurrentArena();
      const deckIds = Array.isArray(input?.deckIds) ? input.deckIds.map(String) : undefined;
      const snapshot = await arena.joinRoom(code, u!.id, socket.id, deckIds);
      if (socket.data.arenaCode !== code) {
        socket.join(arenaChannel(code));
        socket.data.arenaCode = code;
      }
      ack({ ok: true, data: snapshot });
    });

    on("arena:play", { auth: true }, async (u, input, ack) => {
      const code = normalizeRoomCode(input?.code);
      if (!code) return ack(fail("INVALID_INPUT", msg.invalidCode));
      if (typeof input?.cardId !== "string" || !input.cardId) {
        return ack(fail("INVALID_INPUT", msg.missingLot));
      }
      const snapshot = await arena.playCard(code, u!.id, input.cardId);
      ack({ ok: true, data: snapshot });
    });

    on("arena:leave", { auth: true }, async (u, input, ack) => {
      const code = normalizeRoomCode(input?.code);
      if (code) {
        await arena.leaveRoom(code, u!.id);
        if (socket.data.arenaCode === code) leaveCurrentArena();
      }
      ack({ ok: true });
    });

    on("arena:list", { auth: false }, async (_u, ack) => {
      socket.join(ARENA_WATCHERS);
      ack({ ok: true, data: arena.listOpenRooms() });
    });

    socket.on("disconnect", () => {
      void leaveCurrentRoom().catch((err) => console.error("[socket] detach failed", err));
      leaveCurrentArena();
      if (!user) return;
      const set = userSockets.get(user.id);
      if (!set) return;
      set.delete(socket.id);
      if (set.size === 0) {
        userSockets.delete(user.id);
        manager.leaveQueue(user.id);
        transport.statsChanged();
      }
    });
  });
}
