/**
 * Game rules. Everything here is enforced on the server; the client only uses
 * these values for display and to pre-disable impossible actions.
 */
export const GAME_RULES = {
  /** Every player starts each match with this virtual balance (no real money). */
  startingBalance: 20,
  /** Minimum amount a new bid must exceed the current highest bid by. */
  minIncrement: 1,
  /** Allowed number of auction lots (characters) per match. */
  lotOptions: [6, 8, 10, 12] as const,
  defaultLots: 8,
  /** Allowed bidding timer lengths in seconds. */
  timerOptions: [10, 15, 20, 30] as const,
  defaultTimer: 20,
  /**
   * Overtime: a bid placed with less than this many seconds left resets the
   * clock to this value so the other player always gets a chance to respond.
   */
  overtimeSeconds: 6,
  /** Countdown before the first lot opens. */
  startCountdownMs: 3500,
  /** Pause between lots while the result is shown. */
  intermissionMs: 5000,
  /** How long a disconnected player has to come back before forfeiting. */
  reconnectGraceMs: 60_000,
  /** Lobby: how long a disconnected player keeps their seat. */
  lobbySeatGraceMs: 20_000,
  /** When a paused bidding phase resumes, the clock is at least this long. */
  minResumeMs: 8_000,
  /**
   * If, after a bid, the opponent cannot afford to counter it, the lot closes
   * this quickly instead of running out the full clock.
   */
  unopposedCloseMs: 2_500,
  /** Characters can be sold at most once per match. Unsold ones return to the pool. */
  uniquePerMatch: true,
  maxPlayers: 2,
} as const;

export const ROOM_CODE_LENGTH = 6;
/** Unambiguous alphabet for room codes (no 0/O/1/I/L). */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/**
 * Tie-breaking rule (shown in the UI):
 * Bids are processed strictly in the order the server receives them. A new bid
 * must beat the current highest bid by at least the minimum increment, so a
 * matching bid is rejected and the player who reached that price first keeps
 * the lead. If both players finish a match with the same score, the player with
 * more money left wins; if that is also equal the match is a draw.
 */
export const TIE_BREAK_RULE =
  "First to reach a price holds it — an equal bid never takes the lead. Match ties go to the player with more money left.";
