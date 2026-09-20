/**
 * End-to-end smoke test against a local or deployed Worker.
 * Exercises team-count creation, roster setup, face-off, down-the-line answers,
 * secret steals, five boards, and game over over real WebSockets.
 *
 * Usage: node scripts/smoke.mjs [http://localhost:8787]
 */
const BASE = process.argv[2] ?? "http://localhost:8787";
const WS_BASE = BASE.replace(/^http/, "ws");

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
  console.log(`✓ ${message}`);
};

function makeSocket() {
  const listeners = [];
  let ws = null;
  const api = {
    states: [],
    latest: null,
    connect(path) {
      ws = new WebSocket(`${WS_BASE}${path}`);
      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === "state") {
          api.states.push(message.state);
          api.latest = message.state;
        }
        for (const listener of listeners) listener(message);
      };
      return new Promise((resolve, reject) => {
        ws.onopen = () => resolve(api);
        ws.onerror = () => reject(new Error(`WebSocket error: ${path}`));
      });
    },
    on(listener) {
      listeners.push(listener);
      return () => {
        const index = listeners.indexOf(listener);
        if (index >= 0) listeners.splice(index, 1);
      };
    },
    send(message) {
      ws.send(JSON.stringify(message));
    },
  };
  return api;
}

function waitFor(socket, predicate, label, timeout = 5000) {
  return new Promise((resolve, reject) => {
    if (socket.latest && predicate(socket.latest)) return resolve(socket.latest);
    const off = socket.on((message) => {
      if (message.type === "state" && predicate(message.state)) {
        clearTimeout(timer);
        off();
        resolve(message.state);
      }
    });
    const timer = setTimeout(() => {
      off();
      reject(new Error(`timeout waiting for: ${label}`));
    }, timeout);
  });
}

function waitForMessage(socket, predicate, label, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const off = socket.on((message) => {
      if (predicate(message)) {
        clearTimeout(timer);
        off();
        resolve(message);
      }
    });
    const timer = setTimeout(() => {
      off();
      reject(new Error(`timeout waiting for: ${label}`));
    }, timeout);
  });
}

async function run() {
  const create = await fetch(`${BASE}/create`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ teamCount: 3 }),
  });
  assert(create.ok, "POST /create");
  const { code, hostToken } = await create.json();
  assert(/^[A-Z]{4}$/.test(code), `room code ${code} allocated`);

  const host = await makeSocket().connect(`/room/${code}/ws?role=host&token=${hostToken}`);
  const board = await makeSocket().connect(`/room/${code}/ws?role=board`);

  async function joinPlayer(name, teamId, claimCaptain = false) {
    const joining = await makeSocket().connect(`/room/${code}/ws?role=player`);
    const welcome = waitForMessage(joining, (message) => message.type === "welcome" && !!message.playerId, `${name} welcome`);
    joining.send({ type: "join", name, teamId, claimCaptain });
    const { playerId } = await welcome;
    const socket = await makeSocket().connect(`/room/${code}/ws?role=player&playerId=${playerId}`);
    await waitFor(socket, (state) => state.myTeamId === teamId, `${name} reconnected`);
    return { name, playerId, socket };
  }

  const alice = await joinPlayer("Alice", "diamond", true);
  const bob = await joinPlayer("Bob", "pearl", true);
  const cara = await joinPlayer("Cara", "platinum", true);
  const dave = await joinPlayer("Dave", "diamond");
  const players = [alice, bob, cara, dave];
  await waitFor(board, (state) => state.teams.length === 3, "three-team room configured");
  assert(board.latest.teams.find((team) => team.id === "diamond").playerCount === 2, "Diamond has two players for rotation");

  host.send({ type: "host_action", token: hostToken, action: { type: "start_game" } });
  await waitFor(board, (state) => state.phase === "faceoff", "face-off begins");

  alice.socket.send({ type: "player_action", playerId: alice.playerId, action: { type: "buzz" } });
  await waitFor(board, (state) => state.phase === "playing" && state.answerer?.name === "Alice", "Alice wins and is first up");
  alice.socket.send({ type: "player_action", playerId: alice.playerId, action: { type: "submit_answer", text: "first answer" } });
  await waitFor(host, (state) => state.pendingAnswer?.text === "first answer", "host receives the official answer");
  await waitFor(bob.socket, (state) => state.pendingAnswer === null, "opposing team cannot see the answer");

  host.send({ type: "host_action", token: hostToken, action: { type: "reveal_answer", slot: 0 } });
  await waitFor(board, (state) => state.question?.slots[0]?.revealed && state.answerer?.name === "Dave", "answer revealed and mic passes to Dave");

  for (let i = 0; i < 3; i++) host.send({ type: "host_action", token: hostToken, action: { type: "strike" } });
  await waitFor(board, (state) => state.phase === "steal" && !!state.steal?.endsAt, "three strikes open the steal");
  bob.socket.send({ type: "player_action", playerId: bob.playerId, action: { type: "submit_steal", text: "Bob's steal" } });
  cara.socket.send({ type: "player_action", playerId: cara.playerId, action: { type: "submit_steal", text: "Cara's steal" } });
  await waitFor(board, (state) => state.phase === "steal_reveal" && !!state.steal?.results, "steals reveal after both captains submit");

  host.send({
    type: "host_action",
    token: hostToken,
    action: {
      type: "resolve_steal",
      marks: [
        { teamId: "pearl", slot: null },
        { teamId: "platinum", slot: 1 },
      ],
    },
  });
  await waitFor(board, (state) => state.phase === "round_over" && state.lastAward?.teamId === "platinum", "Cara's team banks the steal");

  for (let round = 2; round <= 5; round++) {
    host.send({ type: "host_action", token: hostToken, action: { type: "next_round" } });
    await waitFor(board, (state) => state.phase === "faceoff", `round ${round} face-off`);
    const diamondRep = board.latest.teams.find((team) => team.id === "diamond").repName;
    const rep = players.find((player) => player.name === diamondRep);
    assert(rep, `round ${round} Diamond rep is connected`);
    rep.socket.send({ type: "player_action", playerId: rep.playerId, action: { type: "buzz" } });
    const playing = await waitFor(board, (state) => state.phase === "playing", `round ${round} buzz`);
    for (let slot = 0; slot < playing.question.slots.length; slot++) {
      host.send({ type: "host_action", token: hostToken, action: { type: "reveal_answer", slot } });
    }
    await waitFor(board, (state) => state.phase === "round_over", `round ${round} board clears`);
  }

  host.send({ type: "host_action", token: hostToken, action: { type: "next_round" } });
  await waitFor(board, (state) => state.phase === "game_over", "game ends after the fifth board");
  host.send({ type: "host_action", token: hostToken, action: { type: "close_room" } });
  console.log("\n🎉 SMOKE TEST PASSED — current full game loop works over real WebSockets");
}

run().catch((error) => {
  console.error(`✗ ${error.message}`);
  process.exit(1);
});
