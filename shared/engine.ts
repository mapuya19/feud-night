import {
  ROUND_MULTIPLIERS,
  STEAL_DURATION_MS,
  ANSWER_DURATION_MS,
  RPS_DURATION_MS,
  STRIKES_TO_STEAL,
  TEAM_DEFAULTS,
  MAX_ANSWER_LENGTH,
  MAX_NAME_LENGTH,
  MAX_TEAM_PLAYERS,
  MAX_TEAMS,
  MIN_TEAMS,
} from "./config";
import type { GameState, RpsChoice, SurveyQuestion, Team } from "./types";
import type { HostAction, PlayerAction } from "./protocol";

export interface EngineResult {
  ok: boolean;
  error?: string;
}

const ok: EngineResult = { ok: true };
const fail = (error: string): EngineResult => ({ ok: false, error });

/** Keep a requested team count inside the supported 2–5 range. */
export function clampTeamCount(count: number): number {
  return Math.max(MIN_TEAMS, Math.min(MAX_TEAMS, Math.round(count)));
}

// ---------------------------------------------------------------------------
// Creation & joining
// ---------------------------------------------------------------------------

export function createGame(
  code: string,
  hostToken: string,
  pool: SurveyQuestion[],
  teamCount: number = TEAM_DEFAULTS.length,
): GameState {
  const count = clampTeamCount(teamCount);
  const teams: Record<string, Team> = {};
  for (const t of TEAM_DEFAULTS.slice(0, count)) {
    teams[t.id] = { ...t, name: String(t.name), score: 0, captainId: null, players: [] };
  }
  return {
    code,
    hostToken,
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
    phase: "lobby",
    roundIndex: 0,
    questionPool: shuffle(pool),
    questionCursor: 0,
    teams,
    players: {},
    question: null,
    revealed: [],
    strikes: 0,
    controllingTeamId: null,
    buzzWinnerId: null,
    answererId: null,
    pendingAnswer: null,
    steal: null,
    tiebreak: null,
    timer: null,
    lastAward: null,
    winnerTeamId: null,
    hostConnectedAt: Date.now(),
    reps: {},
  };
}

/** Players choose their own team in the open lobby; the Worker enforces capacity. */
export function joinPlayer(
  state: GameState,
  playerId: string,
  name: string,
  teamId: string,
  claimCaptain: boolean,
): EngineResult {
  if (state.phase !== "lobby") return fail("Teams are locked — the game has started");
  if (state.players[playerId]) return ok; // idempotent
  const trimmed = name.trim().slice(0, MAX_NAME_LENGTH);
  if (!trimmed) return fail("Name required");
  if (Object.keys(state.players).length >= Object.keys(state.teams).length * MAX_TEAM_PLAYERS)
    return fail("Room is full");
  const team = state.teams[teamId];
  if (!team) return fail("Choose a valid team");
  if (team.players.length >= MAX_TEAM_PLAYERS) return fail("That team is full — choose another");
  if (claimCaptain && team.captainId) return fail("That team already has a captain");

  state.players[playerId] = { id: playerId, name: trimmed, teamId, connected: true };
  team.players.push(playerId);
  if (claimCaptain) team.captainId = playerId;
  return ok;
}

function movePlayerToTeam(state: GameState, playerId: string, teamId: string): EngineResult {
  if (state.phase !== "lobby") return fail("Teams are locked — the game has started");
  const player = state.players[playerId];
  const destination = state.teams[teamId];
  if (!player || !destination) return fail("Unknown player or team");
  if (player.teamId === teamId) return ok;
  if (destination.players.length >= MAX_TEAM_PLAYERS) return fail("That team is full — choose another");

  const source = state.teams[player.teamId];
  source.players = source.players.filter((id) => id !== playerId);
  if (source.captainId === playerId) source.captainId = null;
  player.teamId = teamId;
  destination.players.push(playerId);
  return ok;
}

export function setConnected(state: GameState, playerId: string, connected: boolean): void {
  const p = state.players[playerId];
  if (p && p.connected !== connected) p.connected = connected;
  // A submitted answer remains with the host even if its player drops. Only
  // pass the mic when the active player disconnected before submitting.
  if (
    p &&
    !connected &&
    state.phase === "playing" &&
    state.answererId === playerId &&
    state.timer?.kind === "answer" &&
    !state.pendingAnswer
  ) {
    advanceAnswerer(state);
  }
}

