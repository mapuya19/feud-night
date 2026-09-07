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
    this.scheduleAlarm();
  }

  private isExpired(now = Date.now()): boolean {
    return !!this.state && now >= this.state.lastActivityAt + ROOM_TTL_MS;
  }

  private async persist(touch = true): Promise<void> {
    if (!this.state) return;
    if (touch) this.state.lastActivityAt = Date.now();
    await this.ctx.storage.put("state", this.state);
    this.scheduleAlarm();
  }

  /** Schedule whichever happens first: an active game timer or room expiry. */
  private scheduleAlarm(): void {
    if (!this.state) {
      this.ctx.storage.deleteAlarm().catch(() => {});
      return;
    }
    const expiresAt = this.state.lastActivityAt + ROOM_TTL_MS;
    const timer = timerDeadline(this.state);
    const deadline = timer && timer > Date.now() ? Math.min(timer, expiresAt) : expiresAt;
    this.ctx.storage.setAlarm(Math.max(deadline, Date.now())).catch(() => {});
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
      if (this.state) return json({ ok: true, code: this.state.code });
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
      return this.state ? json({ exists: true }) : new Response(null, { status: 404 });
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

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.ctx.acceptWebSocket(server);
    writeAttachment(server, { role, playerId: playerId || null, hostToken: token || null });
    // Cheap app-level keepalive: auto-answered without waking the object.
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));

    const welcome: Record<string, unknown> = { type: "welcome", gameCode: this.state!.code, role };
    if (role === "player" && playerId && this.state!.players[playerId]) {
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
    } catch {
      ws.send(JSON.stringify({ type: "error", message: "Bad message" }));
      return;
    }

    let dirty = false;
    try {
      switch (msg.type) {
        case "join": {
          const id = crypto.randomUUID();
          const res = joinPlayer(this.state, id, msg.name ?? "", msg.teamId, msg.claimCaptain);
          if (!res.ok) {
            ws.send(JSON.stringify({ type: "error", message: res.error ?? "Join failed" }));
            return;
          }
          // Tags are immutable after accept, so the client reconnects once with
          // ?playerId= to bind this socket to its identity.
          ws.send(JSON.stringify({ type: "welcome", gameCode: this.state.code, role: "player", playerId: id }));
          dirty = true;
          break;
        }
        case "rejoin": {
          const id = msg.playerId;
          if (!this.state.players[id]) {
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
          if (!att?.playerId || att.playerId !== msg.playerId) {
            ws.send(JSON.stringify({ type: "error", message: "Reconnect with your playerId to play" }));
            return;
          }
          const res = applyPlayerAction(this.state, msg.playerId, msg.action as PlayerAction);
          if (!res.ok) ws.send(JSON.stringify({ type: "error", message: res.error ?? "Rejected" }));
          dirty = res.ok;
          break;
        }
        case "ping":
          ws.send(JSON.stringify({ type: "pong" }));
          return;
        default:
          return;
      }
    } catch (err) {
      ws.send(JSON.stringify({ type: "error", message: `Server error: ${String(err)}` }));
    }

    if (dirty) {
      await this.persist();
      this.broadcast();
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    await this.ensureLoaded();
    if (!this.state) return;
    const att = readAttachment(ws);
    if (att?.playerId) {
      setConnected(this.state, att.playerId, false);
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
      this.scheduleAlarm();
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
        playerId: att?.playerId ?? undefined,
        isHost: att?.role === "host",
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
