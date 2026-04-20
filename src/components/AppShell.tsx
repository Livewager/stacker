"use client";

/**
 * Wraps every route with the shared client-only providers:
 *   - ToastHost (custom toast stack)
 *   - WalletProvider (II session, balance, buy/deposit actions)
 *
 * Living in its own client component keeps the root layout a server
 * component, which keeps the HTML shell cacheable and lets us export
 * Metadata from route layouts without "use client" poisoning them.
 *
 * Tab-order invariant
 * -------------------
 * The skip-link MUST be the first focusable element on every route
 * so a keyboard user's first Tab lands on it. DOM order here keeps
 * that guarantee: no other focusable renders before it inside
 * <WalletProvider>, and the <main> target carries tabIndex={-1} so
 * it accepts programmatic focus from the link but never from Tab.
 *
 * BottomNav + AppFooter + CommandPalette sit AFTER {children} and
 * therefore never intercept the first Tab stop — verified on every
 * route during POLISH-54.
 */

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ToastHost } from "@/components/shared/Toast";
import { WalletProvider } from "@/components/shared/WalletContext";
import { BottomNav } from "@/components/BottomNav";
import CommandPalette from "@/components/CommandPalette";
import AppFooter from "@/components/AppFooter";
import { NetworkBanner } from "@/components/NetworkBanner";
import { StorageAckBanner } from "@/components/StorageAckBanner";
import { ANCHORS, ROUTES } from "@/lib/routes";
import { usePrefs } from "@/lib/prefs";

/**
 * Global fallback Esc handler. Surface-specific Escape handlers
 * (BottomSheet, Stacker leader-palette, CommandPalette-in-BottomSheet)
 * all fire before this one and stopPropagation or match their own
 * element selector, so Esc always closes the top-most surface first.
 * When nothing is open and we're not on the root route, Esc walks
 * back in history — matches the "decisive exit" expectation Esc
 * carries in modal apps without trapping the user on a first-page
 * visit where back would leave the site entirely.
 */
function GlobalEscBackHandler() {
  const router = useRouter();
  const pathname = usePathname() || "";
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // If ANY modal dialog is live, let its own handler own this
      // keystroke. role=dialog + aria-modal=true is the canonical
      // marker; BottomSheet sets both.
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) {
        return;
      }
      // Root page (/) and the core game routes — staying put is
      // usually more useful than popping history. Game routes
      // have their own Esc handling for round resets.
      const onRoot = pathname === "/" || pathname === ROUTES.stacker || pathname === ROUTES.stacker;
      if (onRoot) return;
      // If history stack has an in-app ancestor, go back. The
      // referrer check avoids yanking a first-visit user out of
      // the site when they hit Esc on a shared link.
      const sameOrigin =
        typeof document !== "undefined" &&
        document.referrer.startsWith(window.location.origin);
      if (!sameOrigin) return;
      e.preventDefault();
      router.back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pathname, router]);
  return null;
}

/**
 * Thin cyan progress strip at the very top of the viewport. Next's
 * App Router navigates via RSC streaming and doesn't ship a browser-
 * style loading indicator, so long dynamic imports or cold routes
 * feel dead from click → render. This bar:
 *
 *   1. Starts on any same-origin anchor click (bubbling, capture
 *      phase to beat the route change itself).
 *   2. Crawls toward 90% via rAF while the navigation settles.
 *   3. Snaps to 100% + fades out once the pathname actually changes.
 *
 * Not a real progress estimate — just a motion affordance that says
 * "something's happening."
 *
 * Reduced motion (POLISH-234): the CSS transitions on the strip are
 * clamped to ~0ms by the global prefers-reduced-motion rule in
 * style.css, but the rAF-driven crawl bypasses that clamp — it
 * updates React state directly. Fixed by gating the crawl itself
 * on the pref: when reduced, snap progress to 85 on click and let
 * the path-change effect snap to 100 as before. No animated climb,
 * but the user still sees a static progress bar materialise + fade,
 * which reads as "something's happening" without autonomous motion.
 */
