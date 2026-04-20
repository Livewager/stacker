"use client";

/**
 * Shared top nav for non-game routes (/account, /wallet, /deposit, …).
 * Carries the logo, primary-route tabs, and the live wallet pill.
 *
 * Notes:
 *  - /stacker has its own in-page hero nav; this component is not
 *    mounted there. Check each route's page for whether it renders
 *    <AppHeader/>.
 *  - Active tab = exact pathname match OR prefix match (so /deposit?via=x
 *    and /wallet/any-subroute still highlight).
 *  - Focus rings: every interactive element uses ring-cyan-300 on focus
 *    to match the rest of the theme.
 */

import Link from "next/link";
import Image from "next/image";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { WalletNav } from "@/components/shared/WalletNav";
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
  { href: ROUTES.fairPlay, label: "Fair play" },
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
  // POLISH-351 — cold-mount suppression: the inline comment below the
  // underline span promised "spawns without a transition so it doesn't
  // zoom in from 0,0," but the original implementation declared
  // transform+width transitions unconditionally, so the first paint
  // animated the underline from x=0/w=0 to the measured position
  // (visible left-edge zoom). Track whether we've measured once; on
  // that first pass render with transition:none so the underline
  // appears in-place (only opacity fades, 120ms). Subsequent route
  // changes flip the flag and get the slide+grow animation.
  const hasMeasuredRef = useRef(false);
  const [ink, setInk] = useState<{
    x: number;
    w: number;
    show: boolean;
    primed: boolean;
  }>({
    x: 0,
    w: 0,
    show: false,
    primed: false,
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
    const wasFirst = !hasMeasuredRef.current;
    hasMeasuredRef.current = true;
    setInk({
      x: tabRect.left - navRect.left + 12, // matches the px-3 tab padding
      w: tabRect.width - 24,
      show: true,
      // primed=false on the first measure → suppress transition this
      // paint; flip on the next tick so subsequent updates animate.
      primed: !wasFirst,
    });
    if (wasFirst) {
      // Arm the slide animation for route changes AFTER the first
      // in-place paint has settled. rAF is enough — the next render
      // will re-run this effect only if pathname changes; this
      // just flips the `primed` flag so an unrelated re-render
      // (resize, focus) doesn't keep the no-transition state.
      requestAnimationFrame(() => {
        setInk((v) => ({ ...v, primed: true }));
      });
    }
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
      setInk((v) => ({
        ...v,
        x: tabRect.left - navRect.left + 12,
        w: tabRect.width - 24,
        show: true,
      }));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [pathname]);
  // Mobile breadcrumb: first matching tab wins. Desktop shows the
  // full tab strip so this label stays hidden at md+.
  const activeTab = TABS.find((t) => isActive(pathname, t.href));
  // Modifier-click on the logo routes to /play (the games hub) instead
  // of /stacker. Alt/Option is the power-user shortcut — leaves ⌘/Ctrl
  // (open-in-new-tab) and shift (new window) with their native
  // browser behavior intact.
  const onLogoClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.altKey) {
      e.preventDefault();
      router.push(ROUTES.play);
    }
  };
  // Soft depth cue: once the page has scrolled meaningfully, cast a
  // faint shadow under the header. Hysteresis band (24px on, 8px
  // off) suppresses flicker from iOS rubber-band bounces and the
  // ±2px scrollY jitter that address-bar collapse introduces.
  // Passive listener so we don't block scrolling on low-end mobile.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const ON = 24;
    const OFF = 8;
    // Functional updater: uses the previous `scrolled` state so the
    // band is applied as true→false / false→true transitions, not
    // as a pure threshold. A user who scrolls to 28 → rubber-bands
    // to 14 won't flicker the shadow off.
    const check = () =>
      setScrolled((prev) => {
        const y = window.scrollY;
        if (prev) return y > OFF;
        return y > ON;
      });
    check();
    window.addEventListener("scroll", check, { passive: true });
    return () => window.removeEventListener("scroll", check);
  }, []);
  return (
    <header
      // POLISH-368 — safe-area-inset-top on the header itself, not
      // the inner content row. Root layout sets viewport-fit=cover,
      // so on notched iPhones + dynamic-island devices the viewport
      // begins under the notch. With `sticky top-0` the header
      // anchors there, and without a top inset the logo + tabs
      // sit behind the notch / clipped by the island. Pushing the
      // inset onto the <header> keeps the backdrop-blur stretching
      // to the hardware edge (so the notch still sees the tinted
      // pane, not a gap) while the content row (padding below)
      // clears the island. The audit ticket framed this as a
      // hero-tower concern; the actual offender was higher in the
      // tree. Hero tower is below-fold in document flow and was
      // never the problem.
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      className={`sticky top-0 z-40 border-b bg-background/85 backdrop-blur-md transition-shadow duration-200 ${
        scrolled
          ? "border-white/15 shadow-[0_8px_24px_-16px_rgba(0,0,0,0.65)]"
          : "border-white/10"
      }`}
    >
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-2.5 md:px-8">
        <Link
          href={ROUTES.stacker}
          onClick={onLogoClick}
          aria-label="Livewager · Stacker home (Alt-click for Games hub)"
          aria-current={pathname === ROUTES.stacker ? "page" : undefined}
          title="Home · Alt-click for Games hub"
          className="inline-flex items-center shrink-0 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
        >
          <Image
            src="/assets/logo43.png"
            alt="Livewager · Stacker"
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
            tab row carries the same information.
            SR exposure: the slash is decorative (aria-hidden), but
            the label itself is announced with an explicit
            "current page" hint so a VoiceOver user knows which
            section they're on without a visible tab strip. */}
        {activeTab && (
          <div
            className="lg:hidden flex items-baseline gap-1.5 text-[11px] uppercase tracking-widest min-w-0 truncate"
            aria-label="Current section"
          >
            <span aria-hidden className="text-gray-600">/</span>
            <span
              className="text-cyan-300 font-semibold truncate"
              aria-current="page"
            >
              {activeTab.label}
            </span>
          </div>
        )}

        {/* Tab strip is lg+ only. Nine tabs × ~88px avg = ~790px,
            plus logo (~216), wallet pill (~140), and palette hint
            (~95) — overflows the 768px md viewport (measured:
            ~1267px min against a 704px content budget after
            px-8 gutters). The breadcrumb carries "where am I"
            for md viewports; the palette and ⌘K discovery covers
            navigation for keyboard users at all widths. */}
        <nav
          ref={navRef}
          aria-label="Primary"
          className="relative hidden lg:flex items-stretch gap-1 ml-4 text-sm"
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
              first paint until the layout effect measures; appears
              in-place via opacity fade (primed=false suppresses the
              transform/width transition so it doesn't zoom in from
              x=0/w=0). Subsequent route changes flip primed=true and
              get the 260ms slide. Respects reduced motion via the
              global rule in style.css (transition-duration: 0.001ms). */}
          <span
            aria-hidden
            className="absolute bottom-[-7px] h-[2px] rounded-full pointer-events-none"
            style={{
              background: "linear-gradient(90deg,#22d3ee,#0891b2)",
              transform: `translateX(${ink.x}px)`,
              width: ink.w,
              opacity: ink.show ? 1 : 0,
              transition: ink.primed
                ? "transform 260ms cubic-bezier(0.2,0.8,0.2,1), width 260ms cubic-bezier(0.2,0.8,0.2,1), opacity 120ms linear"
                : "opacity 120ms linear",
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