// ---------------------------------------------------------------------------
// Round lifecycle
// ---------------------------------------------------------------------------

function multiplier(state: GameState): number {
  return ROUND_MULTIPLIERS[Math.min(state.roundIndex, ROUND_MULTIPLIERS.length - 1)];
}

export function bank(state: GameState): number {
  if (!state.question) return 0;
  return (
    state.question.answers.reduce((sum, a, i) => (state.revealed[i] ? sum + a.points : sum), 0) *
    multiplier(state)
  );
}

function clearTimer(state: GameState): void {
  state.timer = null;
}

/** The controlling team answers down the line; advance and restart the answer clock. */
function advanceAnswerer(state: GameState): void {
  const team = state.controllingTeamId ? state.teams[state.controllingTeamId] : null;
  if (!team || team.players.length === 0) {
    state.answererId = null;
    clearTimer(state);
    return;
  }
  const cur = state.answererId ? team.players.indexOf(state.answererId) : -1;
  const hasConnectedPlayer = team.players.some((id) => state.players[id]?.connected);
  // Preserve join-order rotation, but do not burn the clock on an offline
  // teammate while anyone from the team is available. If nobody is connected,
  // keep a normal turn live so a reconnect can still answer it.
  for (let offset = 1; offset <= team.players.length; offset++) {
    const candidate = team.players[(cur + offset) % team.players.length];
    if (!hasConnectedPlayer || state.players[candidate]?.connected) {
      state.answererId = candidate;
      state.timer = { kind: "answer", endsAt: Date.now() + ANSWER_DURATION_MS, durationMs: ANSWER_DURATION_MS };
      return;
    }
  }
}

/** Three strikes: every opposing captain huddles for one secret steal answer. */
function beginSteal(state: GameState): void {
  state.phase = "steal";
  state.steal = { submissions: [], results: null };
  state.tiebreak = null;
  state.answererId = null;
  state.pendingAnswer = null;
  state.timer = { kind: "steal", endsAt: Date.now() + STEAL_DURATION_MS, durationMs: STEAL_DURATION_MS };
}

const RPS_BEATS: Record<RpsChoice, RpsChoice> = { rock: "scissors", paper: "rock", scissors: "paper" };

function startTiebreak(state: GameState, contenders: string[], round = 1): void {
  state.phase = "steal_tiebreak";
  state.tiebreak = { contenders, choices: [], round, winnerTeamId: null };
  state.timer = { kind: "rps", endsAt: Date.now() + RPS_DURATION_MS, durationMs: RPS_DURATION_MS };
}

/** Reveal a simultaneous RPS throw. A shared winning shape rethrows among its teams. */
function resolveTiebreak(state: GameState): void {
  const tiebreak = state.tiebreak;
  if (!tiebreak) return;
  clearTimer(state);
  const throwers = tiebreak.choices.map((choice) => choice.teamId);
  const shapes = new Set(tiebreak.choices.map((choice) => choice.choice));
  let winnerTeamId: string | null = null;
  let nextContenders = throwers.length > 0 ? throwers : tiebreak.contenders;

  if (tiebreak.choices.length === 1) {
    winnerTeamId = tiebreak.choices[0].teamId;
  } else if (shapes.size === 2) {
    const [first, second] = [...shapes];
    const winningShape = RPS_BEATS[first] === second ? first : second;
    const winners = tiebreak.choices.filter((choice) => choice.choice === winningShape).map((choice) => choice.teamId);
    if (winners.length === 1) winnerTeamId = winners[0];
    else nextContenders = winners;
  }
  // One shape or all three shapes is a tie; the same contenders throw again.
  tiebreak.contenders = nextContenders;
  tiebreak.winnerTeamId = winnerTeamId;
  state.phase = "steal_tiebreak_reveal";
}

/** Pick the next question from the pool (cycles if exhausted) and reset per-question state. */
function loadNextQuestion(state: GameState): void {
  if (state.questionPool.length === 0) return;
  const q = state.questionPool[state.questionCursor % state.questionPool.length];
  state.questionCursor++;
  state.question = q;
  state.revealed = q.answers.map(() => false);
  state.strikes = 0;
  state.pendingAnswer = null;
  state.answererId = null;
  state.steal = null;
  state.tiebreak = null;
  clearTimer(state);
}

