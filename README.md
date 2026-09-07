# Feud Night 🎉

A **3-team Family Feud-style party game** built for a ~30-person apartment
birthday. Phones are controllers, a TV/projector is the board, and a host
laptop runs the show. Real-time over WebSockets, free-tier hosted.

## How it plays

**Setup.** Host creates a room on their laptop. The TV shows a QR code.
Guests scan → type a name → auto-join one of **3 teams** (~10 each).
Reps rotate every round so everyone gets a face-off moment.

**Roles.** Each team has two separate roles: the **face-off rep** is the only
player who can buzz that round (it rotates automatically; host can override
it), while the **captain** locks the team&apos;s official answer and submits its
steal. The host can change either role from the private console.

**Rounds 1–5** (rounds 3–4 are double points; round 5 is the final triple-points board):

1. **Face-off** — one rep per team. First to hit the giant BUZZ button on
   their phone takes control (server-side race, ~100ms resolution).
2. **Playing** — the controlling team's players submit answer suggestions
   from their phones; the **captain** locks the official answer. The host
   judges it against the board: reveal or strike.
3. **Steal** — after 3 strikes, both opposing teams get a 15-second huddle.
   Each **captain secretly submits one steal answer** from their phone.
   Both reveal simultaneously on the TV; the host judges each. **If both steal
   answers are correct, the higher-ranked (higher-point) survey answer wins
   the bank.** Matched steals reveal on the board and the winner banks
   everything.
4. **Final Board** — after four rounds, every team gets one last full
   face-off / play / steal board worth **triple points**. The highest score
   after that board wins the night.

## The host is the judge

Free-text answers are matched by the **host tapping the board answer**
(like a real FF judge), not fuzzy string matching — no "right answer
spelled wrong" bugs at the party.

## Architecture

Same pattern as [themindgame](https://github.com/mapuya19/themindgame):

```
├── src/                      # Next.js 16 app (Vercel)
│   ├── app/
│   │   ├── page.tsx          # landing: host / join / board
│   │   ├── host/             # host console (judging, controls, roster)
│   │   ├── board/            # TV/projector game-show view
│   │   └── play/             # phone controller (buzz, suggest, steal…)
│   ├── components/           # board / phone / host UIs (Tailwind v4, framer-motion)
│   └── lib/                  # ws-client (reconnect+backoff), zustand store, identity
├── shared/                   # imported by BOTH Next.js and the worker
│   ├── engine.ts             # pure game logic (all rules live here)
│   ├── projection.ts         # per-viewer state projection (secrets enforcement)
│   ├── protocol.ts           # WebSocket message types
│   ├── config.ts             # tuning constants
│   └── questions.json        # the survey (edit me!)
├── worker/                   # Cloudflare Worker + Durable Object
│   └── src/router.ts         # room codes + WS routing
│   └── src/index.ts          # FeudRoom DO: authoritative state, hibernation WS
└── tests/                    # vitest suite for the engine + projection
```

**Source of truth:** the Durable Object holds the game state, persists it
to DO storage on every mutation, and pushes a *projected* view to every
socket (host sees everything; players/board see only what they should).
Phones are dumb terminals — refresh, lock your phone, come back, and your
session is restored from localStorage + a reconnect.

Timers (steal huddles, Fast Money) run on DO alarms, and every countdown
is computed client-side from a server-issued deadline + clock offset — so
30 phones tick in lockstep with zero extra traffic.

## Run it locally

```bash
npm install
cd worker && npm install && cd ..

npm run dev:all    # Next.js on :3000 + wrangler dev on :8787
```

Open http://localhost:3000, create a room, and open `/board?g=CODE` in a
second window. Use your phone (same Wi-Fi) at `/play?g=CODE`.

```bash
npm test           # engine + projection unit tests
npm run smoke      # full game loop over real WebSockets (needs wrangler dev running)
npm run typecheck && npm run lint && npm run build
```

## Deploy (free tier)

1. **Worker** — needs a (free) Cloudflare account:
   ```bash
   cd worker && npx wrangler deploy
   ```
   Note the `*.workers.dev` URL it prints.
2. **Next.js** — push to GitHub and import into Vercel (Hobby plan). Set
   one env var:
   ```
   NEXT_PUBLIC_WS_URL=wss://feud-server.<your-subdomain>.workers.dev
   NEXT_PUBLIC_SITE_URL=https://<your-app>.vercel.app   # for QR codes
   ```
3. Party.

Cost at a 3-hour, 32-socket party: comfortably inside free tiers
(outgoing WS messages are free; incoming bill at 20:1; DO duration
~10% of the daily free GB-seconds). Worst case on the free plan is a
daily cap tripping — it errors until 00:00 UTC, never charges.

## Make it yours

- **Questions**: edit `shared/questions.json`. Keep point totals ≈100 per
  question for that authentic board look.
- **Personalized surveys**: send guests a Google Form before the party
  ("name something the birthday person always says"…), tally responses,
  and write them in as questions. This is the killer feature.
- **Tuning**: round multipliers, steal seconds, Fast Money timers/target
  live in `shared/config.ts`.
