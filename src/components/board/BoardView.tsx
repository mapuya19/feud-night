"use client";

import { QRCodeSVG } from "qrcode.react";
import { AnimatePresence, motion } from "framer-motion";
import { useFeud } from "@/lib/store";
import { cn } from "@/lib/cn";
import { Countdown, CountdownBar, PHASE_LABEL } from "@/components/ui";
import type { PublicSlot, PublicState, PublicTeam } from "@shared/projection";

export function BoardView() {
  const { state, status, lastError } = useFeud();
  if (!state) return <Splash text={status === "error" ? lastError ?? "This room is no longer available." : "Connecting…"} />;
  switch (state.phase) {
    case "lobby":
      return <LobbyBoard state={state} />;
    case "faceoff":
    case "faceoff_answer":
    case "playing":
    case "steal":
    case "steal_reveal":
    case "steal_tiebreak":
    case "steal_tiebreak_reveal":
    case "round_over":
      return <RoundBoard state={state} />;
    case "game_over":
      return <GameOver state={state} />;
    default:
      return <Splash text={PHASE_LABEL[state.phase] ?? ""} />;
  }
}

function Splash({ text }: { text: string }) {
  return (
    <div className="tv flex items-center justify-center">
      <p className="display animate-pulse text-4xl text-white/40">{text}</p>
    </div>
  );
}

// ------------------------------------------------------------------ header

function Scoreboard({ state }: { state: PublicState }) {
  const cols = state.teams.length;
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {state.teams.map((t: PublicTeam) => (
        <div
          key={t.id}
          className={cn(
            "rounded-2xl border bg-card px-3 py-2.5 transition-all duration-300",
            t.isControlling ? "scale-[1.03] shadow-lg" : "border-white/15",
          )}
          style={t.isControlling ? { borderColor: t.color, boxShadow: `0 0 32px ${t.color}55` } : undefined}
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="display tv-score-name truncate" style={{ color: t.color }}>
              {t.name}
            </span>
            <motion.span key={t.score} initial={{ scale: 1.6, color: "#f5c518" }} animate={{ scale: 1, color: "#ffffff" }} className="display tv-score-value tabular-nums">
              {t.score}
            </motion.span>
          </div>
          {t.isControlling && <div className="mt-1 text-center text-[10px] font-bold uppercase tracking-widest text-gold">in control</div>}
        </div>
      ))}
    </div>
  );
}

function RoundTag({ state }: { state: PublicState }) {
  return (
    <div className="flex items-center gap-2 text-xs text-white/50">
      <span className="display rounded-md bg-white/10 px-2.5 py-1 text-white/60">Round {state.roundIndex + 1}/{state.totalRounds}</span>
      {state.multiplier > 1 && (
        <span className="display rounded-md bg-gold/20 px-2 py-1 text-gold">×{state.multiplier}</span>
      )}
    </div>
  );
}

// ------------------------------------------------------------------- lobby

