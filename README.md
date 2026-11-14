# Anime Auction

A real-time, two-player anime character auction platform. Each player gets **$20 of virtual money** per match. A random character is revealed to both players at the same moment, they bid live against a synchronized clock, and the winner adds the character to their permanent collection.

> Virtual currency only. There are no deposits, withdrawals, purchases or any real-money features.

**Supported anime:** Naruto · Boruto · One Piece · Black Clover · Bleach · Tokyo Revengers (145 curated characters).

---

## Features

| Area | What's included |
| --- | --- |
| **Multiplayer** | Create room · join by private code · public open-room list · automatic matchmaking queue · ready check · spectators · rematch |
| **Live auction** | Server-authoritative bidding · synchronized timer (server-clock sync) · overtime on late bids · minimum increment · bid history · winner announcement · unsold characters return to the pool |
| **Resilience** | Disconnects pause the match and keep the clock frozen · 60s reconnection window, then forfeit · lobby seats held for 20s · rooms **survive a server restart** (restored from PostgreSQL) |
| **Accounts** | Username/password auth (bcrypt) · DB-backed sessions in httpOnly cookies · CSRF origin checks · login rate limiting |
| **Pages** | Home · Play / Find Match · Create Room · Join Room · Live Auction · Character Database (+ detail) · My Collection · Leaderboard · User Profile · Auction History (+ match report) |

## Game rules

- Both players start every match with **$20**. Balances live on the server and are written to the database on every sale.
- A lot opens at a price based on rarity, and every raise must beat the current bid by at least **$1**. You can't outbid yourself, and you can never bid more than your balance; the bid buttons are disabled with a reason when you can't afford to raise.
- **Overtime:** a bid placed with less than 6 seconds left resets the clock to 6 seconds. If your opponent can't afford to counter, the lot closes after 2.5 seconds.
- **Tie rule:** bids are processed in the order the server receives them, and an equal bid never takes the lead, so the first player to reach a price holds it.
- If nobody bids, the character goes back into the pool and can come up again later in the match.
- A character can be sold only once per match. In your collection each character appears once; winning it again adds a copy (×2, ×3…).
- **Match winner:** the higher collection score from characters won in the match. If scores are tied, the player with more money left wins; if that's tied too, it's a draw.

| Rarity | Points | Opening price |
| --- | --- | --- |
| Common | 1 | $1 |
| Rare | 2 | $1 |
| Epic | 3 | $1 |
| Legendary | 5 | $2 |
| Mythic | 8 | $3 |

All tunables (timers, increments, grace periods, lot options) are in [`src/game/config.ts`](src/game/config.ts) and [`src/game/rarity.ts`](src/game/rarity.ts).

## Tech stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Node.js custom server · Socket.IO 4 · PostgreSQL · Prisma 6 · Zod · Vitest

## Getting started

Requirements: **Node.js ≥ 20.9** and **PostgreSQL** (local install or `docker compose up -d`).

```bash
npm install
cp .env.example .env          # adjust DATABASE_URL if needed
npm run setup                 # apply migrations + seed anime & characters
npm run dev                   # http://localhost:3000
```

Production:

```bash
npm run build
npm run start                 # serves Next.js + Socket.IO on $PORT (default 3000)
```

To try multiplayer locally, open two different browsers (or a normal and a private window), register two accounts, create a room in one and join with the code in the other.

## Deployment

The live auction runs in **one long-running Node process**: it keeps WebSocket connections open and runs per-room timers. Deploy it to a host that runs a normal Node server or a Docker container, together with a PostgreSQL database.

> **Vercel cannot run this app.** Vercel deploys Next.js as serverless functions, so the Socket.IO server in `server.ts` never starts (`/socket.io` returns 404) and there is no long-lived process for auction timers. Pages also fail there unless `DATABASE_URL` points at a reachable database. Use one of the options below, and disconnect the repository from Vercel so it stops publishing broken previews.

**Render (one click, includes the database):** Dashboard → **New → Blueprint** → select this repository. [`render.yaml`](render.yaml) creates the web service and a PostgreSQL database and wires `DATABASE_URL` automatically. Free web services sleep when idle, which ends live matches. Use a paid instance for always-on play.

