# Feud Night 🎉

A **Family Feud-style party game** for 2–5 teams (up to 8 players each, 40
max). Phones are controllers, a TV/projector is the board, and a host laptop
runs the show. Real-time over WebSockets, with no database to provision.

**Forking:** the source is [MIT licensed](LICENSE). Deploy both the frontend
and Worker to your own accounts; no access to the original author's accounts
is needed. Bundled third-party sound effects keep their own license — see
[the sound credits](public/sfx/CREDITS.md).

## How it plays

**Setup.** Host creates a room on their laptop. The TV shows a QR code.
Guests scan → type a name → choose a team (the host sets 2–5 teams)
and may volunteer as that team’s provisional captain. The host can move players
or correct captains, then locks the roster before play begins. Reps rotate every
round so everyone gets a face-off moment.

**Roles.** Each team has two separate roles: the **face-off rep** is the only
player who can buzz that round (it rotates automatically; host can override
it), while the **captain** submits its secret steal and plays any steal
rock-paper-scissors tie-break. Main-board answers rotate through every player.

**Rounds 1–5** (rounds 3–4 are double points; round 5 is the final triple-points board):

1. **Face-off** — one rep per team. First to hit the giant BUZZ button gets
   the first answer chance (first valid buzz received by the server); an on-board
   answer gives that team control, while a miss reopens the buzzers.
2. **Playing** — answers go **down the line**: one player at a time, starting
   with the buzz winner, gets 10 seconds to say their answer aloud. Typing on
   a phone is optional backup; the host can pause the clock after hearing an
   answer, then judge it against the board: reveal or strike. A timeout counts
   as a strike and the mic passes on.
3. **Steal** — after 3 strikes, all opposing teams get a 15-second huddle.
   Each **captain secretly submits one steal answer** from their phone.
   Answers reveal simultaneously on the TV; the host judges each. **The
   highest-ranked survey answer wins the bank; if multiple teams match that same
   top answer, their captains throw simultaneous rock-paper-scissors until one
   team wins.** Matched steals reveal on the board and the winner banks everything.
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
│   │   └── play/             # phone controller (buzz, answer, steal…)
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

Steal huddle timers run on DO alarms, and every countdown is computed
client-side from a server-issued deadline + clock offset — so 30 phones tick
in lockstep with zero extra traffic.

## Room cleanup

A room is automatically deleted after **24 hours without a connection or a
meaningful game action**. Once a game reaches its champion screen, the host
can also use **Close room & clear data** to immediately disconnect every
screen and permanently delete that room's state.

For a known room that cannot be accessed from its host browser, an operator can
configure an `ADMIN_TOKEN` Worker secret and delete it without exposing a room
listing or game data:

