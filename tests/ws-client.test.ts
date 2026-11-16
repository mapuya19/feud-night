import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameClient } from "../src/lib/ws-client";

class Socket {
  static OPEN = 1;
  static instances: Socket[] = [];
  readyState = 0;
  sent: string[] = [];
  autoPong = true;
  onopen: (() => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  constructor(public url: string) { Socket.instances.push(this); }
  open() { this.readyState = 1; this.onopen?.(); }
  message(message: unknown) { this.onmessage?.({ data: JSON.stringify(message) }); }
  state() { this.message({ type: "state", state: {}, serverTime: Date.now() }); }
  send(frame: string) {
    this.sent.push(frame);
    if (frame === "ping" && this.autoPong) this.onmessage?.({ data: "pong" });
  }
  close() { this.readyState = 3; }
  drop() { this.readyState = 3; this.onclose?.({ code: 1006 }); }
}

let client: GameClient;
let handlers: { onOpen: ReturnType<typeof vi.fn>; onDisconnect: ReturnType<typeof vi.fn>; onMessage: ReturnType<typeof vi.fn>; onRoomClosed: ReturnType<typeof vi.fn> };
let win: EventTarget;
let doc: EventTarget & { visibilityState: string };
const latest = () => Socket.instances.at(-1)!;
function connect() {
  client.connect({ code: "TEST", role: "player", playerId: "alice" }, handlers);
  return latest();
}
function live() { const ws = connect(); ws.open(); ws.state(); return ws; }

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(0.5);
  Socket.instances = [];
  win = new EventTarget();
  doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", doc);
  vi.stubGlobal("WebSocket", Socket);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));
  client = new GameClient();
  handlers = { onOpen: vi.fn(), onDisconnect: vi.fn(), onMessage: vi.fn(), onRoomClosed: vi.fn() };
});
afterEach(() => { client.disconnect(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("mobile WebSocket recovery", () => {
  it("does not enable actions until an authoritative snapshot arrives", () => {
    const ws = connect(); ws.open();
    expect(client.connected).toBe(false);
    expect(client.send({ type: "ping" })).toBe(false);
    ws.state();
    expect(client.connected).toBe(true);
    expect(handlers.onOpen).toHaveBeenCalledTimes(1);
  });

  it("reconnects an OPEN socket when heartbeats go unanswered", async () => {
    const ws = live(); ws.autoPong = false;
    await vi.advanceTimersByTimeAsync(20_000);
    expect(client.connected).toBe(false);
    expect(handlers.onDisconnect).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(500);
    expect(Socket.instances).toHaveLength(2);
  });

  it("keeps a healthy socket alive without forwarding raw pongs as JSON", async () => {
    live();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(client.connected).toBe(true);
    expect(Socket.instances).toHaveLength(1);
    expect(handlers.onDisconnect).not.toHaveBeenCalled();
  });

  it.each(["online", "visible", "pageshow"])("rebinds identity and waits for fresh state on %s", (event) => {
    const ws = live();
    if (event === "visible") doc.dispatchEvent(new Event("visibilitychange"));
    else win.dispatchEvent(Object.assign(new Event(event), { persisted: true }));
    expect(Socket.instances).toHaveLength(2);
    expect(latest().url).toContain("playerId=alice");
    expect(client.connected).toBe(false);
    expect(ws.readyState).toBe(3);
    latest().open(); latest().state();
    expect(client.connected).toBe(true);
  });

  it("immediately disables actions when the browser reports offline", () => {
    live(); win.dispatchEvent(new Event("offline"));
    expect(client.connected).toBe(false);
    expect(handlers.onDisconnect).toHaveBeenCalledTimes(1);
  });

  it("does not reconnect merely because the page became hidden", () => {
    live(); doc.visibilityState = "hidden";
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(Socket.instances).toHaveLength(1);
  });

  it("bounds a stalled connection and a connection with no initial snapshot", async () => {
    connect();
    await vi.advanceTimersByTimeAsync(8_500);
    expect(Socket.instances).toHaveLength(2);
    latest().open();
    await vi.advanceTimersByTimeAsync(9_000);
    expect(Socket.instances).toHaveLength(3);
    expect(handlers.onOpen).not.toHaveBeenCalled();
  });

  it("waits for a buzz acknowledgement and never replays an unconfirmed buzz", async () => {
    const ws = live();
    expect(client.send({ type: "player_action", playerId: "alice", requestId: "r1", action: { type: "buzz", faceoffId: 1 } })).toBe(true);
    await vi.advanceTimersByTimeAsync(4_500);
    expect(handlers.onMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "error", message: expect.stringContaining("wasn't confirmed") }));
    expect(Socket.instances).toHaveLength(2);
    latest().open(); latest().state();
    expect(latest().sent.every(frame => frame === "ping")).toBe(true);
    expect(ws.sent.filter(frame => frame.includes('"buzz"'))).toHaveLength(1);
  });

  it("clears the acknowledgement deadline for accepted AND rejected buzzes", async () => {
    const ws = live();
    for (const ok of [true, false]) {
      client.send({ type: "player_action", playerId: "alice", requestId: String(ok), action: { type: "buzz", faceoffId: 1 } });
      ws.message({ type: "action_result", requestId: String(ok), ok });
    }
    await vi.advanceTimersByTimeAsync(5_000);
    expect(handlers.onDisconnect).not.toHaveBeenCalled();
  });

  it("returns false and recovers if WebSocket.send throws", () => {
    const ws = live();
    vi.spyOn(ws, "send").mockImplementation(() => { throw new Error("network lost"); });
    expect(client.send({ type: "ping" })).toBe(false);
    expect(client.connected).toBe(false);
    expect(handlers.onDisconnect).toHaveBeenCalled();
  });

  it("binds a first join for reconnect without interrupting the current socket", () => {
    live(); client.updateIdentity({ code: "TEST", role: "player", playerId: "new-id" });
    expect(Socket.instances).toHaveLength(1);
    win.dispatchEvent(new Event("online"));
    expect(latest().url).toContain("playerId=new-id");
  });

  it("stops reconnecting when a room is missing or closed", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 404 } as Response);
    const ws = connect(); ws.drop();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(handlers.onRoomClosed).toHaveBeenCalledTimes(1);
    expect(Socket.instances).toHaveLength(1);
  });

  it("ignores stale callbacks and removes timers/listeners on disconnect", async () => {
    const ws = live();
    const oldMessage = ws.onmessage!;
    client.disconnect();
    oldMessage({ data: JSON.stringify({ type: "state", state: {} }) });
    win.dispatchEvent(new Event("online"));
    doc.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(Socket.instances).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