/** Reps rotate by round so everyone eventually faces off. */
function assignReps(state: GameState): void {
  for (const team of Object.values(state.teams)) {
    const manual = state.reps[team.id];
    if (manual && team.players.includes(manual)) continue;
    // rotate with the round so everyone eventually faces off
    const idx = state.roundIndex % Math.max(team.players.length, 1);
    state.reps[team.id] = team.players[idx] ?? null;
  }
}

function startRound(state: GameState, roundIndex: number): EngineResult {
  state.roundIndex = roundIndex;
  state.controllingTeamId = null;
  state.buzzWinnerId = null;
  state.lastAward = null;
  state.reps = {}; // clear manual overrides each round
  loadNextQuestion(state);
  assignReps(state);
  state.phase = "faceoff";
  return ok;
}

function awardBank(state: GameState, teamId: string, reason: "clear" | "steal" | "failed_steal"): EngineResult {
  const pts = bank(state);
  state.teams[teamId].score += pts;
  state.lastAward = { teamId, points: pts, reason };
  state.phase = "round_over";
  state.answererId = null;
  state.pendingAnswer = null;
  clearTimer(state);
  return ok;
}

// ---------------------------------------------------------------------------
// Host actions
// ---------------------------------------------------------------------------

export function applyHostAction(state: GameState, action: HostAction): EngineResult {
  switch (action.type) {
    case "start_game": {
      if (state.phase !== "lobby") return fail("Game already started");
      const teams = Object.values(state.teams);
      if (teams.some((team) => team.players.length === 0)) return fail("Every team needs at least one player");
      if (teams.some((team) => !team.captainId)) return fail("Every team needs a captain");
      return startRound(state, 0);
    }

    case "start_faceoff": {
      if (state.phase !== "playing" && state.phase !== "faceoff") return fail("Can only re-run face-off mid-question");
      state.phase = "faceoff";
      state.controllingTeamId = null;
      state.buzzWinnerId = null;
      state.answererId = null;
      state.pendingAnswer = null;
      clearTimer(state);
      return ok;
    }

    case "reveal_answer": {
      if (state.phase !== "playing" || !state.question) return fail("Not in answering phase");
      const slot = action.slot;
      if (slot < 0 || slot >= state.question.answers.length) return fail("Bad slot");
      if (state.revealed[slot]) return fail("Already revealed");
      state.revealed[slot] = true;
      state.pendingAnswer = null;
      if (state.revealed.every(Boolean)) {
        const winner = state.controllingTeamId;
        if (winner) return awardBank(state, winner, "clear");
      }
      advanceAnswerer(state); // next player down the line
      return ok;
    }

    case "strike": {
      if (state.phase !== "playing") return fail("Not in answering phase");
      state.strikes++;
      state.pendingAnswer = null;
      if (state.strikes >= STRIKES_TO_STEAL) {
        beginSteal(state);
      } else {
        advanceAnswerer(state);
      }
      return ok;
    }

    case "skip_answerer": {
      if (state.phase !== "playing") return fail("Not in answering phase");
      state.pendingAnswer = null;
      advanceAnswerer(state);
      return ok;
    }

    case "skip_question": {
      if (state.phase !== "faceoff" && state.phase !== "playing") return fail("No active question");
      state.controllingTeamId = null;
      state.buzzWinnerId = null;
      state.answererId = null;
      state.lastAward = null;
      loadNextQuestion(state);
      assignReps(state);
      state.phase = "faceoff";
      return ok;
    }

    case "next_round": {
      if (state.phase !== "round_over") return fail("Round not over yet");
      const next = state.roundIndex + 1;
      if (next >= ROUND_MULTIPLIERS.length) {
        const leader = Object.values(state.teams).sort((a, b) => b.score - a.score)[0];
        state.winnerTeamId = leader?.id ?? null;
        state.phase = "game_over";
        state.question = null;
        state.timer = null;
        return ok;
      }
      return startRound(state, next);
    }

    case "resolve_steal": {
      if (state.phase !== "steal_reveal" || !state.steal) return fail("Not judging steals");
      const marks = action.marks;
      const results = state.steal.submissions.map((sub) => {
        const mark = marks.find((m) => m.teamId === sub.teamId);
        return { teamId: sub.teamId, text: sub.text, slot: mark?.slot ?? null };
      });
      state.steal.results = results;
      // A matched steal is on the board — reveal it before banking.
      for (const r of results) {
        if (r.slot !== null && state.question && !state.revealed[r.slot]) {
          state.revealed[r.slot] = true;
        }
      }
      // Correct steals compete on survey rank. When two teams match the same
      // top answer, their captains settle the otherwise-network-speed tie with RPS.
      const correct = results.filter((r) => r.slot !== null && state.question).sort((a, b) => a.slot! - b.slot!);
      if (correct.length > 0) {
        const topSlot = correct[0].slot!;
        const tiedTeams = correct.filter((r) => r.slot === topSlot).map((r) => r.teamId);
        if (tiedTeams.length > 1) {
          startTiebreak(state, tiedTeams);
          return ok;
        }
        return awardBank(state, correct[0].teamId, "steal");
      }
      const holder = state.controllingTeamId;
      if (holder) return awardBank(state, holder, "failed_steal");
      state.phase = "round_over";
      return ok;
    }

    case "continue_tiebreak": {
      if (state.phase !== "steal_tiebreak_reveal" || !state.tiebreak) return fail("No tie-break to continue");
      if (state.tiebreak.winnerTeamId) return awardBank(state, state.tiebreak.winnerTeamId, "steal");
      startTiebreak(state, state.tiebreak.contenders, state.tiebreak.round + 1);
      return ok;
    }

    case "set_team_count": {
      if (state.phase !== "lobby") return fail("Teams lock when the game starts");
      const count = clampTeamCount(action.count);
      const keep = new Set<string>(TEAM_DEFAULTS.slice(0, count).map((t) => t.id));
      for (const [id, team] of Object.entries(state.teams)) {
        if (!keep.has(id) && team.players.length > 0)
          return fail("Move players off that team first");
      }
      for (const id of Object.keys(state.teams)) {
        if (!keep.has(id)) delete state.teams[id];
      }
      for (const t of TEAM_DEFAULTS.slice(0, count)) {
        if (!state.teams[t.id])
          state.teams[t.id] = { ...t, name: String(t.name), score: 0, captainId: null, players: [] };
      }
      return ok;
    }

    case "set_captain": {
      if (state.phase !== "lobby") return fail("Captains lock when the game starts");
      const team = state.teams[action.teamId];
      if (!team || !state.players[action.playerId]) return fail("Unknown team/player");
      if (state.players[action.playerId].teamId !== action.teamId) return fail("Player not on that team");
      team.captainId = action.playerId;
      return ok;
    }

    case "move_player": {
      return movePlayerToTeam(state, action.playerId, action.teamId);
    }

    case "set_rep": {
      const team = state.teams[action.teamId];
      if (!team || !state.players[action.playerId]) return fail("Unknown team/player");
      if (state.players[action.playerId].teamId !== action.teamId) return fail("Player not on that team");
      state.reps[action.teamId] = action.playerId;
      return ok;
    }

    case "set_team_name": {
      const team = state.teams[action.teamId];
      if (!team) return fail("Unknown team");
      const name = action.name.trim().slice(0, 24);
      if (name) team.name = name;
      return ok;
    }

    case "end_game": {
      state.phase = "game_over";
      if (state.winnerTeamId === null) {
        const leader = Object.values(state.teams).sort((a, b) => b.score - a.score)[0];
        state.winnerTeamId = leader?.id ?? null;
      }
      state.answererId = null;
      state.pendingAnswer = null;
      clearTimer(state);
      return ok;
    }

    case "reset_game": {
      const fresh = createGame(state.code, state.hostToken, state.questionPool);
      // keep teams & players so the room stays usable
      fresh.teams = state.teams;
      fresh.players = state.players;
      for (const t of Object.values(fresh.teams)) t.score = 0;
      Object.assign(state, fresh);
      return ok;
    }

    default:
      return fail("Unknown host action");
  }
}

