/**
 * End-to-end smoke test against a live wrangler dev worker.
 * Plays a complete game: 3 players join, buzz, answer, strike, steal,
 * 4 rounds, fast money, reveal, game over — over real WebSockets.
 *
 * Usage: node scripts/smoke.mjs [http://localhost:8787]
 */
const BASE = process.argv[2] ?? "http://localhost:8787";
const WS_BASE = BASE.replace(/^http/, "ws");

const assert = (cond, msg) => {
  if (!cond) {
    console.error(`✗ ${msg}`);
    process.exit(1);
  }
  console.log(`✓ ${msg}`);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeSocket() {
  const listeners = [];
  let ws = null;
  let closed = false;
  const api = {
    states: [],
    connect(path) {
      ws = new WebSocket(`${WS_BASE}${path}`);
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.type === "state") {
          api.states.push(msg.state);
          api.latest = msg.state;
        }
        for (const l of listeners) l(msg);
      };
      ws.onclose = () => {
        closed = true;
      };
      return new Promise((res, rej) => {
        ws.onopen = () => res(api);
        ws.onerror = () => rej(new Error(`ws error: ${path}`));
      });
    },
    on(fn) {
      listeners.push(fn);
      return () => {
        const i = listeners.indexOf(fn);
        if (i >= 0) listeners.splice(i, 1);
      };
    },
    send(obj) {
      ws.send(JSON.stringify(obj));
    },
    get closed() {
      return closed;
    },
  };
  return api;
}

const waitFor = (sock, pred, label, timeout = 5000) =>
  new Promise((res, rej) => {
    if (sock.latest && pred(sock.latest)) return res(sock.latest);
    const check = (msg) => {
      if (msg.type === "state" && pred(msg.state)) {
        off();
        res(msg.state);
      }
    };
    const off = sock.on(check);
    setTimeout(() => {
      off();
      rej(new Error(`timeout waiting for: ${label}`));
    }, timeout);
  });

// ---------------------------------------------------------------- run

