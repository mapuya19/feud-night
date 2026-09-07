"use client";

import { QRCodeSVG } from "qrcode.react";
import { AnimatePresence, motion } from "framer-motion";
import { useFeud } from "@/lib/store";
import { cn } from "@/lib/cn";
import { Countdown, CountdownBar, PHASE_LABEL } from "@/components/ui";
import type { PublicSlot, PublicState, PublicTeam } from "@shared/projection";
import { FM_WIN_TARGET } from "@shared/config";

export function BoardView() {
  const { state } = useFeud();
  if (!state) return <Splash text="Connecting…" />;
  switch (state.phase) {
    case "lobby":
      return <LobbyBoard state={state} />;
    case "faceoff":
    case "playing":
    case "steal":
    case "steal_reveal":
    case "round_over":
      return <RoundBoard state={state} />;
    case "fast_money_intro":
      return <FastMoneyIntro state={state} />;
    case "fast_money":
      return <FastMoneyLive state={state} />;
    case "fast_money_reveal":
      return <FastMoneyReveal state={state} />;
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
  return (
    <div className="grid grid-cols-3 gap-3">
      {state.teams.map((t: PublicTeam) => (
        <div
          key={t.id}
          className={cn(
            "rounded-2xl border bg-card px-4 py-3 transition-all duration-300",
            t.isControlling ? "scale-[1.03] shadow-lg" : "border-white/15",
          )}
          style={t.isControlling ? { borderColor: t.color, boxShadow: `0 0 32px ${t.color}55` } : undefined}
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="display truncate text-lg" style={{ color: t.color }}>
              {t.name}
            </span>
            <motion.span key={t.score} initial={{ scale: 1.6, color: "#f5c518" }} animate={{ scale: 1, color: "#ffffff" }} className="display text-3xl tabular-nums">
              {t.score}
            </motion.span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-white/40">
            <span>{t.playerCount} players</span>
            {t.captainName && <span className="truncate">· 👑 {t.captainName}</span>}
            {t.repName && <span className="truncate">· 🔔 {t.repName}</span>}
          </div>
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
    <div className="tv flex flex-col items-center justify-center gap-10 p-10">
      <div>
        <h1 className="display text-center text-7xl text-gold drop-shadow-[0_4px_24px_rgba(245,197,24,0.3)]">
          Feud Night
        </h1>
        <p className="display mt-2 text-center text-lg text-white/50">3 teams · one apartment · total chaos</p>
      </div>
      <div className="flex items-center gap-10 rounded-3xl border border-white/10 bg-white/[0.045] backdrop-blur-xl p-10">
        <div className="flex flex-col items-center gap-3">
          {joinUrl && <QRCodeSVG value={joinUrl} size={220} bgColor="#12121e" fgColor="#f4f4f8" level="M" />}
          <span className="text-xs text-white/40">scan to join</span>
        </div>
        <div className="flex flex-col items-center gap-2">
          <span className="text-xs uppercase tracking-widest text-white/40">room code</span>
          <span className="display text-7xl tracking-[0.3em] text-white">{state.code}</span>
          <span className="mt-3 text-sm text-white/50">{state.teams.reduce((n, t) => n + t.playerCount, 0)} players in</span>
        </div>
      </div>
      <div className="grid w-full max-w-3xl grid-cols-3 gap-3">
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
        "flex h-full items-center gap-4 rounded-xl border px-5 py-3",
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
            className="display flex-1 truncate text-xl text-white sm:text-2xl"
          >
            {slot.text}
          </motion.span>
        ) : (
          <motion.span key="hidden" className="flex-1" />
        )}
      </AnimatePresence>
      <span className={cn("display shrink-0 text-xl tabular-nums", slot.revealed ? "text-gold" : "text-white/30")}>
        {slot.points}
      </span>
    </motion.div>
  );
}

function RoundBoard({ state }: { state: PublicState }) {
  const { serverOffsetMs } = useFeud();
  const q = state.question;
  const controlling = state.teams.find((t) => t.isControlling);
  return (
    <div className="tv flex flex-col gap-4 p-6">
      <div className="flex items-start justify-between gap-4">
        <RoundTag state={state} />
        {state.question && (
          <div className="display rounded-2xl border border-gold/40 bg-gold/10 px-5 py-2 text-2xl text-gold tabular-nums shadow-[0_0_28px_rgba(245,197,24,0.15)]">
            bank {state.question.bank}
          </div>
        )}
      </div>

      {q && (
        <h2 className="display max-w-5xl text-balance text-3xl leading-[1.05] text-paper drop-shadow-[0_2px_18px_rgba(0,0,0,0.6)] sm:text-4xl">
          {q.prompt}
        </h2>
      )}

      <div className="grid flex-1 grid-cols-2 content-stretch gap-3">
        {q?.slots.map((slot, i) => (
          <Slot key={i} slot={slot} index={i} />
        ))}
      </div>

      <div className="flex items-center justify-between gap-6">
        <Strikes count={state.strikes} />
        <AnimatePresence mode="wait">
          {state.phase === "faceoff" && (
            <motion.div key="faceoff" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="display text-2xl text-white/60">
              🔔 first to buzz takes control…
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
              {controlling?.name} — {state.buzzWinnerName} buzzed in!
            </motion.div>
          )}
          {state.phase === "steal" && state.steal && (
            <motion.div key="steal" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-end gap-2">
              <div className="display text-2xl text-gold">
                STEAL! {state.steal.endsAt ? <Countdown endsAt={state.steal.endsAt} offsetMs={serverOffsetMs} className="ml-2" /> : null}
              </div>
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

      <Scoreboard state={state} />
    </div>
  );
}

// -------------------------------------------------------------- fast money

function FastMoneyIntro({ state }: { state: PublicState }) {
  const winner = state.teams.find((t) => t.id === state.winnerTeamId) ?? state.teams[0];
  return (
    <div className="tv flex flex-col items-center justify-center gap-6 p-10">
      <div className="display text-3xl text-white/50">winning team</div>
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 16 }}
        className="display rounded-3xl border-4 px-12 py-8 text-6xl"
        style={{ borderColor: winner.color, color: winner.color, background: `${winner.color}14` }}
      >
        {winner.name}
      </motion.div>
      <div className="display animate-pulse text-4xl text-gold">⚡ FAST MONEY ⚡</div>
      <p className="max-w-md text-center text-white/50">
        Host picks two players. Everyone else: scream wrong answers at them.
      </p>
      <Scoreboard state={state} />
    </div>
  );
}

function FastMoneyLive({ state }: { state: PublicState }) {
  const { serverOffsetMs } = useFeud();
  const fm = state.fastMoney!;
  return (
    <div className="tv flex flex-col items-center justify-center gap-8 p-10">
      <div className="display flex items-center gap-4 text-2xl text-gold">
        ⚡ Fast Money · {fm.activePlayerName} · Q{fm.questionIndex + 1}/{fm.questionCount}
      </div>
      {fm.timer && (
        <div className="flex w-full max-w-2xl flex-col items-center gap-2">
          <Countdown endsAt={fm.timer.endsAt} offsetMs={serverOffsetMs} className="text-7xl" />
          <CountdownBar endsAt={fm.timer.endsAt} durationMs={fm.timer.durationMs} offsetMs={serverOffsetMs} />
        </div>
      )}
      {fm.prompt ? (
        <h2 className="display max-w-4xl text-center text-4xl leading-tight text-white sm:text-5xl">{fm.prompt}</h2>
      ) : (
        <div className="display animate-pulse text-3xl text-white/40">waiting for host…</div>
      )}
      <Scoreboard state={state} />
    </div>
  );
}

function FastMoneyReveal({ state }: { state: PublicState }) {
  const fm = state.fastMoney!;
  const step = fm.reveal?.step ?? -1;
  return (
    <div className="tv flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div className="display text-3xl text-gold">⚡ Fast Money Reveal</div>
        <motion.div
          key={fm.reveal?.total}
          initial={{ scale: 1.5 }}
          animate={{ scale: 1 }}
          className={cn("display text-5xl tabular-nums", fm.reveal && fm.reveal.total >= FM_WIN_TARGET ? "text-emerald-400" : "text-white")}
        >
          {fm.reveal?.total ?? 0} / {FM_WIN_TARGET}
        </motion.div>
      </div>
      <div className="grid flex-1 grid-rows-5 gap-2">
        {fm.reveal!.prompts.map((prompt, qi) => {
          const shown = step >= qi;
          return (
            <div key={qi} className={cn("rounded-xl border p-3", shown ? "border-white/15 bg-card" : "border-transparent bg-white/[0.02] opacity-50")}>
              <div className="flex items-center justify-between gap-4">
                <span className="display truncate text-lg text-white/80">{prompt}</span>
                <div className="flex shrink-0 gap-6">
                  {[0, 1].map((pi) => {
                    const row = fm.reveal!.rows[qi][pi];
                    return (
                      <div key={pi} className="w-56 text-right">
                        <div className={cn("display truncate text-lg", row.duplicate ? "text-red-400 line-through" : "text-white")}>
                          {shown ? (row.text || (row.timedOut ? "(time)" : "—")) : "?"}
                        </div>
                        <div className="display text-sm text-gold tabular-nums">{shown ? row.points : "·"}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <Scoreboard state={state} />
    </div>
  );
}

function GameOver({ state }: { state: PublicState }) {
  const winner = state.teams.find((t) => t.id === state.winnerTeamId) ?? state.teams[0];
  const fmTotal = state.fastMoney?.total ?? 0;
  return (
    <div className="tv relative flex flex-col items-center justify-center gap-6 overflow-hidden p-10">
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
      {fmTotal > 0 && (
        <div className="display text-3xl text-gold">Fast Money: {fmTotal} points {fmTotal >= FM_WIN_TARGET ? "— JACKPOT!" : ""}</div>
      )}
      <Scoreboard state={state} />
    </div>
  );
}
