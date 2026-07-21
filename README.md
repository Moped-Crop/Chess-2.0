<div align="center">

# Chess 2 — ASCENT

**A chess variant on a wider board, with a new piece and pieces that evolve.**

### ▶ [**Play it at chess2-ascent.online**](https://chess2-ascent.online/) ◀

[![Live](https://img.shields.io/badge/live-chess2--ascent.online-5b7cfa)](https://chess2-ascent.online/)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61dafb)](https://react.dev/)
[![Node](https://img.shields.io/badge/Node-%E2%89%A520-5fa04e)](https://nodejs.org/)
[![Tests](https://img.shields.io/badge/tests-210%20passing-2ea043)](#testing)

No install, no sign-up to try it — local games and the tutorial work straight in the browser.

</div>

---

## What makes it Chess 2

|  | |
|---|---|
| **A wider board** | 10 files × 8 ranks (`a–j`, `1–8`). Two extra pieces per side and far more room to maneuver. |
| **The Rooster** | A piece that only threatens forward — a forward ray plus the two forward diagonals. It steps sideways without capturing and **never moves backward**. It advances; it does not cover its own retreat. |
| **Evolution** | A Knight, Bishop, Rook or Rooster that ends its move deep in enemy territory transforms **once and permanently** into a stronger form. Seven forms in total, each a classic piece fused with an extra movement primitive. |

Promotion and evolution are mutually exclusive: a freshly promoted piece can never evolve.

The in-game **How to play** tour teaches the Rooster and evolution on a real board with
real engine moves, and a piece reference is one click away during any game.

---

## Ways to play

### 🤖 Against the bot
Three levels, all running in a Web Worker so the interface never freezes while it thinks.

| Level | How it plays |
|---|---|
| **Easy** | One ply ahead. Takes the centre and develops, but is blind to any two-move tactic — and misses captures about a third of the time. |
| **Medium** | Alpha-beta search, 3 plies. Punishes short tactics; beatable if you think. |
| **Hard** | 4 plies with a transposition table, killer heuristic and recapture search. A real opponent. |

The bot picks its own evolution form and promotion piece — no special logic, the engine
simply offers those as ordinary candidate moves. Bot games never touch the server.

### 👥 Online, 1v1 with a friend
Accounts with verified email, optional two-factor authentication, profiles with avatars
and win/loss/draw statistics, a friend list with live online status, and invitations that
carry the chosen time control.

- Moves sync in real time over Socket.IO, and **every move is re-validated server-side by
  the same engine** the client runs.
- **The clock is server-authoritative** — a tab that sleeps or lies cannot gain time.
  Flagging ends the game on its own, and survives a server restart.
- Resign, reconnect into a game in progress, forfeit after a 90-second disconnect.
- **Game history** with a move-by-move replay viewer (arrow keys to step).

### 🪑 Local, two players on one device
Clocks with presets, take-back, move list, autosave to `localStorage`, and JSON
export/import of a game. Works with no server at all.

---

## Running it locally

You need **Node.js 20 or newer** ([nodejs.org](https://nodejs.org), the LTS button).

```bash
npm install
```

Then create two files in the project root — `.env.example` lists everything:

- **`.env`** — at minimum `DATABASE_URL=` and `JWT_SECRET=`.
  Use `DATABASE_URL=memory://` to run against an in-memory database with nothing to install.
- **`.env.server`** — a single line: `NODE_ENV=development`.

> `NODE_ENV` must live in `.env.server`, **not** `.env` — Vite reads `.env` and would
> break the production React build.

```bash
npm run dev:all     # game (:5173) + server (:3001)
```

Open <http://localhost:5173/>.

> Only want to try the game? `npm run dev` alone is enough — local play, the bot and the
> tutorial need no backend. Sign-in does, so head straight to `/play/bot/setup`.

### Commands

| Command | What it does |
|---|---|
| `npm run dev:all` | Frontend and backend together. |
| `npm run dev` | Frontend only. |
| `npm run dev:server` | Backend only (Express + Socket.IO, port 3001). |
| `npm run migrate` | Apply database migrations. |
| `npm run build` | Type-check, then build the frontend into `dist/`. |
| `npm start` | Production: one process serves `dist/`, the API and sockets. |
| `npm test` | Unit and integration tests. |
| `npm run test:e2e` | Full browser scenario with two players (Playwright). |
| `npm run typecheck` | TypeScript check, frontend and server. |
| `npm run lint` | ESLint. |

---

## Deployment

The production site runs on **[Railway](https://railway.app)** as a **single process**:
`npm start` serves the built frontend, the REST API and Socket.IO from one port. Railway
installs dependencies, runs `npm run build`, then `npm start` (see `railway.json`).
Database migrations are applied automatically on startup.

**Every push to `master` triggers a new deployment.** Health check: `/api/health` returns
`{"ok":true,"db":"ok"}`.

```
GitHub (master)  ──push──▶  Railway build  ──▶  npm start  ──┬──▶  static dist/
                                                             ├──▶  /api/*      (Express)
                                                             ├──▶  /socket.io  (Socket.IO)
                                                             └──▶  PostgreSQL
        Cloudflare (DNS + proxy)  ──▶  chess2-ascent.online
```

Full instructions, including the environment variables, are in **[DEPLOY.md](DEPLOY.md)**.

### Transactional email

The app sends email for verification, password recovery, email changes and 2FA codes.

It goes through the **[Resend](https://resend.com) HTTP API, not SMTP** — a deliberate
choice: Railway blocks outgoing SMTP ports (25/465/587) on every plan below Pro, so an
SMTP mailer simply hangs there. `server/lib/mailer.ts` posts to `api.resend.com/emails`
over port 443 instead.

The sender address lives on `chess2-ascent.online`, a domain verified in Resend, with DNS
on Cloudflare. Message language follows the interface language — the client sends `lang`
with every mail-triggering request.

---

## How the project is built

```
src/
├── engine/   PURE RULES CORE — no React, no DOM, no I/O. Deterministic and immutable.
└── app/      UI (React + SVG): store/ (Zustand), components/, pages/, bot/ (Web Worker
              search), api/ (REST client), net/ (socket.io-client), clock/, tutorial/
server/       Express + Socket.IO, PostgreSQL (pg, plain-SQL migrations).
              gameEngine.ts imports the engine directly from src/engine.
tests/        Engine, API (supertest) and socket tests, all on pg-mem —
              the production database is never touched by tests.
e2e/          End-to-end Playwright scenario (two players, a full game).
docs/         Design documents, rule specifications and audits (in Russian).
```

**Architectural rules that are not negotiable:**

- `app/` depends on `engine/`; `engine/` never imports React or the DOM.
- The server validates moves with **the same engine** as the client. There is no second
  implementation of the rules, and there must never be one.
- Online play and the bot are extra "move controllers" on top of the same store — adding
  them did not change local play.
- Clock math is shared too: `server/lib/serverClock.ts` reuses the pure functions from
  `src/app/clock/clock.ts`.

The rules are frozen in [`docs/Rules_Clarification_v1.0.md`](docs/Rules_Clarification_v1.0.md)
(sections B1–B8) — that document is the source of truth. `CLAUDE.md` is the working memo
for the AI assistant on this project.

---

## Testing

**210 tests** across engine, API, sockets, store and UI, plus a Playwright end-to-end run.

The move generator is checked with **perft** — the standard chess measure that counts every
leaf of the move tree to a given depth. If a single rule were wrong, the count would drift.

Server and integration tests run on **pg-mem**, an in-memory PostgreSQL: the suite is
self-contained and never touches the production database.

```bash
npm test          # unit and integration
npm run test:e2e  # two browsers, a full online game
```

---

## Not included (possible future work)

- Matchmaking with random opponents, ratings.
- Fine balance tuning — to be settled by playtesting.
- Extended FEN / PGN export, PWA offline support.

---

## Stack

TypeScript (strict) · Vite · React 18 · React Router · SVG · Zustand · Web Workers ·
Express · Socket.IO · PostgreSQL (`pg`) · zod · helmet · bcryptjs + JWT · Resend ·
Vitest + Supertest + pg-mem · Playwright · ESLint + Prettier · Railway · Cloudflare
