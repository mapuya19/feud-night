import { describe, expect, it } from "vitest";
import { applyHostAction, applyPlayerAction, clampTeamCount, createGame, expireTimer, joinPlayer } from "@shared/engine";
import { project } from "@shared/projection";
import type { GameState, SurveyQuestion } from "@shared/types";
import { MAX_TEAM_PLAYERS, MAX_TEAMS, MIN_TEAMS } from "@shared/config";

function q(id: string, letter: string): SurveyQuestion {
  return {
    id,
    prompt: `Question ${letter}`,
    answers: [
      { text: `${letter}1`, points: 40 },
      { text: `${letter}2`, points: 30 },
      { text: `${letter}3`, points: 20 },
      { text: `${letter}4`, points: 10 },
    ],
  };
}

const QUESTIONS: SurveyQuestion[] = [q("q1", "A"), q("q2", "B"), q("q3", "C"), q("q4", "D"), q("q5", "E"), q("q6", "F")];
const qsum = (s: SurveyQuestion) => s.answers.reduce((n, a) => n + a.points, 0);

function join(s: GameState, id: string, name: string, teamId: string, claimCaptain = false): void {
  expect(joinPlayer(s, id, name, teamId, claimCaptain).ok).toBe(true);
}

function setup(): GameState {
  const s = createGame("TEST", "tok", QUESTIONS, 4);
  join(s, "p1", "Alice", "blue", true);
  join(s, "p2", "Bob", "red", true);
  join(s, "p3", "Cara", "gold", true);
  join(s, "p4", "Dev", "violet", true);
  join(s, "p5", "Eli", "blue");
  return s;
}

const clearBoard = (s: GameState) => s.question!.answers.forEach((_, i) => applyHostAction(s, { type: "reveal_answer", slot: i }));

function playRound(s: GameState, buzzAs?: string): void {
  // buzz with the controlling team's rep (or an override)
  applyPlayerAction(s, buzzAs ?? s.reps.blue!, { type: "buzz" });
  clearBoard(s);
  applyHostAction(s, { type: "next_round" });
}