```bash
export ADMIN_TOKEN="$(openssl rand -hex 32)"
printf %s "$ADMIN_TOKEN" | (cd worker && npx wrangler secret put ADMIN_TOKEN)
curl -X DELETE "https://feud-server.<your-subdomain>.workers.dev/admin/rooms/ABCD" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

This endpoint intentionally accepts only a known room code; it does not list
rooms.

## Run it locally

Use **Node 22+** (Node 24 recommended; `.nvmrc` is included) and npm.
Both dependency trees have lockfiles:

```bash
nvm use                       # optional, if you use nvm
npm ci
npm --prefix worker ci
cp .env.example .env.local
npm run dev:all                # Next.js :3000 + Worker :8787
```

Open http://localhost:3000, create a room, and open `/board?g=CODE` in a
second window. Host credentials are saved in that browser's localStorage;
keep using the same browser/profile for the host console.

### Test with real phones on your Wi-Fi

`localhost` on a phone means the phone, not your laptop. Find your laptop's
LAN IP (for example `192.168.1.20`), then set `.env.local`:

```dotenv
NEXT_PUBLIC_WS_URL=ws://192.168.1.20:8787
NEXT_PUBLIC_SITE_URL=http://192.168.1.20:3000
```

Run these in separate terminals, allowing access through the laptop firewall:

```bash
npm run dev -- --hostname 0.0.0.0
npm --prefix worker run dev -- --ip 0.0.0.0
```

Restart Next.js after changing the variables. Open the **LAN URL** on the host
and phones. Guest/work Wi-Fi may isolate devices; use a deployed HTTPS site
if phones cannot reach the laptop. Do not expose development servers publicly.

### Checks

```bash
npm test                      # engine, privacy, transport, store, and Worker unit tests
npm run typecheck
npm run typecheck:worker
npm run lint
npm run build
npm run smoke                 # real WS; start wrangler on :8787 first
# Or: npm run smoke -- https://<your-worker>.workers.dev
```

GitHub Actions runs these checks, including the local WebSocket smoke test.
The smoke test creates a disposable room and closes it on success.

## Deploy your own copy

1. **Fork the repo**, clone your fork, and install both dependency trees as
   above. Replace the personal party questions in `shared/questions.json`
   with your own, or select suitable boards in the host lobby.
2. **Deploy the Worker to your own Cloudflare account:**
   ```bash
   cd worker
   npx wrangler login
   npx wrangler deploy
   cd ..
   ```
   `worker/wrangler.jsonc` includes the SQLite Durable Object binding and
   initial migration. The default name `feud-server` is fine in a separate
   account; rename it if that name is already used in yours. Record the exact
   HTTPS URL Wrangler prints. `GET /health` should return `{"ok":true}`.
3. **Import your fork into Vercel** as a Next.js project. Use the repository
   root, not `worker/`, as the Root Directory and Node 24 as the runtime.
   Configure these variables **before the build**:
   ```dotenv
   NEXT_PUBLIC_WS_URL=wss://<your-worker>.workers.dev
   # Optional: defaults to the frontend origin, including QR codes.
   NEXT_PUBLIC_SITE_URL=https://<your-app>.vercel.app
   ```
   Use `wss://` for the deployed Worker, not `https://` or `ws://`. Omit the
   optional site URL until you know it. `NEXT_PUBLIC_*` values are embedded
   at build time: redeploy the frontend whenever they change. Never put host
   credentials or `ADMIN_TOKEN` in these public variables.
4. **Rehearse before the event:** create a room, join two teams from real
   phones, assign captains, start, buzz, lock/unlock a phone, switch Wi-Fi off
   and back on, and confirm its identity and live buzzer recover. Test the
   actual workplace network; it may block WebSockets or Workers domains.

Deploy the Worker and frontend together when upgrading the wire protocol.
Reload open game screens after deployment. The new race IDs deliberately
reject buzzes from old clients rather than accepting taps for the wrong race.
Existing rooms retain their state, but a fresh room is recommended for an event.

Cloudflare and frontend-hosting free tiers may be sufficient for a small event,
but usage limits and workplace/commercial-use eligibility depend on the plan.
Check current provider terms and billing settings instead of assuming every
work deployment is free. Rooms use capability-style access: anyone with the
room code can join or watch; this is not a company SSO/private-data service.
Do not put confidential workplace material in questions or player names.

## Buzzer reliability and fairness

- A pointer buzz sends on **initial contact**, not finger release. Keyboard and
  assistive activation also work. Only the current round's rep can buzz.
- The button is disabled until a fresh server snapshot arrives, and while a
  buzz awaits acknowledgement. The board, not optimistic phone feedback,
  declares the winner. Each reopened race has a new ID to reject stale taps.
- Raw ping/pong heartbeats run every 15 seconds, with a 5-second reply deadline.
  An unconfirmed buzz triggers recovery after 4 seconds. Phone wake-up,
  back/forward-cache restoration, and network restoration trigger a reconnect.
- Reconnects use exponential backoff with jitter. Player identity is retained;
  **buzzes and other actions are never queued or automatically replayed**.
  Once live, tap again if needed and check the board if the last tap was uncertain.
- A brief disconnect does not revoke a winning buzz. Its original 10-second
  answer deadline still applies; the host can pause it after hearing an answer.
- Server arrival order is authoritative, not phone timestamps. Network latency
  still matters; phone buzzers are not tournament-grade physical buzzers.

## Make it yours

- **Questions**: edit `shared/questions.json`. Keep point totals ≈100 per
  question for that authentic board look.
- **Personalized surveys**: send guests a Google Form before the party
  ("name something the guest of honor always says"…), tally responses,
  and write them in as questions. This is the killer feature.
- **Tuning**: round multipliers, team count limits, and steal seconds
  live in `shared/config.ts`.