function LobbyBoard({ state }: { state: PublicState }) {
  const joinUrl =
    typeof window !== "undefined"
      ? `${process.env.NEXT_PUBLIC_SITE_URL || window.location.origin}/play?g=${state.code}`
      : "";
  return (
    <div className="tv tv-stage flex flex-col items-center justify-center">
      <div>
        <h1 className="display tv-lobby-title text-center text-gold drop-shadow-[0_4px_24px_rgba(245,197,24,0.3)]">
          Feud Night
        </h1>
        <p className="display mt-2 text-center text-lg text-white/50">grab a phone · pick your team · total chaos</p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-8 rounded-3xl border border-white/10 bg-white/[0.045] p-6 backdrop-blur-xl sm:p-8">
        <div className="flex flex-col items-center gap-3">
          {joinUrl && <QRCodeSVG value={joinUrl} size={280} bgColor="#12121e" fgColor="#f4f4f8" level="M" />}
          <span className="text-xs text-white/40">scan to join</span>
        </div>
        <div className="flex flex-col items-center gap-2">
          <span className="text-xs uppercase tracking-widest text-white/40">room code</span>
          <span className="display text-7xl tracking-[0.3em] text-white">{state.code}</span>
          <span className="mt-3 text-sm text-white/50">{state.teams.reduce((n, t) => n + t.playerCount, 0)} players in</span>
        </div>
      </div>
      <div
        className="grid w-full max-w-4xl gap-3"
        style={{ gridTemplateColumns: `repeat(${Math.min(state.teams.length, 3)}, minmax(0, 1fr))` }}
      >
        {state.teams.map((t) => (
          <div key={t.id} className="rounded-2xl border border-white/10 bg-white/[0.045] backdrop-blur-xl p-4 text-center">
            <div className="display text-xl" style={{ color: t.color }}>
              {t.name}
            </div>
            <div className="display mt-1 text-4xl tabular-nums">{t.playerCount}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------ round board

function Strikes({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-3">
      {[0, 1, 2].map((i) => (
        <span key={i} className={cn("display text-6xl leading-none", i < count ? "text-red-500" : "text-white/10")}>
          ✕
        </span>
      ))}
      {count >= 3 && (
        <motion.span
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="display text-2xl text-red-400"
        >
          strikeout!
        </motion.span>
      )}
    </div>
  );
}

function Slot({ slot, index }: { slot: PublicSlot; index: number }) {
  return (
    <motion.div
      layout
      className={cn(
        "flex h-full min-h-0 items-center gap-2 rounded-xl border px-3 py-2 sm:gap-4 sm:px-5 sm:py-3",
        slot.revealed ? "border-blue-300/60 bg-gradient-to-b from-blue-500 to-blue-700 shadow-[0_8px_30px_rgba(37,99,235,0.35)]" : "border-white/15 bg-card-2",
      )}
    >
      <span
        className={cn(
          "display flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-lg",
          slot.revealed ? "bg-white/20 text-white" : "bg-white/10 text-white/40",
        )}
      >
        {index + 1}
      </span>
      <AnimatePresence mode="wait">
        {slot.revealed ? (
          <motion.span
            key="revealed"
            initial={{ rotateX: 90, opacity: 0 }}
            animate={{ rotateX: 0, opacity: 1 }}
            transition={{ duration: 0.35 }}
            className="tv-slot-text display min-w-0 flex-1 break-words text-center leading-[0.92] text-white"
          >
            {slot.text}
          </motion.span>
        ) : (
          <motion.span key="hidden" className="flex-1" />
        )}
      </AnimatePresence>
      <span className={cn("display shrink-0 text-xl tabular-nums", slot.revealed ? "text-gold" : "text-white/30")}>
        {slot.revealed ? slot.points : ""}
      </span>
    </motion.div>
  );
}

function RoundBoard({ state }: { state: PublicState }) {
  const { serverOffsetMs } = useFeud();
  const q = state.question;
  const controlling = state.teams.find((t) => t.isControlling);
  return (
    <div className="tv tv-stage flex min-h-0 flex-col">
      <div className="flex items-start justify-between gap-4">
        <RoundTag state={state} />
        {state.question && (
          <div className="display rounded-2xl border border-gold/40 bg-gold/10 px-5 py-2 text-2xl text-gold tabular-nums shadow-[0_0_28px_rgba(245,197,24,0.15)]">
            bank {state.question.bank}
          </div>
        )}
      </div>

      {q && (
        <h2 className="display tv-question max-w-5xl text-balance leading-[1.05] text-paper drop-shadow-[0_2px_18px_rgba(0,0,0,0.6)]">
          {q.prompt}
        </h2>
      )}

      <div className="grid min-h-0 flex-1 auto-rows-fr grid-cols-2 content-stretch gap-3">
        {q?.slots.map((slot, i) => (
          <Slot key={i} slot={slot} index={i} />
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-6">
        <Strikes count={state.strikes} />
        <AnimatePresence mode="wait">
          {state.phase === "faceoff" && (
            <motion.div key="faceoff" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="display text-2xl text-white/60">
              🔔 FACE-OFF · TEAM REPS BUZZ NOW
            </motion.div>
          )}
          {state.phase === "faceoff_answer" && state.answerer && (
            <motion.div key="faceoff-answer" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="display text-2xl text-gold">
              🎤 {state.answerer.name.toUpperCase()} BUZZED FIRST · ANSWER NOW
              {state.answerer.endsAt && <Countdown endsAt={state.answerer.endsAt} offsetMs={serverOffsetMs} className="ml-3 text-white/80" />}
            </motion.div>
          )}
          {state.phase === "playing" && state.buzzWinnerName && (
            <motion.div
              key="control"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="display text-2xl"
              style={{ color: controlling?.color }}
            >
              {controlling?.name.toUpperCase()} IN CONTROL · {state.answerHeard ? "ANSWER IN — HOST JUDGING" : `UP NOW: ${state.answerer?.name ?? "—"}`}
              {state.answerer?.endsAt && (
                <Countdown endsAt={state.answerer.endsAt} offsetMs={serverOffsetMs} className="ml-3 text-white/80" />
              )}
            </motion.div>
          )}
          {state.phase === "steal" && state.steal && (
            <motion.div key="steal" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-end gap-2">
              <div className="display text-2xl text-gold">
                STEAL ROUND · {state.steal.endsAt ? <Countdown endsAt={state.steal.endsAt} offsetMs={serverOffsetMs} className="ml-2" /> : null}
              </div>
              <div className="text-right text-sm text-white/55">Other team captains: huddle and lock one secret answer.</div>
              <div className="flex gap-2">
                {state.teams
                  .filter((t) => !t.isControlling)
                  .map((t) => (
                    <span
                      key={t.id}
                      className={cn(
                        "display rounded-full px-3 py-1 text-xs",
                        state.steal!.submittedTeamIds.includes(t.id)
                          ? "bg-emerald-500/20 text-emerald-300 line-through"
                          : "border border-white/15 text-white/50",
                      )}
                    >
                      {state.steal!.submittedTeamIds.includes(t.id) ? `${t.name} locked ✓` : `${t.name} huddling…`}
                    </span>
                  ))}
              </div>
            </motion.div>
          )}
          {state.phase === "steal_reveal" && (
            <motion.div key="reveal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="display text-2xl text-neon">
              reveal the steals!
            </motion.div>
          )}
          {state.phase === "steal_tiebreak" && state.tiebreak && (
            <motion.div key="rps" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="display text-2xl text-gold">
              STEAL TIE · CAPTAINS THROW ROCK · PAPER · SCISSORS
              {state.tiebreak.endsAt && <Countdown endsAt={state.tiebreak.endsAt} offsetMs={serverOffsetMs} className="ml-3 text-white/80" />}
            </motion.div>
          )}
          {state.phase === "steal_tiebreak_reveal" && state.tiebreak && (
            <motion.div key="rps-reveal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="display text-2xl text-neon">
              {state.tiebreak.winnerTeamId
                ? `${state.teams.find((team) => team.id === state.tiebreak!.winnerTeamId)?.name} WINS THE TIE-BREAK!`
                : "RPS TIED · THROW AGAIN!"}
            </motion.div>
          )}
          {state.phase === "round_over" && state.lastAward && (
            <motion.div
              key={`${state.lastAward.teamId}-${state.lastAward.points}-${state.roundIndex}`}
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 260, damping: 18 }}
              className="display rounded-2xl border border-gold/60 bg-gold/10 px-6 py-3 text-3xl text-gold"
            >
              {state.lastAward.teamName} banks {state.lastAward.points}!
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {state.phase === "steal" && state.steal?.endsAt && (
        <CountdownBar endsAt={state.steal.endsAt} durationMs={state.steal.durationMs} offsetMs={serverOffsetMs} />
      )}

      {state.phase === "steal_reveal" && state.steal?.results && (
        <div className="grid grid-cols-2 gap-3">
          {state.steal.results.map((r) => {
            const team = state.teams.find((t) => t.id === r.teamId)!;
            return (
              <motion.div
                key={r.teamId}
                initial={{ rotateX: 90, opacity: 0 }}
                animate={{ rotateX: 0, opacity: 1 }}
                className="rounded-2xl border p-5 text-center"
                style={{ borderColor: team.color, background: `${team.color}18` }}
              >
                <div className="display text-lg" style={{ color: team.color }}>
                  {team.name}&apos;s steal answer
                </div>
                <div className="display mt-2 text-3xl text-white">“{r.text}”</div>
              </motion.div>
            );
          })}
        </div>
      )}

      {(state.phase === "steal_tiebreak_reveal" || state.phase === "round_over") && state.tiebreak?.choices && (
        <div className="grid grid-cols-2 gap-3">
          {state.tiebreak.choices.map((choice) => {
            const team = state.teams.find((candidate) => candidate.id === choice.teamId)!;
            const icon = choice.choice === "rock" ? "✊" : choice.choice === "paper" ? "✋" : "✌️";
            return (
              <div key={choice.teamId} className="rounded-2xl border border-white/15 bg-white/[0.05] p-3 text-center">
                <div className="display text-base" style={{ color: team.color }}>{team.name}</div>
                <div className="display mt-1 text-3xl text-white">{icon} {choice.choice}</div>
              </div>
            );
          })}
        </div>
      )}

      <Scoreboard state={state} />
    </div>
  );
}

// ---------------------------------------------------------------- game over

function GameOver({ state }: { state: PublicState }) {
  const winner = state.teams.find((t) => t.id === state.winnerTeamId) ?? state.teams[0];
  return (
    <div className="tv tv-stage relative flex flex-col items-center justify-center overflow-hidden">
      {["🎉", "🎊", "🥳", "✨", "🏆", "🎉", "🎊", "✨"].map((e, i) => (
        <motion.span
          key={i}
          className="absolute text-4xl"
          initial={{ y: "-10vh", x: `${(i * 13) % 100 - 50}vw`, opacity: 1 }}
          animate={{ y: "110vh", rotate: 360 }}
          transition={{ duration: 4 + i * 0.6, repeat: Infinity, delay: i * 0.4, ease: "linear" }}
        >
          {e}
        </motion.span>
      ))}
      <div className="display text-2xl text-white/50">your champions</div>
      <div className="display text-7xl" style={{ color: winner.color }}>
        {winner.name}
      </div>
      <Scoreboard state={state} />
    </div>
  );
}
