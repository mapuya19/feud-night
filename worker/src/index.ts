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

const SURVEY: SurveyQuestion[] = questions as SurveyQuestion[];
const ALLOWED_ROLES: Role[] = ["host", "board", "player"];

export class FeudRoom extends DurableObject {
  private state: GameState | null = null;
  private loaded = false;

  // ------------------------------------------------------------------ setup

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    const stored = (await this.ctx.storage.get<GameState>("state")) ?? null;
    this.state = stored;
    this.loaded = true;
    // If a timer was active when we were evicted, reschedule its alarm.
    if (this.state) this.scheduleAlarmForTimer();
  }

  private async persist(): Promise<void> {
    if (!this.state) return;
    await this.ctx.storage.put("state", this.state);
    this.scheduleAlarmForTimer();
  }

  private scheduleAlarmForTimer(): void {
    const deadline = this.state ? timerDeadline(this.state) : null;
    if (deadline && deadline > Date.now()) {
      this.ctx.storage.setAlarm(deadline).catch(() => {});
    } else {
      this.ctx.storage.deleteAlarm().catch(() => {});
    }
  }

  // ------------------------------------------------------------- HTTP entry

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    await this.ensureLoaded();

    if (url.pathname.endsWith("/create") && request.method === "POST") {
      if (this.state) return json({ ok: true, code: this.state.code });
      const body = (await request.json().catch(() => ({}))) as { hostToken?: string };
      if (!body.hostToken) return json({ error: "hostToken required" }, 400);
      this.state = createGame(new URL(request.url).pathname.split("/")[2] ?? "????", body.hostToken, SURVEY);
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
      return this.handleWebSocket(url);
    }

    return new Response("not found", { status: 404 });
  }

  // ------------------------------------------------------------- websockets

  private handleWebSocket(url: URL): Response {
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
          const res = joinPlayer(this.state, id, msg.name ?? "");
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
    if (expireTimer(this.state)) {
      await this.persist();
      this.broadcast();
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
