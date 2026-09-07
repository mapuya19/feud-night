import {
  FM_DURATION_MS,
  FM_QUESTIONS,
  ROUND_MULTIPLIERS,
  STEAL_DURATION_MS,
  STRIKES_TO_STEAL,
  TEAM_DEFAULTS,
  MAX_ANSWER_LENGTH,
  MAX_NAME_LENGTH,
} from "./config";
import type { FmAnswer, GameState, SurveyQuestion, Team } from "./types";
import type { HostAction, PlayerAction } from "./protocol";

export interface EngineResult {
  ok: boolean;
  error?: string;
}

const ok: EngineResult = { ok: true };
const fail = (error: string): EngineResult => ({ ok: false, error });

// ---------------------------------------------------------------------------
// Creation & joining
// ---------------------------------------------------------------------------

export function createGame(code: string, hostToken: string, pool: SurveyQuestion[]): GameState {
  const teams: Record<string, Team> = {};
  for (const t of TEAM_DEFAULTS) {
    teams[t.id] = { ...t, name: String(t.name), score: 0, captainId: null, players: [] };
  }
  return {
    code,
    hostToken,
    createdAt: Date.now(),
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
    suggestions: [],
    pendingAnswer: null,
    steal: null,
    timer: null,
    lastAward: null,
    fastMoney: null,
    winnerTeamId: null,
    hostConnectedAt: Date.now(),
    reps: {},
  };
}

/** Assign to the team with the fewest players; ties keep declaration order. */
export function joinPlayer(state: GameState, playerId: string, name: string): EngineResult {
  if (state.players[playerId]) return ok; // idempotent
  const trimmed = name.trim().slice(0, MAX_NAME_LENGTH);
  if (!trimmed) return fail("Name required");
  if (Object.keys(state.players).length >= 80) return fail("Room is full");
  let team: Team | null = null;
  for (const t of Object.values(state.teams)) {
    if (!team || t.players.length < team.players.length) team = t;
  }
  if (!team) return fail("No teams configured");
  state.players[playerId] = { id: playerId, name: trimmed, teamId: team.id, connected: true };
  team.players.push(playerId);
  if (!team.captainId) team.captainId = playerId; // first to join captains by default
  return ok;
}

