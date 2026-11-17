import type { Rarity } from "./rarity";
import type { PowerTierCode } from "./power-tier";
import type { WinnerDetail } from "./rules";
import type { ArenaCard, RoundResolution } from "./arena";

/** Character data sent to clients. */
export interface CharacterDTO {
  id: string;
  name: string;
  title: string;
  animeId: string;
  animeName: string;
  imageUrl: string | null;
  description: string;
  abilities: string[];
  rarity: Rarity;
  powerLevel: number | null;
  primeForm?: string;
  tierCode?: PowerTierCode;
}

export interface AvatarDTO {
  style: string;
  imageUrl: string | null;
}

export type Phase =
  | "LOBBY"
  | "COUNTDOWN"
  | "BIDDING"
  | "INTERMISSION"
  | "PAUSED"
  | "FINISHED"
  | "ABANDONED";

export interface RoomSettings {
  /** Expected number of characters sold (team size × players); the match ends when every team is full. */
  totalLots: number;
  /** Characters per team. */
  teamSize: number;
  bidSeconds: number;
  startingBalance: number;
  minIncrement: number;
  overtimeSeconds: number;
  animeIds: string[];
}

export interface PlayerState {
  userId: string;
  username: string;
  avatar: AvatarDTO;
  seat: number;
  balance: number;
  /** Team score; null while the match is running (scores are revealed at the end). */
  score: number | null;
  ready: boolean;
  connected: boolean;
  isHost: boolean;
  /** Characters won in this match (ids, in order). */
  wonCharacterIds: string[];
  /** Server time (ms) until which this player's seat/match is held while disconnected. */
  disconnectDeadline: number | null;
}

export interface BidDTO {
  id: string;
  userId: string;
  username: string;
  amount: number;
  at: number;
}

export interface LotState {
  id: string;
  lotNumber: number;
  character: CharacterDTO;
  startingPrice: number;
  highestBid: number | null;
  highestBidderId: string | null;
  bids: BidDTO[];
  startedAt: number;
  /** Server timestamp at which bidding closes (null while paused). */
  endsAt: number | null;
  status: "ACTIVE" | "SOLD" | "UNSOLD" | "CANCELLED";
  winnerId: string | null;
  finalPrice: number | null;
  /** It was this player's turn to open: the server placed their opening bid. */
  forcedOpenerId: string | null;
  /** Players who voted to skip this character. */
  skipVotes: string[];
  /** Both players skipped it. */
  skipped: boolean;
  /** Given for free to a player who ran out of money. */
  autoAssigned: boolean;
}

export interface LotSummary {
  id: string;
  lotNumber: number;
  character: CharacterDTO;
  status: "SOLD" | "UNSOLD" | "CANCELLED";
  winnerId: string | null;
  finalPrice: number | null;
  bidCount: number;
  skipped: boolean;
  autoAssigned: boolean;
}

export interface MatchResultDetail {
  note?: "left" | "no_reconnect" | "all_spent" | "pool_empty" | "everyone_left" | "both_disconnected";
  names?: string[];
  decision?: WinnerDetail;
}

export interface MatchResultState {
  winnerId: string | null;
  reason: "COMPLETED" | "FORFEIT" | "ABANDONED" | "POOL_EXHAUSTED";
  /** Structured explanation of how the winner was decided. */
  detail: MatchResultDetail;
}

export interface RoomSnapshot {
  version: number;
  serverNow: number;
  matchId: string;
  code: string;
  phase: Phase;
  isPrivate: boolean;
  isMatchmade: boolean;
  hostId: string | null;
  settings: RoomSettings;
  players: PlayerState[];
  /** Number of lots that have been completed (sold or unsold). */
  lotsCompleted: number;
  currentLot: LotState | null;
  /** End of the current timed phase (countdown / intermission / pause deadline). */
  phaseEndsAt: number | null;
  /** While PAUSED: the phase that will resume. */
  pausedPhase: Phase | null;
  history: LotSummary[];
  result: MatchResultState | null;
  rematchVotes: string[];
  rematchCode: string | null;
  /** Whose turn it is to open the next lot (null: whoever bids first). */
  nextOpenerId: string | null;
  /** Number of characters still in the pool. */
  poolRemaining: number;
  /** Number of spectators currently watching. */
  spectators: number;
}

export type RoomEvent =
  | { type: "player_joined"; userId: string; username: string }
  | { type: "player_left"; userId: string; username: string }
  | { type: "player_disconnected"; userId: string; username: string }
  | { type: "player_reconnected"; userId: string; username: string }
  | { type: "bid"; bid: BidDTO; overtime: boolean }
  | { type: "lot_started"; lotNumber: number; characterName: string }
  | { type: "lot_sold"; lotNumber: number; characterName: string; winnerId: string; username: string; price: number }
  | { type: "lot_unsold"; lotNumber: number; characterName: string }
  | { type: "match_paused"; userId: string }
  | { type: "match_resumed" }
  | { type: "match_finished"; winnerId: string | null };

export interface OpenRoomDTO {
  code: string;
  host: { username: string; avatar: AvatarDTO };
  settings: RoomSettings;
  createdAt: number;
}

export interface PresenceStats {
  online: number;
  inQueue: number;
  liveMatches: number;
  openRooms: number;
}

