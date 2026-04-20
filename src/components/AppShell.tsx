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

import { useEffect } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ToastHost } from "@/components/dunk/Toast";
import { WalletProvider } from "@/components/dunk/WalletContext";
import { BottomNav } from "@/components/BottomNav";
import CommandPalette from "@/components/CommandPalette";
import AppFooter from "@/components/AppFooter";
import { NetworkBanner } from "@/components/NetworkBanner";
import { ANCHORS, ROUTES } from "@/lib/routes";
import { usePrefs } from "@/lib/prefs";

/**
 * Global fallback Esc handler. Surface-specific Escape handlers
 * (BottomSheet, /dunk leader-palette, CommandPalette-in-BottomSheet)
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
      const onRoot = pathname === "/" || pathname === ROUTES.dunk || pathname === ROUTES.stacker;
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
      </WalletProvider>
    </ToastHost>
  );
}
