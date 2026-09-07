/** Shared game types — used by the worker (authoritative) and all Next.js clients. */

export type Role = "host" | "board" | "player";

export type Phase =
  | "lobby" // players joining, teams forming
  | "faceoff" // reps up, waiting for first buzz
  | "playing" // controlling team answers the board
  | "steal" // 3 strikes; two teams huddle + secretly submit
  | "steal_reveal" // both steal answers shown, host judges
  | "round_over" // bank awarded; host advances
  | "fast_money_intro" // winning team announced, pick 2 players
  | "fast_money" // P1/P2 answering
  | "fast_money_reveal" // dramatic scoring walkthrough
  | "game_over";

export interface SurveyAnswer {
  text: string;
  points: number;
}

export interface SurveyQuestion {
  id: string;
  prompt: string;
  answers: SurveyAnswer[];
}

export interface Player {
  id: string;
  name: string;
  teamId: string;
  connected: boolean;
}

export interface Team {
  id: string;
  name: string;
  color: string; // hex
  score: number;
  captainId: string | null;
  players: string[]; // playerIds in join order
}

export interface Suggestion {
  text: string;
  by: string; // playerId
  byName: string;
  at: number;
}

export interface StealSubmission {
  teamId: string;
  text: string;
  at: number;
}

export interface Timer {
  kind: "steal" | "fast_money";
  endsAt: number; // epoch ms (server clock)
  durationMs: number;
}

export interface FmAnswer {
  text: string;
  points: number;
  duplicate: boolean;
  timedOut: boolean;
  judged: boolean;
}

export interface FastMoneyState {
  playerIds: string[];
  playerIndex: number; // 0 or 1
  questionIndex: number; // 0..FM_QUESTIONS-1
  questions: SurveyQuestion[]; // the 5 FM questions
  answers: FmAnswer[][]; // [questionIndex][playerIndex]
  revealStep: number; // -1 = not started, 0..4 questions, 5 = totals
  total: number;
}

export interface GameState {
  code: string;
  hostToken: string;
  createdAt: number;
  phase: Phase;
  roundIndex: number; // 0..ROUNDS.length-1
  questionPool: SurveyQuestion[]; // shuffled
  questionCursor: number; // next index into pool
  teams: Record<string, Team>;
  players: Record<string, Player>;
  // current question
  question: SurveyQuestion | null;
  revealed: boolean[];
  strikes: number;
  controllingTeamId: string | null;
  buzzWinnerId: string | null;
  suggestions: Suggestion[];
  pendingAnswer: Suggestion | null; // captain's locked-in answer awaiting host judgment
  steal: {
    submissions: StealSubmission[];
    results: { teamId: string; text: string; slot: number | null }[] | null;
  } | null;
  timer: Timer | null;
  lastAward: { teamId: string; points: number; reason: "clear" | "steal" | "failed_steal" } | null;
  fastMoney: FastMoneyState | null;
  winnerTeamId: string | null;
  hostConnectedAt: number | null;
  /** Current round's rep per team (manual override wins until next round). */
  reps: Record<string, string | null>;
}
