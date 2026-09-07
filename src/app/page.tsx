"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createRoom } from "@/lib/ws-client";
import { saveHost } from "@/lib/identity";

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
    <main className="mx-auto flex min-h-dvh w-[min(96vw,64rem)] flex-col gap-12 px-4 py-12 md:py-16">
      <header className="flex flex-col items-start gap-5">
        <span className="chip">
          <span aria-hidden>✦</span> Free · No downloads · 4 teams · ~30 players
        </span>
        <h1 className="display text-6xl leading-[0.9] tracking-tight sm:text-8xl">
          Feud
          <span className="bg-gradient-to-r from-gold via-gold-soft to-tangerine bg-clip-text text-transparent">
            Night
          </span>
        </h1>
        <p className="max-w-2xl text-lg text-paper/65 md:text-xl">
          Family Feud for your apartment, minus the studio budget. Phones are
          controllers, the TV is the board, and the birthday person is the
          survey.
        </p>
      </header>

      <section className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            {
              tag: "Face-off",
              body: "One rep per team steps up. First to hit the big red button takes control — the server calls the buzzer race.",
              accent: "text-gold",
            },
            {
              tag: "Survey says",
              body: "Your team shouts answers from their phones; the captain locks one in. The face-off rep and captain can be different people. Three strikes gives the other teams a simultaneous steal — if multiple steals are right, the higher-ranked survey answer wins.",
              accent: "text-neon",
            },
            {
              tag: "Final board",
              body: "Four rounds build the score; then every team fights through one last full board worth triple points. Big enough for a comeback, familiar enough to stay chaotic.",
              accent: "text-bubble",
            },
          ].map((step, i) => (
            <article
              key={step.tag}
              className="surface flex flex-col gap-3 p-6 animate-float"
              style={{ ["--tilt" as string]: `${i % 2 ? 0.7 : -0.7}deg`, animationDelay: `${i * 0.6}s` }}
            >
              <span className={`label ${step.accent}`}>{step.tag}</span>
              <p className="text-sm leading-relaxed text-paper/65">{step.body}</p>
            </article>
          ))}
        </div>

        <div className="surface flex flex-col gap-5 p-6 md:p-7">
          <div>
            <span className="label text-gold">Host</span>
            <button
              onClick={hostGame}
              disabled={creating}
              className="btn-gold mt-2 w-full py-4 text-base"
            >
              {creating ? "Creating room…" : "🎙 Create a room"}
            </button>
            <p className="mt-2 text-xs text-paper/40">
              Opens the host console — you judge answers and run the show.
            </p>
          </div>

          <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.18em] text-paper/30">
            <span className="h-px flex-1 bg-white/10" /> or <span className="h-px flex-1 bg-white/10" />
          </div>

          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (normalize(code).length === 4) router.push(`/play?g=${normalize(code)}`);
            }}
          >
            <span className="label">Join a game</span>
            <div className="flex gap-2">
              <input
                value={code}
                onChange={(e) => setCode(normalize(e.target.value))}
                placeholder="ABCD"
                maxLength={4}
                className="field display text-center text-2xl tracking-[0.4em]"
              />
              <button type="submit" disabled={normalize(code).length !== 4} className="btn-blue shrink-0 px-5">
                Join
              </button>
            </div>
            <button
              type="button"
              disabled={normalize(code).length !== 4}
              onClick={() => router.push(`/board?g=${normalize(code)}`)}
              className="self-start text-xs text-paper/40 underline decoration-white/20 underline-offset-4 transition hover:text-paper/70 disabled:no-underline disabled:opacity-40"
            >
              open this room as the TV board →
            </button>
          </form>

          {error && <p className="text-center text-sm text-bubble">{error}</p>}
        </div>
      </section>

      <section className="surface p-6 md:p-8">
        <h2 className="display text-2xl">Playing in a small apartment</h2>
        <div className="mt-4 grid gap-6 text-sm leading-relaxed text-paper/65 md:grid-cols-3">
          <p>
            <span className="label mb-2 block text-gold">Setup</span>
            Host creates a room on the laptop. The TV shows a QR code — guests
            scan, type a name, choose one of four teams, and optionally claim
            its provisional captain spot before the host locks the roster.
          </p>
          <p>
            <span className="label mb-2 block text-neon">Space</span>
            Only four reps ever need to stand up. Everyone else plays from
            their team&apos;s corner of the apartment — suggestions, steals and
            fast money all happen on phones.
          </p>
          <p>
            <span className="label mb-2 block text-bubble">Chaos</span>
            Reconnects are seamless: lock your phone, close the tab, come back —
            your team, score and captaincy are waiting.
          </p>
        </div>
      </section>
    </main>
  );
}