// ---------------------------------------------------------------------------
// Player actions
// ---------------------------------------------------------------------------

export function applyPlayerAction(state: GameState, playerId: string, action: PlayerAction): EngineResult {
  const player = state.players[playerId];
  if (!player) return fail("Not joined");
  const team = state.teams[player.teamId];

  switch (action.type) {
    case "choose_team":
      return movePlayerToTeam(state, playerId, action.teamId);

    case "claim_captain": {
      if (state.phase !== "lobby") return fail("Captains are locked for this game");
      if (team.captainId && team.captainId !== playerId) return fail("Your team already has a captain");
      team.captainId = playerId;
      return ok;
    }

    case "release_captain": {
      if (state.phase !== "lobby") return fail("Captains are locked for this game");
      if (team.captainId !== playerId) return fail("You are not this team's captain");
      team.captainId = null;
      return ok;
    }

    case "buzz": {
      if (state.phase !== "faceoff") return fail("No face-off in progress");
      if (state.reps[team.id] !== playerId) return fail("You're not the rep");
      state.controllingTeamId = team.id;
      state.buzzWinnerId = playerId;
      state.phase = "playing";
      // The buzz winner gives the first official answer; then down the line.
      state.answererId = playerId;
      state.timer = { kind: "answer", endsAt: Date.now() + ANSWER_DURATION_MS, durationMs: ANSWER_DURATION_MS };
      return ok;
    }

    case "submit_answer": {
      if (state.phase !== "playing") return fail("Not answering right now");
      if (state.controllingTeamId !== team.id) return fail("Not your team's turn");
      if (state.answererId !== playerId) {
        const up = state.answererId ? state.players[state.answererId]?.name : null;
        return fail(up ? `It's ${up}'s turn — answers go down the line` : "No answerer is up");
      }
      if (state.pendingAnswer) return fail("That answer is already awaiting the host");
      if (state.timer?.kind !== "answer" || Date.now() >= state.timer.endsAt) return fail("Time is up");
      const text = action.text.trim().slice(0, MAX_ANSWER_LENGTH);
      if (!text) return fail("Empty answer");
      state.pendingAnswer = { text, by: playerId, byName: player.name, at: Date.now() };
      clearTimer(state); // answered in time — host now judges
      return ok;
    }

    case "submit_steal": {
      if (state.phase !== "steal" || !state.steal) return fail("No steal in progress");
      if (state.controllingTeamId === team.id) return fail("Controlling team can't steal");
      if (team.captainId !== playerId) return fail("Only the captain submits the steal");
      if (state.steal.submissions.some((s) => s.teamId === team.id)) return fail("Already submitted");
      const text = action.text.trim().slice(0, MAX_ANSWER_LENGTH);
      if (!text) return fail("Empty answer");
      state.steal.submissions.push({ teamId: team.id, text, at: Date.now() });
      maybeFinishSteal(state);
      return ok;
    }

    case "submit_rps": {
      const tiebreak = state.tiebreak;
      if (state.phase !== "steal_tiebreak" || !tiebreak) return fail("No RPS tie-break in progress");
      if (state.timer?.kind !== "rps" || Date.now() >= state.timer.endsAt) return fail("RPS throw time is up");
      if (team.captainId !== playerId || !tiebreak.contenders.includes(team.id)) return fail("Only a tied team captain can throw");
      if (tiebreak.choices.some((choice) => choice.teamId === team.id)) return fail("Your throw is locked");
      if (!(["rock", "paper", "scissors"] as const).includes(action.choice)) return fail("Invalid throw");
      tiebreak.choices.push({ teamId: team.id, choice: action.choice });
      if (tiebreak.choices.length === tiebreak.contenders.length) resolveTiebreak(state);
      return ok;
    }

    default:
      return fail("Unknown player action");
    }
}

