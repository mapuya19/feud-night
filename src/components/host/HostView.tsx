"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useFeud } from "@/lib/store";
import { cn } from "@/lib/cn";
import { Button, Countdown, PHASE_LABEL, StatusDot } from "@/components/ui";
import type { PublicState } from "@shared/projection";

export function HostView({ code }: { code: string }) {
  const { status, state } = useFeud();
  if (!state) return <div className="p-10 text-white/50">Connecting to room {code}…</div>;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-4 p-4 pb-12">
      <Header state={state} status={status} code={code} />
      <main className="flex flex-col gap-4">
        {state.phase === "lobby" && <LobbyHost state={state} />}
        {state.phase === "faceoff" && <FaceoffHost state={state} />}
        {state.phase === "playing" && <PlayingHost state={state} />}
        {state.phase === "steal" && <StealHost state={state} />}
        {state.phase === "steal_reveal" && <StealJudgeHost state={state} />}
        {state.phase === "round_over" && <RoundOverHost state={state} />}
        {state.phase === "fast_money_intro" && <FmIntroHost state={state} />}
        {state.phase === "fast_money" && <FmHost state={state} />}
        {state.phase === "fast_money_reveal" && <FmRevealHost state={state} />}
        {state.phase === "game_over" && <GameOverHost state={state} />}
      </main>
      <Roster state={state} />
    </div>
  );
}

function Header({ state, status, code }: { state: PublicState; status: string; code: string }) {
  const [showQr, setShowQr] = useState(false);
  const joinUrl =
    typeof window !== "undefined"
      ? `${process.env.NEXT_PUBLIC_SITE_URL || window.location.origin}/play?g=${code}`
      : "";
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.045] backdrop-blur-xl px-4 py-3">
      <div className="flex flex-col">
        <span className="display text-xl text-white">
          FEUD NIGHT <span className="text-white/30">· host</span>
        </span>
        <div className="flex items-center gap-2 text-xs text-white/40">
          <StatusDot status={status as "connected"} />
          room {code} · {PHASE_LABEL[state.phase] ?? state.phase}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" onClick={() => setShowQr((v) => !v)}>
          {showQr ? "Hide QR" : "Show QR"}
        </Button>
        {showQr && joinUrl && (
          <div className="animate-pop-in flex flex-col items-center rounded-xl border border-white/10 bg-white/[0.045] backdrop-blur-xl p-3">
            <QRCodeSVG value={joinUrl} size={120} bgColor="#1a1a2b" fgColor="#f4f4f8" />
            <span className="mt-1 text-[10px] text-white/40">{joinUrl}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------- lobby

function LobbyHost({ state }: { state: PublicState }) {
  const { hostAction } = useFeud();
  const total = state.teams.reduce((n, t) => n + t.playerCount, 0);
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.045] backdrop-blur-xl p-4">
      <p className="text-sm text-white/50">
        {total} players in. Teams auto-balance as people join — you can rename teams and reassign captains below.
      </p>
      {state.teams.map((t) => (
        <TeamAdminRow key={t.id} state={state} teamId={t.id} />
      ))}
      <Button
        variant="gold"
        className="mt-2 py-4 text-lg"
        disabled={total < 3}
        onClick={() => hostAction({ type: "start_game" })}
      >
        {total < 3 ? `Need 3+ players (${total} in)` : "▶ Start the Feud"}
      </Button>
    </section>
  );
}