export function setConnected(state: GameState, playerId: string, connected: boolean): void {
  const p = state.players[playerId];
  if (p && p.connected !== connected) p.connected = connected;
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

/** Pick the next question from the pool (cycles if exhausted) and reset per-question state. */
function loadNextQuestion(state: GameState): void {
  if (state.questionPool.length === 0) return;
  const q = state.questionPool[state.questionCursor % state.questionPool.length];
  state.questionCursor++;
  state.question = q;
  state.revealed = q.answers.map(() => false);
  state.strikes = 0;
  state.suggestions = [];
  state.pendingAnswer = null;
  state.steal = null;
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
      const totalPlayers = Object.keys(state.players).length;
      if (totalPlayers < 3) return fail("Need at least 3 players to start");
      return startRound(state, 0);
    }

    case "start_faceoff": {
      if (state.phase !== "playing" && state.phase !== "faceoff") return fail("Can only re-run face-off mid-question");
      state.phase = "faceoff";
      state.controllingTeamId = null;
      state.buzzWinnerId = null;
      state.suggestions = [];
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
      state.suggestions = [];
      if (state.revealed.every(Boolean)) {
        const winner = state.controllingTeamId;
        if (winner) return awardBank(state, winner, "clear");
      }
      return ok;
    }

    case "strike": {
      if (state.phase !== "playing") return fail("Not in answering phase");
      state.strikes++;
      state.pendingAnswer = null;
      state.suggestions = [];
      if (state.strikes >= STRIKES_TO_STEAL) {
        state.phase = "steal";
        state.steal = { submissions: [], results: null };
        state.timer = {
          kind: "steal",
          endsAt: Date.now() + STEAL_DURATION_MS,
          durationMs: STEAL_DURATION_MS,
        };
      }
      return ok;
    }

    case "skip_question": {
      if (state.phase !== "faceoff" && state.phase !== "playing") return fail("No active question");
      state.controllingTeamId = null;
      state.buzzWinnerId = null;
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
      // Winner: correct steals compete on survey rank (higher points wins).
      const correct = results
        .filter((r) => r.slot !== null && state.question)
        .sort((a, b) => {
          const pa = state.question!.answers[a.slot!].points;
          const pb = state.question!.answers[b.slot!].points;
          return pb - pa;
        });
      if (correct.length > 0) {
        return awardBank(state, correct[0].teamId, "steal");
      }
      const holder = state.controllingTeamId;
      if (holder) return awardBank(state, holder, "failed_steal");
      state.phase = "round_over";
      return ok;
    }

    case "set_captain": {
      const team = state.teams[action.teamId];
      if (!team || !state.players[action.playerId]) return fail("Unknown team/player");
      if (state.players[action.playerId].teamId !== action.teamId) return fail("Player not on that team");
      team.captainId = action.playerId;
      return ok;
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

    case "start_fast_money": {
      if (state.phase !== "fast_money_intro" && state.phase !== "game_over")
        return fail("Not in Fast Money setup");
      const ids = action.playerIds;
      if (!Array.isArray(ids) || ids.length !== 2) return fail("Pick exactly 2 players");
      const winnerTeam = state.winnerTeamId ? state.teams[state.winnerTeamId] : null;
      if (!winnerTeam) return fail("No winning team");
      for (const id of ids) {
        const p = state.players[id];
        if (!p || p.teamId !== winnerTeam.id) return fail("Players must be from the winning team");
      }
      const fmQuestions: SurveyQuestion[] = [];
      let cursor = state.questionCursor;
      while (fmQuestions.length < FM_QUESTIONS && fmQuestions.length < state.questionPool.length) {
        fmQuestions.push(state.questionPool[cursor % state.questionPool.length]);
        cursor++;
      }
      state.questionCursor = cursor;
      state.fastMoney = {
        playerIds: ids,
        playerIndex: 0,
        questionIndex: 0,
        questions: fmQuestions,
        answers: fmQuestions.map(() => [
          emptyFmAnswer(),
          emptyFmAnswer(),
        ]),
        revealStep: -1,
        total: 0,
      };
      state.timer = null;
      state.phase = "fast_money";
      return ok;
    }

    case "fm_start_question": {
      if (state.phase !== "fast_money" || !state.fastMoney) return fail("Not in Fast Money");
      const fm = state.fastMoney;
      const cur = fm.answers[fm.questionIndex][fm.playerIndex];
      if (cur.text !== "" && !cur.timedOut) return fail("Answer already submitted — judge it first");
      if (cur.judged) return fail("Already judged — advance the question");
      const ms = FM_DURATION_MS[fm.playerIndex];
      state.timer = { kind: "fast_money", endsAt: Date.now() + ms, durationMs: ms };
      return ok;
    }

    case "fm_judge": {
      if (state.phase !== "fast_money" || !state.fastMoney) return fail("Not in Fast Money");
      const fm = state.fastMoney;
      const cur = fm.answers[fm.questionIndex][fm.playerIndex];
      if (cur.text === "" && !cur.timedOut) return fail("No answer submitted yet");
      cur.points = Math.max(0, Math.min(100, Math.round(action.points)));
      cur.duplicate = action.duplicate;
      if (cur.duplicate) cur.points = 0;
      cur.judged = true;
      clearTimer(state);
      return ok;
    }

    case "fm_next_question": {
      if (state.phase !== "fast_money" || !state.fastMoney) return fail("Not in Fast Money");
      const fm = state.fastMoney;
      const cur = fm.answers[fm.questionIndex][fm.playerIndex];
      if (!cur.judged) return fail("Judge the current answer first");
      if (fm.questionIndex + 1 >= fm.questions.length) return fail("Last question — advance the player");
      fm.questionIndex++;
      clearTimer(state);
      return ok;
    }

    case "fm_next_player": {
      if (state.phase !== "fast_money" || !state.fastMoney) return fail("Not in Fast Money");
      const fm = state.fastMoney;
      if (fm.playerIndex !== 0) return fail("Already on player 2");
      if (!fm.answers[fm.questions.length - 1][0].judged) return fail("Player 1 hasn't finished");
      fm.playerIndex = 1;
      fm.questionIndex = 0;
      clearTimer(state);
      return ok;
    }

    case "fm_reveal_step": {
      if (state.phase !== "fast_money" && state.phase !== "fast_money_reveal") return fail("Not in Fast Money");
      const fm = state.fastMoney;
      if (!fm) return fail("No Fast Money state");
      if (!fm.answers[fm.questions.length - 1][1].judged) return fail("Player 2 hasn't finished");
      if (state.phase === "fast_money") {
        state.phase = "fast_money_reveal";
        fm.revealStep = -1;
        fm.total = 0;
        clearTimer(state);
        return ok;
      }
      if (fm.revealStep < fm.questions.length) {
        fm.revealStep++;
        if (fm.revealStep > 0) {
          const q = fm.revealStep - 1;
          fm.total += fm.answers[q][0].points + fm.answers[q][1].points;
        }
        return ok;
      }
      // stepping past totals → game over
      state.phase = "game_over";
      return ok;
    }

    case "end_game": {
      state.phase = "game_over";
      if (state.winnerTeamId === null) {
        const leader = Object.values(state.teams).sort((a, b) => b.score - a.score)[0];
        state.winnerTeamId = leader?.id ?? null;
      }
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
    case "buzz": {
      if (state.phase !== "faceoff") return fail("No face-off in progress");
      if (state.reps[team.id] !== playerId) return fail("You're not the rep");
      state.controllingTeamId = team.id;
      state.buzzWinnerId = playerId;
      state.phase = "playing";
      return ok;
    }

    case "suggest": {
      if (state.phase !== "playing") return fail("Not answering right now");
      if (state.controllingTeamId !== team.id) return fail("Not your team's turn");
      const text = action.text.trim().slice(0, MAX_ANSWER_LENGTH);
      if (!text) return fail("Empty answer");
      const existing = state.suggestions.find((s) => s.by === playerId);
      if (existing) {
        // players may revise their one live suggestion
        existing.text = text;
        existing.at = Date.now();
      } else {
        state.suggestions.push({ text, by: playerId, byName: player.name, at: Date.now() });
      }
      return ok;
    }

    case "lock_answer": {
      if (state.phase !== "playing") return fail("Not answering right now");
      if (state.controllingTeamId !== team.id) return fail("Not your team's turn");
      if (team.captainId !== playerId) return fail("Only the captain locks answers");
      const text = action.text.trim().slice(0, MAX_ANSWER_LENGTH);
      if (!text) return fail("Empty answer");
      state.pendingAnswer = { text, by: playerId, byName: player.name, at: Date.now() };
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

    case "fm_answer": {
      if (state.phase !== "fast_money" || !state.fastMoney) return fail("Not in Fast Money");
      const fm = state.fastMoney;
      if (fm.playerIds[fm.playerIndex] !== playerId) return fail("Not your Fast Money turn");
      const cur = fm.answers[fm.questionIndex][fm.playerIndex];
      if (cur.text !== "" || cur.timedOut) return fail("Already answered");
      const text = action.text.trim().slice(0, MAX_ANSWER_LENGTH);
      if (!text) return fail("Empty answer");
      cur.text = text;
      clearTimer(state);
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
  if (kind === "fast_money") {
    if (state.phase !== "fast_money" || !state.fastMoney) return false;
    const fm = state.fastMoney;
    const cur = fm.answers[fm.questionIndex][fm.playerIndex];
    if (cur.text === "" && !cur.timedOut) {
      cur.timedOut = true;
      return true;
    }
    return false;
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

function emptyFmAnswer(): FmAnswer {
  return { text: "", points: 0, duplicate: false, timedOut: false, judged: false };
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
