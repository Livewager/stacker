"use client";

/**
 * Games hub. Single game today (Stacker), but the hub stays a
 * distinct route so adding a second mechanic later is a one-array-
 * push edit.
 *
 * Kept deliberately simple: no auth required to browse, the card
 * links directly to the game route. Best-score + last-played read
 * client-side from localStorage so the surface always reflects what
 * the user has already done.
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import AppHeader from "@/components/AppHeader";
import OnboardingNudge from "@/components/OnboardingNudge";
import { HeroTower } from "@/components/stacker/HeroTower";

type Game = {
  href: string;
  tag: string;
  title: string;
  tagline: string;
  bullets: string[];
  accent: string; // css gradient for the card header bar
  bestKey: string | null; // localStorage key or null
  /** localStorage key for last-played epoch ms (JSON number). */
  lastPlayedKey: string | null;
  status: "live" | "beta";
  preview: "stacker";
  /**
   * Ship date of the game on /play. When within NEW_BADGE_WINDOW_MS
   * of the current time, the card renders a small cyan "new" pill
   * next to the status. Hidden after the window expires with no
   * runtime cost — just a date comparison at render time.
   *
   * Set once and left alone. If a game is reworked heavily later,
   * bumping this reuses the same discovery cue instead of adding
   * a separate "updated" system.
   */
  shippedAt: number; // epoch ms
};

/** Window during which the "new" badge appears on a game card. */
const NEW_BADGE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

const GAMES: Game[] = [
  {
    href: "/stacker",
    tag: "Stacker",
    title: "Stack to the top.",
    tagline:
      "Arcade classic. Rows slide; tap to lock. Hit the ceiling clean for a 3× demo prize. Chop off too much and the stack dies.",
    bullets: [
      "7 × 15 grid",
      "Perfect-stack streak bonus",
      "Wager chips (free / 5 / 25 / 100)",
    ],
    accent: "linear-gradient(90deg,#fdba74,#f97316)",
    bestKey: "livewager-stacker-best",
    lastPlayedKey: "livewager-pref:stackerLastPlayed",
    status: "live",
    preview: "stacker",
    shippedAt: Date.UTC(2026, 3, 5), // 2026-04-05 — inside the 30d window as of 2026-04-20
  },
];

function readNumberPref(key: string): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/**
 * Read a JSON epoch-ms value from localStorage. Used by the
 * lastPlayedKey markers both games stamp on round start.
 */