function TeamAdminRow({ state, teamId }: { state: PublicState; teamId: string }) {
  const { hostAction } = useFeud();
  const team = state.teams.find((t) => t.id === teamId)!;
  const members = state.players?.filter((p) => p.teamId === teamId) ?? [];
  const [name, setName] = useState(team.name);
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.045] backdrop-blur-xl p-3">
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: team.color }} />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => hostAction({ type: "set_team_name", teamId, name })}
          maxLength={24}
          className="display flex-1 rounded-md bg-transparent px-1 py-0.5 text-white focus:bg-line focus:outline-none"
          style={{ color: team.color }}
        />
        <span className="text-xs text-white/35">{members.length}p</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {members.map((m) => (
          <button
            key={m.id}
            onClick={() => hostAction({ type: "set_captain", teamId, playerId: m.id })}
            className={cn(
              "rounded-full px-2.5 py-1 text-xs transition-colors",
              m.isCaptain
                ? "bg-gold/20 text-gold"
                : m.connected
                  ? "bg-white/[0.06] text-white/70 hover:bg-white/10"
                  : "bg-white/[0.03] text-white/25 line-through",
            )}
            title={m.connected ? "Tap to make captain" : "disconnected"}
          >
            {m.isCaptain ? "👑 " : ""}
            {m.name}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- faceoff

function FaceoffHost({ state }: { state: PublicState }) {
  const { hostAction } = useFeud();
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.045] backdrop-blur-xl p-4">
      <h2 className="display text-lg text-white">🔔 Face-off — waiting for a buzz</h2>
      <p className="text-sm text-white/50">{state.question?.prompt}</p>
      <div className="grid grid-cols-3 gap-2">
        {state.teams.map((t) => (
          <div key={t.id} className="rounded-xl border border-white/10 bg-white/[0.045] backdrop-blur-xl p-3 text-center">
            <div className="display text-sm" style={{ color: t.color }}>
              {t.name}
            </div>
            <div className="mt-1 text-sm text-white/70">{t.repName ?? "no rep"}</div>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" onClick={() => hostAction({ type: "start_faceoff" })}>
          Reset buzzers
        </Button>
        <Button variant="ghost" onClick={() => hostAction({ type: "skip_question" })}>
          Skip question
        </Button>
      </div>
      <p className="text-xs text-white/30">
        Tip: swap a rep from the roster below before the buzz if someone&apos;s shy.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------- playing

function PlayingHost({ state }: { state: PublicState }) {
  const { hostAction } = useFeud();
  const pending = state.pendingAnswer;
  const unrevealed = state.question?.slots.map((s, i) => ({ s, i })).filter(({ s }) => !s.revealed) ?? [];
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.045] backdrop-blur-xl p-4">
      <h2 className="display text-lg text-white">⚖️ Judge the answer</h2>
      <p className="text-sm text-white/50">{state.question?.prompt}</p>

      <div
        className={cn(
          "display rounded-xl border-2 border-dashed p-4 text-center text-2xl",
          pending ? "border-gold bg-gold/10 text-gold" : "border-white/15 text-white/25",
        )}
      >
        {pending ? `“${pending.text}” — ${pending.byName}` : state.suggestions.length ? "Waiting for captain to lock…" : "Waiting for an answer…"}
      </div>

      {state.suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {state.suggestions.map((s, i) => (
            <span key={i} className="rounded-full bg-white/[0.05] px-2.5 py-1 text-xs text-white/50">
              {s.text} — {s.byName}
            </span>
          ))}
        </div>
      )}

      <div>
        <div className="mb-1.5 text-xs uppercase tracking-widest text-white/40">match to board answer</div>
        <div className="grid grid-cols-2 gap-1.5">
          {unrevealed.map(({ s, i }) => (
            <Button key={i} variant="primary" className="justify-start text-left" onClick={() => hostAction({ type: "reveal_answer", slot: i })}>
              {s.text} · {s.points}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="danger" className="flex-1 py-4 text-lg" onClick={() => hostAction({ type: "strike" })}>
          ✕ Strike ({state.strikes}/3)
        </Button>
        <Button variant="ghost" onClick={() => hostAction({ type: "skip_question" })}>
          Skip Q
        </Button>
        <Button variant="ghost" onClick={() => hostAction({ type: "start_faceoff" })}>
          Redo face-off
        </Button>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ steal

function StealHost({ state }: { state: PublicState }) {
  const { serverOffsetMs } = useFeud();
  const steal = state.steal;
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-gold/40 bg-gold/5 p-4">
      <div className="flex items-center justify-between">
        <h2 className="display text-lg text-gold">🥷 Steal huddle in progress</h2>
        {steal?.endsAt && <Countdown endsAt={steal.endsAt} offsetMs={serverOffsetMs} className="text-2xl" />}
      </div>
      <div className="flex flex-col gap-1.5 text-sm text-white/60">
        {state.teams
          .filter((t) => !t.isControlling)
          .map((t) => (
            <div key={t.id} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.color }} />
              {t.name}
              <span className={steal?.submittedTeamIds.includes(t.id) ? "text-emerald-400" : "text-white/30"}>
                {steal?.submittedTeamIds.includes(t.id) ? "locked ✓" : "huddling…"}
              </span>
            </div>
          ))}
      </div>
      <p className="text-xs text-white/30">Submissions are secret until both are in (or time expires). You&apos;ll judge next.</p>
    </section>
  );
}

function StealJudgeHost({ state }: { state: PublicState }) {
  const { hostAction } = useFeud();
  const results = state.steal?.results ?? [];
  const [marks, setMarks] = useState<Record<string, number | null>>({});
  const slots = state.question?.slots ?? [];
  const allMarked = results.length > 0 && results.every((r) => marks[r.teamId] !== undefined);
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-neon/40 bg-card p-4">
      <h2 className="display text-lg text-neon">🎭 Judge the steals</h2>
      {results.map((r) => {
        const team = state.teams.find((t) => t.id === r.teamId)!;
        const mark = marks[r.teamId];
        return (
          <div key={r.teamId} className="rounded-xl border p-3" style={{ borderColor: team.color }}>
            <div className="display text-sm" style={{ color: team.color }}>
              {team.name}: “{r.text}”
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {slots.map((s, i) => (
                <button
                  key={i}
                  onClick={() => setMarks((m) => ({ ...m, [r.teamId]: i }))}
                  className={cn(
                    "display rounded-lg px-2.5 py-1.5 text-xs",
                    mark === i ? "bg-blue-600 text-white" : "bg-white/[0.06] text-white/70 hover:bg-white/10",
                  )}
                >
                  {s.text} · {s.points}
                </button>
              ))}
              <button
                onClick={() => setMarks((m) => ({ ...m, [r.teamId]: null }))}
                className={cn(
                  "display rounded-lg px-2.5 py-1.5 text-xs",
                  mark === null && marks[r.teamId] !== undefined ? "bg-red-600 text-white" : "bg-white/[0.06] text-white/70 hover:bg-white/10",
                )}
              >
                No match
              </button>
            </div>
          </div>
        );
      })}
      <Button
        variant="gold"
        className="py-4 text-lg"
        disabled={!allMarked}
        onClick={() =>
          hostAction({
            type: "resolve_steal",
            marks: results.map((r) => ({ teamId: r.teamId, slot: marks[r.teamId] ?? null })),
          })
        }
      >
        Resolve steal — award the bank
      </Button>
      <p className="text-xs text-white/30">If both match, the higher-ranked survey answer wins the steal.</p>
    </section>
  );
}

// ------------------------------------------------------------- round over

function RoundOverHost({ state }: { state: PublicState }) {
  const { hostAction } = useFeud();
  const lastRound = state.roundIndex + 1 >= state.totalRounds;
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-gold/50 bg-gold/10 p-4">
      <h2 className="display text-xl text-gold">
        {state.lastAward?.teamName} banked {state.lastAward?.points} pts
      </h2>
      <Button
        variant="gold"
        className="py-4 text-lg"
        onClick={() => hostAction({ type: "next_round" })}
      >
        {lastRound ? "⚡ To Fast Money setup" : `▶ Round ${state.roundIndex + 2}${state.roundIndex + 2 >= 3 ? " (×2 points)" : ""}`}
      </Button>
    </section>
  );
}

// ------------------------------------------------------------ fast money

function FmIntroHost({ state }: { state: PublicState }) {
  const { hostAction } = useFeud();
  const winner = state.teams.find((t) => t.id === state.winnerTeamId) ?? state.teams[0];
  const members = state.players?.filter((p) => p.teamId === winner.id) ?? [];
  const [picked, setPicked] = useState<string[]>([]);
  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < 2 ? [...p, id] : [p[1], id]));
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-gold/40 bg-card p-4">
      <h2 className="display text-lg text-gold">⚡ Fast Money — {winner.name}</h2>
      <p className="text-sm text-white/50">Pick two players. Player 2 should grab headphones / face the wall.</p>
      <div className="flex flex-wrap gap-1.5">
        {members.map((m) => (
          <button
            key={m.id}
            onClick={() => toggle(m.id)}
            className={cn(
              "display rounded-full px-3 py-1.5 text-sm",
              picked.includes(m.id) ? "bg-gold text-black" : "bg-white/[0.06] text-white/70 hover:bg-white/10",
            )}
          >
            {m.name}
          </button>
        ))}
      </div>
      <Button
        variant="gold"
        className="py-4 text-lg"
        disabled={picked.length !== 2}
        onClick={() => hostAction({ type: "start_fast_money", playerIds: picked })}
      >
        Start Fast Money
      </Button>
    </section>
  );
}