export interface PresenceDTO {
  serverNow: number;
  stats: PresenceStats;
  active: { code: string; phase: string } | null;
  queue: { inQueue: boolean; since: number | null; matchedCode: string | null };
}

export type ErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "ROOM_FULL"
  | "MATCH_ENDED"
  | "ACTIVE_MATCH"
  | "NOT_A_PLAYER"
  | "NOT_BIDDING"
  | "LOT_MISMATCH"
  | "TIME_UP"
  | "INVALID_AMOUNT"
  | "ALREADY_HIGHEST"
  | "BELOW_MINIMUM"
  | "INSUFFICIENT_BALANCE"
  | "TEAM_FULL"
  | "INVALID_INPUT"
  | "RATE_LIMITED"
  | "INVALID_STATE"
  | "SERVER_ERROR";

export type Ack<T = undefined> =
  | ({ ok: true; serverNow?: number } & (T extends undefined ? object : { data: T }))
  | { ok: false; code: ErrorCode; message: string; serverNow?: number; data?: { code?: string; matchId?: string } };

export type ArenaAction =
  | { action: "join"; deckIds?: string[] }
  | { action: "sync" }
  | { action: "play"; cardId: string }
  | { action: "leave" };

export interface CreateRoomInput {
  isPrivate: boolean;
  bidSeconds: number;
  animeIds: string[];
}

/** Room actions sent to POST /api/live/rooms/[code]. */
export type RoomAction =
  | { action: "join" }
  | { action: "sync" }
  | { action: "ready"; ready: boolean }
  | { action: "bid"; lotId: string; amount: number }
  | { action: "skip" }
  | { action: "leave" }
  | { action: "rematch" };

export type ArenaPhase = "LOBBY" | "ATTACK" | "DEFEND" | "ROUND_REVEAL" | "FINISHED" | "ABANDONED";

export interface ArenaPlayerSnapshot {
  userId: string;
  username: string;
  avatar: AvatarDTO;
  seat: 0 | 1;
  score: number;
  cardsRemaining: number;
  totalPower: number;
  connected: boolean;
}

export interface ArenaRoomSnapshot {
  code: string;
  phase: ArenaPhase;
  roundNumber: number;
  attackerSeat: 0 | 1;
  players: ArenaPlayerSnapshot[];
  mySeat: 0 | 1 | null;
  myHand: ArenaCard[];
  attackerCard: ArenaCard | null;
  lastResolution: RoundResolution | null;
  history: RoundResolution[];
  winnerId: string | null;
  xpAwarded: number | null;
  createdAt: number;
}

export interface OpenArenaRoomDTO {
  code: string;
  host: { username: string; avatar: AvatarDTO };
  totalPower: number;
  createdAt: number;
}

export interface ClientToServerEvents {
  "time:sync": (clientNow: number, ack: (serverNow: number) => void) => void;
  "room:create": (input: CreateRoomInput, ack: (res: Ack<{ code: string }>) => void) => void;
  "room:join": (input: { code: string }, ack: (res: Ack<RoomSnapshot>) => void) => void;
  "room:leave": (input: { code: string }, ack: (res: Ack) => void) => void;
  /** Stop receiving updates for a room without giving up the seat (e.g. navigating away). */
  "room:detach": (input: { code: string }, ack: (res: Ack) => void) => void;
  "room:ready": (input: { code: string; ready: boolean }, ack: (res: Ack) => void) => void;
  "room:rematch": (input: { code: string }, ack: (res: Ack) => void) => void;
  "auction:bid": (input: { code: string; lotId: string; amount: number }, ack: (res: Ack<{ amount: number }>) => void) => void;
  "queue:join": (ack: (res: Ack<{ matchedCode: string | null }>) => void) => void;
  "queue:leave": (ack: (res: Ack) => void) => void;
  "rooms:list": (ack: (res: Ack<OpenRoomDTO[]>) => void) => void;
  "me:active": (ack: (res: Ack<{ code: string | null; phase: Phase | null }>) => void) => void;

  "arena:create": (input: { deckIds: string[] }, ack: (res: Ack<{ code: string }>) => void) => void;
  "arena:join": (input: { code: string; deckIds?: string[] }, ack: (res: Ack<ArenaRoomSnapshot>) => void) => void;
  "arena:play": (input: { code: string; cardId: string }, ack: (res: Ack<ArenaRoomSnapshot>) => void) => void;
  "arena:leave": (input: { code: string }, ack: (res: Ack) => void) => void;
  "arena:list": (ack: (res: Ack<OpenArenaRoomDTO[]>) => void) => void;
}

export interface ServerToClientEvents {
  "room:state": (snapshot: RoomSnapshot) => void;
  "room:event": (event: RoomEvent & { code: string; at: number }) => void;
  "room:redirect": (input: { from: string; to: string }) => void;
  "queue:matched": (input: { code: string }) => void;
  "queue:status": (input: { inQueue: boolean; since: number | null }) => void;
  "presence:stats": (stats: PresenceStats) => void;
  "rooms:updated": (rooms: OpenRoomDTO[]) => void;

  "arena:state": (snapshot: ArenaRoomSnapshot) => void;
  "arena:updated": (rooms: OpenArenaRoomDTO[]) => void;
}