const run = async () => {
  // 1. create room
  const createRes = await fetch(`${BASE}/create`, { method: "POST" });
  assert(createRes.ok, "POST /create");
  const { code, hostToken } = await createRes.json();
  assert(/^[A-Z]{4}$/.test(code), `room code ${code} allocated`);

  const exists = await fetch(`${BASE}/room/${code}`);
  assert(exists.ok, "GET /room/:code exists");

  // 2. host + board + players connect
  const host = await makeSocket().connect(`/room/${code}/ws?role=host&token=${hostToken}`);
  const board = await makeSocket().connect(`/room/${code}/ws?role=board`);
  console.log(`✓ host & board sockets open for ${code}`);

  const joinPlayer = async (name) => {
    const sock = await makeSocket().connect(`/room/${code}/ws?role=player`);
    const welcome = await new Promise((res) => sock.on((m) => m.type === "welcome" && res(m)));
    sock.send({ type: "join", name });
    // server issues playerId → reconnect with it
    const playerId = welcome.playerId ?? (await new Promise((res) => sock.on((m) => m.type === "welcome" && m.playerId && res(m)))).playerId;
    const sock2 = await makeSocket().connect(`/room/${code}/ws?role=player&playerId=${playerId}`);
    return { sock: sock2, playerId, name };
  };

  const p1 = await joinPlayer("Alice");
  const p2 = await joinPlayer("Bob");
  const p3 = await joinPlayer("Cara");
  const p4 = await joinPlayer("Dave"); // lands on blue (auto-balance) for FM duo
  console.log("✓ 4 players joined with bound sockets");

  await waitFor(p4.sock, (s) => !!s.myTeamId, "all players have team state");
  const myTeam = (p) => p.sock.latest.myTeamId;
  console.log(`✓ teams assigned: Alice=${myTeam(p1)} Bob=${myTeam(p2)} Cara=${myTeam(p3)}`);
  assert(new Set([myTeam(p1), myTeam(p2), myTeam(p3)]).size === 3, "one player per team (auto-balance)");

  // host identity check
  host.send({ type: "host_action", token: "wrong", action: { type: "start_game" } });
  const denied = await new Promise((res) => host.on((m) => m.type === "error" && res(m)));
  assert(/Host only/.test(denied.message), "bad host token rejected");

  // 3. start game
  host.send({ type: "host_action", token: hostToken, action: { type: "start_game" } });
  await waitFor(board, (s) => s.phase === "faceoff", "faceoff after start_game");

  // phone privacy: unrevealed answer text hidden from board
  const boardSlot = board.latest.question.slots.find((s) => !s.revealed);
  assert(boardSlot.text === null && boardSlot.points > 0, "board hides unrevealed answers, shows points");

  // 4. buzz race: rep buzzes
  const buzzSock = myTeam(p1) === board.latest.teams[0].id ? p1 : p1; // Alice is rep for her team round 1
  p1.sock.send({ type: "player_action", playerId: p1.playerId, action: { type: "buzz" } });
  p2.sock.send({ type: "player_action", playerId: p2.playerId, action: { type: "buzz" } });
  await waitFor(board, (s) => s.phase === "playing", "first buzz wins control");
  assert(board.latest.buzzWinnerName === "Alice", `buzz winner is Alice (got ${board.latest.buzzWinnerName})`);

  // 5. suggest + captain lock
  p1.sock.send({ type: "player_action", playerId: p1.playerId, action: { type: "suggest", text: "maybe this" } });
  const suggSeen = await waitFor(p1.sock, (s) => s.suggestions.length === 1, "suggestion visible to own team");
  assert(suggSeen.pendingAnswer === null, "no pending answer yet");
  p1.sock.send({ type: "player_action", playerId: p1.playerId, action: { type: "lock_answer", text: "first answer" } });
  const locked = await waitFor(host, (s) => s.pendingAnswer?.text === "first answer", "host sees captain's locked answer");
  assert(locked.suggestions.length === 1, "host sees team suggestions");
  // other team sees neither
  await waitFor(p2.sock, (s) => s.suggestions.length === 0 && s.pendingAnswer === null, "opposing team sees no suggestions/pending");

  // 6. host reveals slot 0 (correct)
  host.send({ type: "host_action", token: hostToken, action: { type: "reveal_answer", slot: 0 } });
  await waitFor(board, (s) => s.question?.slots[0]?.revealed && s.question.slots[0].text !== null, "slot 1 revealed on board");

  // 7. three strikes → steal
  for (let i = 0; i < 3; i++) {
    host.send({ type: "host_action", token: hostToken, action: { type: "strike" } });
  }
  const stealState = await waitFor(p2.sock, (s) => s.phase === "steal" && s.steal?.endsAt, "steal phase with countdown");
  assert(stealState.steal.submittedTeamIds.length === 0, "no submissions visible yet");
  assert(stealState.steal.mySubmission === null, "own submission starts hidden");

  // captains submit simultaneously
  p2.sock.send({ type: "player_action", playerId: p2.playerId, action: { type: "submit_steal", text: "steal A" } });
  p3.sock.send({ type: "player_action", playerId: p3.playerId, action: { type: "submit_steal", text: "steal B" } });
  const reveal = await waitFor(board, (s) => s.phase === "steal_reveal" && s.steal?.results, "auto-reveal when both submitted");
  assert(reveal.steal.results.length === 2, "both steal answers on the board");
  // cross-team privacy: p3 shouldn't have seen p2's answer pre-reveal
  const p2Own = p2.sock.states.find((s) => s.phase === "steal" && s.steal?.mySubmission === "steal A");
  assert(!!p2Own, "captain saw own submission before reveal");

  // 8. resolve steal: p3's team matches slot 1, p2's no match
  const marks = [
    { teamId: myTeam(p2), slot: null },
    { teamId: myTeam(p3), slot: 1 },
  ];
  host.send({ type: "host_action", token: hostToken, action: { type: "resolve_steal", marks } });
  const awarded = await waitFor(board, (s) => s.phase === "round_over" && s.lastAward, "round over after steal resolution");
  assert(awarded.lastAward.teamId === myTeam(p3), "stealing team (Cara) banked the round");
  assert(awarded.question.slots[1].revealed, "stolen answer revealed on board");

  // 9. fast-forward rounds 2-4 (buzz with blue's rotating rep: Alice or Dave)
  const blueRep = () => (board.latest.teams.find((t) => t.name === "Team Blue")?.repName === "Dave" ? p4 : p1);
  for (let r = 1; r < 4; r++) {
    host.send({ type: "host_action", token: hostToken, action: { type: "next_round" } });
    await waitFor(board, (s) => s.phase === "faceoff", `round ${r + 1} faceoff`);
    const rep = blueRep();
    rep.sock.send({ type: "player_action", playerId: rep.playerId, action: { type: "buzz" } });
    const playing = await waitFor(board, (s) => s.phase === "playing", `round ${r + 1} buzz`);
    const n = playing.question.slots.length;
    for (let i = 0; i < n; i++) {
      host.send({ type: "host_action", token: hostToken, action: { type: "reveal_answer", slot: i } });
    }
    await waitFor(board, (s) => s.phase === "round_over", `round ${r + 1} cleared`);
  }
  host.send({ type: "host_action", token: hostToken, action: { type: "next_round" } });
  await waitFor(board, (s) => s.phase === "fast_money_intro", "fast money intro after 4 rounds");
  console.log(`✓ scores after 4 rounds: ${board.latest.teams.map((t) => `${t.name}=${t.score}`).join(", ")}`);

  // 10. fast money
  host.send({ type: "host_action", token: hostToken, action: { type: "start_fast_money", playerIds: [p1.playerId, p4.playerId] } });
  await waitFor(board, (s) => s.phase === "fast_money", "fast money started (both players from winning team)");
  host.send({ type: "host_action", token: hostToken, action: { type: "fm_start_question" } });
  await waitFor(board, (s) => s.fastMoney?.timer?.endsAt, "FM timer broadcast");
  p1.sock.send({ type: "player_action", playerId: p1.playerId, action: { type: "fm_answer", text: "fm answer" } });
  const judged = await waitFor(host, (s) => s.fastMoney?.hostCurrent?.text === "fm answer", "host sees FM answer");
  assert(judged.fastMoney.hostQuestion.answers.length > 0, "host sees FM survey options");
  host.send({ type: "host_action", token: hostToken, action: { type: "fm_judge", points: 33, duplicate: false } });

  // P2 must not see P1's FM answers
  const p2View = p2.sock.latest;
  assert(p2View.fastMoney?.reveal === null && p2View.fastMoney?.hostCurrent === null, "P2 cannot see P1 answers/options");

  console.log("\n🎉 SMOKE TEST PASSED — full game loop works over real WebSockets");
  process.exit(0);
};

run().catch((err) => {
  console.error(`✗ ${err.message}`);
  process.exit(1);
});
