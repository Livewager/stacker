"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";

/**
 * Visual shell shared by not-found + error + global-error pages.
 * Kept standalone (no AppHeader, no providers) so it renders cleanly
 * even when the surrounding app layout is the thing that crashed.
 */

export function ErrorScaffold({
  tone = "muted",
  eyebrow,
  title,
  body,
  primary,
  secondary,
  detail,
  autoRetrySeconds,
}: {
  tone?: "muted" | "danger";
  eyebrow: string;
  title: string;
  body: ReactNode;
  primary: { href?: string; label: string; onClick?: () => void };
  secondary?: { href?: string; label: string; onClick?: () => void };
  detail?: string;
  /**
   * When set alongside an onClick primary, starts a visible countdown
   * and fires primary.onClick automatically at zero. Any interaction
   * with the primary button or hover over the card cancels the timer
   * — the idea is to self-heal transient errors without trapping the
   * user in a forced refresh loop if they're reading the detail.
   * Ignored when primary is a plain href (nothing to retry).
   */
  autoRetrySeconds?: number;
}) {
  const accent = tone === "danger" ? "#f87171" : "#22d3ee";
  const canAutoRetry =
    typeof autoRetrySeconds === "number" &&
    autoRetrySeconds > 0 &&
    typeof primary.onClick === "function";
  const [secondsLeft, setSecondsLeft] = useState<number | null>(
    canAutoRetry ? (autoRetrySeconds as number) : null,
  );
  useEffect(() => {
    if (secondsLeft === null) return;
    if (secondsLeft <= 0) {
      // Defer firing to a microtask so state + layout settle first.
      const h = setTimeout(() => primary.onClick?.(), 0);
      return () => clearTimeout(h);
    }
    const id = window.setTimeout(() => {
      setSecondsLeft((s) => (s === null ? null : s - 1));
    }, 1000);
    return () => window.clearTimeout(id);
  }, [secondsLeft, primary]);
  const cancelAutoRetry = () => {
    if (secondsLeft !== null) setSecondsLeft(null);
  };
  return (
    <main
      className="min-h-screen bg-background text-white flex items-center justify-center px-5 py-16"
      onMouseMove={cancelAutoRetry}
      onFocusCapture={cancelAutoRetry}
      onKeyDownCapture={cancelAutoRetry}
    >
      <div className="max-w-xl w-full text-center">
        {/* Droplet / error sigil — SVG, scales with the text. */}
        <div className="relative mx-auto mb-8 h-28 w-28">
          <div
            aria-hidden
            className="absolute inset-0 rounded-full blur-2xl opacity-60"
            style={{ background: `${accent}55` }}
          />
          <svg
            viewBox="0 0 96 96"
            className="relative h-28 w-28"
            aria-hidden
            role="img"
          >
            <defs>
              <linearGradient id="dropGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor={accent} stopOpacity="0.9" />
                <stop offset="100%" stopColor={accent} stopOpacity="0.35" />
              </linearGradient>
            </defs>
            <path
              d="M48 8 C62 24, 78 40, 78 58 C78 74, 64 86, 48 86 C32 86, 18 74, 18 58 C18 40, 34 24, 48 8 Z"
              fill="url(#dropGrad)"
              stroke={accent}
              strokeOpacity={0.6}
              strokeWidth={1.5}
            />
            {/* Inner highlight */}
            <path
              d="M40 26 C34 36, 30 46, 30 54"
              fill="none"
              stroke="#fff"
              strokeOpacity={0.55}
              strokeWidth={2.5}
              strokeLinecap="round"
            />
          </svg>
        </div>

        <div
          className="text-xs uppercase tracking-widest mb-3"
          style={{ color: accent }}
        >
          {eyebrow}
        </div>
        <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-3">
          {title}
        </h1>
        <p className="text-sm md:text-base text-gray-300 leading-relaxed max-w-md mx-auto mb-7">
          {body}
        </p>

        <div className="flex items-center justify-center gap-3 flex-wrap">
          {primary.href ? (
            <Link href={primary.href}>
              <Button tone="cyan" size="lg">
                {primary.label}
              </Button>
            </Link>
          ) : (
            <Button onClick={primary.onClick} tone="cyan" size="lg">
              {primary.label}
            </Button>
          )}
          {secondary ? (
            secondary.href ? (
              <Link href={secondary.href}>
                <Button variant="outline" size="lg">
                  {secondary.label}
                </Button>
              </Link>
            ) : (
              <Button onClick={secondary.onClick} variant="outline" size="lg">
                {secondary.label}
              </Button>
            )
          ) : null}
        </div>

        {secondsLeft !== null && secondsLeft > 0 && (
          <div
            className="mt-4 text-[11px] font-mono uppercase tracking-widest text-gray-500"
            aria-live="polite"
          >
            Auto-retrying in{" "}
            <span className="text-white tabular-nums">{secondsLeft}</span>s ·{" "}
            <button
              type="button"
              onClick={cancelAutoRetry}
              className="underline-offset-2 hover:underline text-gray-400 hover:text-white"
            >
              cancel
            </button>
          </div>
        )}

        {detail && (
          <details className="mt-8 text-left rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3 text-xs">
            <summary className="cursor-pointer text-gray-400 uppercase tracking-widest text-[10px]">
              Technical detail
            </summary>
            <pre className="mt-2 font-mono text-[11px] text-gray-300 whitespace-pre-wrap break-words leading-snug">
              {detail}
            </pre>
          </details>
        )}
      </div>
    </main>
  );
}
