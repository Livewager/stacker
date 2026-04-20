"use client";

/**
 * Games hub. Two cards, two routes, one shared wallet.
 *
 * Kept deliberately simple: no auth required to browse, the cards link
 * directly to the game routes. Stats (best score, hourly rank) read
 * client-side from the same localStorage keys each game writes to, so
 * they just reflect whatever the user has already played.
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import AppHeader from "@/components/AppHeader";
import OnboardingNudge from "@/components/OnboardingNudge";

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
  preview: "pour" | "stacker";
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
    href: "/dunk",
    tag: "Tilt Pour",
    title: "Tilt. Pour. Don't spill.",
    tagline:
      "Phone-native skill game. Tilt your device to pour, steady your hand, and hit the line without overflowing.",
    bullets: [
      "20-second round",
      "Gyroscope + keyboard fallback",
      "Leaderboard integration",
    ],
    accent: "linear-gradient(90deg,#22d3ee,#0891b2)",
    bestKey: null,
    lastPlayedKey: "livewager-pref:pourLastPlayed",
    status: "live",
    preview: "pour",
    shippedAt: Date.UTC(2026, 0, 15), // 2026-01-15
  },
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

  useEffect(() => {
    const bestNext: Record<string, number | null> = {};
    const lpNext: Record<string, number | null> = {};
    for (const g of GAMES) {
      if (g.bestKey) bestNext[g.bestKey] = readNumberPref(g.bestKey);
      if (g.lastPlayedKey) lpNext[g.lastPlayedKey] = readEpochPref(g.lastPlayedKey);
    }
    setBests(bestNext);
    setLastPlayed(lpNext);
  }, []);

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
              Pick a game.
            </h1>
            <p className="text-gray-400 text-sm md:text-base max-w-lg">
              Same wallet, different skill surface. Points, prizes, and leaderboard
              all live on the Internet Computer as ICRC-1 tokens. Every demo round
              is clearly labeled — nothing moves on-chain unless you ship it.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {GAMES.map((g) => {
              const best = g.bestKey ? bests[g.bestKey] : null;
              const lp = g.lastPlayedKey ? lastPlayed[g.lastPlayedKey] : null;
              const lastPlayedLabel =
                lp && Number.isFinite(lp)
                  ? formatRelative(lp, Date.now())
                  : null;
              return (
                <ParallaxCard
                  key={g.href}
                  href={g.href}
                  className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-white/25 hover:bg-white/[0.05]"
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
                    {best !== null && best !== undefined && (
                      <div className="rounded-md bg-black/50 px-2 py-1 text-[10px] font-mono uppercase tracking-widest">
                        <span className="text-gray-400">Best </span>
                        <span className="text-yellow-300 tabular-nums">{best}</span>
                      </div>
                    )}
                  </div>

                  <h2 className="text-2xl md:text-3xl font-black tracking-tight mb-2">
                    {g.title}
                  </h2>
                  <p className="text-sm text-gray-300 leading-snug mb-4 max-w-sm">
                    {g.tagline}
                  </p>

                  <div className="mb-4 rounded-xl overflow-hidden border border-white/5 bg-black/40 aspect-[5/2]">
                    <GamePreview kind={g.preview} />
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
                      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
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
      className={className}
      style={style}
      onPointerMove={onMove}
      onPointerLeave={reset}
      onPointerCancel={reset}
    >
      {children}
    </Link>
  );
}

// Per-game animated previews. Inline SVG + framer-motion so the
// cards render a living peek at each mechanic. Loops continuously
// rather than hover-only so mobile sees them too.
// ---------------------------------------------------------------

function GamePreview({ kind }: { kind: "pour" | "stacker" }) {
  return kind === "pour" ? <PourPreview /> : <StackerPreview />;
}

function PourPreview() {
  const reduced = useReducedMotion();
  return (
    <svg
      viewBox="0 0 200 80"
      className="w-full h-full"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      {/* Background wash */}
      <defs>
        <linearGradient id="pour-bg" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#0c2437" />
          <stop offset="100%" stopColor="#020b18" />
        </linearGradient>
        <linearGradient id="pour-water" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#0891b2" />
        </linearGradient>
      </defs>
      <rect width="200" height="80" fill="url(#pour-bg)" />

      {/* Target line */}
      <line
        x1="120"
        x2="180"
        y1="30"
        y2="30"
        stroke="#22d3ee"
        strokeOpacity="0.5"
        strokeDasharray="2 3"
        strokeWidth="1"
      />
      <text
        x="180"
        y="28"
        fontSize="6"
        fontFamily="ui-monospace, SFMono-Regular, monospace"
        fill="#22d3ee"
        textAnchor="end"
        opacity="0.7"
      >
        LINE
      </text>

      {/* Tilting pitcher + water stream */}
      <motion.g
        style={{ transformOrigin: "60px 35px" }}
        initial={{ rotate: 10 }}
        animate={reduced ? { rotate: 35 } : { rotate: [10, 55, 20, 40, 10] }}
        transition={{
          duration: 5,
          repeat: reduced ? 0 : Infinity,
          ease: "easeInOut",
        }}
      >
        {/* Pitcher body */}
        <path
          d="M 48 20 L 72 20 L 70 42 L 50 42 Z"
          fill="rgba(255,255,255,0.9)"
        />
        {/* Handle */}
        <path
          d="M 72 24 Q 80 28 72 38"
          fill="none"
          stroke="rgba(255,255,255,0.9)"
          strokeWidth="1.6"
        />
        {/* Spout */}
        <path d="M 48 20 L 44 17 L 46 22 Z" fill="rgba(255,255,255,0.9)" />
      </motion.g>

      {/* Water stream — loops in sync with pitcher peak tilt */}
      {!reduced && (
        <motion.path
          d="M 46 22 Q 70 40 120 60 L 180 60 L 180 75 L 120 75 Z"
          fill="url(#pour-water)"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.7, 0.95, 0.7, 0] }}
          transition={{ duration: 5, repeat: Infinity, times: [0, 0.25, 0.5, 0.75, 1] }}
        />
      )}

      {/* Cup filling up */}
      <rect x="120" y="38" width="60" height="32" rx="2" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.2)" strokeWidth="0.8" />
      <motion.rect
        x="122"
        y="55"
        width="56"
        height="13"
        rx="1"
        fill="url(#pour-water)"
        initial={{ height: 2, y: 66 }}
        animate={reduced ? { height: 20, y: 48 } : { height: [2, 20, 6, 16, 2], y: [66, 48, 62, 52, 66] }}
        transition={{ duration: 5, repeat: reduced ? 0 : Infinity, times: [0, 0.3, 0.55, 0.8, 1] }}
      />
    </svg>
  );
}