// ---------------------------------------------------------------------------
// Timers (fired by DO alarms)
// ---------------------------------------------------------------------------

function maybeFinishSteal(state: GameState): void {
  const steal = state.steal;
  if (!steal) return;
  const expected = Object.values(state.teams).filter((t) => t.id !== state.controllingTeamId).length;
  if (steal.submissions.length >= expected) {
    state.phase = "steal_reveal";
    clearTimer(state);
  }
}

/** Called when the active timer expires. Returns true if state changed. */
export function expireTimer(state: GameState): boolean {
  if (!state.timer) return false;
  const kind = state.timer.kind;
  state.timer = null;
  if (kind === "steal") {
    if (state.phase !== "steal" || !state.steal) return false;
    state.phase = "steal_reveal";
    return true;
  }
  if (kind === "answer") {
    if (state.phase !== "playing") return false;
    // Out of time without an official answer — that's a strike, keep the line moving.
    state.strikes++;
    state.pendingAnswer = null;
    if (state.strikes >= STRIKES_TO_STEAL) {
      beginSteal(state);
    } else {
      advanceAnswerer(state);
    }
    return true;
  }
  if (kind === "rps") {
    if (state.phase !== "steal_tiebreak" || !state.tiebreak) return false;
    resolveTiebreak(state);
    return true;
  }
  return false;
}

/** Next alarm time for the active timer, or null. */
export function timerDeadline(state: GameState): number | null {
  return state.timer?.endsAt ?? null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
