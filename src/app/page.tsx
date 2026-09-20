"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createRoom } from "@/lib/ws-client";
import { saveHost } from "@/lib/identity";
import { MAX_TEAM_PLAYERS, MAX_TEAMS, MIN_TEAMS } from "@shared/config";

export default function Home() {
  const router = useRouter();
  const [teamCount, setTeamCount] = useState(4);
  const [code, setCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const maxPlayers = teamCount * MAX_TEAM_PLAYERS;

  const hostGame = async () => {
    setCreating(true);
    setError(null);
    try {
      const room = await createRoom(teamCount);
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
          <span aria-hidden>✦</span> Free · No downloads · {MIN_TEAMS}–{MAX_TEAMS} teams · up to {MAX_TEAMS * MAX_TEAM_PLAYERS} players
        </span>
        <h1 className="display text-6xl leading-[0.9] tracking-tight sm:text-8xl">
          Feud
          <span className="bg-gradient-to-r from-gold via-gold-soft to-tangerine bg-clip-text text-transparent">
            Night
          </span>
        </h1>
        <p className="max-w-2xl text-lg text-paper/65 md:text-xl">
          A Family Feud-style party game for any living room. Phones are
          controllers, the TV is the board, and your crew writes the answers.
        </p>
      </header>

      <button
        type="button"
        onClick={() => router.push("/rules")}
        className="surface group grid w-full gap-4 p-6 text-left transition hover:-translate-y-0.5 hover:border-gold/40 hover:bg-gold/[0.06] md:grid-cols-[auto_1fr_auto] md:items-center"
      >
        <span className="display flex h-14 w-14 items-center justify-center rounded-2xl border border-gold/35 bg-gold/10 text-3xl text-gold">?</span>
        <span>
          <span className="label text-gold">New here?</span>
          <span className="display mt-1 block text-2xl text-white">View the rules &amp; gameplay flow</span>
          <span className="mt-1 block text-sm text-paper/55">A spoiler-free card for the host, players, answer rotation, steals, and captain RPS tie-breaks.</span>
        </span>
        <span className="display text-lg text-gold transition group-hover:translate-x-1">Open guide →</span>
      </button>

      <section className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            {
              tag: "Face-off",
              body: "One rep per team steps up. First to hit the big red button gets the first answer chance; an on-board answer wins control.",
              accent: "text-gold",
            },
            {
              tag: "Survey says",
              body: "Answers rotate one player at a time with a 10-second clock. Three strikes gives the other teams a simultaneous steal; matching top steals go to the captains for rock-paper-scissors.",
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
            <div className="mt-2 flex flex-col gap-2">
              <span className="text-xs text-paper/50">How many teams?</span>
              <div
                className="grid gap-2"
                role="group"
                aria-label="Number of teams"
                style={{ gridTemplateColumns: `repeat(${MAX_TEAMS - MIN_TEAMS + 1}, minmax(0, 1fr))` }}
              >
                {Array.from({ length: MAX_TEAMS - MIN_TEAMS + 1 }, (_, i) => MIN_TEAMS + i).map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={teamCount === n}
                    onClick={() => setTeamCount(n)}
                    className={
                      "display min-h-11 touch-manipulation rounded-2xl border py-2.5 text-lg transition " +
                      (teamCount === n
                        ? "border-gold bg-gold/15 text-gold"
                        : "border-white/15 bg-white/[0.04] text-paper/60 hover:bg-white/10")
                    }
                  >
                    {n}
                  </button>
                ))}
              </div>
              <span className="text-[11px] text-paper/35">
                {teamCount} teams · {maxPlayers} player max ({MAX_TEAM_PLAYERS} per team)
              </span>
            </div>
            <button
              onClick={hostGame}
              disabled={creating}
              className="btn-gold mt-4 w-full py-4 text-base"
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
        <h2 className="display text-2xl">How a game night runs</h2>
        <div className="mt-4 grid gap-6 text-sm leading-relaxed text-paper/65 md:grid-cols-3">
          <p>
            <span className="label mb-2 block text-gold">Setup</span>
            Host creates a room on the laptop and picks 2–5 teams. The TV shows a
            QR code — guests scan, type a name, pick a team, and optionally claim
            its provisional captain spot before the host locks the roster. Captains submit steals; main-board answers rotate through every player.
          </p>
          <p>
            <span className="label mb-2 block text-neon">Space</span>
            Only one rep per team ever needs to stand up. Everyone else plays
            from their seats — answers go down the line with a 10-second shot
            clock, and steals and scoring all happen on phones and the TV.
          </p>
          <p>
            <span className="label mb-2 block text-bubble">Scale</span>
            Up to {MAX_TEAMS * MAX_TEAM_PLAYERS} players ({MAX_TEAM_PLAYERS} per team) — that&apos;s a
            ceiling, not a target. Small groups are fine: every team just needs
            one player and a captain to start.
          </p>
        </div>
      </section>
    </main>
  );
}
