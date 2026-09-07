"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useFeud } from "@/lib/store";
import { cn } from "@/lib/cn";
import { Button, Countdown, PHASE_LABEL, StatusDot, TeamBadge } from "@/components/ui";
import type { PublicState } from "@shared/projection";
import { recallName } from "@/lib/identity";

export function PhoneView({ code }: { code: string }) {
  const { status, playerId, playerName, state, join } = useFeud();

  if (status === "error") {
    return <Centered>⚠️ Can&apos;t reach the game server. Check your Wi-Fi.</Centered>;
  }
  if (!state) return <Centered>Connecting to room {code}…</Centered>;
  if (!playerId) return <JoinScreen onJoin={join} defaultName={recallName()} />;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-4 pb-10 pt-4">
      <PhoneHeader state={state} name={playerName ?? ""} />
      <AnimatePresence mode="wait">
        <motion.div key={state.phase} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
          <PhasePanel state={state} />
        </motion.div>
      </AnimatePresence>
      {state.question?.prompt && state.phase !== "lobby" && (
        <p className="display rounded-xl border border-white/10 bg-white/[0.045] backdrop-blur-xl p-4 text-center text-lg leading-snug text-white/80">
          {state.question.prompt}
        </p>
      )}
      <MiniBoard state={state} />
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-dvh items-center justify-center p-6 text-center text-white/60">{children}</div>;
}

// ------------------------------------------------------------------- join

function JoinScreen({ onJoin, defaultName }: { onJoin: (name: string) => void; defaultName: string }) {
  const [name, setName] = useState(defaultName);
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-7 p-6">
      <div className="text-center">
        <h1 className="display text-5xl">
          Feud{" "}
          <span className="bg-gradient-to-r from-gold via-gold-soft to-tangerine bg-clip-text text-transparent">Night</span>
        </h1>
        <p className="mt-2 text-sm text-paper/50">You&apos;re in. Pick a name your team can chant.</p>
      </div>
      <form
        className="flex w-full flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onJoin(name);
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={16}
          placeholder="Your name"
          autoFocus
          className="field display text-center text-xl"
        />
        <Button type="submit" variant="gold" className="w-full py-4 text-base">
          Let&apos;s go
        </Button>
      </form>
    </div>
  );
}

// ----------------------------------------------------------------- header

function PhoneHeader({ state, name }: { state: PublicState; name: string }) {
  const { status } = useFeud();
  const team = state.teams.find((t) => t.id === state.myTeamId);
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.045] backdrop-blur-xl px-4 py-3">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="truncate text-sm font-semibold text-white/80">{name}</span>
        {team && <TeamBadge team={team} className="w-fit" />}
      </div>
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-1.5 text-[11px] text-white/40">
          <StatusDot status={status} />
          {status === "connected" ? "live" : status}
        </div>
        <span className="display text-2xl tabular-nums text-white">{team?.score ?? 0}</span>
      </div>
    </div>
  );
}

function useTeam(): PublicState["teams"][number] | null {
  const { state } = useFeud();
  if (!state?.myTeamId) return null;
  return state.teams.find((t) => t.id === state.myTeamId) ?? null;
}

// ------------------------------------------------------------- phase panel

function PhasePanel({ state }: { state: PublicState }) {
  const { playerId, playerAction } = useFeud();
  switch (state.phase) {
    case "lobby":
      return <LobbyPanel state={state} />;
    case "faceoff":
      return <FaceoffPanel state={state} />;
    case "playing":
      return <PlayingPanel state={state} />;
    case "steal":
      return <StealPanel state={state} />;
    case "steal_reveal":
      return <StealRevealPanel state={state} />;
    case "round_over":
      return (
        <Centered>
          <div className="flex flex-col items-center gap-2">
            <span className="display text-2xl text-gold">
              {state.lastAward ? `${state.lastAward.teamName} +${state.lastAward.points}` : "Round over"}
            </span>
            <span className="text-white/40">host is setting up the next round…</span>
          </div>
        </Centered>
      );
    case "fast_money_intro":
      return <Centered>⚡ {state.teams.find((t) => t.id === state.winnerTeamId)?.name} is going for Fast Money!</Centered>;
    case "fast_money":
      return <FastMoneyPanel state={state} />;
    case "fast_money_reveal":
      return <Centered>📺 Watch the TV — Fast Money results!</Centered>;
    case "game_over":
      return <Centered>🏆 That&apos;s the game! Final scores on the board.</Centered>;
    default:
      return <Centered>{PHASE_LABEL[state.phase] ?? ""}</Centered>;
  }
}

