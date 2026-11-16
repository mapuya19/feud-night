import type { ClientMessage, ServerMessage } from "@shared/protocol";

const WS_BASE = (process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8787").replace(/\/$/, "");
export const HTTP_BASE = WS_BASE.replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://");

const HEARTBEAT_MS = 15_000;
const PONG_TIMEOUT_MS = 5_000;
const CONNECT_TIMEOUT_MS = 8_000;
const ACTION_TIMEOUT_MS = 4_000;

export interface ConnectOptions {
  code: string;
  role: "host" | "board" | "player";
  playerId?: string;
  hostToken?: string;
}

export interface GameClientHandlers {
  onMessage: (msg: ServerMessage) => void;
  /** Ready means an authoritative state arrived, not merely a TCP connection. */
  onOpen: () => void;
  onDisconnect: () => void;
  onRoomClosed?: (message: string) => void;
}

export class GameClient {
  private ws: WebSocket | null = null;
  private opts: ConnectOptions | null = null;
  private handlers: GameClientHandlers | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private actionTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private shouldReconnect = false;
  private attempts = 0;
  private ready = false;
  private generation = 0;

  connect(opts: ConnectOptions, handlers: GameClientHandlers): void {
    this.disconnect();
    this.opts = { ...opts };
    this.handlers = handlers;
    this.shouldReconnect = true;
    this.attempts = 0;
    if (typeof window !== "undefined") {
      window.addEventListener("online", this.resume);
      window.addEventListener("offline", this.offline);
      window.addEventListener("pageshow", this.pageShow);
      document.addEventListener("visibilitychange", this.visibilityChange);
    }
    this.open();
  }

  // Mobile browsers suspend timers and may retain an OPEN but dead socket after
  // locking. Reconnect on return and require a fresh snapshot before enabling play.
  private resume = (): void => {
    if (this.shouldReconnect) {
      this.handlers?.onDisconnect();
      this.open();
    }
  };
  private offline = (): void => { this.recover(); };
  private visibilityChange = (): void => {
    if (document.visibilityState === "visible") this.resume();
  };
  private pageShow = (event: PageTransitionEvent): void => {
    if (event.persisted) this.resume();
  };

  private open(): void {
    if (!this.opts || !this.handlers || !this.shouldReconnect) return;
    this.clearReconnect();
    this.cleanupSocket();
    const generation = ++this.generation;
    const q = new URLSearchParams({ role: this.opts.role });
    if (this.opts.playerId) q.set("playerId", this.opts.playerId);
    if (this.opts.hostToken) q.set("token", this.opts.hostToken);

    let ws: WebSocket;
    try {
      ws = new WebSocket(`${WS_BASE}/room/${this.opts.code}/ws?${q}`);
      this.ws = ws;
    } catch {
      this.recover();
      return;
    }
    let opened = false;
    this.connectTimer = setTimeout(() => this.recover(), CONNECT_TIMEOUT_MS);
    ws.onopen = () => {
      if (this.ws !== ws) return;
      opened = true;
      this.probe();
      this.pingTimer = setInterval(() => this.probe(), HEARTBEAT_MS);
    };
    ws.onmessage = (event) => {
      if (this.ws !== ws) return;
      if (event.data === "pong") {
        if (this.pongTimer) clearTimeout(this.pongTimer);
        this.pongTimer = null;
        return;
      }
      let msg: ServerMessage;
      try {
        msg = JSON.parse(event.data as string) as ServerMessage;
        if (!msg || typeof msg.type !== "string") return;
      } catch {
        return;
      }
      if (msg.type === "room_closed") {
        this.closed(msg.message);
        return;
      }
      if (msg.type === "action_result") {
        const timer = this.actionTimers.get(msg.requestId);
        if (timer) clearTimeout(timer);
        this.actionTimers.delete(msg.requestId);
      }
      if (msg.type === "state" && !this.ready) {
        this.ready = true;
        this.attempts = 0;
        if (this.connectTimer) clearTimeout(this.connectTimer);
        this.connectTimer = null;
        this.handlers?.onOpen();
      }
      this.handlers?.onMessage(msg);
    };
    ws.onclose = (event) => {
      if (this.ws !== ws) return;
      if (event.code === 4004) {
        this.closed("This room has expired or was closed by its host.");
        return;
      }
      this.cleanupSocket();
      this.handlers?.onDisconnect();
      if (!this.shouldReconnect) return;
      if (opened) this.scheduleReconnect();
      else void this.handleInitialConnectionFailure(generation);
    };
    ws.onerror = () => {
      if (this.ws !== ws) return;
      // Browsers follow a connection error with close. The connection deadline
      // also bounds cases where no close event arrives.
      try { ws.close(); } catch { this.recover(); }
    };
  }

  private recover(): void {
    this.cleanupSocket();
    if (!this.shouldReconnect) return;
    this.handlers?.onDisconnect();
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect || this.reconnectTimer) return;
    // Jitter prevents all thirty phones reconnecting in lockstep after Wi-Fi loss.
    const delay = Math.min(500 * 2 ** Math.min(this.attempts++, 4), 5_000) * (0.8 + Math.random() * 0.4);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, delay);
  }

  private async handleInitialConnectionFailure(generation: number): Promise<void> {
    if (!this.opts || !this.shouldReconnect) return;
    const status = await roomStatus(this.opts.code);
    if (!this.shouldReconnect || generation !== this.generation) return;
    if (status === "missing") this.closed("This room has expired or was closed by its host.");
    else this.scheduleReconnect();
  }

  private closed(message: string): void {
    this.disconnect();
    this.handlers?.onRoomClosed?.(message);
  }

  private probe(): void {
    if (this.pongTimer || this.ws?.readyState !== WebSocket.OPEN) return;
    // The DO auto-answers raw ping without waking. Unlike a keepalive alone,
    // a deadline detects half-open sockets whose sends silently go nowhere.
    this.pongTimer = setTimeout(() => this.recover(), PONG_TIMEOUT_MS);
    try { this.ws.send("ping"); } catch { this.recover(); }
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private cleanupSocket(): void {
    this.ready = false;
    if (this.ws) {
      this.ws.onopen = this.ws.onmessage = this.ws.onclose = this.ws.onerror = null;
      try { this.ws.close(); } catch { /* already closed */ }
      this.ws = null;
    }
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.pongTimer) clearTimeout(this.pongTimer);
    if (this.connectTimer) clearTimeout(this.connectTimer);
    this.pingTimer = this.pongTimer = this.connectTimer = null;
    for (const timer of this.actionTimers.values()) clearTimeout(timer);
    this.actionTimers.clear();
  }

  send(msg: ClientMessage): boolean {
    if (!this.connected) return false;
    if (msg.type === "player_action" && msg.requestId) {
      const requestId = msg.requestId;
      this.actionTimers.set(requestId, setTimeout(() => {
        this.handlers?.onMessage({ type: "error", message: "Your tap wasn't confirmed. Check the board, then tap again once reconnected." });
        this.recover();
      }, ACTION_TIMEOUT_MS));
    }
    try {
      this.ws!.send(JSON.stringify(msg));
      return true;
    } catch {
      this.recover();
      return false;
    }
  }

  /** Bind a first join without closing the already-bound server socket. */
  updateIdentity(opts: ConnectOptions): void {
    this.opts = { ...opts };
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.generation++;
    this.clearReconnect();
    this.cleanupSocket();
    if (typeof window !== "undefined") {
      window.removeEventListener("online", this.resume);
      window.removeEventListener("offline", this.offline);
      window.removeEventListener("pageshow", this.pageShow);
      document.removeEventListener("visibilitychange", this.visibilityChange);
    }
  }

  get connected(): boolean {
    return this.ready && this.ws?.readyState === WebSocket.OPEN;
  }
}

export async function createRoom(teamCount: number): Promise<{ code: string; hostToken: string }> {
  const res = await fetch(`${HTTP_BASE}/create`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ teamCount }),
  });
  if (!res.ok) throw new Error("Could not create a room");
  return res.json();
}

export async function roomExists(code: string): Promise<boolean> {
  return (await roomStatus(code)) === "exists";
}

async function roomStatus(code: string): Promise<"exists" | "missing" | "unreachable"> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const res = await fetch(`${HTTP_BASE}/room/${code.toUpperCase()}`, { signal: controller.signal });
    if (res.ok) return "exists";
    return res.status === 404 ? "missing" : "unreachable";
  } catch {
    return "unreachable";
  } finally {
    clearTimeout(timeout);
  }
}
