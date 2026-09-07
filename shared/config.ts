/** Game tuning constants — shared by engine, worker, and UI. */

/** Two single rounds, two double rounds, then an all-team final triple board. */
export const ROUND_MULTIPLIERS = [1, 1, 2, 2, 3] as const;

/** Strikes before the steal opportunity opens. */
export const STRIKES_TO_STEAL = 3;

/** Huddle time for simultaneous steals, ms. */
export const STEAL_DURATION_MS = 15_000;

/** Team palette and order. A room uses the first N of these (2–5 teams). */
export const TEAM_DEFAULTS = [
  { id: "blue", name: "Team Blue", color: "#2563eb" },
  { id: "red", name: "Team Red", color: "#dc2626" },
  { id: "gold", name: "Team Gold", color: "#d97706" },
  { id: "violet", name: "Team Violet", color: "#8b5cf6" },
  { id: "emerald", name: "Team Emerald", color: "#059669" },
] as const;

/** Teams per room can be tuned by the host between 2 and MAX_TEAMS. */
export const MIN_TEAMS = 2;
export const MAX_TEAMS = TEAM_DEFAULTS.length;

/** Per-team cap; room capacity = teamCount × this (16–32 players). */
export const MAX_TEAM_PLAYERS = 8;

export const MAX_NAME_LENGTH = 16;
export const MAX_ANSWER_LENGTH = 60;
export const STATE_TTL_DAYS = 1; // DO storage cleanup horizon