function LobbyPanel({ state }: { state: PublicState }) {
  const myTeam = useTeam();
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.045] backdrop-blur-xl p-4">
      <div className="display text-lg text-white/70">You&apos;re on</div>
      {myTeam ? (
        <>
          <div className="display text-3xl" style={{ color: myTeam.color }}>
            {myTeam.name}
          </div>
          <div className="mt-1 grid grid-cols-2 gap-2 text-xs text-white/50">
            <div className="rounded-lg bg-white/[0.04] px-2.5 py-2">
              <span className="label block text-[9px]">👑 Captain</span>
              <span className="mt-0.5 block truncate text-white/80">{myTeam.captainName ?? "—"}</span>
            </div>
            <div className="rounded-lg bg-white/[0.04] px-2.5 py-2">
              <span className="label block text-[9px]">🔔 Face-off rep</span>
              <span className="mt-0.5 block truncate text-white/80">{myTeam.repName ?? "Set next round"}</span>
            </div>
          </div>
        </>
      ) : (
        <div className="text-sm text-white/50">Assigning…</div>
      )}
      <div className="display mt-2 animate-pulse text-sm text-gold">waiting for the host to start…</div>
    </div>
  );
}

// ---------------------------------------------------------------- faceoff

function FaceoffPanel({ state }: { state: PublicState }) {
  const { playerAction, playerName } = useFeud();
  const myTeam = useTeam();
  const amRep = !!myTeam?.repName && myTeam.repName === playerName;
  if (amRep) {
    return (
      <div className="flex flex-col items-center gap-3">
        <p className="display text-center text-lg text-white/70">You&apos;re up. First to buzz takes control!</p>
        <motion.button
          whileTap={{ scale: 0.94 }}
          onClick={() => playerAction({ type: "buzz" })}
          className="no-select display h-44 w-full rounded-3xl border-4 border-red-300/60 bg-gradient-to-b from-red-500 to-red-700 text-4xl text-white animate-buzz-glow"
        >
          BUZZ
        </motion.button>
      </div>
    );
  }
  return (
    <Centered>
      <div className="flex flex-col items-center gap-2">
        <span className="display text-xl text-white/60">🔔 Face-off in progress…</span>
        <span className="text-sm text-white/35">
          Reps: {state.teams.map((t) => t.repName ?? "—").join(" vs ")}
        </span>
      </div>
    </Centered>
  );
}

// ---------------------------------------------------------------- playing

