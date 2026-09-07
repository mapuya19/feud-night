import { describe, expect, it } from "vitest";
import { applyHostAction, applyPlayerAction, createGame, expireTimer, joinPlayer } from "@shared/engine";
import { project } from "@shared/projection";
import type { GameState, SurveyQuestion } from "@shared/types";

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

function setup(): GameState {
  const s = createGame("TEST", "tok", QUESTIONS);
  joinPlayer(s, "p1", "Alice"); // blue
  joinPlayer(s, "p2", "Bob"); // red
  joinPlayer(s, "p3", "Cara"); // gold
  joinPlayer(s, "p4", "Dave"); // blue
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
  it("balances teams and assigns first-joiner as captain", () => {
    const s = setup();
    expect(s.players.p1.teamId).toBe("blue");
    expect(s.players.p2.teamId).toBe("red");
    expect(s.players.p3.teamId).toBe("gold");
    expect(s.players.p4.teamId).toBe("blue");
    expect(s.teams.blue.captainId).toBe("p1");
    expect(s.teams.red.captainId).toBe("p2");
  });

  it("requires 3 players to start", () => {
    const s = createGame("TEST", "tok", QUESTIONS);
    joinPlayer(s, "p1", "Alice");
    joinPlayer(s, "p2", "Bob");
    expect(applyHostAction(s, { type: "start_game" }).ok).toBe(false);
    joinPlayer(s, "p3", "Cara");
    expect(applyHostAction(s, { type: "start_game" }).ok).toBe(true);
    expect(s.phase).toBe("faceoff");
  });
});

describe("faceoff", () => {
  it("only lets the current rep buzz; first buzz wins control", () => {
    const s = setup();
    applyHostAction(s, { type: "start_game" });
    expect(applyPlayerAction(s, "p4", { type: "buzz" }).ok).toBe(false); // not the rep
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
    expect(s.reps.blue).toBe("p4"); // round 2 → players[1]
    playRound(s);
    expect(s.reps.blue).toBe("p1"); // round 3 → players[2 % 2]
  });
});

describe("answers & scoring", () => {
  it("captain locks, host reveals, bank awarded on clear", () => {
    const s = setup();
    applyHostAction(s, { type: "start_game" });
    applyPlayerAction(s, "p1", { type: "buzz" });
    expect(applyPlayerAction(s, "p4", { type: "suggest", text: "alpha maybe" }).ok).toBe(true); // teammate
    expect(applyPlayerAction(s, "p2", { type: "suggest", text: "nope" }).ok).toBe(false); // other team
    expect(applyPlayerAction(s, "p4", { type: "lock_answer", text: "A1" }).ok).toBe(false); // not captain
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
    expect(s.phase).toBe("steal_reveal");
    expect(applyPlayerAction(s, "p2", { type: "submit_steal", text: "Z" }).ok).toBe(false); // one shot only

    // host marks red→slot 0 (40), gold→slot 1 (30): red outranks.
    // Both matched answers reveal; the winner takes the whole board bank (40+30).
    applyHostAction(s, {
      type: "resolve_steal",
      marks: [
        { teamId: "red", slot: 0 },
        { teamId: "gold", slot: 1 },
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
    applyHostAction(s, {
      type: "resolve_steal",
      marks: [
        { teamId: "red", slot: null },
        { teamId: "gold", slot: null },
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

describe("fast money", () => {
  function toFastMoney(s: GameState): void {
    applyHostAction(s, { type: "start_game" });
    playRound(s);
    playRound(s);
    playRound(s);
    playRound(s);
    expect(s.phase).toBe("fast_money_intro");
    expect(s.winnerTeamId).toBe("blue");
  }

  it("runs P1 → P2 with duplicate scoring and reveal totals", () => {
    const s = setup();
    toFastMoney(s);
    expect(applyHostAction(s, { type: "start_fast_money", playerIds: ["p1", "p4"] }).ok).toBe(true);
    expect(s.phase).toBe("fast_money");
    expect(s.fastMoney!.questions.length).toBe(5);

    for (let qi = 0; qi < 5; qi++) {
      expect(applyHostAction(s, { type: "fm_start_question" }).ok).toBe(true);
      expect(s.timer?.kind).toBe("fast_money");
      expect(applyPlayerAction(s, "p1", { type: "fm_answer", text: `a${qi}` }).ok).toBe(true);
      expect(applyPlayerAction(s, "p4", { type: "fm_answer", text: `no${qi}` }).ok).toBe(false); // not active
      applyHostAction(s, { type: "fm_judge", points: 20, duplicate: false });
      if (qi < 4) expect(applyHostAction(s, { type: "fm_next_question" }).ok).toBe(true);
    }
    expect(applyHostAction(s, { type: "fm_next_player" }).ok).toBe(true);
    expect(s.fastMoney!.playerIndex).toBe(1);

    for (let qi = 0; qi < 5; qi++) {
      applyHostAction(s, { type: "fm_start_question" });
      if (qi === 0) {
        applyPlayerAction(s, "p4", { type: "fm_answer", text: "a0" });
        applyHostAction(s, { type: "fm_judge", points: 20, duplicate: true }); // → 0
      } else if (qi === 1) {
        expect(expireTimer(s)).toBe(true); // timeout path
        applyHostAction(s, { type: "fm_judge", points: 0, duplicate: false });
      } else {
        applyPlayerAction(s, "p4", { type: "fm_answer", text: `b${qi}` });
        applyHostAction(s, { type: "fm_judge", points: 20, duplicate: false });
      }
      if (qi < 4) applyHostAction(s, { type: "fm_next_question" });
    }

    applyHostAction(s, { type: "fm_reveal_step" }); // enters reveal
    for (let i = 0; i < 6; i++) applyHostAction(s, { type: "fm_reveal_step" }); // steps through all 5 → totals
    // P1: 5×20 = 100, P2: dup 0 + timeout 0 + 3×20 = 60 → 160
    expect(s.fastMoney!.total).toBe(160);
    expect(s.fastMoney!.revealStep).toBe(5);
    applyHostAction(s, { type: "fm_reveal_step" }); // → game over
    expect(s.phase).toBe("game_over");
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
    expect(host.players!.length).toBe(4);
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

  it("hides fast money P1 answers from P2 and board until reveal", () => {
    const s = setup();
    toFastMoneyLite(s);
    applyHostAction(s, { type: "fm_start_question" });
    applyPlayerAction(s, "p1", { type: "fm_answer", text: "secret" });
    const p2 = project(s, { role: "player", playerId: "p2", isHost: false });
    const p1 = project(s, { role: "player", playerId: "p4", isHost: false }); // FM player 2
    const board = project(s, { role: "board", isHost: false });
    const host = project(s, { role: "host", isHost: true });
    for (const v of [p2, p1, board]) {
      expect(v.fastMoney!.reveal).toBeNull();
      expect(v.fastMoney!.hostQuestion).toBeNull();
    }
    expect(host.fastMoney!.hostCurrent?.text).toBe("secret");
    expect(host.fastMoney!.hostQuestion!.answers.length).toBe(4);
    expect(p1.fastMoney!.myAnswerState).toBeNull(); // p1 is the active answerer, not p4
  });
});

/** Fast money setup without playing the full 4 rounds (uses end_game shortcut). */
function toFastMoneyLite(s: GameState): void {
  applyHostAction(s, { type: "start_game" });
  applyHostAction(s, { type: "end_game" });
  expect(applyHostAction(s, { type: "start_fast_money", playerIds: ["p1", "p4"] }).ok).toBe(true);
}
