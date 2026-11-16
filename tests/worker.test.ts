import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FeudRoom } from "../worker/src/index";
import { applyHostAction, createGame, joinPlayer } from "@shared/engine";
import type { GameState } from "@shared/types";

class Socket {
  static OPEN = 1;
  readyState = 1;
  attachment: unknown;
  frames: Record<string, any>[] = [];
  serializeAttachment(value: unknown) { this.attachment = value; }
  deserializeAttachment() { return this.attachment; }
  send(frame: string) { this.frames.push(JSON.parse(frame)); }
  close() { this.readyState = 3; }
}
function fixture() {
  const state = createGame("TEST", "secret", [{ id: "q", prompt: "Test", answers: [{ text: "Hidden answer", points: 100 }] }], 2);
  joinPlayer(state, "a", "Alice", "diamond", true);
  joinPlayer(state, "b", "Bob", "pearl", true);
  applyHostAction(state, { type: "start_game" });
  return state;
}
function roomFor(state: GameState) {
  let stored = structuredClone(state);
  const sockets: Socket[] = [];
  const storage = {
    get: vi.fn(async () => structuredClone(stored)),
    put: vi.fn(async (_key, value) => { stored = structuredClone(value); }),
    setAlarm: vi.fn(async () => {}),
    deleteAlarm: vi.fn(async () => {}),
    deleteAll: vi.fn(async () => {}),
  };
  const ctx = { storage, getWebSockets: () => sockets, acceptWebSocket: (ws: Socket) => sockets.push(ws), setWebSocketAutoResponse: vi.fn() };
  const room = new FeudRoom(ctx as never, {} as never);
  const connect = async (query: string) => {
    const response = await room.fetch(new Request(`https://do/room/TEST/ws?${query}`, { headers: { Upgrade: "websocket" } }));
    return { response, socket: sockets.at(-1)! };
  };
  const send = (socket: Socket, msg: unknown) => room.webSocketMessage(socket as never, JSON.stringify(msg));
  return { room, storage, sockets, connect, send, saved: () => stored };
}

beforeEach(() => {
  const RealResponse = Response;
  vi.stubGlobal("Response", class extends RealResponse {
    webSocket: unknown;
    constructor(body: BodyInit | null, init?: ResponseInit & { webSocket?: unknown }) {
      super(body, init?.status === 101 ? { status: 200 } : init);
      if (init?.status === 101) Object.defineProperty(this, "status", { value: 101 });
      this.webSocket = init?.webSocket;
    }
  });
  vi.stubGlobal("WebSocket", Socket);
  vi.stubGlobal("WebSocketPair", class { 0 = new Socket(); 1 = new Socket(); });
  vi.stubGlobal("WebSocketRequestResponsePair", class {});
});
afterEach(() => vi.unstubAllGlobals());