function PlayingPanel({ state }: { state: PublicState }) {
  const { playerAction, playerName } = useFeud();
  const myTeam = useTeam();
  const isMyTeam = !!myTeam?.isControlling;
  const isCaptain = myTeam?.captainName === playerName;

  if (!isMyTeam) {
    return (
      <Centered>
        <div className="flex flex-col items-center gap-2">
          <span className="display text-xl" style={{ color: state.teams.find((t) => t.isControlling)?.color }}>
            {state.teams.find((t) => t.isControlling)?.name} has control
          </span>
          <span className="text-sm text-white/40">Watch the board — your steal could be next.</span>
        </div>
      </Centered>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="display rounded-2xl border border-gold/40 bg-gold/10 p-3 text-center text-xl text-gold">
        YOUR TEAM IS UP · {state.strikes} strike{state.strikes === 1 ? "" : "s"}
      </div>

      <SuggestBox />

      {state.suggestions.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-xs uppercase tracking-widest text-white/40">team suggestions</span>
          <div className="flex flex-wrap gap-2">
            {state.suggestions.map((s, i) => (
              <span key={i} className="rounded-full border border-white/10 bg-white/[0.045] backdrop-blur-xl px-3 py-1.5 text-sm text-white/80">
                “{s.text}” <span className="text-white/35">— {s.byName}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {isCaptain && <CaptainLock />}
    </div>
  );
}
// ---------------------------------------------------------------- playing

function SuggestBox() {
  const { playerAction } = useFeud();
  const [text, setText] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim()) return;
        playerAction({ type: "suggest", text });
        setSent(text.trim());
        setText("");
      }}
    >
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={60}
        placeholder="Shout an answer here…"
        className="field min-w-0 flex-1"
      />
      <Button variant="primary" type="submit" disabled={!text.trim()}>
        Send
      </Button>
      {sent && <span className="sr-only">sent</span>}
    </form>
  );
}

function CaptainLock() {
  const { state, playerAction } = useFeud();
  const [text, setText] = useState("");
  const pending = state?.pendingAnswer;
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-neon/40 bg-neon/5 p-3">
      <span className="text-xs uppercase tracking-widest text-neon">👑 captain — lock the official answer</span>
      {state?.suggestions && state.suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {state.suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => setText(s.text)}
              className="display rounded-full border border-white/10 bg-white/[0.045] backdrop-blur-xl px-3 py-1.5 text-xs text-white/80 active:scale-95"
            >
              {s.text}
            </button>
          ))}
        </div>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          playerAction({ type: "lock_answer", text });
        }}
      >
        <input
          value={pending ? pending.text : text}
          onChange={(e) => setText(e.target.value)}
          maxLength={60}
          placeholder="Final answer…"
          className="field min-w-0 flex-1 font-semibold focus:border-neon/70 focus:ring-neon/25"
        />
        <Button variant="gold" type="submit" disabled={!text.trim() && !pending}>
          Lock it
        </Button>
      </form>
      {pending && <span className="text-center text-xs text-white/40">“{pending.text}” is in — awaiting host…</span>}
    </div>
  );
}

// ------------------------------------------------------------------ steal

function StealPanel({ state }: { state: PublicState }) {
  const { serverOffsetMs, playerName, playerAction } = useFeud();
  const myTeam = useTeam();
  const steal = state.steal;
  const isStealingTeam = !!myTeam && !myTeam.isControlling;
  const isCaptain = myTeam?.captainName === playerName;
  const submitted = !!steal && !!myTeam && steal.submittedTeamIds.includes(myTeam.id);

  if (!isStealingTeam) {
    return (
      <Centered>
        <span className="display text-xl text-red-400">✕✕✕ Three strikes! Your team is defending the bank…</span>
      </Centered>
    );
  }
  if (submitted || steal?.mySubmission) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-6 text-center">
        <span className="display text-xl text-emerald-300">🔒 Answer locked: “{steal?.mySubmission}”</span>
        <span className="text-sm text-white/50">No takebacks. Look confident.</span>
      </div>
    );
  }
  if (!isCaptain) {
    return (
      <Centered>
        <div className="flex flex-col items-center gap-2">
          <span className="display text-2xl text-gold">STEAL CHANCE!</span>
          {steal?.endsAt && <Countdown endsAt={steal.endsAt} offsetMs={serverOffsetMs} className="text-5xl" />}
          <span className="text-sm text-white/40">Yell suggestions at your captain — they submit.</span>
        </div>
      </Centered>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between rounded-2xl border border-gold/50 bg-gold/10 p-3">
        <span className="display text-xl text-gold">🥷 CAPTAIN — THE STEAL IS YOURS</span>
        {steal?.endsAt && <Countdown endsAt={steal.endsAt} offsetMs={serverOffsetMs} className="text-3xl" />}
      </div>
      <div className="mt-1 flex items-center gap-2 text-xs text-white/50">
        <span>👑 Captain: {myTeam?.captainName ?? "—"}</span>
        <span className="text-white/20">•</span>
        <span>🔔 Rep: {myTeam?.repName ?? "—"}</span>
      </div>
      <StealForm onSubmit={(text) => playerAction({ type: "submit_steal", text })} />
      <p className="text-center text-xs text-white/40">Both teams correct? The higher-ranked board answer wins the bank.</p>
    </div>
  );
}