function StackerPreview() {
  const reduced = useReducedMotion();
  const BASE_BLOCKS = 4; // four stacked blocks at the bottom
  return (
    <svg
      viewBox="0 0 200 80"
      className="w-full h-full"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      <defs>
        <linearGradient id="stk-bg" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#0c2437" />
          <stop offset="100%" stopColor="#020b18" />
        </linearGradient>
        <linearGradient id="stk-block" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#fdba74" />
          <stop offset="100%" stopColor="#f97316" />
        </linearGradient>
      </defs>
      <rect width="200" height="80" fill="url(#stk-bg)" />

      {/* Grid dots */}
      {Array.from({ length: 10 }, (_, c) =>
        Array.from({ length: 4 }, (_, r) => (
          <circle
            key={`${c}-${r}`}
            cx={20 + c * 18}
            cy={20 + r * 16}
            r="0.6"
            fill="rgba(255,255,255,0.06)"
          />
        )),
      )}

      {/* Stacked blocks */}
      {Array.from({ length: BASE_BLOCKS }, (_, i) => (
        <rect
          key={i}
          x={60}
          y={70 - i * 10}
          width={80}
          height={8}
          rx={1.5}
          fill="url(#stk-block)"
          opacity={0.92}
        />
      ))}

      {/* Moving slider on top */}
      <motion.rect
        y={20}
        width={80}
        height={8}
        rx={1.5}
        fill="#fdba74"
        initial={{ x: 20 }}
        animate={reduced ? { x: 60 } : { x: [20, 100, 20] }}
        transition={{
          duration: 3.2,
          repeat: reduced ? 0 : Infinity,
          ease: "easeInOut",
        }}
        style={{
          filter: "drop-shadow(0 0 6px rgba(253,186,116,0.45))",
        }}
      />

      {/* "TAP" prompt pulsing to hint the mechanic */}
      {!reduced && (
        <motion.g
          initial={{ opacity: 0.2 }}
          animate={{ opacity: [0.2, 0.85, 0.2] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        >
          <rect x="160" y="6" width="32" height="12" rx="2" fill="rgba(253,186,116,0.15)" stroke="rgba(253,186,116,0.6)" strokeWidth="0.6" />
          <text
            x="176"
            y="14"
            fontSize="6"
            fontFamily="ui-monospace, SFMono-Regular, monospace"
            fill="#fdba74"
            textAnchor="middle"
            letterSpacing="1"
          >
            TAP
          </text>
        </motion.g>
      )}
    </svg>
  );
}
