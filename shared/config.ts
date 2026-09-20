/** Game tuning constants — shared by engine, worker, and UI. */

/** Two single rounds, two double rounds, then an all-team final triple board. */
export const ROUND_MULTIPLIERS = [1, 1, 2, 2, 3] as const;

/** Strikes before the steal opportunity opens. */
export const STRIKES_TO_STEAL = 3;

/** Huddle time for simultaneous steals, ms. */
export const STEAL_DURATION_MS = 15_000;

/** Down-the-line answering: the up player has this long to give the official answer. */
export const ANSWER_DURATION_MS = 10_000;

/** Simultaneous captain rock-paper-scissors throw for a tied steal, ms. */
export const RPS_DURATION_MS = 10_000;

/** Team palette and order (top→bottom on screens). A room uses the first N (2–5). */
export const TEAM_DEFAULTS = [
  { id: "diamond", name: "Team Diamond", color: "#38bdf8" }, // Pokémon Diamond — cyan blue
  { id: "pearl", name: "Team Pearl", color: "#f472b6" }, // Pokémon Pearl — pink
  { id: "platinum", name: "Team Platinum", color: "#a78bfa" }, // Pokémon Platinum — platinum lavender
  { id: "gold", name: "Team Gold", color: "#eab308" }, // Pokémon Gold — gold
  { id: "silver", name: "Team Silver", color: "#9ca3af" }, // Pokémon Silver — silver
] as const;

/** Teams per room can be tuned by the host between 2 and MAX_TEAMS. */
export const MIN_TEAMS = 2;
export const MAX_TEAMS = TEAM_DEFAULTS.length;

/** Per-team cap; room capacity = teamCount × this (16–40 players). */
export const MAX_TEAM_PLAYERS = 8;

export const MAX_NAME_LENGTH = 16;
export const MAX_ANSWER_LENGTH = 60;
export const STATE_TTL_DAYS = 1; // DO storage cleanup horizon
