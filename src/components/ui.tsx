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
    default: "btn-ghost",
    primary: "btn-blue",
    danger: "btn-red",
    gold: "btn-gold",
    ghost: "btn-ghost",
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={cn(variants[variant], className)}>
      {children}
    </button>
  );
}

// ------------------------------------------------------------------ badge

export function TeamBadge({ team, className }: { team: PublicTeam; className?: string }) {
  return (
    <span
      className={cn("display inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold", className)}
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
    <span className={cn("display text-3xl tabular-nums", seconds <= 5 ? "text-bubble" : "text-paper/90", className)}>
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
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-white/10", className)}>
      <div
        className={cn("h-full rounded-full transition-none", frac < 0.25 ? "bg-bubble" : "bg-gold")}
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
    <div role="alert" aria-live="assertive" className="animate-pop-in fixed inset-x-4 top-4 z-50 rounded-2xl border border-bubble/50 bg-bubble/15 px-4 py-3 text-sm text-bubble backdrop-blur-xl">
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
  game_over: "Game Over",
};