function RouteTransitionBar() {
  const pathname = usePathname() || "";
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const rafRef = useRef(0);
  const startedRef = useRef(0);
  const lastPathRef = useRef(pathname);
  // In-app reduced-motion pref. Skip the autonomous rAF crawl when
  // set; the user still sees the bar materialise + snap, just
  // without a 1.2s asymptotic climb driven by state updates.
  const { reducedMotion } = usePrefs();
  const reducedMotionRef = useRef(reducedMotion);
  reducedMotionRef.current = reducedMotion;

  // Kick off the crawl when a link is clicked. Uses a single
  // document-level listener so we don't have to touch every Link.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      // Only left-click with no modifiers — cmd-click opens a new
      // tab and shouldn't show a progress indicator in *this* tab.
      if (e.defaultPrevented) return;
      if (e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const a = (e.target as HTMLElement | null)?.closest("a");
      if (!a) return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
        return;
      }
      if (a.target && a.target !== "_self") return;
      // Resolve to check same-origin; external links get the
      // browser's own spinner.
      try {
        const url = new URL(href, window.location.href);
        if (url.origin !== window.location.origin) return;
        if (url.pathname === window.location.pathname && url.search === window.location.search) {
          return; // in-page anchor navigation, no route change
        }
      } catch {
        return;
      }
      setVisible(true);
      // Reduced-motion: snap to 85 immediately and skip the rAF crawl.
      // The user still sees a materialise → settle → snap-100 → fade
      // sequence on navigation, just without an animated climb.
      if (reducedMotionRef.current) {
        setProgress(85);
        return;
      }
      setProgress(8);
      startedRef.current = performance.now();
      cancelAnimationFrame(rafRef.current);
      const tick = () => {
        const elapsed = performance.now() - startedRef.current;
        // Asymptotic crawl: fast early, slows approaching 90%.
        const target = 90;
        const t = Math.min(1, elapsed / 1200);
        const eased = target * (1 - Math.pow(1 - t, 2));
        setProgress((p) => Math.max(p, eased));
        if (eased < target - 0.5) rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    };
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Path change = destination settled. Snap to 100 + fade.
  useEffect(() => {
    if (pathname === lastPathRef.current) return;
    lastPathRef.current = pathname;
    if (!visible) return;
    cancelAnimationFrame(rafRef.current);
    setProgress(100);
    const hideT = window.setTimeout(() => {
      setVisible(false);
      // Reset to 0 after fade so the next nav starts fresh.
      window.setTimeout(() => setProgress(0), 200);
    }, 180);
    return () => window.clearTimeout(hideT);
  }, [pathname, visible]);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed top-0 left-0 right-0 z-[1000] h-[2px]"
      style={{ opacity: visible ? 1 : 0, transition: "opacity 180ms ease-out" }}
    >
      <div
        className="h-full origin-left"
        style={{
          background: "linear-gradient(90deg,#22d3ee,#0891b2)",
          transform: `scaleX(${progress / 100})`,
          transition: "transform 160ms ease-out",
          width: "100%",
        }}
      />
    </div>
  );
}

/**
 * Mirrors the in-app `reducedMotion` pref onto <html>.lw-reduce-motion
 * so CSS rules can kill animation uniformly — including server-rendered
 * skeleton shimmer that has no client hook. The OS prefers-reduced-motion
 * query is honored independently via a @media block in style.css.
 */
function ReducedMotionBridge() {
  const { reducedMotion } = usePrefs();
  useEffect(() => {
    const el = document.documentElement;
    el.classList.toggle("lw-reduce-motion", reducedMotion);
    return () => {
      el.classList.remove("lw-reduce-motion");
    };
  }, [reducedMotion]);
  return null;
}

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <ToastHost>
      <WalletProvider>
        <ReducedMotionBridge />
        <GlobalEscBackHandler />
        <RouteTransitionBar />
        {/* Paired skip-links. DOM order matters: "main content" is
            the first Tab stop (matches tab-order invariant in the
            file header), "games" is second. Both use the shared
            .skip-link style which is invisible until focused. The
            games link is a Next Link (client nav) so it also bails
            into prefetch — useful because a keyboard user
            activating it is about to play a round. */}
        <a href={ANCHORS.content} className="skip-link">
          Skip to main content
        </a>
        <Link href={ROUTES.play} className="skip-link">
          Skip to games
        </Link>
        <NetworkBanner />
        <main id={ANCHORS.content.slice(1)} tabIndex={-1} className="outline-none">
          {children}
        </main>
        <AppFooter />
        <BottomNav />
        <CommandPalette />
        <StorageAckBanner />
      </WalletProvider>
    </ToastHost>
  );
}
