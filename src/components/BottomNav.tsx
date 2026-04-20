"use client";

/**
 * Mobile-only bottom tab bar.
 *
 * Fixed to the bottom of the viewport on narrow screens, hidden at md+.
 * Five slots chosen for thumb reach + primary flow frequency:
 *   Play · Wallet · Deposit · Account · Stacker
 *
 * Deposit gets a raised center-stack to match the standard mobile
 * finance-app affordance — the main thing a user does here.
 *
 * Lives under AppShell so every route gets it automatically. Pages that
 * don't want it (the game canvas itself, for example) can opt out via
 * the `NO_BOTTOM_NAV_PATHS` list below.
 *
 * Soft-keyboard handling
 * ----------------------
 * On iOS Safari, the soft keyboard sits above any position:fixed bar
 * and can double-stack with focused inputs on /send + /withdraw. We
 * listen to visualViewport resize events and toggle the
 * `data-kb-open` attribute on ourselves when the keyboard overlays
 * the bar. The CSS in style.css hides the nav + its spacer while
 * that attribute is true. No per-route opt-in needed.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ROUTES } from "@/lib/routes";
import { usePrefs } from "@/lib/prefs";

type Item = {
  href: string;
  label: string;
  icon: ReactNode;
  matchPrefix?: string; // counts as active when pathname startsWith this
  emphasize?: boolean;
};

// Paths where the bar must not render (immersive game views where thumbs
// are busy with the play surface). Keep this list short.
const NO_BOTTOM_NAV_PATHS: readonly string[] = [];

const ITEMS: Item[] = [
  {
    href: ROUTES.play,
    label: "Play",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="h-5 w-5">
        <path d="M6.3 3.7a1 1 0 0 1 1.5-.87l8 5.3a1 1 0 0 1 0 1.74l-8 5.3A1 1 0 0 1 6.3 14.3v-10.6Z" />
      </svg>
    ),
  },
  {
    href: ROUTES.wallet,
    label: "Wallet",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="h-5 w-5">
        <path d="M3 6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1H5a3 3 0 0 0-2 .78V6Zm0 4a2 2 0 0 1 2-2h11a1 1 0 0 1 1 1v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4Zm10 2a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z" />
      </svg>
    ),
  },
  {
    href: ROUTES.deposit,
    label: "Deposit",
    emphasize: true,
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="h-6 w-6">
        <path d="M10 2a1 1 0 0 1 1 1v8.59l2.3-2.3a1 1 0 0 1 1.4 1.42l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.42l2.3 2.3V3a1 1 0 0 1 1-1Zm-6 14a1 1 0 1 1 0-2h12a1 1 0 1 1 0 2H4Z" />
      </svg>
    ),
  },
  {
    href: ROUTES.account,
    label: "Account",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="h-5 w-5">
        <path d="M10 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-7 7a7 7 0 0 1 14 0 1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" />
      </svg>
    ),
  },
  {
    href: ROUTES.stacker,
    label: "Stacker",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="h-5 w-5">
        <path d="M4 14h12v2H4v-2Zm1-4h10v2H5v-2Zm2-4h6v2H7V6Z" />
      </svg>
    ),
  },
];

export function BottomNav() {
  const pathname = usePathname() || "";
  const { haptics } = usePrefs();
  // Soft-keyboard detection via visualViewport. When the keyboard
  // covers ≥ 150px of the layout viewport, treat it as "open" and
  // let CSS fade the nav + spacer out. Threshold tolerates on-screen
  // toolbars / side panels that nibble the viewport by a few dozen
  // pixels without triggering a hide.
  const [kbOpen, setKbOpen] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;
    const KB_MIN_PX = 150;
    const onResize = () => {
      const covered = window.innerHeight - vv.height;
      setKbOpen(covered >= KB_MIN_PX);
    };
    onResize();
    vv.addEventListener("resize", onResize);
    vv.addEventListener("scroll", onResize);
    return () => {
      vv.removeEventListener("resize", onResize);
      vv.removeEventListener("scroll", onResize);
    };
  }, []);
  if (NO_BOTTOM_NAV_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return null;
  }

  // POLISH-354 — tap-feedback pair. Haptic and SR announcement both
  // fire from the same onClick synchronously so a VoiceOver user who
  // taps a tab gets the same "tap received → going to X" beat as a
  // sighted user with haptics on. Without the announcement, the
  // haptic pulse fires but nothing in the AT surface confirms *where*
  // we're going until the new page hydrates and focus coincidentally
  // lands on something labeled. The sr-only span below is wired to
  // this state via aria-live="polite".
  //
  // No-op case: tapping the already-active tab fires neither — no
  // haptic ping, no "Navigating to Wallet" announcement when you're
  // already on /wallet. That matches sighted behavior (no visible
  // transition) and avoids VO chatter on accidental re-taps.
  const [announce, setAnnounce] = useState("");
  const tapFeedback = (active: boolean, label: string) => {
    if (active) return;
    if (haptics) {
      try {
        navigator.vibrate?.(6);
      } catch {
        /* Safari + iOS don't expose the Vibration API; that's fine. */
      }
    }
    // Always announce, even if haptics are off — the announcement is
    // a separate accessibility affordance and not gated by the haptic
    // pref. Bump with a "." suffix if the same label fires twice
    // (same-destination re-taps from a different screen) so the
    // aria-live region re-announces; otherwise setting the same
    // string is a no-op and SR stays silent.
    setAnnounce((prev) =>
      prev === `Navigating to ${label}`
        ? `Navigating to ${label}.`
        : `Navigating to ${label}`,
    );
  };

  return (
    <>
      {/* Spacer keeps the last line of page content above the fixed bar
          on mobile so nothing's hidden behind it. Matches the bar height
          (56px) + safe-area inset. data-kb-open collapses it when the
          soft keyboard is up so the form has full breathing room. */}
      <div
        aria-hidden
        data-kb-open={kbOpen ? "true" : undefined}
        className="lw-bottom-nav md:hidden"
        style={{ height: "calc(56px + env(safe-area-inset-bottom, 0px))" }}
      />

      {/* aria-label disambiguates this from AppHeader's <nav aria-
          label="Primary">. Two nav landmarks sharing a name is a
          common SR pain point — screen-reader rotor lists both as
          "Primary navigation" and the user can't tell them apart.
          "Primary mobile" keeps the semantic weight (still the app's
          main nav) while distinguishing it as the bottom-tab form. */}
      <nav
        aria-label="Primary mobile"
        data-kb-open={kbOpen ? "true" : undefined}
        className="lw-bottom-nav md:hidden fixed bottom-0 inset-x-0 z-50 border-t border-white/10 bg-background/90 backdrop-blur-md"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <ul role="list" className="flex items-stretch justify-around">
          {ITEMS.map((it) => {
            const active =
              pathname === it.href ||
              pathname.startsWith(it.href + "/") ||
              (it.matchPrefix ? pathname.startsWith(it.matchPrefix) : false);
            return (
              <li key={it.href} className="flex-1">
                <Link
                  href={it.href}
                  aria-current={active ? "page" : undefined}
                  onClick={() => tapFeedback(active, it.label)}
                  className={[
                    "flex flex-col items-center justify-center gap-0.5 h-14 text-[10px] uppercase tracking-widest transition",
                    active ? "text-cyan-300" : "text-gray-400 hover:text-white",
                    it.emphasize ? "relative" : "",
                  ].join(" ")}
                >
                  {it.emphasize ? (
                    <span
                      className={`absolute -top-4 grid h-11 w-11 place-items-center rounded-2xl border shadow-lg transition-transform duration-150 active:scale-95 ${
                        active
                          ? "bg-orange-500 border-orange-400 scale-105"
                          : "bg-orange-500/85 border-orange-400/80"
                      }`}
                      style={{
                        boxShadow: active
                          ? "0 6px 18px -6px rgba(249,115,22,0.6)"
                          : "0 4px 14px -6px rgba(249,115,22,0.45)",
                      }}
                    >
                      <span className="text-black">{it.icon}</span>
                    </span>
                  ) : (
                    // 120ms scale pop on tap. Uses CSS :active so there's
                    // no extra state to track, and the GPU composites it.
                    <span className="transition-transform duration-150 active:scale-90">
                      {it.icon}
                    </span>
                  )}
                  <span className={it.emphasize ? "mt-4" : ""}>{it.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
        {/* POLISH-354 live-region. Sits inside the nav landmark so the
            announcement is scoped to mobile-nav transitions (a desktop
            SR user won't be confused by it — the nav is md:hidden
            anyway). aria-live="polite" queues after any in-progress
            speech; role="status" reinforces the polite semantics for
            VoiceOver rotor. Announcement text is set synchronously in
            the tap handler so the pulse + announcement fire as one
            beat, not two. */}
        <span role="status" aria-live="polite" className="sr-only">
          {announce}
        </span>
      </nav>
    </>
  );
}
