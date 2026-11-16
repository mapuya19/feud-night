import { describe, expect, it } from "vitest";
import { applyHostAction, applyPlayerAction, createGame, expireTimer, joinPlayer, setConnected } from "@shared/engine";
import { project } from "@shared/projection";

function setup() {
  const s = createGame("TEST", "secret", [{ id: "q", prompt: "Test", answers: [{ text: "Hidden", points: 100 }] }], 2);
  joinPlayer(s, "a", "Alice", "diamond", true);
  joinPlayer(s, "b", "Bob", "pearl", true);
  applyHostAction(s, { type: "start_game" });
  return s;
}

describe("buzzer reliability", () => {
  it("accepts exactly one winner for a race and rejects duplicates", () => {
    const s = setup();
    const buzz = { type: "buzz", faceoffId: s.faceoffId } as const;
    expect(applyPlayerAction(s, "a", buzz).ok).toBe(true);
    expect(applyPlayerAction(s, "b", buzz).ok).toBe(false);
    expect(applyPlayerAction(s, "a", buzz).ok).toBe(false);
    expect(s.buzzWinnerId).toBe("a");
  });

  it("rejects delayed taps after a reset, timeout, rep change, question skip, or game reset", () => {
    for (const operation of ["reset", "timeout", "rep", "question", "game"] as const) {
      const s = setup();
      const oldId = s.faceoffId;
      if (operation === "reset") applyHostAction(s, { type: "start_faceoff" });
      if (operation === "timeout") {
        applyPlayerAction(s, "a", { type: "buzz", faceoffId: oldId });
        expireTimer(s, s.timer!.endsAt);
      }
      if (operation === "rep") applyHostAction(s, { type: "set_rep", teamId: "diamond", playerId: "a" });
      if (operation === "question") applyHostAction(s, { type: "skip_question" });
      if (operation === "game") {
        applyHostAction(s, { type: "reset_game" });
        applyHostAction(s, { type: "start_game" });
      }
      expect(s.faceoffId, operation).toBeGreaterThan(oldId);
      const before = structuredClone(s);
      expect(applyPlayerAction(s, "a", { type: "buzz", faceoffId: oldId }).ok, operation).toBe(false);
      expect(s).toEqual(before);
      expect(applyPlayerAction(s, "a", { type: "buzz", faceoffId: s.faceoffId }).ok).toBe(true);
    }
  });

  it("rejects missing and invalid race IDs rather than treating them as current", () => {
    const s = setup();
    for (const id of [undefined, null, NaN, Infinity, "1", -1, 1.5]) {
      // Simulate untrusted wire input, not TypeScript callers.
      expect(applyPlayerAction(s, "a", { type: "buzz", faceoffId: id } as never).ok).toBe(false);
      expect(s.phase).toBe("faceoff");
    }
  });

  it("rejects a late arrival as rep without changing state", () => {
    const s = setup();
    joinPlayer(s, "late", "Late", "diamond", false);
    const before = structuredClone(s);
    expect(applyHostAction(s, { type: "set_rep", teamId: "diamond", playerId: "late" }).ok).toBe(false);
    expect(s).toEqual(before);
  });

  it("can resume a pre-upgrade room before incrementing its first new race", () => {
    const s = setup();
    delete (s as Partial<typeof s>).faceoffId;
    expect(project(s, { role: "player", playerId: "a", isHost: false }).faceoffId).toBe(0);
    expect(applyPlayerAction(s, "a", { type: "buzz", faceoffId: 0 }).ok).toBe(true);
    applyHostAction(s, { type: "strike" });
    expect(s.faceoffId).toBe(1);
    expect(applyPlayerAction(s, "a", { type: "buzz", faceoffId: 0 }).ok).toBe(false);
  });

  it("preserves a winning buzz and deadline through a disconnect, but still times out", () => {
    const s = setup();
    applyPlayerAction(s, "a", { type: "buzz", faceoffId: s.faceoffId });
    const deadline = s.timer!.endsAt;
    setConnected(s, "a", false);
    expect(s.buzzWinnerId).toBe("a");
    expect(s.timer!.endsAt).toBe(deadline);
    expect(expireTimer(s, deadline - 1)).toBe(false);
    expect(s.phase).toBe("faceoff_answer");
    expect(expireTimer(s, deadline)).toBe(true);
    expect(s.phase).toBe("faceoff");
    expect(s.buzzWinnerId).toBeNull();
  });

  it("publishes only a non-secret race ID, not host credentials or answer keys", () => {
    const s = setup();
    for (const viewer of [{ role: "board", isHost: false }, { role: "player", playerId: "a", isHost: false }] as const) {
      const view = project(s, viewer);
      expect(view.faceoffId).toBe(s.faceoffId);
      expect(view.question!.slots[0].text).toBeNull();
      expect(view.players).toBeNull();
      expect(JSON.stringify(view)).not.toContain("secret");
    }
  });

  it("does not accept a steal after its deadline even if the alarm is delayed", () => {
    const s = setup();
    applyPlayerAction(s, "a", { type: "buzz", faceoffId: s.faceoffId });
    applyHostAction(s, { type: "reveal_answer", slot: 0 });
    for (let i = 0; i < 3; i++) applyHostAction(s, { type: "strike" });
    s.timer!.endsAt = Date.now() - 1;
    expect(applyPlayerAction(s, "b", { type: "submit_steal", text: "late" }).ok).toBe(false);
    expect(s.steal!.submissions).toEqual([]);
  });
});
