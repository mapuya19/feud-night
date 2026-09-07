import { ROUND_MULTIPLIERS } from "./config";
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
  pendingAnswer: { text: string; byName: string } | null; // host + controlling team
  suggestions: { text: string; byName: string }[]; // host + controlling team
  steal: PublicSteal | null;
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
      bank: bank(state),
    };
  }

  let steal: PublicSteal | null = null;
  if (state.steal && (state.phase === "steal" || state.phase === "steal_reveal" || state.phase === "round_over")) {
    const mine = myTeamId ? state.steal.submissions.find((s) => s.teamId === myTeamId) : undefined;
    const resolved = state.steal.results;
    const showing = state.phase === "steal_reveal" || state.phase === "round_over";
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
    pendingAnswer:
      viewer.isHost || isControllingTeam
        ? state.pendingAnswer
          ? { text: state.pendingAnswer.text, byName: state.pendingAnswer.byName }
          : null
        : null,
    suggestions:
      viewer.isHost || isControllingTeam
        ? state.suggestions.map((s) => ({ text: s.text, byName: s.byName }))
        : [],
    steal,
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
