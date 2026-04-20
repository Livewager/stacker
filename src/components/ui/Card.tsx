"use client";

/**
 * Shared Card primitive. Matches the existing app convention of
 * rounded-2xl + border-white/10 + bg-white/[0.02 or 0.03].
 *
 * Use Card for static panels. Use CardHeader to place the
 * eyebrow + optional trailing meta consistently. Tone changes the
 * eyebrow color without touching the card body so sections stay
 * visually calm.
 */

import type { HTMLAttributes, ReactNode } from "react";

export type CardTone =
  | "default"
  | "cyan"
  | "orange"
  | "violet"
  | "rose"
  | "yellow"
  | "emerald";

const TONE_EYEBROW: Record<CardTone, string> = {
  default: "text-cyan-300",
  cyan: "text-cyan-300",
  orange: "text-orange-300",
  violet: "text-violet-300",
  rose: "text-rose-300",
  yellow: "text-yellow-300",
  emerald: "text-emerald-300",
};

type CardProps = HTMLAttributes<HTMLDivElement> & {
  /** Extra padding ring density. Default "md". */
  density?: "sm" | "md" | "lg";
  /** Elevated cards get a slightly brighter bg for the hero card slot. */
  elevated?: boolean;
};

export function Card({
  density = "md",
  elevated = false,
  className = "",
  children,
  ...rest
}: CardProps) {
  const pad =
    density === "sm" ? "p-3" : density === "lg" ? "p-6 md:p-8" : "p-5";
  const bg = elevated ? "bg-white/[0.035]" : "bg-white/[0.02]";
  return (
    <div
      className={[
        "rounded-2xl border border-white/10",
        bg,
        pad,
        className,
      ].join(" ")}
      {...rest}
    >
      {children}
    </div>
  );
}

type CardHeaderProps = {
  eyebrow?: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  tone?: CardTone;
  trailing?: ReactNode;
  className?: string;
};

export function CardHeader({
  eyebrow,
  title,
  subtitle,
  tone = "default",
  trailing,
  className = "",
}: CardHeaderProps) {
  return (
    <div className={`flex items-start justify-between gap-3 ${className}`}>
      <div className="min-w-0">
        {eyebrow && (
          <div
            className={`text-[10px] uppercase tracking-widest mb-1 ${TONE_EYEBROW[tone]}`}
          >
            {eyebrow}
          </div>
        )}
        {title && (
          <div className="text-lg font-semibold text-white">{title}</div>
        )}
        {subtitle && (
          <div className="mt-1 text-sm text-gray-400 leading-snug">
            {subtitle}
          </div>
        )}
      </div>
      {trailing && <div className="shrink-0">{trailing}</div>}
    </div>
  );
}
