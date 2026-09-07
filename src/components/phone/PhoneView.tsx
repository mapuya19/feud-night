"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useFeud } from "@/lib/store";
import { cn } from "@/lib/cn";
import { Button, Countdown, PHASE_LABEL, StatusDot, TeamBadge } from "@/components/ui";
import type { PublicState } from "@shared/projection";
import { recallName } from "@/lib/identity";
import { MAX_TEAM_PLAYERS } from "@shared/config";

export function PhoneView({ code }: { code: string }) {
  const { status, playerId, playerName, state, join, lastError } = useFeud();

  if (status === "error") {
    return <Centered fullScreen>⚠️ {lastError ?? "Can't reach the game server. Check your Wi-Fi."}</Centered>;
  }
  if (!state) return <Centered fullScreen>Connecting to room {code}…</Centered>;
  if (!playerId) return <JoinScreen state={state} onJoin={join} defaultName={recallName()} />;

  return (
    <div className="phone-shell mx-auto flex w-full max-w-md flex-col gap-4">
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

function Centered({ children, fullScreen = false }: { children: React.ReactNode; fullScreen?: boolean }) {
  return (
    <div className={cn("flex items-center justify-center p-6 text-center text-white/60", fullScreen ? "min-h-dvh" : "min-h-48")}>
      {children}
    </div>
  );
}

// ------------------------------------------------------------------- join

function JoinScreen({
  state,
  onJoin,
  defaultName,
}: {
  state: PublicState;
  onJoin: (name: string, teamId: string, claimCaptain: boolean) => void;
  defaultName: string;
}) {
  const [name, setName] = useState(defaultName);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [claimCaptain, setClaimCaptain] = useState(false);
  const selected = state.teams.find((team) => team.id === teamId);
  const captainAvailable = !!selected && !selected.captainName;
  return (
    <div className="phone-shell mx-auto flex w-full max-w-md flex-col justify-center gap-6">
      <div className="text-center">
        <h1 className="display text-5xl">
          Feud{" "}
          <span className="bg-gradient-to-r from-gold via-gold-soft to-tangerine bg-clip-text text-transparent">Night</span>
        </h1>
        <p className="mt-2 text-sm text-paper/50">Pick your squad before the host locks the roster.</p>
      </div>
      <form
        className="flex w-full flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim() && teamId) onJoin(name, teamId, claimCaptain && captainAvailable);
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={16}
          placeholder="Your name"
          autoComplete="name"
          autoCapitalize="words"
          autoFocus
          className="field display text-center text-xl"
        />
        <div className="grid grid-cols-2 gap-2">
          {state.teams.map((team) => {
            const full = team.playerCount >= MAX_TEAM_PLAYERS;
            const active = team.id === teamId;
            return (
              <button
                key={team.id}
                type="button"
                disabled={full}
                onClick={() => {
                  setTeamId(team.id);
                  setClaimCaptain(false);
                }}
                className={cn(
                  "min-h-20 touch-manipulation rounded-2xl border p-3 text-left transition",
                  active ? "bg-white/10" : "border-white/10 bg-white/[0.035] hover:bg-white/[0.08]",
                  full && "cursor-not-allowed opacity-35",
                )}
                aria-pressed={active}
                style={active ? { borderColor: team.color, boxShadow: `0 0 20px ${team.color}33` } : undefined}
              >
                <span className="display block text-base" style={{ color: team.color }}>{team.name}</span>
                <span className="mt-1 block text-xs text-white/45">{full ? "full" : `${team.playerCount}/${MAX_TEAM_PLAYERS} players`}</span>
                <span className="mt-1 block truncate text-[10px] text-white/35">{team.captainName ? `👑 ${team.captainName}` : "Captain spot open"}</span>
              </button>
            );
          })}
        </div>
        {selected && (
          <label className={cn("flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-xs", captainAvailable ? "border-gold/20 bg-gold/[0.06] text-paper/65" : "border-white/10 text-white/35")}>
            <input
              type="checkbox"
              checked={claimCaptain && captainAvailable}
              disabled={!captainAvailable}
              onChange={(e) => setClaimCaptain(e.target.checked)}
            />
            {captainAvailable ? "👑 I’ll be the provisional captain (I can step down before the host starts)." : `👑 ${selected.captainName} is the provisional captain.`}
          </label>
        )}
        <Button type="submit" variant="gold" disabled={!teamId || !name.trim()} className="w-full py-4 text-base">
          Join {selected?.name ?? "a team"}
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
    case "game_over":
      return <Centered>🏆 That&apos;s the game! Final scores on the board.</Centered>;
    default:
      return <Centered>{PHASE_LABEL[state.phase] ?? ""}</Centered>;
  }
}

function LobbyPanel({ state }: { state: PublicState }) {
  const { playerAction } = useFeud();
  const myTeam = useTeam();
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.045] backdrop-blur-xl p-4">
      <div>
        <div className="display text-lg text-white/70">Roster is open</div>
        <p className="mt-1 text-xs text-white/45">Pick a squad or claim captain before the host locks teams.</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {state.teams.map((team) => {
          const active = team.id === state.myTeamId;
          const full = team.playerCount >= MAX_TEAM_PLAYERS;
          return (
            <button
              key={team.id}
              disabled={active || full}
              onClick={() => playerAction({ type: "choose_team", teamId: team.id })}
              className={cn(
                "min-h-16 touch-manipulation rounded-xl border p-2.5 text-left transition",
                active ? "bg-white/[0.1]" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.08]",
                (active || full) && "cursor-default",
                full && !active && "opacity-35",
              )}
              aria-pressed={active}
              style={active ? { borderColor: team.color } : undefined}
            >
              <span className="display block text-sm" style={{ color: team.color }}>{team.name}</span>
              <span className="mt-1 block text-[10px] text-white/45">{active ? "your team" : full ? "full" : `${team.playerCount}/${MAX_TEAM_PLAYERS} players`}</span>
            </button>
          );
        })}
      </div>
      {myTeam && (
        <>
          <div className="grid grid-cols-2 gap-2 text-xs text-white/50">
            <div className="rounded-lg bg-white/[0.04] px-2.5 py-2">
              <span className="label block text-[9px]">👑 Captain</span>
              <span className="mt-0.5 block truncate text-white/80">{myTeam.captainName ?? "Open — volunteer?"}</span>
            </div>
            <div className="rounded-lg bg-white/[0.04] px-2.5 py-2">
              <span className="label block text-[9px]">🔔 Face-off rep</span>
              <span className="mt-0.5 block truncate text-white/80">Set when the game starts</span>
            </div>
          </div>
          {state.myIsCaptain ? (
            <Button variant="ghost" className="w-full text-sm" onClick={() => playerAction({ type: "release_captain" })}>
              Step down as captain
            </Button>
          ) : !myTeam.captainName ? (
            <Button variant="gold" className="w-full text-sm" onClick={() => playerAction({ type: "claim_captain" })}>
              👑 Claim captain
            </Button>
          ) : null}
        </>
      )}
      <div className="display mt-1 animate-pulse text-sm text-gold">waiting for the host to lock teams…</div>
    </div>
  );
}

