"use client";

/** localStorage identities — survive refreshes, dead batteries, and iOS tab purges. */

const PLAYER_PREFIX = "feud.player.";
const HOST_PREFIX = "feud.host.";
const NAME_KEY = "feud.name";

export interface PlayerIdentity {
  playerId: string;
  name: string;
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode etc. */
  }
}

export function savePlayer(code: string, id: PlayerIdentity): void {
  safeSet(PLAYER_PREFIX + code, JSON.stringify(id));
}

export function loadPlayer(code: string): PlayerIdentity | null {
  const raw = safeGet(PLAYER_PREFIX + code);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PlayerIdentity;
  } catch {
    return null;
  }
}

export function saveHost(code: string, hostToken: string): void {
  safeSet(HOST_PREFIX + code, JSON.stringify({ hostToken }));
}

export function loadHost(code: string): string | null {
  const raw = safeGet(HOST_PREFIX + code);
  if (!raw) return null;
  try {
    return (JSON.parse(raw) as { hostToken: string }).hostToken;
  } catch {
    return null;
  }
}

export function rememberName(name: string): void {
  safeSet(NAME_KEY, name);
}

export function recallName(): string {
  return safeGet(NAME_KEY) ?? "";
}
