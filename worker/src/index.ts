import { DurableObject } from "cloudflare:workers";
import { readAttachment, writeAttachment } from "./attachment";
import type { SocketAttachment } from "./attachment";
import questions from "../../shared/questions.json";
import {
  applyHostAction,
  applyPlayerAction,
  createGame,
  expireTimer,
  joinPlayer,
  setConnected,
  timerDeadline,
} from "../../shared/engine";
import { project } from "../../shared/projection";
import type { ClientMessage, HostAction, PlayerAction } from "../../shared/protocol";
import type { GameState, Role, SurveyQuestion } from "../../shared/types";
import { STATE_TTL_DAYS } from "../../shared/config";

const SURVEY: SurveyQuestion[] = questions as SurveyQuestion[];
const ALLOWED_ROLES: Role[] = ["host", "board", "player"];
const ROOM_TTL_MS = STATE_TTL_DAYS * 24 * 60 * 60 * 1000;
const ROOM_CLOSED_CODE = 4004;

export class FeudRoom extends DurableObject {
  private state: GameState | null = null;
  private loaded = false;

  // ------------------------------------------------------------------ setup

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    this.state = (await this.ctx.storage.get<GameState>("state")) ?? null;
    this.loaded = true;
    if (!this.state) return;

    // Backfill rooms created before inactivity cleanup existed.
    if (!this.state.lastActivityAt) {
      this.state.lastActivityAt = this.state.createdAt;
      await this.ctx.storage.put("state", this.state);
    }
    if (this.isExpired()) {
      await this.closeRoom("Room expired after 24 hours of inactivity");
      return;
    }
    await this.scheduleAlarm();
  }

  private isExpired(now = Date.now()): boolean {
    return !!this.state && now >= this.state.lastActivityAt + ROOM_TTL_MS;
  }

  private async persist(touch = true): Promise<void> {
    if (!this.state) return;
    if (touch) this.state.lastActivityAt = Date.now();
    await this.ctx.storage.put("state", this.state);
    await this.scheduleAlarm();
  }

  /** Schedule whichever happens first: an active game timer or room expiry. */
  private async scheduleAlarm(): Promise<void> {
    if (!this.state) {
      await this.ctx.storage.deleteAlarm();
      return;
    }
    const expiresAt = this.state.lastActivityAt + ROOM_TTL_MS;
    const timer = timerDeadline(this.state);
    // Overdue timers need immediate processing, not replacement by the room TTL.
    const deadline = timer === null ? expiresAt : Math.min(timer, expiresAt);
    await this.ctx.storage.setAlarm(Math.max(deadline, Date.now()));
  }

  private async advanceExpiredTimer(): Promise<void> {
    if (this.state && expireTimer(this.state)) {
      await this.persist(false);
      this.broadcast();
    }
  }

  /** Notify every connected screen, drop persistent state, and free the room code. */
  private async closeRoom(message: string): Promise<void> {
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(JSON.stringify({ type: "room_closed", message }));
        ws.close(ROOM_CLOSED_CODE, message);
      } catch {
        /* socket may already be gone */
      }
    }
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    this.state = null;
    this.loaded = true;
  }

  // ------------------------------------------------------------- HTTP entry

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    await this.ensureLoaded();

    if (url.pathname.endsWith("/admin-close") && request.method === "DELETE") {
      if (!this.state) return new Response(null, { status: 404 });
      await this.closeRoom("Room closed by an administrator");
      return json({ ok: true });
    }

    if (url.pathname.endsWith("/create") && request.method === "POST") {
      if (this.state) return json({ error: "Room code already allocated" }, 409);
      const body = (await request.json().catch(() => ({}))) as { hostToken?: string; teamCount?: number };
      if (!body.hostToken) return json({ error: "hostToken required" }, 400);
      this.state = createGame(
        new URL(request.url).pathname.split("/")[2] ?? "????",
        body.hostToken,
        SURVEY,
        Number(body.teamCount) || undefined,
      );
      await this.persist();
      return json({ ok: true, code: this.state.code });
    }

    if (url.pathname.endsWith("/exists")) {
      return this.state ? json({ exists: true }) : json({ exists: false }, 404);
    }

    if (url.pathname.endsWith("/ws")) {
      const upgrade = request.headers.get("Upgrade");
      if (upgrade !== "websocket") return new Response("expected websocket", { status: 426 });
      if (!this.state) return new Response("room not found", { status: 404 });
      return await this.handleWebSocket(url);
    }

    return new Response("not found", { status: 404 });
  }

  // ------------------------------------------------------------- websockets

  private async handleWebSocket(url: URL): Promise<Response> {
    const roleParam = url.searchParams.get("role") as Role | null;
    const role: Role = roleParam && ALLOWED_ROLES.includes(roleParam) ? roleParam : "player";
    const playerId = url.searchParams.get("playerId") ?? "";
    const token = url.searchParams.get("token") ?? "";
    if (role === "host" && token !== this.state!.hostToken) return json({ error: "Host only" }, 403);
    await this.advanceExpiredTimer();
    const boundPlayerId = role === "player" && this.state!.players[playerId] ? playerId : null;

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.ctx.acceptWebSocket(server);
    writeAttachment(server, { role, playerId: boundPlayerId, hostToken: role === "host" ? token : null });
    // Cheap app-level keepalive: auto-answered without waking the object.
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));

    const welcome: Record<string, unknown> = { type: "welcome", gameCode: this.state!.code, role };
    if (boundPlayerId) {
      welcome.playerId = playerId;
      setConnected(this.state!, playerId, true);
    }
    // A reconnect/opened screen counts as room activity, so an active party
    // does not expire simply because no one pressed a button recently.
    await this.persist();
    server.send(JSON.stringify(welcome));
    // Everyone gets an immediate state push on connect — the host console and
    // TV board open before any game actions happen, so waiting for the next
    // mutation would leave them on a connecting screen forever.
    this.broadcast();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    await this.ensureLoaded();
    if (!this.state) return;
    if (typeof raw !== "string") return;
    if (raw === "ping") return; // handled by auto-response

    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw) as ClientMessage;
      if (!msg || typeof msg !== "object" || typeof msg.type !== "string") throw new Error("Bad envelope");
      if ((msg.type === "host_action" || msg.type === "player_action") &&
          (!msg.action || typeof msg.action !== "object" || typeof msg.action.type !== "string"))
        throw new Error("Bad action");
    } catch {
      ws.send(JSON.stringify({ type: "error", message: "Bad message" }));
      return;
    }

    await this.advanceExpiredTimer();
    let dirty = false;
    let result: { requestId: string; ok: boolean; error?: string } | null = null;
    try {
      switch (msg.type) {
        case "join": {
          const att = readAttachment(ws);
          if (att?.role !== "player" || att.playerId) {
            ws.send(JSON.stringify({ type: "error", message: "Already joined or not a player" }));
            return;
          }
          const id = crypto.randomUUID();
          const res = joinPlayer(this.state, id, msg.name ?? "", msg.teamId, msg.claimCaptain);
          if (!res.ok) {
            ws.send(JSON.stringify({ type: "error", message: res.error ?? "Join failed" }));
            return;
          }
          // Attachments are mutable: bind immediately without a fragile extra
          // connection handoff. The identity still survives future reconnects.
          writeAttachment(ws, { role: "player", playerId: id, hostToken: null });
          ws.send(JSON.stringify({ type: "welcome", gameCode: this.state.code, role: "player", playerId: id }));
          dirty = true;
          break;
        }
        case "rejoin": {
          const id = msg.playerId;
          const att = readAttachment(ws);
          if (att?.role !== "player" || att.playerId !== id || !this.state.players[id]) {
            ws.send(JSON.stringify({ type: "error", message: "Unknown player — rejoin as new" }));
            return;
          }
          setConnected(this.state, id, true);
          ws.send(JSON.stringify({ type: "welcome", gameCode: this.state.code, role: "player", playerId: id }));
          dirty = true;
          break;
        }
        case "host_auth": {
          if (msg.token === this.state.hostToken) {
            writeAttachment(ws, { role: "host", playerId: null, hostToken: msg.token });
            this.state.hostConnectedAt = Date.now();
            dirty = true;
          } else {
            ws.send(JSON.stringify({ type: "error", message: "Bad host token" }));
          }
          break;
        }
        case "host_action": {
          if (msg.token !== this.state.hostToken) {
            ws.send(JSON.stringify({ type: "error", message: "Host only" }));
            return;
          }
          if (msg.action.type === "close_room") {
            await this.closeRoom("Room closed by the host");
            return;
          }
          const res = applyHostAction(this.state, msg.action as HostAction);
          if (!res.ok) ws.send(JSON.stringify({ type: "error", message: res.error ?? "Rejected" }));
          dirty = res.ok;
          break;
        }
        case "player_action": {
          const att = readAttachment(ws);
          const res = att?.role === "player" && att.playerId && att.playerId === msg.playerId
            ? applyPlayerAction(this.state, msg.playerId, msg.action as PlayerAction)
            : { ok: false, error: "Reconnect with your playerId to play" };
          if (typeof msg.requestId === "string" && msg.requestId.length <= 100) {
            result = { requestId: msg.requestId, ok: res.ok, error: res.error };
          } else if (!res.ok) {
            ws.send(JSON.stringify({ type: "error", message: res.error ?? "Rejected" }));
          }
          dirty = res.ok;
          break;
        }
        case "ping":
          ws.send(JSON.stringify({ type: "pong" }));
          return;
        default:
          return;
      }
    } catch {
      ws.send(JSON.stringify({ type: "error", message: "Invalid action" }));
    }

    if (dirty) {
      await this.persist();
      this.broadcast();
    }
    // A success acknowledges a persisted mutation, never just receipt of a tap.
    if (result) ws.send(JSON.stringify({ type: "action_result", ...result }));
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    // Our compatibility date predates automatic close-frame replies.
    try { ws.close(); } catch { /* already closed */ }
    await this.ensureLoaded();
    if (!this.state) return;
    const att = readAttachment(ws);
    if (att?.role === "player" && att.playerId) {
      // A player can legitimately have two tabs or be mid-reconnect. Closing
      // one socket must not mark them offline or skip their answer turn.
      const stillConnected = this.ctx
        .getWebSockets()
        .some((socket) => socket !== ws && socket.readyState === WebSocket.OPEN &&
          readAttachment(socket)?.role === "player" && readAttachment(socket)?.playerId === att.playerId);
      setConnected(this.state, att.playerId, stillConnected);
      await this.persist();
      this.broadcast();
    }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    try {
      ws.close(1011, "error");
    } catch {
      /* already closed */
    }
  }

  // ----------------------------------------------------------------- alarms

  async alarm(): Promise<void> {
    await this.ensureLoaded();
    if (!this.state) return;
    if (this.isExpired()) {
      await this.closeRoom("Room expired after 24 hours of inactivity");
      return;
    }
    if (expireTimer(this.state)) {
      // Timer expiry advances the game but is not player activity.
      await this.persist(false);
      this.broadcast();
    } else {
      await this.scheduleAlarm();
    }
  }

  // -------------------------------------------------------------- broadcast

  private broadcast(): void {
    if (!this.state) return;
    const snapshot = this.state;
    for (const ws of this.ctx.getWebSockets()) {
      const att = readAttachment(ws) as SocketAttachment | null;
      const viewer = {
        role: att?.role ?? "player",
        playerId: att?.role === "player" ? att.playerId ?? undefined : undefined,
        // Recheck even for attachments accepted before authentication was fixed.
        isHost: att?.role === "host" && att.hostToken === snapshot.hostToken,
      };
      try {
        ws.send(
          JSON.stringify({
            type: "state",
            state: project(snapshot, viewer),
            serverTime: Date.now(),
          }),
        );
      } catch {
        /* socket died; close handler cleans up */
      }
    }
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type",
    },
  });
}