// ---------------------------------------------------------------- faceoff

function FaceoffPanel({ state }: { state: PublicState }) {
  const { playerAction } = useFeud();
  const myTeam = useTeam();
  const amRep = state.myIsRep;
  if (amRep) {
    return (
      <div className="flex flex-col items-center gap-3">
        <p className="display text-center text-lg text-white/70">You&apos;re up. First to buzz takes control!</p>
        <motion.button
          whileTap={{ scale: 0.94 }}
          onClick={() => playerAction({ type: "buzz" })}
          aria-label="Buzz in for your team"
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
          Reps: {state.teams.map((t) => t.repName ?? "—").join(" vs ")}. Only reps can buzz.
        </span>
      </div>
    </Centered>
  );
}

// ---------------------------------------------------------------- playing

function PlayingPanel({ state }: { state: PublicState }) {
  const { playerAction } = useFeud();
  const myTeam = useTeam();
  const isMyTeam = !!myTeam?.isControlling;
  const isCaptain = state.myIsCaptain;

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

      <p className="text-center text-sm text-white/50">Everyone sends suggestions. Your captain chooses one official answer for the host.</p>

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
        autoCapitalize="sentences"
        enterKeyHint="send"
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
              className="display min-h-11 touch-manipulation rounded-full border border-white/10 bg-white/[0.045] backdrop-blur-xl px-3 py-1.5 text-xs text-white/80 active:scale-95"
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
          autoCapitalize="sentences"
          enterKeyHint="send"
          className="field min-w-0 flex-1 font-semibold focus:border-neon/70 focus:ring-neon/25"
        />
        <Button variant="gold" type="submit" disabled={!text.trim() && !pending}>
          Lock it
        </Button>
      </form>
      {pending && <span role="status" className="text-center text-xs text-white/40">“{pending.text}” is in — awaiting host…</span>}
    </div>
  );
}

// ------------------------------------------------------------------ steal

function StealPanel({ state }: { state: PublicState }) {
  const { serverOffsetMs, playerAction } = useFeud();
  const myTeam = useTeam();
  const steal = state.steal;
  const isStealingTeam = !!myTeam && !myTeam.isControlling;
  const isCaptain = state.myIsCaptain;
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
          <span className="text-sm text-white/40">Huddle with your team, then your captain submits one secret answer.</span>
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
      <p className="text-center text-xs text-white/40">If more than one team is correct, the highest-ranked board answer wins the bank.</p>
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
        autoCapitalize="sentences"
        enterKeyHint="send"
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
