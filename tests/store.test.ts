import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const transport = vi.hoisted(() => ({
  handlers: null as any,
  send: vi.fn(() => true),
  updateIdentity: vi.fn(),
  disconnect: vi.fn(),
}));
vi.mock("../src/lib/ws-client", () => ({
  GameClient: class {
    connect(_opts: unknown, handlers: unknown) { transport.handlers = handlers; }
    send = transport.send;
    updateIdentity = transport.updateIdentity;
    disconnect = transport.disconnect;
  },
  createRoom: vi.fn(),
}));
import { useFeud } from "../src/lib/store";

const store = () => useFeud.getState();
const buzz = { type: "buzz", faceoffId: 1 } as const;
function connect(live = true) {
  store().connect({ code: "TEST", role: "player" });
  transport.handlers.onMessage({ type: "welcome", role: "player", playerId: "alice", gameCode: "TEST" });
  if (live) transport.handlers.onOpen();
}

beforeEach(() => {
  store().disconnect();
  vi.clearAllMocks();
  transport.send.mockReturnValue(true);
  const memory = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => memory.set(key, value),
    removeItem: (key: string) => memory.delete(key),
  });
});
afterEach(() => { store().disconnect(); vi.unstubAllGlobals(); });

describe("phone action feedback", () => {
  it("deduplicates pointer/keyboard activation synchronously until acknowledgement", () => {
    connect();
    expect(store().playerAction(buzz)).toBe(true);
    const id = store().pendingBuzzId;
    expect(id).toBeTruthy();
    expect(store().playerAction(buzz)).toBe(false);
    expect(transport.send).toHaveBeenCalledTimes(1);
    transport.handlers.onMessage({ type: "action_result", requestId: id, ok: true });
    expect(store().pendingBuzzId).toBeNull();
  });

  it("can buzz on an HTTP LAN without the secure-context crypto API", () => {
    vi.stubGlobal("crypto", undefined);
    connect();
    expect(store().playerAction(buzz)).toBe(true);
    expect(store().pendingBuzzId).toMatch(/^buzz-/);
  });

  it("shows server rejections and ignores unrelated acknowledgements", () => {
    connect(); store().playerAction(buzz);
    const id = store().pendingBuzzId;
    transport.handlers.onMessage({ type: "action_result", requestId: "other", ok: true });
    expect(store().pendingBuzzId).toBe(id);
    transport.handlers.onMessage({ type: "action_result", requestId: id, ok: false, error: "Another rep already buzzed" });
    expect(store().pendingBuzzId).toBeNull();
    expect(store().lastError).toBe("Another rep already buzzed");
  });

  it("does not silently drop taps during reconnect or a failed send", () => {
    connect(false);
    expect(store().playerAction(buzz)).toBe(false);
    expect(transport.send).not.toHaveBeenCalled();
    expect(store().lastError).toContain("not sent");
    transport.handlers.onOpen(); transport.send.mockReturnValue(false);
    expect(store().playerAction(buzz)).toBe(false);
    expect(store().pendingBuzzId).toBeNull();
    expect(store().lastError).toContain("not sent");
  });

  it("clears pending feedback on disconnect and handles missing-room callbacks", () => {
    connect(); store().playerAction(buzz);
    transport.handlers.onDisconnect();
    expect(store().status).toBe("reconnecting");
    expect(store().pendingBuzzId).toBeNull();
    expect(store().lastError).toContain("wasn't confirmed");
    transport.handlers.onRoomClosed("Room expired");
    expect(store().status).toBe("error");
    expect(store().lastError).toBe("Room expired");
  });

  it("remembers first-join identity without opening another connection", () => {
    connect();
    expect(transport.updateIdentity).toHaveBeenCalledWith({ code: "TEST", role: "player", playerId: "alice" });
    expect(JSON.parse(localStorage.getItem("feud.player.TEST")!).playerId).toBe("alice");
  });

  it("forgets a stale identity when a room code has been reused", () => {
    localStorage.setItem("feud.player.TEST", JSON.stringify({ playerId: "old", name: "Alice" }));
    store().connect({ code: "TEST", role: "player" });
    transport.handlers.onMessage({ type: "welcome", role: "player", gameCode: "TEST" });
    expect(store().playerId).toBeNull();
    expect(localStorage.getItem("feud.player.TEST")).toBeNull();
  });

  it("does not retain a previous room's player identity on navigation", () => {
    connect();
    store().connect({ code: "NEXT", role: "player" });
    expect(store().playerId).toBeNull();
    expect(store().pendingBuzzId).toBeNull();
  });
});
