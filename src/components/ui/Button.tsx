"use client";

/**
 * Shared Button primitive. Consolidates the cyan/orange/violet/rose
 * gradient CTAs, ghost buttons, and outline buttons scattered across
 * the app into a single component with known variants.
 *
 * No external deps. Forwards ref + rest props so it drops into any
 * place that previously used a raw <button>.
 *
 * Intent:
 *   <Button variant="primary" tone="cyan">Connect</Button>
 *   <Button variant="primary" tone="orange">Deposit</Button>
 *   <Button variant="outline">Cancel</Button>
 *   <Button variant="ghost" size="sm">Copy</Button>
 */

import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonTone = "cyan" | "orange" | "violet" | "rose" | "emerald";
export type ButtonVariant = "primary" | "outline" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  tone?: ButtonTone;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
};

const TONE_GRADIENTS: Record<ButtonTone, string> = {
  cyan: "linear-gradient(90deg,#22d3ee,#0891b2)",
  orange: "linear-gradient(90deg,#fdba74,#f97316)",
  violet: "linear-gradient(90deg,#c4b5fd,#8b5cf6)",
  rose: "linear-gradient(90deg,#fda4af,#f43f5e)",
  emerald: "linear-gradient(90deg,#6ee7b7,#059669)",
};

const SIZE_CLS: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-5 text-base",
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  {
    variant = "primary",
    tone = "cyan",
    size = "md",
    loading = false,
    fullWidth = false,
    leading,
    trailing,
    className = "",
    disabled,
    children,
    style,
    ...rest
  },
  ref,
) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg font-bold transition disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98]";

  const variantCls =
    variant === "primary"
      ? "text-black shadow-sm hover:brightness-110"
      : variant === "outline"
        ? "border border-white/15 bg-white/[0.03] text-gray-200 hover:text-white hover:border-white/30"
        : variant === "danger"
          ? "border border-red-400/40 bg-red-500/10 text-red-200 hover:bg-red-500/20"
          : "text-gray-300 hover:text-white hover:bg-white/5";

  const bgStyle =
    variant === "primary"
      ? { background: TONE_GRADIENTS[tone], ...style }
      : style;

  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={[
        base,
        SIZE_CLS[size],
        variantCls,
        fullWidth ? "w-full" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={bgStyle}
      {...rest}
    >
      {loading ? (
        <span
          aria-hidden
          className="inline-block h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin"
        />
      ) : (
        leading
      )}
      <span>{children}</span>
      {!loading && trailing}
    </button>
  );
});
