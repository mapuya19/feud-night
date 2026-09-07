"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createRoom } from "@/lib/ws-client";
import { saveHost } from "@/lib/identity";
import { Button } from "@/components/ui";

export default function Home() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hostGame = async () => {
    setCreating(true);
    setError(null);
    try {
      const room = await createRoom();
      saveHost(room.code, room.hostToken);
      router.push(`/host?g=${room.code}`);
    } catch {
      setError("Couldn't reach the game server. Is the worker running?");
      setCreating(false);
    }
  };

  const normalize = (c: string) => c.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col items-center justify-center gap-8 p-6">
      <div className="text-center">
        <h1 className="display text-5xl text-gold drop-shadow-[0_4px_24px_rgba(245,197,24,0.3)]">Feud Night</h1>
        <p className="mt-2 text-white/50">3 teams · 30 phones · one apartment · survey says</p>
      </div>

      <div className="flex w-full flex-col gap-4 rounded-3xl border border-line bg-card p-6">
        <button
          onClick={hostGame}
          disabled={creating}
          className="display w-full rounded-2xl border border-gold/50 bg-gold px-4 py-5 text-xl text-black transition-transform active:scale-[0.98] disabled:opacity-50"
        >
          {creating ? "Creating room…" : "🎙 Host a game"}
        </button>

        <div className="flex items-center gap-3 text-xs text-white/25">
          <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
        </div>

        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (normalize(code).length === 4) router.push(`/play?g=${normalize(code)}`);
          }}
        >
          <label className="text-xs uppercase tracking-widest text-white/40">join with room code</label>
          <div className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(normalize(e.target.value))}
              placeholder="ABCD"
              maxLength={4}
              className="display min-w-0 flex-1 rounded-xl border border-line bg-card-2 px-4 py-3 text-center text-2xl tracking-[0.4em] text-white placeholder:text-white/20 focus:border-gold focus:outline-none"
            />
            <Button type="submit" variant="primary" disabled={normalize(code).length !== 4}>
              Join
            </Button>
          </div>
        </form>

        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (normalize(code).length === 4) router.push(`/board?g=${normalize(code)}`);
          }}
        >
          <button
            type="submit"
            disabled={normalize(code).length !== 4}
            className="text-xs text-white/35 underline disabled:no-underline disabled:opacity-40"
          >
            open this room as the TV board →
          </button>
        </form>

        {error && <p className="text-center text-sm text-red-400">{error}</p>}
      </div>

      <ol className="flex list-inside list-decimal flex-col gap-1 text-xs text-white/35">
        <li>Host creates a room, opens the console on the laptop</li>
        <li>TV/projector opens the board view</li>
        <li>Guests scan the QR — phone becomes their controller</li>
      </ol>
    </main>
  );
}