function FmHost({ state }: { state: PublicState }) {
  const { hostAction, serverOffsetMs } = useFeud();
  const fm = state.fastMoney!;
  const [dup, setDup] = useState(false);
  const cur = fm.hostCurrent;
  const answered = cur !== null;
  const answeredAll = fm.questionIndex + 1 >= fm.questionCount;
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.045] backdrop-blur-xl p-4">
      <div className="flex items-center justify-between">
        <h2 className="display text-lg text-gold">
          ⚡ {fm.playerNames[fm.playerIndex]} · Q{fm.questionIndex + 1}/{fm.questionCount}
        </h2>
        {fm.timer && <Countdown endsAt={fm.timer.endsAt} offsetMs={serverOffsetMs} className="text-2xl" />}
      </div>
      <p className="text-sm text-white/60">{fm.prompt ?? "Press Ask when the player is ready."}</p>

      {!answered ? (
        <Button variant="gold" className="py-4 text-lg" onClick={() => hostAction({ type: "fm_start_question" })}>
          🎤 Ask question + start timer
        </Button>
      ) : (
        <>
          <div className="display rounded-xl border-2 border-dashed border-gold bg-gold/10 p-4 text-center text-2xl text-gold">
            “{cur!.text || "(ran out of time)"}”
          </div>
          <div className="text-xs uppercase tracking-widest text-white/40">award points</div>
          <div className="grid grid-cols-2 gap-1.5">
            {fm.hostQuestion?.answers.map((a) => (
              <Button
                key={a.text}
                variant="primary"
                className="justify-start text-left"
                onClick={() => hostAction({ type: "fm_judge", points: a.points, duplicate: dup })}
              >
                {a.text} · {a.points}
              </Button>
            ))}
            <Button
              variant="danger"
              className="col-span-2"
              onClick={() => hostAction({ type: "fm_judge", points: 0, duplicate: false })}
            >
              No points
            </Button>
          </div>
          <label className="flex items-center gap-2 text-sm text-white/60">
            <input type="checkbox" checked={dup} onChange={(e) => setDup(e.target.checked)} className="h-4 w-4 accent-gold" />
            Duplicate of player 1&apos;s answer (0 pts)
          </label>
          <Button variant="gold" onClick={() => hostAction({ type: "fm_next_question" })} disabled={answeredAll}>
            Next question →
          </Button>
          {answeredAll && fm.playerIndex === 0 && (
            <Button variant="gold" onClick={() => hostAction({ type: "fm_next_player" })}>
              Bring in player 2 →
            </Button>
          )}
          {answeredAll && fm.playerIndex === 1 && (
            <Button variant="gold" onClick={() => hostAction({ type: "fm_reveal_step" })}>
              Start the reveal 🎬
            </Button>
          )}
        </>
      )}
    </section>
  );
}

