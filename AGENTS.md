# AGENTS.md

Guidelines for AI coding agents working in this repo.

## What this is

A real-time party game (Family Feud-style, 3 teams, ~30 phone clients).
Next.js 16 frontend on Vercel + Cloudflare Worker with a Durable Object
game server. Monorepo: `src/` (Next), `worker/` (Cloudflare), `shared/`
(imported by both).

## Hard rules

1. **The Durable Object is the only source of truth.** Game state lives
   in `worker/src/index.ts` (FeudRoom), logic in `shared/engine.ts`.
   Never compute game state client-side; clients render projected state.
2. **All rule changes go in `shared/engine.ts`** as pure mutations of
   `GameState`, wired through `HostAction`/`PlayerAction` in
   `shared/protocol.ts`. Validate inputs there and return
   `{ok: false, error}` — never throw for game-rule violations.
3. **Secrets are enforced in `shared/projection.ts`.** Anything a viewer
   must not see (unrevealed answers, steal submissions, captain RPS throws
   before reveal) is stripped per-socket before broadcast. If you add state,
   decide its visibility here and add a privacy test.
4. **Add tests for every engine change** (`tests/engine.test.ts`), and
   extend `scripts/smoke.mjs` when you add a message type. The smoke
   script needs `wrangler dev` running on :8787.
5. **Don't add a database.** State persists via DO storage; rooms are
   throwaway. Survey content is `shared/questions.json`.
6. Mobile phones are the worst clients: assume iOS Safari, flaky Wi-Fi,
   locked screens. Reconnection must be seamless (identity in
   localStorage, `?playerId=` socket rebinding — see worker
   `handleWebSocket`).
7. Outgoing WS broadcasts are free; incoming messages bill at 20:1.
   Prefer server-pushed state over client polling; timers are deadlines
   broadcast once and ticked client-side (`serverOffsetMs` in the store).

## Commands

```bash
npm run dev:all      # next :3000 + wrangler :8787
npm test             # engine/projection unit tests
node scripts/smoke.mjs  # E2E over real WS (start wrangler first)
npm run typecheck    # root (src + shared); worker has its own tsconfig
npm run lint
npm run build
```

## Conventions

- Tailwind v4 (CSS-first theme in `globals.css`), framer-motion for
  game-show animation, zustand for client state, no UI kit.
- `.display` class = game-show typography (900 italic uppercase).
- Team colors come from state (`TEAM_DEFAULTS` in `shared/config.ts`) —
  style dynamically, don't hardcode.
- Files stay focused: one phase-panel per concern in
  `src/components/{board,phone,host}`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
