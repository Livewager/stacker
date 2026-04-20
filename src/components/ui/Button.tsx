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

import { forwardRef, useEffect, useState } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonTone = "cyan" | "orange" | "violet" | "rose" | "emerald";
// variant=danger is the destructive CTA treatment: translucent red
// fill + red border + red-tinted label, no gradient. Reserve it for
// actions that end a session or lose user state. Today's call sites:
//   - /settings Sign-out row + its confirm modal
//   - /account Sign-out pill
// `rose` is a visual tone (gradient fill for a positive destructive
// CTA like /withdraw "Send") and is intentionally distinct — don't
// merge tone=rose and variant=danger, they read differently.
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
  /** Increment this key to flash the success pulse (ring out + fade). */
  successPulse?: number;
  /**
   * Square icon-only button. Children should be a single icon (svg /
   * emoji / text glyph). The button still needs an accessible name —
   * callers MUST pass either `aria-label` or `title`; we assert in
   * dev if both are missing since an icon alone doesn't announce.
   *
   * Width/height match the size-token height so the hit target stays
   * 36/44/48px (thumb-reach compliant). No padding-x override needed;
   * base already sets items-center/justify-center.
   */
  iconOnly?: boolean;
};

const TONE_GRADIENTS: Record<ButtonTone, string> = {
  cyan: "linear-gradient(90deg,#22d3ee,#0891b2)",
  orange: "linear-gradient(90deg,#fdba74,#f97316)",
  violet: "linear-gradient(90deg,#c4b5fd,#8b5cf6)",
  rose: "linear-gradient(90deg,#fda4af,#f43f5e)",
  emerald: "linear-gradient(90deg,#6ee7b7,#059669)",
};

// Minimums hit the 44px target for primary touch actions at md/lg.
// "sm" is reserved for inline secondary affordances where 36px is fine.
const SIZE_CLS: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-xs",
  md: "h-11 px-4 text-sm",
  lg: "h-12 px-5 text-base",
};

// Square variants for iconOnly — same heights as SIZE_CLS, no px,
// width clamped to match height so the target stays square.
const ICON_SIZE_CLS: Record<ButtonSize, string> = {
  sm: "h-9 w-9 text-xs",
  md: "h-11 w-11 text-sm",
  lg: "h-12 w-12 text-base",
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
    successPulse = 0,
    iconOnly = false,
    className = "",
    disabled,
    children,
    style,
    ...rest
  },
  ref,
) {
  // Dev-only guard: icon-only buttons must carry an accessible name.
  // A warning here catches the "I forgot the aria-label on the new
  // copy button" regression before it ships.
  if (
    process.env.NODE_ENV !== "production" &&
    iconOnly &&
    !rest["aria-label"] &&
    !rest.title
  ) {
    // eslint-disable-next-line no-console
    console.warn(
      "[Button] iconOnly requires aria-label or title for accessibility",
    );
  }
  const [pulseVer, setPulseVer] = useState(0);
  useEffect(() => {
    if (successPulse > 0) {
      setPulseVer((v) => v + 1);
      const t = window.setTimeout(() => setPulseVer((v) => v + 1), 560);
      return () => window.clearTimeout(t);
    }
  }, [successPulse]);
  const pulsing = pulseVer > 0 && pulseVer % 2 === 1;
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
        iconOnly ? ICON_SIZE_CLS[size] : SIZE_CLS[size],
        variantCls,
        fullWidth && !iconOnly ? "w-full" : "",
        pulsing ? "lw-btn-success" : "",
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
      {iconOnly ? (
        // Icon-only renders children directly — no span wrapper so
        // the SVG sizes cleanly against the button's line-height and
        // hit-target math stays square.
        !loading && children
      ) : (
        <span className={loading ? "opacity-60" : undefined}>{children}</span>
      )}
      {!loading && !iconOnly && trailing}
    </button>
  );
});
