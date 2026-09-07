import type { ClientMessage, ServerMessage } from "@shared/protocol";

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8787";

/** HTTP origin of the worker, derived from the WS base (create/exists calls). */
export const HTTP_BASE = WS_BASE.replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://");

export interface ConnectOptions {
  code: string;
  role: "host" | "board" | "player";
  playerId?: string;
  hostToken?: string;
}

export interface GameClientHandlers {
  onMessage: (msg: ServerMessage) => void;
  onOpen: () => void;
  onDisconnect: () => void;
  onRoomClosed?: (message: string) => void;
}

export class GameClient {
  private ws: WebSocket | null = null;
  private opts: ConnectOptions | null = null;
  private handlers: GameClientHandlers | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = true;
  private attempts = 0;
  private opened = false;

  connect(opts: ConnectOptions, handlers: GameClientHandlers): void {
    this.opts = opts;
    this.handlers = handlers;
    this.shouldReconnect = true;
    this.open();
  }

  private open(): void {
    if (!this.opts || !this.handlers) return;
    this.cleanupSocket();
    this.opened = false;

    const q = new URLSearchParams({ role: this.opts.role });
    if (this.opts.playerId) q.set("playerId", this.opts.playerId);
    if (this.opts.hostToken) q.set("token", this.opts.hostToken);
    const url = `${WS_BASE}/room/${this.opts.code}/ws?${q.toString()}`;

    try {
      this.ws = new WebSocket(url);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.opened = true;
      this.attempts = 0;
      this.startPing();
      this.handlers?.onOpen();
    };
    this.ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as ServerMessage;
        this.handlers?.onMessage(msg);
      } catch {
        /* ignore malformed frames */
      }
    };
    this.ws.onclose = () => {
      this.stopPing();
      if (!this.opened && this.shouldReconnect) {
        void this.handleInitialConnectionFailure();
        return;
      }
      this.handlers?.onDisconnect();
      if (this.shouldReconnect) this.scheduleReconnect();
    };
    this.ws.onerror = () => {
      try {
        this.ws?.close();
      } catch {
        /* noop */
      }
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const delay = Math.min(500 * 2 ** this.attempts, 5000);
    this.attempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, delay);
  }

  private async handleInitialConnectionFailure(): Promise<void> {
    if (!this.opts || !this.shouldReconnect) return;
    const status = await roomStatus(this.opts.code);
    if (!this.shouldReconnect) return;
    if (status === "missing") {
      this.shouldReconnect = false;
      this.handlers?.onRoomClosed?.("This room has expired or was closed by its host.");
      return;
    }
    this.handlers?.onDisconnect();
    this.scheduleReconnect();
  }

  private startPing(): void {
    this.stopPing();
    // Raw "ping" is auto-answered by the DO without waking it (free keepalive).
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) this.ws.send("ping");
    }, 25_000);
  }

  private stopPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  private cleanupSocket(): void {
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      try {
        this.ws.close();
      } catch {
        /* noop */
      }
      this.ws = null;
    }
    this.stopPing();
  }

  send(msg: ClientMessage): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(msg));
    return true;
  }

  /** Swap identity (e.g. first join returns a playerId) with one reconnect. */
  reconnectAs(opts: ConnectOptions): void {
    this.opts = { ...opts };
    this.open();
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.cleanupSocket();
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

/** POST /create on the worker → { code, hostToken }. */
export async function createRoom(teamCount: number): Promise<{ code: string; hostToken: string }> {
  const res = await fetch(`${HTTP_BASE}/create`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ teamCount }),
  });
  if (!res.ok) throw new Error("Could not create a room");
  return res.json();
}

/** GET /room/:code → boolean. */
export async function roomExists(code: string): Promise<boolean> {
  return (await roomStatus(code)) === "exists";
}

async function roomStatus(code: string): Promise<"exists" | "missing" | "unreachable"> {
  try {
    const res = await fetch(`${HTTP_BASE}/room/${code.toUpperCase()}`);
    if (res.ok) return "exists";
    return res.status === 404 ? "missing" : "unreachable";
  } catch {
    return "unreachable";
  }
}
