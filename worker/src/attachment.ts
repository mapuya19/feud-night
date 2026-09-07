/**
 * Per-socket viewer identity, persisted with the socket so it survives
 * Durable Object hibernation (attachments are stored, tags are not needed).
 */
export interface SocketAttachment {
  role: "host" | "board" | "player";
  playerId: string | null;
  hostToken: string | null;
}

export function readAttachment(ws: WebSocket): SocketAttachment | null {
  try {
    return (ws as unknown as { deserializeAttachment?: () => unknown }).deserializeAttachment?.() as SocketAttachment | null ?? null;
  } catch {
    return null;
  }
}

export function writeAttachment(ws: WebSocket, att: SocketAttachment): void {
  try {
    (ws as unknown as { serializeAttachment?: (a: unknown) => void }).serializeAttachment?.(att);
  } catch {
    /* socket not in a state to attach */
  }
}
