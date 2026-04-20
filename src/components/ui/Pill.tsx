"use client";

/**
 * Status pill. Canonical variants for the "live / demo / arriving /
 * soon / beta / error" labels sprinkled across the app.
 *
 *   <Pill status="live">live</Pill>
 *   <Pill status="demo">demo rail</Pill>
 *   <Pill status="soon">arriving</Pill>
 */

import type { ReactNode } from "react";

export type PillStatus =
  | "live"
  | "demo"
  | "soon"
  | "beta"
  | "error"
  | "neutral";

const STYLES: Record<PillStatus, { bg: string; fg: string; border: string }> = {
  live: {
    bg: "bg-emerald-400/[0.08]",
    fg: "text-emerald-300",
    border: "border-emerald-400/40",
  },
  demo: {
    bg: "bg-cyan-300/[0.08]",
    fg: "text-cyan-300",
    border: "border-cyan-300/40",
  },
  soon: {
    bg: "bg-orange-400/[0.08]",
    fg: "text-orange-300",
    border: "border-orange-400/40",
  },
  beta: {
    bg: "bg-yellow-400/[0.08]",
    fg: "text-yellow-300",
    border: "border-yellow-400/40",
  },
  error: {
    bg: "bg-red-500/[0.08]",
    fg: "text-red-300",
    border: "border-red-400/40",
  },
  neutral: {
    bg: "bg-white/[0.04]",
    fg: "text-gray-300",
    border: "border-white/15",
  },
};

type Props = {
  status?: PillStatus;
  children: ReactNode;
  className?: string;
};

export function Pill({ status = "neutral", children, className = "" }: Props) {
  const s = STYLES[status];
  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-widest font-semibold",
        s.bg,
        s.fg,
        s.border,
        className,
      ].join(" ")}
    >
      {children}
    </span>
  );
}
