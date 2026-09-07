/** Game tuning constants — shared by engine, worker, and UI. */

/** Two single rounds, two double rounds, then an all-team final triple board. */
export const ROUND_MULTIPLIERS = [1, 1, 2, 2, 3] as const;

/** Strikes before the steal opportunity opens. */
export const STRIKES_TO_STEAL = 3;

/** Huddle time for simultaneous steals, ms. */
export const STEAL_DURATION_MS = 15_000;

/** Fast Money: questions per player and per-question timers (P1, P2). */
export const FM_QUESTIONS = 5;
export const FM_DURATION_MS: [number, number] = [20_000, 25_000];

/** Classic Fast Money win threshold. */
export const FM_WIN_TARGET = 200;

/** Team setup for a 4-team game (~7–8 players each at a 30-person party). */
export const TEAM_DEFAULTS = [
  { id: "blue", name: "Team Blue", color: "#2563eb" },
  { id: "red", name: "Team Red", color: "#dc2626" },
  { id: "gold", name: "Team Gold", color: "#d97706" },
  { id: "violet", name: "Team Violet", color: "#8b5cf6" },
] as const;

/** Keeps a ~30-player party naturally balanced at 8 / 8 / 7 / 7. */
export const MAX_TEAM_PLAYERS = 8;

export const MAX_NAME_LENGTH = 16;
export const MAX_ANSWER_LENGTH = 60;
export const STATE_TTL_DAYS = 1; // DO storage cleanup horizon
