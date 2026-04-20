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
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

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
    href: "/play",
    label: "Play",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
        <path d="M6.3 3.7a1 1 0 0 1 1.5-.87l8 5.3a1 1 0 0 1 0 1.74l-8 5.3A1 1 0 0 1 6.3 14.3v-10.6Z" />
      </svg>
    ),
  },
  {
    href: "/wallet",
    label: "Wallet",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
        <path d="M3 6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1H5a3 3 0 0 0-2 .78V6Zm0 4a2 2 0 0 1 2-2h11a1 1 0 0 1 1 1v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4Zm10 2a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z" />
      </svg>
    ),
  },
  {
    href: "/deposit",
    label: "Deposit",
    emphasize: true,
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6">
        <path d="M10 2a1 1 0 0 1 1 1v8.59l2.3-2.3a1 1 0 0 1 1.4 1.42l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.42l2.3 2.3V3a1 1 0 0 1 1-1Zm-6 14a1 1 0 1 1 0-2h12a1 1 0 1 1 0 2H4Z" />
      </svg>
    ),
  },
  {
    href: "/account",
    label: "Account",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
        <path d="M10 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-7 7a7 7 0 0 1 14 0 1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" />
      </svg>
    ),
  },
  {
    href: "/stacker",
    label: "Stacker",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
        <path d="M4 14h12v2H4v-2Zm1-4h10v2H5v-2Zm2-4h6v2H7V6Z" />
      </svg>
    ),
  },
];

export function BottomNav() {
  const pathname = usePathname() || "";
  if (NO_BOTTOM_NAV_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return null;
  }

  return (
    <>
      {/* Spacer keeps the last line of page content above the fixed bar
          on mobile so nothing's hidden behind it. Matches the bar height
          (56px) + safe-area inset. */}
      <div
        aria-hidden
        className="md:hidden"
        style={{ height: "calc(56px + env(safe-area-inset-bottom, 0px))" }}
      />

      <nav
        aria-label="Primary"
        className="md:hidden fixed bottom-0 inset-x-0 z-50 border-t border-white/10 bg-background/90 backdrop-blur-md"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <ul className="flex items-stretch justify-around">
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
                  className={[
                    "flex flex-col items-center justify-center gap-0.5 h-14 text-[10px] uppercase tracking-widest transition",
                    active ? "text-cyan-300" : "text-gray-400 hover:text-white",
                    it.emphasize ? "relative" : "",
                  ].join(" ")}
                >
                  {it.emphasize ? (
                    <span
                      className={`absolute -top-4 grid h-11 w-11 place-items-center rounded-2xl border shadow-lg transition-transform ${
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
                    <span className={active ? "" : ""}>{it.icon}</span>
                  )}
                  <span className={it.emphasize ? "mt-4" : ""}>{it.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
