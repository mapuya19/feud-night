"use client";

import { create } from "zustand";
import { GameClient, createRoom } from "./ws-client";
import type { HostAction, PlayerAction, ServerMessage } from "@shared/protocol";
import type { PublicState } from "@shared/projection";
import { loadPlayer, rememberName, saveHost, savePlayer } from "./identity";

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
  connect: (args: ConnectArgs) => void;
  join: (name: string, teamId: string, claimCaptain: boolean) => void;
  hostAction: (action: HostAction) => void;
  playerAction: (action: PlayerAction) => void;
  setError: (msg: string | null) => void;
  disconnect: () => void;
}

let client: GameClient | null = null;

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

  connect: ({ code, role, hostToken }) => {
    client?.disconnect();
    client = new GameClient();
    set({ status: "connecting", code, role, hostToken: hostToken ?? null, lastError: null, state: null });

    const saved = role === "player" ? loadPlayer(code) : null;
    if (saved) set({ playerId: saved.playerId, playerName: saved.name });

    client.connect(
      { code, role, playerId: saved?.playerId, hostToken },
      {
        onOpen: () => set({ status: "connected", lastError: null }),
        onDisconnect: () => {
          if (get().status !== "error") set({ status: "reconnecting" });
        },
        onMessage: (msg: ServerMessage) => {
          switch (msg.type) {
            case "welcome": {
              if (msg.role === "player" && msg.playerId) {
                const existing = get().playerId;
                if (existing && existing === msg.playerId) break; // reconnect confirmed
                // First join: server issued a fresh playerId. Bind this socket
                // to it by reconnecting with ?playerId= so actions are owned.
                savePlayer(code, { playerId: msg.playerId, name: get().playerName ?? "" });
                rememberName(get().playerName ?? "");
                set({ playerId: msg.playerId });
                client?.reconnectAs({ code, role: "player", playerId: msg.playerId });
              }
              break;
            }
            case "state": {
              const st = msg.state as PublicState;
              set({ state: st, serverOffsetMs: st.serverTime - Date.now() });
              break;
            }
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
    client.send({ type: "join", name: trimmed, teamId, claimCaptain });
  },

  hostAction: (action) => {
    const { hostToken, code } = get();
    if (!hostToken || !code || !client) return;
    client.send({ type: "host_action", token: hostToken, action });
  },

  playerAction: (action) => {
    const { playerId } = get();
    if (!playerId || !client) return;
    client.send({ type: "player_action", playerId, action });
  },

  setError: (msg) => set({ lastError: msg }),

  disconnect: () => {
    client?.disconnect();
    client = null;
    set({ client: null, status: "idle" });
  },
}));

export { createRoom };
