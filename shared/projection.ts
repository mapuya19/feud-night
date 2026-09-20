import { ANSWER_DURATION_MS, ROUND_MULTIPLIERS, RPS_DURATION_MS } from "./config";
import { bank } from "./engine";
import type { GameState, Role } from "./types";

/**
 * Per-viewer projection of GameState. The Durable Object calls this before
 * sending state to each connected socket — clients only ever receive their
 * own view, so secrets are enforced server-side:
 *
 *  - Unrevealed board answers are hidden from everyone except the host.
 *  - Steal submissions stay hidden until steal_reveal (a captain sees their own).
 */
export interface Viewer {
  role: Role;
  playerId?: string;
  isHost: boolean;
}

export interface PublicSlot {
  points: number;
  revealed: boolean;
  text: string | null; // present when revealed (or host)
}

export interface PublicTeam {
  id: string;
  name: string;
  color: string;
  score: number;
  playerCount: number;
  connectedCount: number;
  isControlling: boolean;
  captainName: string | null;
  repName: string | null;
}

export interface PublicSteal {
  endsAt: number | null;
  durationMs: number;
  submittedTeamIds: string[];
  mySubmission: string | null;
  results: { teamId: string; text: string; matched: boolean; matchedText: string | null }[] | null;
}

export interface PublicTiebreak {
  contenderTeamIds: string[];
  round: number;
  endsAt: number | null;
  durationMs: number;
  submittedTeamIds: string[];
  myChoice: "rock" | "paper" | "scissors" | null;
  choices: { teamId: string; choice: "rock" | "paper" | "scissors" }[] | null;
  winnerTeamId: string | null;
}

export interface PublicAnswerer {
  name: string;
  position: number; // 1-based spot in the line
  lineLength: number; // team size
  endsAt: number | null; // null once the answer is in (awaiting host judgment)
  durationMs: number;
}

export interface PublicState {
  code: string;
  phase: GameState["phase"];
  serverTime: number;
  roundIndex: number;
  totalRounds: number;
  multiplier: number;
  /** Set for player viewers — their own team and lobby/game role permissions. */
  myTeamId: string | null;
  myIsCaptain: boolean;
  myIsRep: boolean;
  teams: PublicTeam[];
  players:
    | { id: string; name: string; teamId: string; connected: boolean; isCaptain: boolean; isRep: boolean }[]
    | null; // host only
  question: { prompt: string | null; slots: PublicSlot[]; bank: number } | null;
  strikes: number;
  buzzWinnerName: string | null;
  answerer: PublicAnswerer | null; // who's giving the current spoken answer
  myIsAnswerer: boolean; // for player viewers — it's your turn, including face-off
  answerHeard: boolean; // host heard a spoken answer and is judging it
  pendingAnswer: { text: string; byName: string } | null; // host + controlling team
  steal: PublicSteal | null;
  tiebreak: PublicTiebreak | null;
  lastAward: { teamId: string; teamName: string; points: number; reason: string } | null;
  winnerTeamId: string | null;
}