function FmRevealHost({ state }: { state: PublicState }) {
  const { hostAction } = useFeud();
  const fm = state.fastMoney!;
  const step = fm.reveal?.step ?? -1;
  const done = step >= fm.questionCount;
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-gold/40 bg-card p-4">
      <h2 className="display text-lg text-gold">🎬 Fast Money reveal — step through</h2>
      <div className="text-sm text-white/50">
        Question {Math.min(step + 1, fm.questionCount)} of {fm.questionCount} · running total {fm.reveal?.total ?? 0}
      </div>
      <Button variant="gold" className="py-4 text-lg" onClick={() => hostAction({ type: "fm_reveal_step" })}>
        {step < 0 ? "Reveal question 1" : step < fm.questionCount ? "Reveal next" : done ? "Finish" : "Show totals"}
      </Button>
      <p className="text-xs text-white/30">Milk it. The board animates each reveal.</p>
    </section>
  );
}

function GameOverHost({ state }: { state: PublicState }) {
  const { hostAction } = useFeud();
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-gold/50 bg-gold/10 p-4">
      <h2 className="display text-xl text-gold">🏆 {state.teams.find((t) => t.id === state.winnerTeamId)?.name} wins!</h2>
      <Button variant="ghost" onClick={() => hostAction({ type: "reset_game" })}>
        Play again (same teams)
      </Button>
    </section>
  );
}

// ----------------------------------------------------------------- roster

function Roster({ state }: { state: PublicState }) {
  const { hostAction } = useFeud();
  const players = state.players ?? [];
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="self-start text-xs text-white/30 underline">
        show roster ({players.filter((p) => p.connected).length}/{players.length} connected)
      </button>
    );
  }
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.045] backdrop-blur-xl p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="display text-sm text-white/60">Roster</h3>
        <button onClick={() => setOpen(false)} className="text-xs text-white/30 underline">
          hide
        </button>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {state.teams.map((t) => (
          <div key={t.id} className="flex flex-col gap-1">
            <span className="display text-xs" style={{ color: t.color }}>
              {t.name}
            </span>
            {players
              .filter((p) => p.teamId === t.id)
              .map((p) => (
                <button
                  key={p.id}
                  onClick={() => hostAction({ type: "set_rep", teamId: t.id, playerId: p.id })}
                  className={cn(
                    "rounded-md px-2 py-1 text-left text-xs",
                    p.isRep
                      ? "bg-neon/15 text-neon"
                      : p.connected
                        ? "text-white/60 hover:bg-white/10/50"
                        : "text-white/25 line-through",
                  )}
                  title={p.isRep ? "Current rep" : "Tap to set as next face-off rep"}
                >
                  {p.isRep ? "🔔 " : p.isCaptain ? "👑 " : ""}
                  {p.name}
                </button>
              ))}
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-white/25">Tap a player to pre-set them as rep for the next face-off.</p>
    </section>
  );
}