**Railway / Fly.io / any Docker host:** the [`Dockerfile`](Dockerfile) builds a production image. Provide `DATABASE_URL` (and the platform's `PORT`). On start the container runs `npm run start:prod`, which applies migrations, seeds the characters and starts the server.

```bash
docker build -t anime-auction .
docker run -p 3000:3000 -e DATABASE_URL="postgresql://user:pass@host:5432/db" anime-auction
```

`GET /api/health` returns `200 {"ok":true}` when the server and database are up, for platform health checks. Run a **single instance**: live rooms are held in memory, so don't scale horizontally.

### Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Development server (Next.js HMR; auto-restarts when server code changes) |
| `npm run build` / `npm run start` | Production build / run |
| `npm run start:prod` | Migrate + seed, then start (used by the Dockerfile and Render) |
| `npm run setup` | `prisma migrate deploy` + seed |
| `npm run db:seed` | Re-seed anime & characters (idempotent) |
| `npm run db:migrate` | Create/apply a new migration during development |
| `npm test` | Unit tests for auction rules and the match engine |
| `npm run typecheck` | TypeScript check |
| `npm run images:fetch` | Look up character artwork URLs on AniList (see below) |

### Environment

| Variable | Default | Notes |
| --- | --- | --- |
| `DATABASE_URL` | — | PostgreSQL connection string |
| `PORT` | `3000` | HTTP port for the combined server |
| `HOST` | `0.0.0.0` | Bind address |
| `COOKIE_SECURE` | auto | Session cookies are `Secure` when the request arrives over HTTPS (`x-forwarded-proto`). Set to `true` to force it. |

## Architecture

```
server.ts                    One Node process: Next.js request handler + Socket.IO
src/server/
  engine.ts                  MatchEngine — per-room state machine (server-authoritative)
  manager.ts                 RoomManager — rooms, matchmaking queue, open-room list, restore on boot
  socket.ts                  Socket.IO transport: cookie auth, rate limiting, event routing
  persistence.ts             All DB writes for the engine (transactions with balance guards)
  lock.ts                    AsyncLock — serializes every action on a room
src/game/                    Shared rules, config and socket event types (client + server)
src/data/                    Anime registry + curated character data (seed source)
src/app/                     Next.js pages and REST routes (auth, profile)
src/components/              UI (auction stage, lobby, cards, play hub…)
prisma/                      Schema, migrations, seed
tests/                       Vitest: rules + engine (fake timers, in-memory persistence)
```

**How a bid flows:** the client sends only an intent (`auction:bid { lotId, amount }`). The engine takes the room's lock and validates the bid against its own state: phase, lot id, the time the server received the bid, the bidder's balance, the minimum raise and who currently leads. It writes the bid to PostgreSQL and only then updates memory and broadcasts the new snapshot to everyone in the room. Settling a sale runs in one transaction that debits the balance (with a `balance >= price` guard), marks the lot sold, upserts ownership and updates stats. A lot can't be settled twice and a balance can't go negative.

**Phases:** `LOBBY → COUNTDOWN → BIDDING ⇄ INTERMISSION → FINISHED`. `PAUSED` can interrupt any live phase while a player is disconnected; if nobody comes back the match ends as `ABANDONED`.

**Clock sync:** clients measure the offset to the server clock with a few round trips and use it to render countdowns. Only the server decides when a lot closes.

## Adding a new anime

1. Add an entry to [`src/data/anime.ts`](src/data/anime.ts) (`enabled: false` until it's ready).
2. Create `src/data/characters/<anime-id>.ts` (copy an existing file) and register it in [`src/data/characters/index.ts`](src/data/characters/index.ts).
3. `npm run images:fetch` to look up artwork, then `npm run db:seed`.
4. Set `enabled: true` and re-seed.

No schema or UI changes are needed. Filters, room settings, badges and pools all read from the registry. Characters removed from the data files are disabled rather than deleted, so match history stays intact.

## Artwork

Character images are **not stored in this repository**. `npm run images:fetch` looks up each character on the public [AniList](https://anilist.co) API, checks that the match appears in the correct anime, and stores only the CDN URL in `src/data/character-images.json`. Cards fall back to generated art if an image is missing or fails to load. Character names and artwork belong to their respective creators and publishers.

## Testing

- `npm test`: 26 unit tests covering bid validation (increments, balance, self-outbid, timing, malformed amounts), the tie rule under concurrent bids, overtime, the unopposed close, unsold → pool, pause/resume, forfeit, abandonment, lobby seat expiry and pool exhaustion.
- End-to-end (verified during development with Playwright and two browser sessions): full matches, live sync of bids and balances, disconnect/reconnect, server crash and restore, rematch, forfeit and matchmaking.