function readEpochPref(key: string): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const n = JSON.parse(raw);
    return typeof n === "number" && Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function formatRelative(tsMs: number, nowMs: number): string {
  const diff = Math.max(0, nowMs - tsMs);
  const min = 60_000;
  const hour = 60 * min;
  const day = 24 * hour;
  if (diff < min) return "just now";
  if (diff < hour) return `${Math.floor(diff / min)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  const d = new Date(tsMs);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function PlayHubPage() {
  const [bests, setBests] = useState<Record<string, number | null>>({});
  const [lastPlayed, setLastPlayed] = useState<Record<string, number | null>>({});
  // Tracks whether the local prefs have been read at least once. Without
  // this, the page renders a "first-time visitor" banner for a single
  // frame while prefs hydrate, then flips it away — a brief, confusing
  // flash for returning players. The flag lets us withhold the banner
  // until we *know* both last-played stamps are null.
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const bestNext: Record<string, number | null> = {};
    const lpNext: Record<string, number | null> = {};
    for (const g of GAMES) {
      if (g.bestKey) bestNext[g.bestKey] = readNumberPref(g.bestKey);
      if (g.lastPlayedKey) lpNext[g.lastPlayedKey] = readEpochPref(g.lastPlayedKey);
    }
    setBests(bestNext);
    setLastPlayed(lpNext);
    setPrefsLoaded(true);
  }, []);

  // First-time visitor: no lastPlayed stamp yet. Highlights the card
  // with a cyan accent so it reads as "start here" without needing a
  // separate banner. Hidden once the user has played at least once.
  const firstVisit =
    prefsLoaded && GAMES.every((g) => !g.lastPlayedKey || !lastPlayed[g.lastPlayedKey]);

  // Route-scoped number shortcuts: "1" → first game, "2" → second,
  // etc. Only while /play is the active view. Inert inside any text
  // input or when a modifier is held — the user might legitimately
  // be composing a form or using a leader-key sequence.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      const typing =
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        (e.target as HTMLElement | null)?.isContentEditable;
      if (typing) return;
      const digit = Number.parseInt(e.key, 10);
      if (!Number.isInteger(digit) || digit < 1 || digit > GAMES.length) return;
      const target = GAMES[digit - 1];
      if (!target) return;
      e.preventDefault();
      router.push(target.href);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  return (
    <>
      <AppHeader />
      <OnboardingNudge />
      <div className="min-h-screen bg-background text-white">
        <section className="max-w-7xl mx-auto px-5 md:px-8 py-8">
          <div className="max-w-2xl mb-8">
            <div className="text-xs uppercase tracking-widest mb-2 text-cyan-300">
              Play
            </div>
            <h1 className="text-3xl md:text-5xl font-black tracking-tight mb-2">
              Play{" "}
              <span
                className="bg-clip-text text-transparent"
                style={{
                  backgroundImage:
                    "linear-gradient(90deg,#22d3ee,#fdba74 50%,#facc15)",
                }}
              >
                Stacker
              </span>
              .
            </h1>
            <p className="text-gray-400 text-sm md:text-base max-w-lg">
              Non-custodial wallet. Arcade skill. Points, prizes, and leaderboard
              all live on the Internet Computer as ICRC-1 tokens. Every demo round
              is clearly labeled — nothing moves on-chain unless you ship it.
            </p>
          </div>

          <div className="grid gap-4 md:max-w-2xl">
            {GAMES.map((g, i) => {
              const best = g.bestKey ? bests[g.bestKey] : null;
              const lp = g.lastPlayedKey ? lastPlayed[g.lastPlayedKey] : null;
              const lastPlayedLabel =
                lp && Number.isFinite(lp)
                  ? formatRelative(lp, Date.now())
                  : null;
              const suggested = firstVisit;
              return (
                <ParallaxCard
                  key={g.href}
                  href={g.href}
                  className={`group relative overflow-hidden rounded-2xl border p-5 transition ${
                    suggested
                      ? "border-cyan-300/40 bg-cyan-300/[0.05] hover:border-cyan-300/60"
                      : "border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.05]"
                  }`}
                >
                  <div
                    aria-hidden
                    className="absolute inset-x-0 top-0 h-1"
                    style={{ background: g.accent }}
                  />
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest">
                      <span className="text-cyan-300">{g.tag}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 font-semibold ${
                          g.status === "live"
                            ? "border border-emerald-400/40 text-emerald-300 bg-emerald-400/[0.08]"
                            : "border border-orange-400/40 text-orange-300 bg-orange-400/[0.08]"
                        }`}
                      >
                        {g.status}
                      </span>
                      {/* "New" pill — auto-expires NEW_BADGE_WINDOW_MS
                          after the ship date so nobody has to remember
                          to delete it. Slight dot flourish so it stands
                          out without fighting the status pill's tone. */}
                      {Date.now() - g.shippedAt < NEW_BADGE_WINDOW_MS && (
                        <span
                          className="inline-flex items-center gap-1 rounded-full border border-cyan-300/40 bg-cyan-300/[0.08] px-2 py-0.5 font-semibold text-cyan-200"
                          title={`Shipped ${new Date(g.shippedAt).toLocaleDateString()}`}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />
                          new
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {best !== null && best !== undefined && (
                        <div className="rounded-md bg-black/50 px-2 py-1 text-[10px] font-mono uppercase tracking-widest">
                          <span className="text-gray-400">Best </span>
                          <span className="text-yellow-300 tabular-nums">{best}</span>
                        </div>
                      )}
                      {/* Keyboard shortcut hint — desktop only (hover
                          devices), mobile hides via hidden md:flex. The
                          numeric key matches this card's position in
                          GAMES. Pure hint; the listener above is what
                          actually navigates. */}
                      <kbd className="hidden md:inline-flex items-center rounded border border-white/15 bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-mono text-gray-400">
                        {i + 1}
                      </kbd>
                    </div>
                  </div>

                  <h2 className="text-2xl md:text-3xl font-black tracking-tight mb-2">
                    {g.title}
                  </h2>
                  <p className="text-sm text-gray-300 leading-snug mb-4 max-w-sm">
                    {g.tagline}
                  </p>

                  {/* Full Stacker hero animation, centered. Portrait
                      3:4 frame wraps the 7×15 tower comfortably; the
                      HeroTower SVG preserves aspect-ratio internally
                      so the grid always centers horizontally. */}
                  <div className="mb-4 mx-auto w-full max-w-[380px] aspect-[3/4]">
                    <HeroTower showBadges entrance={false} />
                  </div>

                  <ul className="space-y-1.5 mb-5">
                    {g.bullets.map((b) => (
                      <li
                        key={b}
                        className="flex items-start gap-2 text-xs text-gray-300"
                      >
                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-cyan-300/70 shrink-0" />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>

                  {lastPlayedLabel && (
                    <div className="mb-3 text-[10px] font-mono uppercase tracking-widest text-gray-500">
                      Last played · {lastPlayedLabel}
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <span className="text-[11px] uppercase tracking-widest text-gray-500">
                      Enter
                    </span>
                    <span
                      aria-hidden
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-white/70 transition group-hover:bg-cyan-300/15 group-hover:text-cyan-300"
                    >
                      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5">
                        <path d="M7.3 4.3a1 1 0 0 1 1.4 0l5 5a1 1 0 0 1 0 1.4l-5 5a1 1 0 0 1-1.4-1.4L11.58 10 7.3 5.7a1 1 0 0 1 0-1.4Z" />
                      </svg>
                    </span>
                  </div>
                </ParallaxCard>
              );
            })}
          </div>

          <p className="mt-6 text-xs text-gray-500 max-w-lg">
            More games are in development. If you have a skill-game mechanic that
            fits a 10-30 second round, the shared wallet + ledger make it cheap to
            plug in.
          </p>
        </section>
      </div>
    </>
  );
}

// ---------------------------------------------------------------
// ---------------------------------------------------------------
// Parallax tilt wrapper. Desktop-only (md+) via window.matchMedia +
// prefers-reduced-motion gate. Tracks pointer position within the
// card and applies a tiny rotateX/Y transform so the card feels
// three-dimensional when hovered. The underlying preview SVGs pop
// a bit because their "depth" now shifts with the cursor.
//
// Mobile + reduced-motion paths short-circuit and just render the
// Link so touch users never trigger an accidental parallax.
// ---------------------------------------------------------------

function ParallaxCard({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLAnchorElement | null>(null);
  const reduced = useReducedMotion();
  const [enabled, setEnabled] = useState(false);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0 });

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Tailwind md breakpoint = 768px. Only enable above that — touch
    // viewports and mobile Safari don't benefit from pointermove
    // tracking.
    const mq = window.matchMedia("(hover: hover) and (min-width: 768px)");
    const update = () => setEnabled(mq.matches && !reduced);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [reduced]);

  const onMove = (e: React.PointerEvent<HTMLAnchorElement>) => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width; // 0..1
    const py = (e.clientY - rect.top) / rect.height; // 0..1
    // Max 6° each axis; flip Y so top-of-card tilts toward viewer.
    const ry = (px - 0.5) * 12;
    const rx = -(py - 0.5) * 12;
    setTilt({ rx, ry });
  };
  const reset = () => setTilt({ rx: 0, ry: 0 });

  const style = enabled
    ? {
        transform: `perspective(900px) rotateX(${tilt.rx.toFixed(
          2,
        )}deg) rotateY(${tilt.ry.toFixed(2)}deg)`,
        transformStyle: "preserve-3d" as const,
        // POLISH-369 audit: the two-mode transition (260ms glide on
        // reset, none during active tracking) is the right shape.
        // - `none` during tracking because the tilt is a pure
        //   geometric map of cursor position (not velocity-
        //   integrated), so any transition delay shows up as the
        //   card *lagging* the cursor. 60Hz pointermove events land
        //   every ~16ms; even an 80ms transition would mean the
        //   card only reaches ~20% of each new target before the
        //   next move rewrites it — mushy, not smooth.
        // - 260ms glide on reset because leave is a one-shot event
        //   and the user wants to see the card settle gracefully.
        // The "overshoot at high velocity" concern the ticket
        // raised doesn't apply: this is pure position→angle, not
        // a spring. Max angle is ±6° at card edges by construction.
        // The "laggy at low velocity" concern also doesn't apply:
        // there's no damping term to lag against.
        // One theoretical cost: pointer-enter at a non-center
        // position produces a 1-frame snap from 0° to wherever
        // the cursor is. Imperceptible at 6° max angle over 16ms,
        // and the common case is cursor-trail continuity from
        // just outside the card (so the enter position is near 0
        // anyway). Not worth adding justEntered state to smooth.
        transition:
          tilt.rx === 0 && tilt.ry === 0
            ? "transform 260ms cubic-bezier(0.2,0.8,0.2,1)"
            : "none",
        willChange: "transform",
      }
    : undefined;

  return (
    <Link
      ref={ref}
      href={href}
      // Built-in keyboard focus ring: cyan + 2px outline-offset so
      // the ring sits outside the card's own border instead of
      // hugging it. Tilt transform lives via `style`; the ring
      // uses outline (not box-shadow) so preserve-3d doesn't
      // flatten it when enabled. Call sites only need to pass
      // their shape/color classes.
      className={`${className ?? ""} focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300/70`}
      style={style}
      onPointerMove={onMove}
      onPointerLeave={reset}
      onPointerCancel={reset}
    >
      {children}
    </Link>
  );
}

