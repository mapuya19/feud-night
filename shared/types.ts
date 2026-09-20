/** Shared game types — used by the worker (authoritative) and all Next.js clients. */

export type Role = "host" | "board" | "player";

export type Phase =
  | "lobby" // players joining, teams forming
  | "faceoff" // reps up, waiting for first buzz
  | "faceoff_answer" // first buzzer gives the answer that can win control
  | "playing" // controlling team answers the board
  | "steal" // 3 strikes; every opposing team huddles + secretly submits
  | "steal_reveal" // all steal answers shown; host judges
  | "steal_tiebreak" // tied captains secretly throw rock-paper-scissors
  | "steal_tiebreak_reveal" // RPS throws shown; host awards or starts a rethrow
  | "round_over" // bank awarded; host advances
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

export type RpsChoice = "rock" | "paper" | "scissors";

export interface RpsTiebreak {
  contenders: string[]; // team IDs still tied after a throw
  choices: { teamId: string; choice: RpsChoice }[];
  round: number;
  winnerTeamId: string | null;
}

export interface Timer {
  kind: "steal" | "answer" | "rps";
  endsAt: number; // epoch ms (server clock)
  durationMs: number;
}

export interface GameState {
  code: string;
  hostToken: string;
  createdAt: number;
  /** Updated on room creation, connections, and meaningful game actions; used for automatic cleanup. */
  lastActivityAt: number;
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
  answererId: string | null; // who's giving the official answer (down the line)
  answerHeard: boolean; // host heard a spoken answer and paused the clock to judge it
  pendingAnswer: Suggestion | null; // optional typed answer awaiting host judgment
  steal: {
    submissions: StealSubmission[];
    results: { teamId: string; text: string; slot: number | null }[] | null;
  } | null;
  tiebreak: RpsTiebreak | null;
  timer: Timer | null;
  lastAward: { teamId: string; points: number; reason: "clear" | "steal" | "failed_steal" } | null;
  winnerTeamId: string | null;
  hostConnectedAt: number | null;
  /** Current round's rep per team (manual override wins until next round). */
  reps: Record<string, string | null>;
}