function StealForm({ onSubmit }: { onSubmit: (text: string) => void }) {
  const [text, setText] = useState("");
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) onSubmit(text);
      }}
    >
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={60}
        placeholder="Secret steal answer…"
        autoFocus
        className="field min-w-0 flex-1 border-gold/50 text-lg font-semibold focus:border-gold/70"
      />
      <Button variant="gold" type="submit" className="px-6" disabled={!text.trim()}>
        Steal!
      </Button>
    </form>
  );
}

function StealRevealPanel({ state }: { state: PublicState }) {
  const results = state.steal?.results;
  if (!results) return <Centered>Revealing steals…</Centered>;
  return (
    <div className="flex flex-col gap-3">
      {results.map((r) => {
        const team = state.teams.find((t) => t.id === r.teamId);
        return (
          <div key={r.teamId} className="rounded-2xl border p-4" style={{ borderColor: team?.color, background: `${team?.color}12` }}>
            <div className="display text-sm" style={{ color: team?.color }}>
              {team?.name}
            </div>
            <div className="display text-xl text-white">“{r.text}”</div>
          </div>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------ fast money

function FastMoneyPanel({ state }: { state: PublicState }) {
  const { serverOffsetMs, playerName, playerAction } = useFeud();
  const fm = state.fastMoney!;
  const amActive = fm.activePlayerName === playerName && fm.myAnswerState !== null;
  if (fm.myAnswerState === "submitted") {
    return <Centered>✅ Answer in — {fm.activePlayerName}, stay dramatic.</Centered>;
  }
  if (amActive) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between rounded-2xl border border-gold/40 bg-gold/10 p-3">
          <span className="display text-lg text-gold">⚡ Q{fm.questionIndex + 1}</span>
          {fm.timer && <Countdown endsAt={fm.timer.endsAt} offsetMs={serverOffsetMs} className="text-3xl" />}
        </div>
        {fm.prompt && <p className="display text-center text-xl text-white">{fm.prompt}</p>}
        <FmForm onSubmit={(text) => playerAction({ type: "fm_answer", text })} />
      </div>
    );
  }
  return <Centered>⚡ {fm.activePlayerName} is answering. No pressure from the peanut gallery.</Centered>;
}

function FmForm({ onSubmit }: { onSubmit: (text: string) => void }) {
  const [text, setText] = useState("");
  const ref = useRef("");
  useEffect(() => {
    ref.current = text;
  }, [text]);
  // Auto-submit whatever's typed when we unmount (question moved on).
  useEffect(() => {
    return () => {
      if (ref.current.trim()) onSubmit(ref.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) onSubmit(text);
      }}
    >
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={60}
        placeholder="Blurt it out…"
        autoFocus
        className="field min-w-0 flex-1 text-lg font-semibold"
      />
      <Button variant="gold" type="submit" className="px-6" disabled={!text.trim()}>
        Answer
      </Button>
    </form>
  );
}

// ------------------------------------------------------------- mini board

function MiniBoard({ state }: { state: PublicState }) {
  const q = state.question;
  if (!q || state.phase === "lobby") return null;
  return (
    <div className="mt-auto flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-[11px] uppercase tracking-widest text-white/35">
        <span>board</span>
        <span className="text-gold">bank {q.bank}</span>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {q.slots.map((s, i) => (
          <div
            key={i}
            className={cn(
              "flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs",
              s.revealed ? "bg-blue-600/80 text-white" : "bg-white/[0.06] text-white/25",
            )}
          >
            <span className="display truncate">{s.revealed ? s.text : i + 1}</span>
            <span className="display shrink-0 tabular-nums">{s.points}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
