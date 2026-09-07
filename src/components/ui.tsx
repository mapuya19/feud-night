"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import type { PublicTeam } from "@shared/projection";

// ------------------------------------------------------------------ button

export function Button({
  children,
  onClick,
  variant = "default",
  className,
  disabled,
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "default" | "primary" | "danger" | "ghost" | "gold";
  className?: string;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  const variants = {
    default: "bg-card-2 hover:bg-line text-white border border-line",
    primary: "bg-blue-600 hover:bg-blue-500 text-white border border-blue-400/40",
    danger: "bg-red-600 hover:bg-red-500 text-white border border-red-400/40",
    gold: "bg-gold hover:brightness-110 text-black border border-yellow-300/60",
    ghost: "bg-transparent hover:bg-card-2 text-white/70 border border-line",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "display rounded-xl px-4 py-2.5 text-sm transition-all active:scale-[0.97]",
        "disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100",
        variants[variant],
        className,
      )}
    >
      {children}
    </button>
  );
}

// ------------------------------------------------------------------ badge

export function TeamBadge({ team, className }: { team: PublicTeam; className?: string }) {
  return (
    <span
      className={cn("display inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs", className)}
      style={{ backgroundColor: `${team.color}26`, color: team.color, border: `1px solid ${team.color}80` }}
    >
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: team.color }} />
      {team.name}
    </span>
  );
}

// ------------------------------------------------------------------ status

export function StatusDot({ status }: { status: "connected" | "reconnecting" | "connecting" | "idle" | "error" }) {
  const color =
    status === "connected" ? "bg-emerald-400" : status === "error" ? "bg-red-500" : "bg-amber-400 animate-pulse";
  return <span className={cn("inline-block h-2 w-2 rounded-full", color)} />;
}

// --------------------------------------------------------------- countdown

/**
 * Server-synced countdown. `endsAt` is a server-epoch deadline; `offsetMs`
 * is (serverTime - clientTime) captured at the last state push, so every
 * phone counts down in lockstep without extra traffic.
 */
export function Countdown({
  endsAt,
  offsetMs = 0,
  className,
  onExpire,
}: {
  endsAt: number;
  offsetMs?: number;
  className?: string;
  onExpire?: () => void;
}) {
  const [now, setNow] = useState(() => Date.now() + offsetMs);
  const fired = useRef(false);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() + offsetMs), 150);
    return () => clearInterval(t);
  }, [offsetMs]);
  const left = Math.max(0, endsAt - now);
  const seconds = Math.ceil(left / 1000);
  useEffect(() => {
    if (left <= 0 && !fired.current) {
      fired.current = true;
      onExpire?.();
    }
  }, [left, onExpire]);
  return (
    <span className={cn("display tabular-nums", seconds <= 5 ? "text-red-400" : "", className)}>
      {seconds}s
    </span>
  );
}

/** Progress bar matched to a Countdown deadline. */
export function CountdownBar({
  endsAt,
  durationMs = 15000,
  offsetMs = 0,
  className,
}: {
  endsAt: number;
  durationMs?: number;
  offsetMs?: number;
  className?: string;
}) {
  const [frac, setFrac] = useState(1);
  useEffect(() => {
    const tick = () => {
      setFrac(Math.max(0, Math.min(1, (endsAt - (Date.now() + offsetMs)) / durationMs)));
    };
    tick();
    const t = setInterval(tick, 150);
    return () => clearInterval(t);
  }, [endsAt, durationMs, offsetMs]);
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-line", className)}>
      <div
        className={cn("h-full rounded-full transition-none", frac < 0.25 ? "bg-red-500" : "bg-gold")}
        style={{ width: `${frac * 100}%` }}
      />
    </div>
  );
}

// ------------------------------------------------------------------- misc

export function ErrorToast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3500);
    return () => clearTimeout(t);
  }, [message, onDone]);
  return (
    <div className="animate-pop-in fixed inset-x-4 top-4 z-50 rounded-xl border border-red-500/50 bg-red-950/90 px-4 py-3 text-sm text-red-200 shadow-lg">
      {message}
    </div>
  );
}

export const PHASE_LABEL: Record<string, string> = {
  lobby: "Lobby",
  faceoff: "Face-Off",
  playing: "Playing",
  steal: "Steal!",
  steal_reveal: "Steal Results",
  round_over: "Round Over",
  fast_money_intro: "Fast Money",
  fast_money: "Fast Money",
  fast_money_reveal: "Fast Money",
  game_over: "Game Over",
};