describe("lobby", () => {
  it("lets players choose teams and provisional captains before the roster locks", () => {
    const s = setup();
    expect(s.players.p1.teamId).toBe("blue");
    expect(s.players.p2.teamId).toBe("red");
    expect(s.players.p3.teamId).toBe("gold");
    expect(s.players.p4.teamId).toBe("violet");
    expect(s.players.p5.teamId).toBe("blue");
    expect(s.teams.blue.captainId).toBe("p1");
    expect(s.teams.red.captainId).toBe("p2");
  });

  it("requires every team to have a player and captain before locking the roster", () => {
    const s = createGame("TEST", "tok", QUESTIONS, 4);
    join(s, "p1", "Alice", "blue", true);
    join(s, "p2", "Bob", "red", true);
    join(s, "p3", "Cara", "gold", true);
    expect(applyHostAction(s, { type: "start_game" }).ok).toBe(false);
    join(s, "p4", "Dev", "violet");
    expect(applyHostAction(s, { type: "start_game" }).ok).toBe(false);
    expect(applyPlayerAction(s, "p4", { type: "claim_captain" }).ok).toBe(true);
    expect(applyHostAction(s, { type: "start_game" }).ok).toBe(true);
    expect(s.phase).toBe("faceoff");
  });

  it("enforces per-team and room capacity derived from the team count", () => {
    const s = createGame("TEST", "tok", QUESTIONS, 4);
    for (let i = 0; i < MAX_TEAM_PLAYERS; i++) {
      join(s, `blue-${i}`, `Blue ${i}`, "blue");
    }
    expect(joinPlayer(s, "one-too-many", "Extra", "blue", false).ok).toBe(false);
    expect(Object.keys(s.teams).length * MAX_TEAM_PLAYERS).toBe(32);
    expect(MAX_TEAMS * MAX_TEAM_PLAYERS).toBe(40); // 5-team ceiling
  });

  it("scales capacity down when the host lowers the team count in the lobby", () => {
    const s = createGame("TEST", "tok", QUESTIONS, 2);
    expect(Object.keys(s.teams).sort()).toEqual(["blue", "red"]);
    for (let i = 0; i < MAX_TEAM_PLAYERS; i++) {
      join(s, `blue-${i}`, `B${i}`, "blue");
      join(s, `red-${i}`, `R${i}`, "red");
    }
    expect(joinPlayer(s, "overflow", "Extra", "blue", false).ok).toBe(false);
    expect(Object.keys(s.players).length).toBe(2 * MAX_TEAM_PLAYERS);
  });

  it("adjusts team count in the lobby but guards players and phases", () => {
    const s = setup();
    expect(applyHostAction(s, { type: "set_team_count", count: 3 }).ok).toBe(false); // violet has a player
    join(s, "p6", "Finn", "violet");
    expect(applyPlayerAction(s, "p4", { type: "choose_team", teamId: "blue" }).ok).toBe(true);
    expect(applyHostAction(s, { type: "set_team_count", count: 3 }).ok).toBe(false); // Finn is still on violet
    expect(applyPlayerAction(s, "p6", { type: "choose_team", teamId: "gold" }).ok).toBe(true);
    expect(applyHostAction(s, { type: "set_team_count", count: 3 }).ok).toBe(true);
    expect(s.teams.violet).toBeUndefined();
    expect(applyHostAction(s, { type: "set_team_count", count: 2 }).ok).toBe(false); // gold still has players
    expect(applyPlayerAction(s, "p3", { type: "choose_team", teamId: "blue" }).ok).toBe(true);
    expect(applyPlayerAction(s, "p6", { type: "choose_team", teamId: "red" }).ok).toBe(true);
    expect(applyHostAction(s, { type: "set_team_count", count: 2 }).ok).toBe(true);
    expect(Object.keys(s.teams).length).toBe(MIN_TEAMS);
    // out-of-range requests clamp into the supported range instead of erroring
    expect(applyHostAction(s, { type: "set_team_count", count: 99 }).ok).toBe(true);
    expect(Object.keys(s.teams).length).toBe(MAX_TEAMS);
    expect(s.teams.emerald.id).toBe("emerald"); // fifth team materializes on demand
    expect(applyHostAction(s, { type: "set_team_count", count: 1 }).ok).toBe(true);
    expect(Object.keys(s.teams).length).toBe(MIN_TEAMS);
    applyHostAction(s, { type: "start_game" });
    expect(applyHostAction(s, { type: "set_team_count", count: 4 }).ok).toBe(false); // locked after start
    expect(clampTeamCount(1)).toBe(MIN_TEAMS);
    expect(clampTeamCount(50)).toBe(MAX_TEAMS);
  });

  it("allows lobby team switches but rejects them after the host locks teams", () => {
    const s = setup();
    expect(applyPlayerAction(s, "p5", { type: "choose_team", teamId: "violet" }).ok).toBe(true);
    expect(s.players.p5.teamId).toBe("violet");
    applyHostAction(s, { type: "start_game" });
    expect(applyPlayerAction(s, "p5", { type: "choose_team", teamId: "blue" }).ok).toBe(false);
  });

  it("ends an in-progress game without awarding its unfinished bank", () => {
    const s = setup();
    applyHostAction(s, { type: "start_game" });
    applyPlayerAction(s, "p1", { type: "buzz" });
    applyHostAction(s, { type: "reveal_answer", slot: 0 }); // points are in the bank, not scores yet
    s.teams.red.score = 10;

    expect(applyHostAction(s, { type: "end_game" }).ok).toBe(true);
    expect(s.phase).toBe("game_over");
    expect(s.winnerTeamId).toBe("red");
    expect(s.teams.blue.score).toBe(0);
    expect(s.timer).toBeNull();
  });
});

describe("faceoff", () => {
  it("only lets the current rep buzz; first buzz wins control", () => {
    const s = setup();
    applyHostAction(s, { type: "start_game" });
    expect(applyPlayerAction(s, "p5", { type: "buzz" }).ok).toBe(false); // not the rep
    expect(applyPlayerAction(s, "p1", { type: "buzz" }).ok).toBe(true);
    expect(s.phase).toBe("playing");
    expect(s.controllingTeamId).toBe("blue");
    expect(applyPlayerAction(s, "p2", { type: "buzz" }).ok).toBe(false); // race lost
  });

  it("rep rotates with rounds", () => {
    const s = setup();
    applyHostAction(s, { type: "start_game" });
    expect(s.reps.blue).toBe("p1"); // round 1 → players[0]
    playRound(s);
    expect(s.reps.blue).toBe("p5"); // round 2 → players[1]
    playRound(s);
    expect(s.reps.blue).toBe("p1"); // round 3 → players[2 % 2]
  });
});

