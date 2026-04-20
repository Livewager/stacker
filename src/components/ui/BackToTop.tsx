"use client";

/**
 * Floating "back to top" chip. Fades in after the user scrolls past
 * `threshold` pixels from the top; on click, smooth-scrolls to 0
 * (respecting prefers-reduced-motion).
 *
 * Used on long list pages — leaderboard when the live-hour board runs
 * past 10 rows, for instance — so mobile users don't have to
 * finger-sprint back up the page.
 */

import { useEffect, useState } from "react";

type Props = {
  /** Scroll distance (px) at which the button becomes visible. */
  threshold?: number;
  /** Right-edge offset. Tweak for pages with a mobile bottom-nav. */
  bottomOffset?: number;
  className?: string;
};

export function BackToTop({
  threshold = 600,
  bottomOffset = 84,
  className = "",
}: Props) {
  const [visible, setVisible] = useState(false);

  // Show/hide with hysteresis so a slow-scroll near the threshold
  // doesn't flicker the chip on/off each frame. Mirrors the
  // AppHeader scroll-shadow pattern (POLISH-184): threshold-on,
  // (threshold - 100)-off. One-sided deadband — always 100px —
  // works across any caller-supplied threshold without exposing
  // a second prop.
  useEffect(() => {
    const ON = threshold;
    const OFF = Math.max(0, threshold - 100);
    const onScroll = () => {
      setVisible((prev) => {
        const y = window.scrollY;
        return prev ? y > OFF : y > ON;
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);

  const scrollToTop = () => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
  };

  return (
    <button
      type="button"
      onClick={scrollToTop}
      aria-label="Back to top"
      className={[
        // transition-[opacity,transform] (not transition-all) so
        // only the GPU-composited properties animate. Prevents any
        // accidental layout-triggering property — e.g. if a future
        // className adds a size tween — from blocking paint on the
        // entrance. Same discipline as lw-reveal et al. 160ms ease-
        // out matches the AppHeader shadow fade (POLISH-184): a
        // barely-perceptible settle, not a motion event.
        "fixed right-4 z-40 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-background/85 backdrop-blur-md px-3 py-2 text-[11px] font-semibold uppercase tracking-widest text-gray-200 shadow-lg transition-[opacity,transform] duration-150 ease-out hover:text-white hover:border-white/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60",
        visible
          ? "opacity-100 translate-y-0 pointer-events-auto"
          : "opacity-0 translate-y-2 pointer-events-none",
        className,
      ].join(" ")}
      style={{ bottom: `calc(${bottomOffset}px + env(safe-area-inset-bottom, 0px))` }}
    >
      <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="h-3.5 w-3.5">
        <path d="M10 3a1 1 0 0 1 .707.293l6 6a1 1 0 1 1-1.414 1.414L11 6.414V17a1 1 0 1 1-2 0V6.414l-4.293 4.293a1 1 0 1 1-1.414-1.414l6-6A1 1 0 0 1 10 3Z" />
      </svg>
      Top
    </button>
  );
}
