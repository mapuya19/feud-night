/**
 * Edge router. Thin: generates room codes, hands WebSockets to the room's
 * Durable Object (single source of truth for game state), CORS for HTTP.
 */
import { FeudRoom } from "./index";

export { FeudRoom };

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ"; // no I, L, O — QR-code friendly

interface Env {
  GAME_ROOM: DurableObjectNamespace;
  /** Optional Worker secret used only for the known-room admin delete endpoint. */
  ADMIN_TOKEN?: string;
}

function code(): string {
  let s = "";
  for (let i = 0; i < 4; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return s;
}

function roomStub(env: Env, roomCode: string) {
  const id = env.GAME_ROOM.idFromName(roomCode);
  return env.GAME_ROOM.get(id);
}

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  "access-control-allow-headers": "content-type, authorization",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    if (url.pathname === "/health") return json({ ok: true });

    if (url.pathname === "/create" && request.method === "POST") {
      const hostToken = crypto.randomUUID().replace(/-/g, "");
      for (let attempt = 0; attempt < 5; attempt++) {
        const roomCode = code();
        const exists = await roomStub(env, roomCode).fetch(`https://do/room/${roomCode}/exists`);
        if (exists.status === 404) {
          const res = await roomStub(env, roomCode).fetch(`https://do/room/${roomCode}/create`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ hostToken }),
          });
          if (res.ok) return json({ code: roomCode, hostToken });
        }
      }
      return json({ error: "Could not allocate a room code" }, 500);
    }

    const adminDeleteMatch = url.pathname.match(/^\/admin\/rooms\/([A-Z]{4})$/);
    if (adminDeleteMatch && request.method === "DELETE") {
      if (!env.ADMIN_TOKEN || request.headers.get("authorization") !== `Bearer ${env.ADMIN_TOKEN}`) {
        return json({ error: "Unauthorized" }, 401);
      }
      return roomStub(env, adminDeleteMatch[1]).fetch(`https://do/room/${adminDeleteMatch[1]}/admin-close`, {
        method: "DELETE",
      });
    }

    const wsMatch = url.pathname.match(/^\/room\/([A-Z]{4})\/ws$/);
    if (wsMatch) {
      return roomStub(env, wsMatch[1]).fetch(request);
    }

    const existsMatch = url.pathname.match(/^\/room\/([A-Z]{4})$/);
    if (existsMatch && request.method === "GET") {
      return roomStub(env, existsMatch[1]).fetch(`https://do/room/${existsMatch[1]}/exists`);
    }

    return new Response("not found", { status: 404, headers: CORS });
  },
};