describe("answers & scoring", () => {
  it("captain locks, host reveals, bank awarded on clear", () => {
    const s = setup();
    applyHostAction(s, { type: "start_game" });
    applyPlayerAction(s, "p1", { type: "buzz" });
    expect(applyPlayerAction(s, "p5", { type: "suggest", text: "alpha maybe" }).ok).toBe(true); // teammate
    expect(applyPlayerAction(s, "p2", { type: "suggest", text: "nope" }).ok).toBe(false); // other team
    expect(applyPlayerAction(s, "p5", { type: "lock_answer", text: "A1" }).ok).toBe(false); // not captain
    expect(applyPlayerAction(s, "p1", { type: "lock_answer", text: "A1" }).ok).toBe(true);
    expect(s.pendingAnswer?.text).toBe("A1");
    expect(applyHostAction(s, { type: "reveal_answer", slot: 0 }).ok).toBe(true);
    expect(s.revealed[0]).toBe(true);
    expect(s.pendingAnswer).toBeNull();
    clearBoard(s);
    expect(s.phase).toBe("round_over");
    expect(s.teams.blue.score).toBe(qsum(s.question!)); // all answers, ×1
    expect(s.lastAward?.reason).toBe("clear");
  });

  it("rounds 3-4 are double points", () => {
    const s = setup();
    applyHostAction(s, { type: "start_game" });
    const r1 = qsum(s.questionPool[0]);
    const r2 = qsum(s.questionPool[1]);
    const r3 = qsum(s.questionPool[2]);
    playRound(s); // round 1 (×1)
    playRound(s); // round 2 (×1)
    playRound(s); // round 3 (×2)
    expect(s.roundIndex).toBe(3);
    applyPlayerAction(s, s.reps.blue!, { type: "buzz" }); // round 4 face-off
    expect(applyHostAction(s, { type: "reveal_answer", slot: 0 }).ok).toBe(true);
    expect(s.question!.id).toBe(s.questionPool[3].id);
    applyHostAction(s, { type: "reveal_answer", slot: 1 });
    applyHostAction(s, { type: "reveal_answer", slot: 2 });
    applyHostAction(s, { type: "reveal_answer", slot: 3 });
    expect(s.teams.blue.score).toBe(r1 + r2 + 2 * r3 + 2 * qsum(s.questionPool[3]));
  });
});

describe("strikes & steal", () => {
  function strikeOut(s: GameState): void {
    applyHostAction(s, { type: "strike" });
    applyHostAction(s, { type: "strike" });
    applyHostAction(s, { type: "strike" });
  }

  it("3 strikes open a steal; higher survey answer wins between correct steals", () => {
    const s = setup();
    applyHostAction(s, { type: "start_game" });
    applyPlayerAction(s, "p1", { type: "buzz" }); // blue controls
    strikeOut(s);
    expect(s.phase).toBe("steal");
    expect(s.timer?.kind).toBe("steal");

    expect(applyPlayerAction(s, "p2", { type: "submit_steal", text: "X" }).ok).toBe(true); // red captain
    expect(applyPlayerAction(s, "p3", { type: "submit_steal", text: "Y" }).ok).toBe(true); // gold captain
    expect(applyPlayerAction(s, "p4", { type: "submit_steal", text: "Z" }).ok).toBe(true); // violet captain
    expect(s.phase).toBe("steal_reveal");
    expect(applyPlayerAction(s, "p2", { type: "submit_steal", text: "again" }).ok).toBe(false); // one shot only

    // host marks red→slot 0 (40), gold→slot 1 (30): red outranks.
    // Both matched answers reveal; the winner takes the whole board bank (40+30).
    applyHostAction(s, {
      type: "resolve_steal",
      marks: [
        { teamId: "red", slot: 0 },
        { teamId: "gold", slot: 1 },
        { teamId: "violet", slot: null },
      ],
    });
    expect(s.phase).toBe("round_over");
    expect(s.teams.red.score).toBe(70);
    expect(s.teams.blue.score).toBe(0);
    expect(s.lastAward?.reason).toBe("steal");
  });

  it("failed steal banks revealed points for the controlling team", () => {
    const s = setup();
    applyHostAction(s, { type: "start_game" });
    applyPlayerAction(s, "p1", { type: "buzz" });
    applyHostAction(s, { type: "reveal_answer", slot: 0 }); // 40 revealed
    strikeOut(s);
    applyPlayerAction(s, "p2", { type: "submit_steal", text: "zzz" });
    applyPlayerAction(s, "p3", { type: "submit_steal", text: "yyy" });
    applyPlayerAction(s, "p4", { type: "submit_steal", text: "xxx" });
    applyHostAction(s, {
      type: "resolve_steal",
      marks: [
        { teamId: "red", slot: null },
        { teamId: "gold", slot: null },
        { teamId: "violet", slot: null },
      ],
    });
    expect(s.teams.blue.score).toBe(40);
    expect(s.lastAward?.reason).toBe("failed_steal");
  });

  it("steal timer expiry moves to reveal with unsubmitted teams locked out", () => {
    const s = setup();
    applyHostAction(s, { type: "start_game" });
    applyPlayerAction(s, "p1", { type: "buzz" });
    strikeOut(s);
    applyPlayerAction(s, "p2", { type: "submit_steal", text: "X" }); // only red submits
    expect(expireTimer(s)).toBe(true);
    expect(s.phase).toBe("steal_reveal");
    expect(s.steal?.submissions.length).toBe(1);
    expect(s.steal?.submissions[0].teamId).toBe("red");
  });

  it("zero steal submissions can be resolved after timer expiry", () => {
    const s = setup();
    applyHostAction(s, { type: "start_game" });
    applyPlayerAction(s, "p1", { type: "buzz" });
    applyHostAction(s, { type: "reveal_answer", slot: 0 }); // 40 revealed
    strikeOut(s);

    expect(expireTimer(s)).toBe(true);
    expect(s.phase).toBe("steal_reveal");
    expect(s.steal?.submissions).toHaveLength(0);
    expect(applyHostAction(s, { type: "resolve_steal", marks: [] }).ok).toBe(true);
    expect(s.phase).toBe("round_over");
    expect(s.teams.blue.score).toBe(40);
    expect(s.lastAward?.reason).toBe("failed_steal");
  });

  it("only captains submit steals; controlling team excluded", () => {
    const s = setup();
    applyHostAction(s, { type: "start_game" });
    applyPlayerAction(s, "p1", { type: "buzz" });
    strikeOut(s);
    expect(applyPlayerAction(s, "p1", { type: "submit_steal", text: "own bank" }).ok).toBe(false);
    expect(applyPlayerAction(s, "p2", { type: "submit_steal", text: "ok" }).ok).toBe(true);
  });
});

