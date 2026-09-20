import type { Role } from "./types";

/** Client → Worker (WS or HTTP). */
export type ClientMessage =
  // WS lifecycle
  | { type: "join"; name: string; teamId: string; claimCaptain: boolean }
  | { type: "rejoin"; playerId: string }
  | { type: "host_auth"; token: string }
  | { type: "ping" }
  // Host actions (host only)
  | { type: "host_action"; token: string; action: HostAction }
  // Player actions (player only)
  | { type: "player_action"; playerId: string; action: PlayerAction };

export type HostAction =
  | { type: "start_game" }
  | { type: "start_faceoff" } // re-run faceoff for same round (e.g. buzz dispute)
  | { type: "reveal_answer"; slot: number }
  | { type: "hear_answer" } // host heard a spoken answer; pause clock while judging
  | { type: "strike" }
  | { type: "skip_answerer" } // advance to the next player in line (e.g. someone AFK)
  | { type: "skip_question" }
  | { type: "next_round" }
  | { type: "resolve_steal"; marks: { teamId: string; slot: number | null }[] }
  | { type: "continue_tiebreak" }
  | { type: "set_captain"; teamId: string; playerId: string }
  | { type: "set_team_count"; count: number }
  | { type: "set_questions"; questionIds: string[] }
  | { type: "shuffle_questions" }
  | { type: "move_player"; playerId: string; teamId: string }
  | { type: "set_rep"; teamId: string; playerId: string }
  | { type: "set_team_name"; teamId: string; name: string }
  | { type: "end_game" }
  | { type: "close_room" }
  | { type: "reset_game" };

export type PlayerAction =
  | { type: "choose_team"; teamId: string }
  | { type: "claim_captain" }
  | { type: "release_captain" }
  | { type: "buzz" }
  | { type: "submit_answer"; text: string } // official answer — only the player who is up
  | { type: "submit_steal"; text: string }
  | { type: "submit_rps"; choice: "rock" | "paper" | "scissors" };

/** Worker → Client. */
export type ServerMessage =
  | { type: "welcome"; gameCode: string; role: Role; playerId?: string }
  | { type: "state"; state: unknown; serverTime: number }
  | { type: "error"; message: string }
  | { type: "room_closed"; message: string }
  | { type: "pong" };

/** HTTP helpers (create room before opening a socket). */
export interface CreateRoomResponse {
  code: string;
  hostToken: string;
}
