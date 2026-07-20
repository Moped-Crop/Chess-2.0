# Chess 2 — ASCENT

A browser chess variant with local and online play.
**Live at [chess2-ascent.online](https://chess2-ascent.online/)**

[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61dafb)](https://react.dev/)
[![Node](https://img.shields.io/badge/Node-%E2%89%A520-5fa04e)](https://nodejs.org/)

---

## What makes it Chess 2

| | |
|---|---|
| **A wider board** | 10 files × 8 ranks (`a–j`, `1–8`). More room to maneuver, and two extra pieces per side. |
| **The Rooster** | A new piece that only threatens forward — it attacks along a forward ray and the two forward diagonals, but never sideways or backward. It advances; it does not cover its own retreat. |
| **Evolution** | A Knight, Bishop, Rook, or Rooster that ends its move deep in enemy territory transforms once — permanently — into a stronger form. Seven forms in total, each a classic piece fused with an extra movement primitive. |

Promotion and evolution are mutually exclusive: a freshly promoted piece can never evolve.

The game ships with an interactive **How to Play** tour that teaches the Rooster
and evolution on a real board with real engine moves — available without signing in.

---

## Features

**Gameplay**
- Complete Chess 2 rules: all pieces, the Rooster, evolution into 7 forms, castling
  ("Bastion"), en passant, promotion, check/checkmate/stalemate, and every draw
  condition (threefold repetition, 75-move rule, insufficient material).
- Custom piece artwork, move/capture/evolution animations, legal-move highlights,
  light and dark themes, Web Audio sound with a volume control.

**Local play (hotseat)**
Two players on one device. Clocks with presets, take-back, move list, autosave to
`localStorage`, and JSON export/import of a game.

**Online play (1v1 with a friend)**
- Accounts with mandatory email verification, password recovery, and optional
  TOTP two-factor authentication with backup codes.
- Profiles with avatars and win/loss/draw statistics; a friend list with live
  online status; invitations that carry the chosen time control.
- Real-time move sync over Socket.IO, with **every move re-validated server-side
  by the same engine** the client runs.
- **Server-authoritative clocks** — the server owns the time, so a tab that
  sleeps or lies cannot gain an advantage. Flagging ends the game on its own.
- Resign, reconnect into a game in progress, and forfeit after a 90-second
  disconnect.
- **Game history** with a move-by-move replay viewer (arrow keys to step).

---

## Running it locally

You need **Node.js 20 or newer** ([nodejs.org](https://nodejs.org), LTS button).

### 1. Install (once)

```bash
npm install
```

Then create two files in the project root — see `.env.example` for the full list:

- **`.env`** — at minimum `DATABASE_URL=` (a PostgreSQL connection string; use
  `DATABASE_URL=memory://` to run against an in-memory database with no setup)
  and `JWT_SECRET=` (any long random string).
- **`.env.server`** — a single line: `NODE_ENV=development`.

> `NODE_ENV` must live in `.env.server`, **not** `.env` — Vite reads `.env` and
> would break the production React build.

### 2. Run

```bash
npm run dev:all   # game (:5173) + server (:3001) in one command
```

Open <http://localhost:5173/>. Stop with `Ctrl+C`.

The local hotseat mode works without the server — `npm run dev` alone is enough.

### Commands

| Command | What it does |
|---|---|
| `npm run dev:all` | Frontend + backend together (development). |
| `npm run dev` | Frontend only. |
| `npm run dev:server` | Backend only (Express + Socket.IO, port 3001). |
| `npm run migrate` | Apply database migrations. |
| `npm run build` | Type-check, then build the frontend into `dist/`. |
| `npm start` | Production: one process serves `dist/`, the API, and sockets. |
| `npm test` | Unit and integration tests (engine, API, sockets). |
| `npm run test:e2e` | Full browser scenario with two players (Playwright). |
| `npm run typecheck` | TypeScript check, frontend and server. |
| `npm run lint` | ESLint. |

---

## How the project is built

```
src/
├── engine/   PURE RULES CORE — no React, no DOM, no I/O. Deterministic and immutable.
└── app/      UI (React + SVG): store/ (Zustand), components/, pages/,
              api/ (REST client), net/ (socket.io-client), clock/, tutorial/
server/       Express + Socket.IO, PostgreSQL (pg, plain-SQL migrations).
              gameEngine.ts imports the engine directly from src/engine.
tests/        Engine, API (supertest), and socket tests, all on pg-mem —
              the production database is never touched by tests.
e2e/          End-to-end Playwright scenario (two players, a full game).
docs/         Design documents, rule specifications, and audits (in Russian).
```

**Architectural rules that are not negotiable:**

- `app/` depends on `engine/`; `engine/` never imports React or the DOM.
- The server validates moves with **the same engine** as the client. There is no
  second implementation of the rules, and there must never be one.
- Online play is a second "move controller" on top of the same store — adding it
  did not change local play.
- Clock math is likewise shared: `server/lib/serverClock.ts` reuses the pure
  functions from `src/app/clock/clock.ts`.

The final rules of the game are frozen in
[`docs/Rules_Clarification_v1.0.md`](docs/Rules_Clarification_v1.0.md) (sections
B1–B8) — that document is the source of truth. `CLAUDE.md` is the working memo
for the AI assistant on this project. Deployment is described in
[`DEPLOY.md`](DEPLOY.md).

---

## Not included (possible future work)

- Matchmaking with random opponents, an AI opponent, ratings.
- Fine balance tuning — to be settled by playtesting.
- Extended FEN / PGN export, PWA offline support.

---

## Stack

TypeScript (strict) · Vite · React 18 · React Router · SVG · Zustand ·
Express · Socket.IO · PostgreSQL (`pg`) · zod · helmet · bcryptjs + JWT ·
Resend (email) · Vitest + Supertest + pg-mem · Playwright · ESLint + Prettier ·
deployed on Railway.
