"use client";

/**
 * Shared top nav for non-game routes (/account, /wallet, /deposit, …).
 * Carries the logo, primary-route tabs, and the live wallet pill.
 *
 * Notes:
 *  - /dunk has its own in-page hero nav; this component is not mounted
 *    there. Check each route's page for whether it renders <AppHeader/>.
 *  - Active tab = exact pathname match OR prefix match (so /deposit?via=x
 *    and /wallet/any-subroute still highlight).
 *  - Focus rings: every interactive element uses ring-cyan-300 on focus
 *    to match the rest of the theme.
 */

import Link from "next/link";
import Image from "next/image";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { WalletNav } from "@/components/dunk/WalletNav";
import { ROUTES } from "@/lib/routes";
import { useLocalPref, PREF_KEYS } from "@/lib/prefs";
import { OPEN_PALETTE_EVENT } from "@/components/CommandPalette";

type Tab = { href: string; label: string };

const TABS: Tab[] = [
  { href: ROUTES.play, label: "Play" },
  { href: ROUTES.wallet, label: "Wallet" },
  { href: ROUTES.deposit, label: "Deposit" },
  { href: ROUTES.send, label: "Send" },
  { href: ROUTES.withdraw, label: "Withdraw" },
  { href: ROUTES.leaderboard, label: "Leaderboard" },
  { href: ROUTES.account, label: "Account" },
  { href: ROUTES.settings, label: "Settings" },
];

function isActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  return pathname.startsWith(href + "/");
}

