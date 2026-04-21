"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { useReducedMotion } from "@/lib/hooks/useReducedMotion";
import { usePrefs } from "@/lib/prefs";

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
  // POLISH-366 — stable id for an sr-only hint that points the
  // primary Retry/Reload button at the "Technical detail"
  // disclosure below. SR users reaching the button by landmark or
  // tab currently hear "Try again, button" with no clue that a
  // digest + message exists in a `<details>` further down the
  // card. With aria-describedby pointing at the hint span, the
  // accessible description becomes "Try again, button. Error
  // details available; expand 'Technical detail' below to read."
  const scaffoldId = useId();
  const detailHintId = `${scaffoldId}-detail-hint`;
  const accent = tone === "danger" ? "#f87171" : "#22d3ee";
  // POLISH-306 — dual-gate reduced-motion disables auto-retry
  // entirely. The rationale: auto-retry on an error boundary is a
  // micro-interaction that ticks a visible number every second and
  // then *acts on its own*. Users with reduced-motion preferences
  // (OS or in-app) overlap heavily with users who want predictable,
  // self-directed interaction — a ticking countdown + forced action
  // violates both the spirit (calmer, less surprising) and the
  // aria-live chatter (one announcement per tick). Manual retry
  // still works — the Button is primary-focused on mount (POLISH-274)
  // so Enter fires it instantly. We read both the OS media query and
  // the in-app pref because users sometimes bump the in-app flag
  // without touching OS (e.g. a shared device). Gate is loose (OR)
  // because either signal is enough to opt out.
  // During SSR and the first paint, osReduced === null; treat that
  // as "assume motion OK until we know otherwise" — otherwise the
  // countdown would flicker on/off at hydration, which is exactly
  // the kind of motion this flag is trying to avoid.
  const osReduced = useReducedMotion();
  const { reducedMotion: userReduced } = usePrefs();
  const motionReduced = osReduced === true || userReduced === true;
  const canAutoRetry =
    typeof autoRetrySeconds === "number" &&
    autoRetrySeconds > 0 &&
    typeof primary.onClick === "function" &&
    !motionReduced;
  const [secondsLeft, setSecondsLeft] = useState<number | null>(
    canAutoRetry ? (autoRetrySeconds as number) : null,
  );
  // If the OS or in-app pref flips *after* mount (user toggles
  // reduce-motion in Settings mid-countdown, or OS setting changes
  // live), cancel any in-flight retry. The flag was false at mount
  // so the countdown started; now it's true so we should stop.
  // We don't *re-arm* the opposite direction — once cancelled, a
  // user can still Enter to retry manually.
  useEffect(() => {
    if (motionReduced && secondsLeft !== null) setSecondsLeft(null);
  }, [motionReduced, secondsLeft]);
  // Per-mount jitter: ±500ms offset applied to the first tick
  // (and only the first). Prevents an error cold-start where many
  // tabs all arrive at the retry button on the same wall-clock
  // second from stampeding the upstream — instead they spread
  // across a 1s window. Subsequent ticks run on the plain 1000ms
  // cadence so the countdown still feels crisp.
  // Computed once per ErrorScaffold mount; a retry restarts the
  // component via reset() which remounts, which redraws jitter.
  const firstTickJitterMs = useRef(Math.floor((Math.random() - 0.5) * 1000));
  const firstTickAppliedRef = useRef(false);
  useEffect(() => {
    if (secondsLeft === null) return;
    if (secondsLeft <= 0) {
      // Defer firing to a microtask so state + layout settle first.
      const h = setTimeout(() => primary.onClick?.(), 0);
      return () => clearTimeout(h);
    }
    const jitter = firstTickAppliedRef.current ? 0 : firstTickJitterMs.current;
    firstTickAppliedRef.current = true;
    const id = window.setTimeout(() => {
      setSecondsLeft((s) => (s === null ? null : s - 1));
    }, 1000 + jitter);
    return () => window.clearTimeout(id);
  }, [secondsLeft, primary]);
  const cancelAutoRetry = () => {
    if (secondsLeft !== null) setSecondsLeft(null);
  };

  // Environment block — build SHA, user agent, URL, timestamp. Grabbed
  // once on mount so rerenders don't regenerate a "now" that drifts
  // from when the error actually fired. Everything here is information
  // the user could include verbatim in a support request without
  // leaking anything private (no principal, no balance — those aren't
  // available inside the error boundary anyway).
  const envBlock = useMemo(() => {
    if (typeof window === "undefined") return null;
    const sha = process.env.NEXT_PUBLIC_BUILD_SHA ?? "dev";
    const ua = navigator.userAgent;
    const url = window.location.href;
    const when = new Date().toISOString();
    return { sha, ua, url, when };
  }, []);

  const fullDetail =
    [
      detail?.trim() || null,
      envBlock
        ? [
            `---`,
            `env:`,
            `  build: ${envBlock.sha}`,
            `  url: ${envBlock.url}`,
            `  ts: ${envBlock.when}`,
            `  ua: ${envBlock.ua}`,
          ].join("\n")
        : null,
    ]
      .filter(Boolean)
      .join("\n") || undefined;

  // POLISH-274 — focus the primary CTA on mount so keyboard users
  // arriving at the error boundary can hit Enter to retry without
  // having to Tab-hunt. Only focus when the primary action is a
  // retry (onClick-backed) — a link-based primary doesn't need
  // forced focus, the user may have already pressed Enter to get
  // here in a successful reset. preventScroll keeps the page
  // anchored; without it the button can jump the viewport when
  // the error block is below the fold on a long error detail.
  // Skip the grab if something else was scripted to focus first
  // (document.activeElement moved off body before this effect).
  const primaryBtnRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (primary.href) return;
    const el = primaryBtnRef.current;
    if (!el) return;
    const active =
      typeof document !== "undefined" ? document.activeElement : null;
    if (active && active !== document.body) return;
    try {
      el.focus({ preventScroll: true });
    } catch {
      /* focus may race with rapid unmount — ignore */
    }
  }, [primary.href]);

  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    if (!fullDetail) return;
    try {
      await navigator.clipboard.writeText(fullDetail);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — no-op, the <pre> is selectable */
    }
  };
  return (
    // Plain <div>, not <main>. This component is rendered inside
    // AppShell's outer <main id="content"> via Next's per-segment
    // error.tsx, so nesting a second <main> would both invalidate
    // the HTML (spec: one non-hidden <main> per document) and
    // shadow the SkipLink target. POLISH-276 audit found this
    // here and in SkeletonPage; both migrated to div.
    // NOTE: global-error.tsx replaces the whole document and
    // doesn't use this scaffold, so this change is safe.
    //
    // POLISH-321 — deliberately NO lw-reveal on this container.
    // Wallet cards use lw-reveal (POLISH-303) as a subtle "it's
    // here" affirmation for expected navigation. An error boundary
    // is unexpected, and framing it with a 220ms fade reads as
    // "ta-da, here's your error page" — tonally wrong. Three
    // concrete reasons to keep the entrance static:
    //   1. Primary button is focused on mount (POLISH-274) so
    //      keyboard users can hit Enter to retry instantly — an
    //      entrance fade would land clicks on a mid-fade element
    //      for the first 220ms, looks janky.
    //   2. aria-live countdown starts immediately (POLISH-306
    //      kept it when motion allowed) — pairing motion with a
    //      ticking announcement reads as too busy for a
    //      recovery surface.
    //   3. Reduced-motion users already opted out of decorative
    //      animation; adding one to the worst-case surface would
    //      undermine that signal exactly where it matters most.
    // Pinned so the next motion sweep doesn't re-ask.
    <div
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
            <Link
              href={primary.href}
              aria-describedby={fullDetail ? detailHintId : undefined}
              className="inline-flex rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <Button tone="cyan" size="lg" tabIndex={-1}>
                {primary.label}
              </Button>
            </Link>
          ) : (
            <Button
              ref={primaryBtnRef}
              onClick={primary.onClick}
              aria-describedby={fullDetail ? detailHintId : undefined}
              tone="cyan"
              size="lg"
            >
              {primary.label}
            </Button>
          )}
          {secondary ? (
            secondary.href ? (
              <Link
                href={secondary.href}
                className="inline-flex rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <Button variant="outline" size="lg" tabIndex={-1}>
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
              className="underline-offset-2 hover:underline text-gray-400 hover:text-white cursor-pointer focus:outline-none focus-visible:text-white focus-visible:underline focus-visible:ring-2 focus-visible:ring-cyan-300/50 rounded-sm"
            >
              cancel
            </button>
          </div>
        )}

        {/* POLISH-366 — sr-only hint referenced by the primary button's
            aria-describedby. Phrased as "expand X below to read" so
            the sighted affordance name ("Technical detail") is the
            same token a SR user hears, which helps them find it via
            the rotor or search. Only rendered when there's actually
            a detail payload to describe. */}
        {fullDetail && (
          <span id={detailHintId} className="sr-only">
            Error details available; expand the &ldquo;Technical detail&rdquo;
            disclosure below to read the digest and message.
          </span>
        )}

        {fullDetail && (
          <details className="mt-8 text-left rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3 text-xs">
            <summary className="cursor-pointer text-gray-400 uppercase tracking-widest text-[10px] flex items-center justify-between gap-3">
              <span>Technical detail</span>
              <button
                type="button"
                onClick={(e) => {
                  // Don't let the click toggle the <details> summary.
                  e.preventDefault();
                  e.stopPropagation();
                  onCopy();
                }}
                className="normal-case tracking-normal text-[10px] rounded-md border border-white/15 px-2 py-0.5 text-gray-200 hover:text-white hover:border-white/30 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/40"
                aria-label="Copy technical detail"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </summary>
            <pre className="mt-2 font-mono text-[11px] text-gray-300 whitespace-pre-wrap break-words leading-snug">
              {fullDetail}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}