describe("room authentication and race handling", () => {
  it("rejects host upgrades without the correct secret, before accepting a socket", async () => {
    const f = roomFor(fixture());
    for (const query of ["role=host", "role=host&token=wrong"]) {
      const { response } = await f.connect(query);
      expect(response.status).toBe(403);
      expect(f.sockets).toHaveLength(0);
    }
    const { socket } = await f.connect("role=host&token=secret");
    const view = socket.frames.find(m => m.type === "state")!.state;
    expect(view.question.slots[0].text).toBe("Hidden answer");
  });

  it("revalidates old host attachments before sending private projections", async () => {
    const f = roomFor(fixture());
    const oldHost = new Socket(); oldHost.attachment = { role: "host", hostToken: null };
    f.sockets.push(oldHost);
    await f.connect("role=board&playerId=a");
    const view = oldHost.frames.find(m => m.type === "state")!.state;
    expect(view.question.slots[0].text).toBeNull();
    expect(view.players).toBeNull();
    const board = f.sockets.at(-1)!.frames.find(m => m.type === "state")!.state;
    expect(board.myTeamId).toBeNull();
  });

  it("acknowledges a persisted winning buzz and explicitly rejects the next one", async () => {
    const f = roomFor(fixture());
    const { socket: a } = await f.connect("role=player&playerId=a");
    const { socket: b } = await f.connect("role=player&playerId=b");
    const action = { type: "buzz", faceoffId: f.saved().faceoffId };
    await f.send(a, { type: "player_action", playerId: "a", requestId: "first", action });
    expect(f.saved().buzzWinnerId).toBe("a");
    expect(a.frames.at(-1)).toEqual({ type: "action_result", requestId: "first", ok: true });
    await f.send(b, { type: "player_action", playerId: "b", requestId: "second", action });
    expect(b.frames.at(-1)).toMatchObject({ type: "action_result", requestId: "second", ok: false });
    await f.room.webSocketClose(a as never);
    expect(f.saved().phase).toBe("faceoff_answer");
    expect(f.saved().buzzWinnerId).toBe("a");
  });

  it("binds new players immediately and disallows duplicate joins on the same socket", async () => {
    const state = fixture(); state.phase = "lobby";
    const f = roomFor(state);
    const { socket } = await f.connect("role=player");
    const join = { type: "join", name: "New", teamId: "diamond", claimCaptain: false };
    await f.send(socket, join);
    const id = socket.frames.find(m => m.type === "welcome" && m.playerId)!.playerId;
    expect(socket.deserializeAttachment()).toMatchObject({ playerId: id });
    await f.send(socket, { type: "player_action", playerId: id, action: { type: "choose_team", teamId: "pearl" } });
    expect(f.saved().players[id].teamId).toBe("pearl");
    await f.send(socket, join);
    expect(Object.keys(f.saved().players)).toHaveLength(3);
  });

  it("does not let another socket act or rejoin as an arbitrary player", async () => {
    const f = roomFor(fixture());
    const { socket } = await f.connect("role=player");
    await f.send(socket, { type: "rejoin", playerId: "a" });
    expect(socket.frames.at(-1)!.type).toBe("error");
    await f.send(socket, { type: "player_action", playerId: "a", requestId: "fake", action: { type: "buzz", faceoffId: f.saved().faceoffId } });
    expect(socket.frames.at(-1)).toMatchObject({ type: "action_result", ok: false });
    expect(f.saved().phase).toBe("faceoff");
  });

  it("schedules overdue deadlines immediately and processes them before new actions", async () => {
    const state = fixture();
    state.phase = "faceoff_answer"; state.buzzWinnerId = "a"; state.answererId = "a";
    state.timer = { kind: "answer", endsAt: Date.now() - 1, durationMs: 10_000 };
    const f = roomFor(state);
    const before = Date.now();
    await f.room.fetch(new Request("https://do/room/TEST/exists"));
    expect(f.storage.setAlarm.mock.calls[0][0]).toBeGreaterThanOrEqual(before);
    expect(f.storage.setAlarm.mock.calls[0][0]).toBeLessThan(Date.now() + 1000);
    const { socket } = await f.connect("role=player&playerId=b");
    expect(f.saved().phase).toBe("faceoff");
    await f.send(socket, { type: "player_action", playerId: "b", requestId: "old", action: { type: "buzz", faceoffId: state.faceoffId } });
    expect(socket.frames.at(-1)).toMatchObject({ ok: false });
  });

  it("does not expire a newly started answer on an early or duplicate alarm", async () => {
    const f = roomFor(fixture());
    const { socket } = await f.connect("role=player&playerId=a");
    await f.send(socket, { type: "player_action", playerId: "a", action: { type: "buzz", faceoffId: f.saved().faceoffId } });
    await f.room.alarm(); await f.room.alarm();
    expect(f.saved().phase).toBe("faceoff_answer");
  });

  it("includes CORS on missing-room lookups so the browser can stop reconnecting", async () => {
    const room = new FeudRoom({ storage: { get: async () => null } } as never, {} as never);
    const response = await room.fetch(new Request("https://do/room/TEST/exists"));
    expect(response.status).toBe(404);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
  });
});
