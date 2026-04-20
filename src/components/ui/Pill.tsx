"use client";

/**
 * Status pill. Canonical variants for the small uppercase labels
 * sprinkled across the app — demo tags, live dots, pending-tx
 * chips, recent-recipient badges, etc.
 *
 *   <Pill status="live">live</Pill>
 *   <Pill status="demo">demo rail</Pill>
 *   <Pill status="soon">arriving</Pill>
 *   <Pill status="pending" mono size="xs">buying</Pill>
 *
 * `size="xs"` + `mono` together produce the 9px font-mono form that
 * the wallet/account demo eyebrows and pending-tx chips use. Keep
 * them as a pair when you want the tight technical look; they're
 * separate props so callers can opt in independently.
 */

import type { ReactNode } from "react";

export type PillStatus =
  | "live"
  | "demo"
  | "soon"
  | "beta"
  | "error"
  | "pending"
  | "info"
  | "neutral";

export type PillSize = "sm" | "xs";

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
  // In-flight tx / mid-async state. Distinct from `soon` (orange →
  // "coming") so a pending chip next to an arriving chip doesn't
  // collapse into the same color.
  pending: {
    bg: "bg-amber-400/[0.08]",
    fg: "text-amber-200",
    border: "border-amber-400/40",
  },
  // Soft violet for reference chips (recent recipient, tip target).
  // Not an action state — just "this is a thing we're pointing at."
  info: {
    bg: "bg-violet-300/[0.06]",
    fg: "text-violet-200",
    border: "border-violet-300/30",
  },
  neutral: {
    bg: "bg-white/[0.04]",
    fg: "text-gray-300",
    border: "border-white/15",
  },
};

const SIZES: Record<PillSize, string> = {
  sm: "text-[10px] px-2 py-0.5",
  xs: "text-[9px] px-2 py-0.5",
};

type Props = {
  status?: PillStatus;
  size?: PillSize;
  /** Use mono type. Standard pairs with size="xs" for the technical
   *  look used on demo/pending/reference chips. */
  mono?: boolean;
  children: ReactNode;
  className?: string;
  /** Native tooltip — matches the `<span title>` the inline variants used. */
  title?: string;
  /** Optional a11y override for pills where the visual text is a glyph or
   *  shorthand that doesn't speak well (e.g. "×3" streak badges). */
  "aria-label"?: string;
  /** Pass-through ARIA role. Use "status" (polite live region) for
   *  pills whose content updates should be announced to SR — in-flight
   *  tx chips, pending counts, etc. Default (no role) is fine for
   *  decorative/static tags. */
  role?: "status" | "alert";
};

export function Pill({
  status = "neutral",
  size = "sm",
  mono = false,
  children,
  className = "",
  title,
  "aria-label": ariaLabel,
  role,
}: Props) {
  const s = STYLES[status];
  return (
    <span
      title={title}
      aria-label={ariaLabel}
      role={role}
      className={[
        "inline-flex items-center gap-1 rounded-full border uppercase tracking-widest",
        mono ? "font-mono" : "font-semibold",
        SIZES[size],
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