describe("final triple board", () => {
  it("plays a fifth all-team board at triple points, then reveals the champion", () => {
    const s = setup();
    applyHostAction(s, { type: "start_game" });
    const roundSums = s.questionPool.slice(0, 5).map(qsum);

    // Complete the first four boards; each next_round opens the next face-off.
    playRound(s);
    playRound(s);
    playRound(s);
    playRound(s);
    expect(s.phase).toBe("faceoff");
    expect(s.roundIndex).toBe(4);

    // The fifth board is worth triple and is still a normal face-off/play/steal board.
    applyPlayerAction(s, s.reps.blue!, { type: "buzz" });
    clearBoard(s);
    expect(s.phase).toBe("round_over");
    expect(s.teams.blue.score).toBe(roundSums[0] + roundSums[1] + 2 * roundSums[2] + 2 * roundSums[3] + 3 * roundSums[4]);

    applyHostAction(s, { type: "next_round" });
    expect(s.phase).toBe("game_over");
    expect(s.winnerTeamId).toBe("blue");
  });
});

describe("projection privacy", () => {
  it("hides unrevealed answers from players and board, shows host", () => {
    const s = setup();
    applyHostAction(s, { type: "start_game" });
    applyPlayerAction(s, "p1", { type: "buzz" });
    applyHostAction(s, { type: "reveal_answer", slot: 0 });
    const player = project(s, { role: "player", playerId: "p2", isHost: false });
    const board = project(s, { role: "board", isHost: false });
    const host = project(s, { role: "host", isHost: true });
    expect(player.question!.slots[1].text).toBeNull();
    expect(board.question!.slots[1].text).toBeNull();
    expect(host.question!.slots[1].text).toBe(s.question!.answers[1].text);
    expect(player.question!.slots[0].text).toBe(s.question!.answers[0].text);
    expect(player.myTeamId).toBe("red");
    expect(host.players!.length).toBe(5);
    expect(player.players).toBeNull();
  });

  it("hides steal submissions cross-team until reveal", () => {
    const s = setup();
    applyHostAction(s, { type: "start_game" });
    applyPlayerAction(s, "p1", { type: "buzz" });
    applyHostAction(s, { type: "strike" });
    applyHostAction(s, { type: "strike" });
    applyHostAction(s, { type: "strike" });
    applyPlayerAction(s, "p2", { type: "submit_steal", text: "X1" });
    const red = project(s, { role: "player", playerId: "p2", isHost: false });
    const gold = project(s, { role: "player", playerId: "p3", isHost: false });
    expect(red.steal!.mySubmission).toBe("X1");
    expect(gold.steal!.mySubmission).toBeNull();
    expect(gold.steal!.submittedTeamIds).toContain("red");
    expect(gold.steal!.results).toBeNull();
  });
});
