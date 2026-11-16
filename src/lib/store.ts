"use client";

import { create } from "zustand";
import { GameClient, createRoom } from "./ws-client";
import type { HostAction, PlayerAction, ServerMessage } from "@shared/protocol";
import type { PublicState } from "@shared/projection";
import { clearPlayer, loadPlayer, rememberName, savePlayer } from "./identity";

export type ConnStatus = "idle" | "connecting" | "connected" | "reconnecting" | "error";

interface ConnectArgs {
  code: string;
  role: "host" | "board" | "player";
  hostToken?: string;
}

interface FeudStore {
  client: GameClient | null;
  status: ConnStatus;
  lastError: string | null;
  code: string | null;
  role: "host" | "board" | "player" | null;
  playerId: string | null;
  playerName: string | null;
  hostToken: string | null;
  state: PublicState | null;
  serverOffsetMs: number;
  pendingBuzzId: string | null;
  connect: (args: ConnectArgs) => void;
  join: (name: string, teamId: string, claimCaptain: boolean) => void;
  hostAction: (action: HostAction) => void;
  playerAction: (action: PlayerAction) => boolean;
  setError: (msg: string | null) => void;
  disconnect: () => void;
}

let client: GameClient | null = null;
// Correlation only, not a credential. Works on HTTP LANs where randomUUID is unavailable.
let nextRequestId = 0;

export const useFeud = create<FeudStore>((set, get) => ({
  client: null,
  status: "idle",
  lastError: null,
  code: null,
  role: null,
  playerId: null,
  playerName: null,
  hostToken: null,
  state: null,
  serverOffsetMs: 0,
  pendingBuzzId: null,

  connect: ({ code, role, hostToken }) => {
    client?.disconnect();
    client = new GameClient();
    const saved = role === "player" ? loadPlayer(code) : null;
    set({ status: "connecting", code, role, hostToken: hostToken ?? null, lastError: null, state: null,
      playerId: saved?.playerId ?? null, playerName: saved?.name ?? null, pendingBuzzId: null });

    client.connect(
      { code, role, playerId: saved?.playerId, hostToken },
      {
        onOpen: () => set({ status: "connected" }),
        onDisconnect: () => {
          if (get().status !== "error") set({
            status: "reconnecting", pendingBuzzId: null,
            ...(get().pendingBuzzId ? { lastError: "Your tap wasn't confirmed. Check the board, then tap again once reconnected." } : {}),
          });
        },
        onRoomClosed: (message) => set({ status: "error", lastError: message, state: null, pendingBuzzId: null }),
        onMessage: (msg: ServerMessage) => {
          switch (msg.type) {
            case "welcome": {
              if (msg.role === "player" && msg.playerId) {
                const existing = get().playerId;
                if (existing && existing === msg.playerId) break; // reconnect confirmed
                // The Worker already bound this socket; remember the identity
                // for future reconnects without an unnecessary socket handoff.
                savePlayer(code, { playerId: msg.playerId, name: get().playerName ?? "" });
                rememberName(get().playerName ?? "");
                set({ playerId: msg.playerId });
                client?.updateIdentity({ code, role: "player", playerId: msg.playerId });
              } else if (msg.role === "player" && get().playerId) {
                // Room codes can be reused after cleanup; forget an old identity.
                clearPlayer(code);
                set({ playerId: null, pendingBuzzId: null });
                client?.updateIdentity({ code, role: "player" });
              }
              break;
            }
            case "state": {
              const st = msg.state as PublicState;
              set({ state: st, serverOffsetMs: st.serverTime - Date.now() });
              break;
            }
            case "action_result":
              if (msg.requestId === get().pendingBuzzId) {
                set({ pendingBuzzId: null, ...(!msg.ok ? { lastError: msg.error ?? "Buzz rejected" } : {}) });
              }
              break;
            case "room_closed":
              client?.disconnect();
              set({ status: "error", lastError: msg.message, state: null });
              break;
            case "error":
              set({ lastError: msg.message });
              break;
            case "pong":
              break;
          }
        },
      },
    );
    set({ client });
  },

  join: (name: string, teamId: string, claimCaptain: boolean) => {
    const trimmed = name.trim();
    if (!trimmed || !teamId || !client) return;
    rememberName(trimmed);
    set({ playerName: trimmed });
    if (!client.send({ type: "join", name: trimmed, teamId, claimCaptain }))
      set({ lastError: "Reconnecting — wait for live, then join again." });
  },

  hostAction: (action) => {
    const { hostToken, code } = get();
    if (!hostToken || !code || !client) return;
    if (!client.send({ type: "host_action", token: hostToken, action }))
      set({ lastError: "Reconnecting — this action was not sent. Try again when live." });
  },

  playerAction: (action) => {
    const { playerId, pendingBuzzId, status } = get();
    if (!playerId || !client) return false;
    if (action.type === "buzz" && pendingBuzzId) return false;
    if (status !== "connected") {
      set({ lastError: "Reconnecting — your tap was not sent. Tap again when live." });
      return false;
    }
    const requestId = action.type === "buzz" ? `buzz-${Date.now()}-${++nextRequestId}` : undefined;
    if (requestId) set({ pendingBuzzId: requestId, lastError: null });
    if (!client.send({ type: "player_action", playerId, action, requestId })) {
      set({ pendingBuzzId: null, lastError: "Your tap was not sent. Wait for live and tap again." });
      return false;
    }
    return true;
  },

  setError: (msg) => set({ lastError: msg }),

  disconnect: () => {
    client?.disconnect();
    client = null;
    set({ client: null, status: "idle", pendingBuzzId: null });
  },
}));

export { createRoom };