export function project(state: GameState, viewer: Viewer): PublicState {
  const now = Date.now();
  const myTeamId = viewer.playerId ? state.players[viewer.playerId]?.teamId : null;
  const myIsCaptain = !!myTeamId && state.teams[myTeamId]?.captainId === viewer.playerId;
  const myIsRep = !!myTeamId && (state.reps[myTeamId] ?? null) === viewer.playerId;
  const isControllingTeam = myTeamId !== null && myTeamId === state.controllingTeamId;

  const teams: PublicTeam[] = Object.values(state.teams).map((t) => {
    const repId = state.reps[t.id] ?? null;
    const rep = repId ? state.players[repId] : null;
    const captain = t.captainId ? state.players[t.captainId] : null;
    return {
      id: t.id,
      name: t.name,
      color: t.color,
      score: t.score,
      playerCount: t.players.length,
      connectedCount: t.players.filter((pid) => state.players[pid]?.connected).length,
      isControlling: t.id === state.controllingTeamId,
      captainName: captain?.name ?? null,
      repName: rep?.name ?? null,
    };
  });

  const players = viewer.isHost
    ? Object.values(state.players).map((p) => ({
        id: p.id,
        name: p.name,
        teamId: p.teamId,
        connected: p.connected,
        isCaptain: state.teams[p.teamId]?.captainId === p.id,
        isRep: (state.reps[p.teamId] ?? null) === p.id,
      }))
    : null;

  let question: PublicState["question"] = null;
  if (state.question) {
    question = {
      prompt: state.question.prompt,
      slots: state.question.answers.map((a, i) => ({
        points: a.points,
        revealed: state.revealed[i],
        text: state.revealed[i] || viewer.isHost ? a.text : null,
      })),
      // The end-of-round answer key flips every slot, but scoring remains the
      // frozen bank that was awarded before those informational reveals.
      bank: state.phase === "round_over" && state.lastAward ? state.lastAward.points : bank(state),
    };
  }

  let steal: PublicSteal | null = null;
  if (state.steal && (state.phase === "steal" || state.phase === "steal_reveal" || state.phase === "steal_tiebreak" || state.phase === "steal_tiebreak_reveal" || state.phase === "round_over")) {
    const mine = myTeamId ? state.steal.submissions.find((s) => s.teamId === myTeamId) : undefined;
    const resolved = state.steal.results;
    const showing = state.phase !== "steal";
    steal = {
      endsAt: state.timer?.kind === "steal" ? state.timer.endsAt : null,
      durationMs: state.timer?.kind === "steal" ? state.timer.durationMs : 15000,
      submittedTeamIds: state.steal.submissions.map((s) => s.teamId),
      mySubmission: mine?.text ?? null,
      results: showing
        ? state.steal.submissions.map((sub) => {
            const r = resolved?.find((x) => x.teamId === sub.teamId);
            return {
              teamId: sub.teamId,
              text: sub.text,
              matched: r?.slot != null,
              matchedText: r?.slot != null && state.question ? state.question.answers[r.slot].text : null,
            };
          })
        : null,
    };
  }

  let tiebreak: PublicTiebreak | null = null;
  if (state.tiebreak && (state.phase === "steal_tiebreak" || state.phase === "steal_tiebreak_reveal" || state.phase === "round_over")) {
    const mine = myTeamId ? state.tiebreak.choices.find((choice) => choice.teamId === myTeamId) : undefined;
    const showing = state.phase !== "steal_tiebreak";
    tiebreak = {
      contenderTeamIds: state.tiebreak.contenders,
      round: state.tiebreak.round,
      endsAt: state.timer?.kind === "rps" ? state.timer.endsAt : null,
      durationMs: state.timer?.kind === "rps" ? state.timer.durationMs : RPS_DURATION_MS,
      submittedTeamIds: state.tiebreak.choices.map((choice) => choice.teamId),
      myChoice: mine?.choice ?? null,
      choices: showing ? state.tiebreak.choices : null,
      winnerTeamId: state.tiebreak.winnerTeamId,
    };
  }

  return {
    code: state.code,
    phase: state.phase,
    serverTime: now,
    roundIndex: state.roundIndex,
    totalRounds: ROUND_MULTIPLIERS.length,
    multiplier: ROUND_MULTIPLIERS[Math.min(state.roundIndex, ROUND_MULTIPLIERS.length - 1)],
    myTeamId: myTeamId,
    myIsCaptain,
    myIsRep,
    teams,
    players,
    question,
    strikes: state.strikes,
    buzzWinnerName: state.buzzWinnerId ? state.players[state.buzzWinnerId]?.name ?? null : null,
    answerer: (() => {
      if ((state.phase !== "playing" && state.phase !== "faceoff_answer") || !state.answererId) return null;
      const up = state.players[state.answererId];
      const team = state.teams[state.controllingTeamId ?? up?.teamId ?? ""];
      if (!up || !team) return null;
      return {
        name: up.name,
        position: team.players.indexOf(state.answererId) + 1,
        lineLength: team.players.length,
        endsAt: state.timer?.kind === "answer" ? state.timer.endsAt : null,
        durationMs: state.timer?.kind === "answer" ? state.timer.durationMs : ANSWER_DURATION_MS,
      };
    })(),
    myIsAnswerer:
      (state.phase === "playing" || state.phase === "faceoff_answer") && !!state.answererId && state.answererId === viewer.playerId,
    answerHeard: state.answerHeard,
    pendingAnswer:
      viewer.isHost || isControllingTeam || (state.phase === "faceoff_answer" && state.answererId === viewer.playerId)
        ? state.pendingAnswer
          ? { text: state.pendingAnswer.text, byName: state.pendingAnswer.byName }
          : null
        : null,
    steal,
    tiebreak,
    lastAward: state.lastAward
      ? {
          teamId: state.lastAward.teamId,
          teamName: state.teams[state.lastAward.teamId]?.name ?? "?",
          points: state.lastAward.points,
          reason: state.lastAward.reason,
        }
      : null,
    winnerTeamId: state.winnerTeamId,
  };
}