export default function AppHeader() {
  const pathname = usePathname() || "";
  const router = useRouter();
  // Discovery nudge: once the user has opened the palette (by shortcut
  // or click), the hint never returns. Persisted via the shared prefs
  // pipeline so cross-tab + future-session dismissal sticks.
  const [hasOpenedPalette] = useLocalPref<boolean>(
    PREF_KEYS.hasOpenedPalette,
    false,
  );
  // Magic-ink underline: one shared element positioned via transform
  // against the active tab's bounding rect. Cheaper visually (one
  // composited layer that slides) and means the underline tracks
  // nav resizes like viewport changes or font-loading shifts.
  const navRef = useRef<HTMLElement | null>(null);
  const tabRefs = useRef(new Map<string, HTMLAnchorElement>());
  const [ink, setInk] = useState<{ x: number; w: number; show: boolean }>({
    x: 0,
    w: 0,
    show: false,
  });
  useLayoutEffect(() => {
    const nav = navRef.current;
    const active = TABS.find((t) => isActive(pathname, t.href));
    const el = active ? tabRefs.current.get(active.href) : undefined;
    if (!nav || !el) {
      setInk((v) => ({ ...v, show: false }));
      return;
    }
    const navRect = nav.getBoundingClientRect();
    const tabRect = el.getBoundingClientRect();
    setInk({
      x: tabRect.left - navRect.left + 12, // matches the px-3 tab padding
      w: tabRect.width - 24,
      show: true,
    });
  }, [pathname]);
  // Reposition on viewport changes (responsive paddings, font load)
  // so the underline doesn't drift from its tab.
  useEffect(() => {
    const onResize = () => {
      const nav = navRef.current;
      const active = TABS.find((t) => isActive(pathname, t.href));
      const el = active ? tabRefs.current.get(active.href) : undefined;
      if (!nav || !el) return;
      const navRect = nav.getBoundingClientRect();
      const tabRect = el.getBoundingClientRect();
      setInk({
        x: tabRect.left - navRect.left + 12,
        w: tabRect.width - 24,
        show: true,
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [pathname]);
  // Mobile breadcrumb: first matching tab wins. Desktop shows the
  // full tab strip so this label stays hidden at md+.
  const activeTab = TABS.find((t) => isActive(pathname, t.href));
  // Modifier-click on the logo routes to /play (the games hub) instead
  // of /dunk. Alt/Option is the power-user shortcut — leaves ⌘/Ctrl
  // (open-in-new-tab) and shift (new window) with their native
  // browser behavior intact.
  const onLogoClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.altKey) {
      e.preventDefault();
      router.push(ROUTES.play);
    }
  };
  // Soft depth cue: once the page has scrolled, cast a faint shadow
  // under the header so it reads as elevated above the scrolling
  // content instead of a flat strip. Threshold is low (4px) so even a
  // tiny scroll registers — passive listener so we don't block
  // scrolling on low-end mobile.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const check = () => setScrolled(window.scrollY > 4);
    check();
    window.addEventListener("scroll", check, { passive: true });
    return () => window.removeEventListener("scroll", check);
  }, []);
  return (
    <header
      className={`sticky top-0 z-40 border-b bg-background/85 backdrop-blur-md transition-shadow duration-200 ${
        scrolled
          ? "border-white/15 shadow-[0_8px_24px_-16px_rgba(0,0,0,0.65)]"
          : "border-white/10"
      }`}
    >
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-2.5 md:px-8">
        <Link
          href={ROUTES.dunk}
          onClick={onLogoClick}
          aria-label="Livewager · Dunk home (Alt-click for Games hub)"
          title="Home · Alt-click for Games hub"
          className="inline-flex items-center shrink-0 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
        >
          <Image
            src="/assets/logo43.png"
            alt="Livewager · Dunk"
            width={200}
            height={64}
            priority
            sizes="200px"
            style={{ height: 40, width: "auto", objectFit: "contain" }}
          />
        </Link>

        {/* Mobile-only active-tab breadcrumb. Slash glyph + cyan label
            so the user always knows where they are without a visible
            tab strip. Desktop hides it (md:hidden) since the full
            tab row carries the same information. */}
        {activeTab && (
          <div
            className="md:hidden flex items-baseline gap-1.5 text-[11px] uppercase tracking-widest min-w-0 truncate"
            aria-hidden
          >
            <span className="text-gray-600">/</span>
            <span className="text-cyan-300 font-semibold truncate">
              {activeTab.label}
            </span>
          </div>
        )}

        <nav
          ref={navRef}
          aria-label="Primary"
          className="relative hidden md:flex items-stretch gap-1 ml-4 text-sm"
        >
          {TABS.map((t) => {
            const active = isActive(pathname, t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                ref={(el) => {
                  if (el) tabRefs.current.set(t.href, el);
                  else tabRefs.current.delete(t.href);
                }}
                aria-current={active ? "page" : undefined}
                className={[
                  "relative inline-flex items-center rounded-md px-3 py-1.5 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70",
                  active
                    ? "text-white"
                    : "text-gray-300 hover:text-white hover:bg-white/5",
                ].join(" ")}
              >
                {t.label}
              </Link>
            );
          })}
          {/* Magic-ink underline — one shared composited layer that
              slides between tabs via transform + width. Hidden on
              first paint until the layout effect measures; spawns
              without a transition so it doesn't zoom in from 0,0.
              Respects reduced motion via the global rule in
              style.css (transition-duration: 0.001ms). */}
          <span
            aria-hidden
            className="absolute bottom-[-7px] h-[2px] rounded-full pointer-events-none"
            style={{
              background: "linear-gradient(90deg,#22d3ee,#0891b2)",
              transform: `translateX(${ink.x}px)`,
              width: ink.w,
              opacity: ink.show ? 1 : 0,
              transition:
                "transform 260ms cubic-bezier(0.2,0.8,0.2,1), width 260ms cubic-bezier(0.2,0.8,0.2,1), opacity 120ms linear",
              willChange: "transform, width",
            }}
          />
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {/* ⌘K discovery hint — desktop only (md+), hidden after the
              user has opened the palette once. Clicking fires the
              global OPEN_PALETTE_EVENT so mouse users can discover
              the feature without knowing the shortcut. Platform-
              aware label: macOS shows ⌘K, elsewhere ^K. */}
          {!hasOpenedPalette && (
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))}
              aria-label="Open command palette (⌘K)"
              title="Open command palette"
              className="hidden md:inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] uppercase tracking-widest text-gray-400 hover:text-white hover:border-white/25 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60"
            >
              <kbd className="font-mono text-[10px] text-cyan-300">
                <PlatformModKey />K
              </kbd>
              <span>palette</span>
            </button>
          )}
          <WalletNav />
        </div>
      </div>
    </header>
  );
}

/**
 * Platform-aware modifier symbol for keyboard hints. macOS users
 * expect ⌘; everyone else gets ^ (caret, universally readable as
 * "Ctrl"). Detected after mount so SSR doesn't emit one symbol and
 * hydrate another — both passes start with ⌘ (most common in our
 * audience) and the effect swaps to ^ only on non-Mac clients.
 */
function PlatformModKey() {
  const [glyph, setGlyph] = useState<"⌘" | "^">("⌘");
  useEffect(() => {
    const platform = navigator.platform || navigator.userAgent || "";
    if (!/mac|iphone|ipad|ipod/i.test(platform)) setGlyph("^");
  }, []);
  return <>{glyph}</>;
}
