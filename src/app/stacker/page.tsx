"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import Image from "next/image";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { StackerWager, PAYOUT_MULTIPLIER } from "@/components/stacker/StackerWager";
import { Livestream } from "@/components/stacker/Livestream";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { ROUTES } from "@/lib/routes";

/**
 * Parse a seed query param in the forms: "0xABCD", "ABCD" (hex),
 * or a decimal int. Any malformed value falls through to null so
 * the game uses its own randomSeed(). Clamps to 32 bits to match
 * SeededRng's mulberry32 input.
 */
function parseSeedParam(raw: string | null): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // 0x-prefixed or bare hex — 1..8 hex digits.
  const hex = trimmed.startsWith("0x") || trimmed.startsWith("0X")
    ? trimmed.slice(2)
    : /^[0-9a-fA-F]{1,8}$/.test(trimmed)
      ? trimmed
      : null;
  if (hex !== null && /^[0-9a-fA-F]{1,8}$/.test(hex)) {
    const n = Number.parseInt(hex, 16);
    return Number.isFinite(n) ? n >>> 0 : null;
  }
  // Plain decimal — accept positive 32-bit values.
  const dec = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(dec) || dec < 0) return null;
  return dec >>> 0;
}

const StackerGame = dynamic(() => import("@/components/stacker/StackerGame"), {
  ssr: false,
  loading: () => (
    <div className="mx-auto w-full max-w-[560px] aspect-[3/5] rounded-2xl border border-white/10 bg-white/[0.03] animate-pulse" />
  ),
});

type Phase = "idle" | "playing" | "won" | "over";

export default function StackerPage() {
  // useSearchParams needs a Suspense boundary in Next 15 App Router.
  return (
    <Suspense fallback={null}>
      <StackerPageInner />
    </Suspense>
  );
}

function StackerPageInner() {
  const searchParams = useSearchParams();
  // Consume the ?seed= param once at mount. Subsequent client nav
  // that changes this param won't retroactively rewrite the current
  // round — that'd be surprising. If the user wants a fresh replay
  // they can change the URL and refresh.
  const initialSeed = useMemo(
    () => parseSeedParam(searchParams.get("seed")),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [stake, setStake] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [roundKey, setRoundKey] = useState(0);
  const wagerDisabled = phase === "playing";

  // Scope the scroll-snap behavior to this page only. <html> is the
  // scroll container, so we add/remove a class there. No regression
  // risk because the CSS hides behind a mobile media query.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("lw-snap-page");
    return () => root.classList.remove("lw-snap-page");
  }, []);

  return (
    <div className="min-h-screen bg-background text-white relative overflow-x-hidden">
      <AmbientBackdrop />

      {/* Sticky hero nav: was `relative z-20` so it scrolled off on a
          long landing, which left Deposit + Play CTAs only reachable
          via the in-page scroll-back. Every other route sits under
          AppHeader (sticky top-0 z-40) so /stacker felt janky in
          comparison — a user 3 sections deep who wanted to deposit
          had to scroll all the way back up or find the WagerPrimer
          call-out. sticky top-0 + backdrop-blur matches AppHeader's
          POLISH-368 treatment (safe-area-inset-top on the <nav>
          itself so notched viewports keep the backdrop stretching
          to the hardware edge). */}
      <nav
        aria-label="Site"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
        className="sticky top-0 z-30 border-b border-white/10 bg-background/85 backdrop-blur-md"
      >
        <ScrollProgress />

        <div className="max-w-7xl mx-auto px-5 md:px-8 py-3 md:py-4 flex items-center justify-between gap-3">
          <Link href={ROUTES.stacker} className="flex items-center" aria-label="Livewager Stacker home">
            <Image
              src="/assets/logo43.png"
              alt="Livewager · Stacker"
              width={440}
              height={144}
              priority
              sizes="(max-width: 768px) 220px, 360px"
              style={{ height: 56, width: "auto", objectFit: "contain" }}
            />
          </Link>
          <div className="flex items-center gap-2">
            <Link href={ROUTES.play} className="hidden sm:inline-flex">
              <Button variant="outline" size="sm">
                ← All games
              </Button>
            </Link>
            <Link href={ROUTES.deposit}>
              <Button tone="orange" size="sm">
                Deposit now
              </Button>
            </Link>
            <a href="#play">
              <Button tone="cyan" size="sm">
                Play
              </Button>
            </a>
          </div>
        </div>
      </nav>

      {/* -------------- HERO -------------- */}
      <Hero />

      {/* -------------- LIVESTREAM PLACEHOLDER --------------
          Social proof of play: a 16:9 gradient tile dressed up as
          a video player with fake cycling chat beside it. Not a
          real stream — the "demo" pill and "Chat input opens once
          the real stream ships" copy keep that honest. */}
      <Livestream />

      {/* -------------- WHY IT'S HARD -------------- */}
      <DifficultyLadder />

      {/* -------------- HOW IT WORKS -------------- */}
      <HowItWorks />

      {/* -------------- WAGER PRIMER -------------- */}
      <WagerPrimer />

      {/* Fair play explainer lives on its own /fair-play route, linked
          from the WagerPrimer's demo-pill row above (STACKER-24). The
          /stacker page overrides AppHeader with its own custom hero
          nav so the global header link isn't reachable from here —
          the inline contextual link inside WagerPrimer is the only
          path forward to fair-play details for users who land on
          /stacker. Previously inlined here; moved out so the /stacker
          landing stays focused on the game itself. */}

      {/* -------------- PLAY -------------- */}
      <section
        id="play"
        className="lw-section relative z-10 max-w-7xl mx-auto px-5 md:px-8 pt-8 pb-16"
      >
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-cyan-300 mb-2 flex items-center gap-2">
              <span>Your round</span>
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-400/[0.08] px-1.5 py-0.5 text-[9px] font-semibold text-emerald-200">
                <span aria-hidden className="h-1 w-1 rounded-full bg-emerald-300 animate-pulse" />
                live demo
              </span>
            </div>
            <h2 className="text-4xl md:text-5xl font-black tracking-tight leading-[0.95]">
              Lock in. Stack clean.
            </h2>
            <p className="text-sm md:text-base text-gray-400 mt-2 max-w-lg">
              Pick a chip, then tap to start. Space or Enter works too. Low on
              LWP?{" "}
              <Link
                href={ROUTES.deposit}
                className="text-orange-300 underline underline-offset-2 hover:text-orange-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300/60 rounded-sm"
              >
                Top up now →
              </Link>
            </p>
          </div>
          <Link href={ROUTES.deposit} className="hidden md:block">
            <Button tone="orange" size="lg">
              Deposit LWP
            </Button>
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-[minmax(0,560px)_1fr] items-start">
          {/* Game board with a pulsing bloom behind it on idle, so
              the eye tracks to it. Bloom fades the moment the round
              begins so it doesn't fight the gameplay canvas. */}
          <div className="relative">
            <div
              aria-hidden
              className={`absolute -inset-6 rounded-[2rem] pointer-events-none transition-opacity duration-500 ${
                phase === "playing" ? "opacity-0" : "opacity-100"
              }`}
              style={{
                background:
                  "radial-gradient(500px 420px at 50% 50%, rgba(34,211,238,0.16), rgba(249,115,22,0.08) 55%, transparent 75%)",
                filter: "blur(6px)",
              }}
            />
            <StackerGame
              key={roundKey}
              stake={stake}
              winMultiplier={PAYOUT_MULTIPLIER.win}
              // Seed replay: ?seed=0x... on the very first mounted
              // round only. Subsequent rounds (roundKey > 0) fall back
              // to a fresh random seed so the user doesn't get locked
              // into the same level forever.
              initialSeed={roundKey === 0 ? initialSeed : null}
              onPhaseChange={(p) => setPhase(p)}
            />
          </div>

          <div className="space-y-4">
            <StackerWager
              disabled={wagerDisabled}
              onStart={(s) => {
                // Future slice: thread `mode` into StackerGame so it
                // can disable the entropy buffer on unranked rounds.
                // For now the stake-forced-to-0 on unranked is enough
                // to keep the prize copy honest.
                setStake(s);
                setRoundKey((k) => k + 1);
                setPhase("idle");
              }}
            />

            <div className="grid gap-3 text-sm text-gray-300">
              <Tip title="Controls">Space / Enter / Click / Tap locks the slider.</Tip>
              <Tip title="Scoring">10 pts per row. Perfect stack adds 15 × streak.</Tip>
              <Tip title="Prize (demo)">
                Stake × {PAYOUT_MULTIPLIER.win} on a clean top floor. LWP does not
                move on-chain in this demo round.
              </Tip>
            </div>
          </div>
        </div>

        {/* Sticky mobile-only deposit rail — only after the fold.
            Puts a fat orange CTA within thumb reach the moment the
            user has scrolled to the actual play area. */}
        <StickyDepositRail />
      </section>
    </div>
  );
}

// =============================================================
// Background
// =============================================================

function AmbientBackdrop() {
  return (
    <div
      aria-hidden
      className="absolute inset-0 z-0 pointer-events-none"
      style={{
        background:
          "radial-gradient(1200px 700px at 10% -10%, rgba(34,211,238,0.18), transparent 60%), radial-gradient(900px 600px at 110% 10%, rgba(249,115,22,0.14), transparent 55%), radial-gradient(1000px 700px at 50% 110%, rgba(139,92,246,0.12), transparent 60%)",
      }}
    />
  );
}

// =============================================================
// Hero
// =============================================================

function Hero() {
  return (
    <section className="lw-section relative z-10 max-w-7xl mx-auto px-5 md:px-8 pt-4 pb-12 md:pt-10 md:pb-20">
      <div className="grid gap-8 md:grid-cols-[1.15fr_1fr] items-center">
        <div>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="flex items-center gap-2 mb-4 flex-wrap"
          >
            <Pill status="demo">Arcade · demo</Pill>
            <span className="text-[10px] uppercase tracking-widest text-gray-500">
              Stacker · Livewager
            </span>
            <LivePulse />
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.05 }}
            className="text-5xl md:text-7xl font-black tracking-tight leading-[0.95] mb-4"
          >
            Stack to the{" "}
            <span className="relative inline-block">
              {/* Pulsing glow behind the gradient word. Scoped to
                  the word itself so the rest of the h1 stays static.
                  Respects reduced-motion via the global CSS clamp in
                  style.css which drops transition-duration to 0.001ms
                  — the framer-motion animate prop also defers to OS
                  preference. */}
              <motion.span
                aria-hidden
                className="absolute inset-0 blur-xl pointer-events-none"
                style={{
                  background:
                    "linear-gradient(90deg,rgba(34,211,238,0.55),rgba(253,186,116,0.55) 50%,rgba(250,204,21,0.55))",
                  borderRadius: 12,
                }}
                initial={{ opacity: 0.35, scale: 0.96 }}
                animate={{ opacity: [0.35, 0.7, 0.35], scale: [0.96, 1.04, 0.96] }}
                transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
              />
              <span
                className="relative bg-clip-text text-transparent"
                style={{
                  backgroundImage:
                    "linear-gradient(90deg,#22d3ee,#fdba74 50%,#facc15)",
                }}
              >
                top.
              </span>
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.12 }}
            className="text-gray-300 text-base md:text-lg max-w-lg leading-snug mb-6"
          >
            Fifteen rows. A sliding block. One tap to lock it. Miss the window
            and the stack narrows — hit zero and it collapses. The top floor
            pays{" "}
            <span className="text-yellow-300 font-semibold">
              {PAYOUT_MULTIPLIER.win}×
            </span>{" "}
            your stake.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.18 }}
            className="flex flex-wrap items-center gap-3"
          >
            <a href="#play">
              <Button tone="cyan" size="lg">
                Play now
              </Button>
            </a>
            <Link href={ROUTES.deposit}>
              <Button tone="orange" size="lg">
                Deposit LWP
              </Button>
            </Link>
            <a href="#how">
              <Button variant="outline" size="lg">
                How it works
              </Button>
            </a>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.35 }}
            // Mobile: horizontal scroll with snap + chrome-free scrollbar.
            // Desktop (sm+): falls back to the original flex-wrap so the
            // stat chips never collide with the hero copy (POLISH-223).
            className="mt-8 flex items-center gap-x-6 gap-y-2 text-[11px] text-gray-500 overflow-x-auto snap-x snap-mandatory no-scrollbar -mx-5 px-5 sm:mx-0 sm:px-0 sm:flex-wrap sm:overflow-visible sm:snap-none"
          >
            <StatChip label="Grid" value="7 × 15" />
            <StatChip label="Round" value="~30s" />
            <StatChip label="Perfect bonus" value="15 × streak" />
            <StatChip label="Prize mode" value={`${PAYOUT_MULTIPLIER.win}× stake`} />
          </motion.div>
        </div>

        <HeroTower />
      </div>

      <WinnersMarquee />
    </section>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-2 shrink-0 snap-start rounded-full border border-white/10 bg-white/[0.03] pl-2 pr-2.5 py-1">
      <span aria-hidden className="h-1 w-1 rounded-full bg-cyan-300/60" />
      <span className="text-[10px] uppercase tracking-widest text-gray-500">{label}</span>
      <span className="font-mono text-xs text-white tabular-nums">{value}</span>
    </span>
  );
}

// =============================================================
// Live pulse — "N playing now" chip in the badge row
// =============================================================

/**
 * Small live-ish pulse that sits next to the hero's eyebrow row.
 * Deterministic per-minute: the "playing now" count comes from a
 * mulberry32 hash of the current minute so every visitor in the
 * same minute sees the same number (the social-proof trick). Dot
 * pulses via animate-pulse, gated by prefers-reduced-motion via
 * the framer-motion hook.
 */
function LivePulse() {
  const reduced = useReducedMotion();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    // Refresh every 30s so the count drifts as the user reads.
    const id = window.setInterval(() => setTick((t) => t + 1), 30_000);
    return () => window.clearInterval(id);
    // tick unused — interval just re-runs the closure to bump state
  }, []);
  const n = useMemo(() => {
    const m = Math.floor(Date.now() / 60_000);
    let h = (m ^ 0x9e3779b9) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 2246822507) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
    h ^= h >>> 16;
    // 180..420 playing now, stable per minute.
    return 180 + (h % 240);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-400/[0.08] px-2 py-0.5 text-[10px] uppercase tracking-widest font-semibold text-emerald-200"
      role="status"
      aria-live="off"
      title="Live players (demo)"
    >
      <span
        aria-hidden
        className={`h-1.5 w-1.5 rounded-full bg-emerald-300 ${reduced ? "" : "animate-pulse"}`}
      />
      <span className="font-mono tabular-nums">{n}</span>
      <span className="text-emerald-300/80">playing now</span>
    </span>
  );
}

// =============================================================
// Scroll progress — 2px gradient bar pinned to the sticky nav top
// =============================================================

/**
 * Thin cyan→orange→yellow progress bar that grows across the top
 * of the sticky hero nav as the user scrolls the page. Fills 0→1
 * over the full scrollable range. Passive scroll listener + rAF
 * throttling so the bar can't drop frames on low-end mobile. Uses
 * transform: scaleX so the browser composites on the GPU and
 * avoids layout thrash.
 */
function ScrollProgress() {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    let rafId = 0;
    const tick = () => {
      const max =
        (document.documentElement.scrollHeight || 0) - window.innerHeight;
      const y = window.scrollY;
      setPct(max > 0 ? Math.min(1, Math.max(0, y / max)) : 0);
      rafId = 0;
    };
    const onScroll = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(tick);
    };
    tick();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, []);
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-white/5 overflow-hidden"
      style={{ top: "env(safe-area-inset-top, 0px)" }}
    >
      <div
        className="h-full origin-left"
        style={{
          background:
            "linear-gradient(90deg,#22d3ee,#fdba74 55%,#facc15)",
          transform: `scaleX(${pct.toFixed(4)})`,
        }}
      />
    </div>
  );
}

// =============================================================
// Winners marquee — scrolling ticker of recent fake wins
// =============================================================

type MarqueeEntry = { handle: string; amount: number; tier: "big" | "mid" | "small" };
const MARQUEE_POOL: MarqueeEntry[] = [
  { handle: "topfloor", amount: 300, tier: "big" },
  { handle: "queenstacks", amount: 75, tier: "mid" },
  { handle: "basedhunter", amount: 300, tier: "big" },
  { handle: "r3m", amount: 15, tier: "small" },
  { handle: "cosmic", amount: 75, tier: "mid" },
  { handle: "mimic", amount: 15, tier: "small" },
  { handle: "elev8", amount: 300, tier: "big" },
  { handle: "ftboi", amount: 75, tier: "mid" },
  { handle: "ricochet", amount: 300, tier: "big" },
  { handle: "civic", amount: 15, tier: "small" },
  { handle: "atxstax", amount: 75, tier: "mid" },
  { handle: "dropship", amount: 15, tier: "small" },
];

/**
 * Auto-scrolling winners ticker below the hero. Renders two copies
 * of the pool end-to-end and translates the container by -50% over
 * a long duration so the loop seams are invisible (the half-offset
 * lines up with the duplicate starting position). Pauses on hover
 * and when prefers-reduced-motion is set; reduced users get a
 * static "recent wins" chip strip instead.
 */
function WinnersMarquee() {
  const reduced = useReducedMotion();
  const entries = [...MARQUEE_POOL, ...MARQUEE_POOL];
  return (
    <div
      aria-label="Recent winners (demo)"
      role="region"
      className="mt-10 relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-r from-white/[0.03] via-white/[0.05] to-white/[0.03]"
    >
      {/* Left + right fade masks */}
      <div
        aria-hidden
        className="absolute inset-y-0 left-0 w-16 z-10 pointer-events-none"
        style={{
          background:
            "linear-gradient(90deg, rgba(2,11,24,1), rgba(2,11,24,0))",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-y-0 right-0 w-16 z-10 pointer-events-none"
        style={{
          background:
            "linear-gradient(270deg, rgba(2,11,24,1), rgba(2,11,24,0))",
        }}
      />

      <div className="flex items-center gap-3 py-3 pl-4 pr-4">
        <span className="shrink-0 text-[10px] uppercase tracking-widest font-mono text-yellow-300/90 z-20 relative">
          Recent wins
        </span>
        <div className="relative flex-1 overflow-hidden">
          {reduced ? (
            // Static row when reduced — show 4 entries, no motion.
            <div className="flex items-center gap-4">
              {MARQUEE_POOL.slice(0, 4).map((e, i) => (
                <MarqueeChip key={i} entry={e} />
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-4 animate-[lw-marquee_34s_linear_infinite] hover:[animation-play-state:paused]">
              {entries.map((e, i) => (
                <MarqueeChip key={i} entry={e} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Keyframes scoped to this component */}
      <style>{`
        @keyframes lw-marquee {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}

// =============================================================
// Sticky deposit rail — mobile-only, appears after scroll
// =============================================================

/**
 * Thumb-reach DEPOSIT NOW button fixed to the bottom-right on
 * mobile only. Appears after the user has scrolled ~500px past
 * the hero (so it doesn't crowd the first-paint), sits above the
 * BottomNav safe-area-inset, and dismisses if the user dismisses
 * it. Hidden at md+ because desktop already shows deposit buttons
 * in the sticky top nav, the hero CTA rail, the Play section
 * header, and the WagerPrimer panel.
 */
function StickyDepositRail() {
  const reduced = useReducedMotion();
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > 500);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  if (dismissed) return null;
  return (
    <div
      className="md:hidden fixed right-4 z-40 flex items-center gap-1.5 transition-[opacity,transform] duration-200"
      style={{
        bottom: "calc(80px + env(safe-area-inset-bottom, 0px))",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(8px)",
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      <Link
        href={ROUTES.deposit}
        aria-label="Deposit LWP"
        className="relative inline-flex items-center gap-2 rounded-full border border-orange-300/60 px-4 py-2.5 text-sm font-black uppercase tracking-widest text-black shadow-[0_10px_24px_-10px_rgba(249,115,22,0.55)] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
        style={{
          background:
            "linear-gradient(90deg,#fdba74,#f97316 60%,#ea580c)",
        }}
      >
        <span aria-hidden className={`h-1.5 w-1.5 rounded-full bg-black/70 ${reduced ? "" : "animate-pulse"}`} />
        Deposit now
      </Link>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss deposit reminder"
        className="inline-flex items-center justify-center h-8 w-8 rounded-full border border-white/15 bg-background/85 backdrop-blur-sm text-gray-300 hover:text-white hover:border-white/30 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3" aria-hidden>
          <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
        </svg>
      </button>
    </div>
  );
}

/**
 * Hash handle → deterministic "seconds ago" in [8, 420). Stable
 * per-handle so the same chip always shows the same relative time
 * across mounts within a page view, which keeps the marquee honest
 * even though the data is fake. FNV-1a is overkill but cheap.
 */
function handleSecondsAgo(handle: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < handle.length; i++) {
    h ^= handle.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  // 8s..7m spread — matches the feel of a live chat.
  return 8 + (h % 412);
}

function formatRelative(s: number): string {
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  return `${m}m ago`;
}

function MarqueeChip({ entry }: { entry: MarqueeEntry }) {
  const toneCls =
    entry.tier === "big"
      ? "border-yellow-400/40 bg-yellow-400/[0.08] text-yellow-200"
      : entry.tier === "mid"
        ? "border-cyan-300/40 bg-cyan-300/[0.08] text-cyan-200"
        : "border-white/15 bg-white/[0.04] text-gray-300";
  const relTs = formatRelative(handleSecondsAgo(entry.handle));
  return (
    <span
      className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-mono ${toneCls}`}
    >
      <span className="font-semibold">@{entry.handle}</span>
      <span className="text-white/90">+{entry.amount} LWP</span>
      <span className="text-white/40 hidden sm:inline">· {relTs}</span>
    </span>
  );
}

// ---- Animated tower preview ----

/**
 * Hero tower: an actual demo round playing on loop.
 *
 * Each row is a two-phase step (slide → lock). The slider sweeps
 * left↔right during the slide, a ripple marks the lock, and the
 * block drops into place. One row in the middle is imperfect (a
 * falling shard sells the chop-off rule). At the top, a prize ring
 * fires and the whole stack fades so the next loop can begin fresh.
 *
 * Timing is driven by performance.now inside a single rAF tick so
 * everything stays in sync. No framer-motion variants — we're
 * computing frame values directly, which buys us smoother chain
 * transitions than discrete keyframed fragments.
 */

const HERO_GRID_COLS = 7;
const HERO_GRID_ROWS = 15;

/** Demo-round script. Each entry is one row the slider will lock on. */
type HeroRow = { width: number; lockCol: number; perfect: boolean };
const HERO_SCRIPT: HeroRow[] = [
  { width: 3, lockCol: 2, perfect: true },
  { width: 3, lockCol: 2, perfect: true },
  { width: 3, lockCol: 2, perfect: true },
  { width: 3, lockCol: 2, perfect: true },
  { width: 3, lockCol: 2, perfect: true },
  { width: 3, lockCol: 2, perfect: true },
  { width: 3, lockCol: 3, perfect: false }, // +1 chop at row 6
  { width: 2, lockCol: 3, perfect: true },
  { width: 2, lockCol: 3, perfect: true },
  { width: 2, lockCol: 3, perfect: true },
  { width: 2, lockCol: 3, perfect: true },
  { width: 2, lockCol: 3, perfect: true },
  { width: 2, lockCol: 3, perfect: true },
  { width: 2, lockCol: 3, perfect: true },
  { width: 2, lockCol: 3, perfect: true },
];

const SLIDE_MS = 380;
const SETTLE_MS = 140;
const END_HOLD_MS = 1600;
const FADE_MS = 600;
const STEP_MS = SLIDE_MS + SETTLE_MS;
const LOOP_MS =
  HERO_SCRIPT.length * STEP_MS + END_HOLD_MS + FADE_MS;

const HERO_CYAN: [number, number, number] = [34, 211, 238];
const HERO_GOLD: [number, number, number] = [250, 204, 21];
function heroColor(row: number): string {
  const t = row / (HERO_GRID_ROWS - 1);
  const r = Math.round(HERO_CYAN[0] + (HERO_GOLD[0] - HERO_CYAN[0]) * t);
  const g = Math.round(HERO_CYAN[1] + (HERO_GOLD[1] - HERO_CYAN[1]) * t);
  const b = Math.round(HERO_CYAN[2] + (HERO_GOLD[2] - HERO_CYAN[2]) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

type HeroFrame = {
  placed: Array<{ row: number; col: number; width: number }>;
  /** 0..script.length — the currently sliding row. null when the round is complete. */
  currentRow: number | null;
  /** fractional left-edge column of the slider (integer during lock). */
  sliderX: number;
  /** width of the slider (cells). */
  sliderW: number;
  /** 0..1 progress through lock settle. Nonzero during the settle phase only. */
  lockT: number;
  /** Chop shard to draw falling, if any. */
  shard: null | { row: number; col: number; width: number; vy: number; rot: number; alpha: number };
  /** 0..1 — fade for the whole stack at end-of-loop. */
  fade: number;
  /** Prize ring opacity when the run completes. */
  prizeRing: number;
};

function computeHeroFrame(tMs: number): HeroFrame {
  const t = tMs % LOOP_MS;

  // Running tallies
  const placed: HeroFrame["placed"] = [];
  let shard: HeroFrame["shard"] = null;

  // Which step are we in?
  const totalSteps = HERO_SCRIPT.length;
  const completeMs = totalSteps * STEP_MS;
  const stepIndex = Math.min(totalSteps, Math.floor(t / STEP_MS));
  const tInStep = t - stepIndex * STEP_MS;

  // All rows below the current step are already placed.
  for (let i = 0; i < Math.min(stepIndex, totalSteps); i++) {
    const r = HERO_SCRIPT[i];
    placed.push({ row: i, col: r.lockCol, width: r.width });
  }

  let currentRow: number | null = null;
  let sliderX = 0;
  let sliderW = 0;
  let lockT = 0;

  if (stepIndex < totalSteps) {
    const cur = HERO_SCRIPT[stepIndex];
    currentRow = stepIndex;
    sliderW = cur.width;
    const maxX = HERO_GRID_COLS - sliderW;

    if (tInStep < SLIDE_MS) {
      // Easing slide — two sweeps so the direction change reads even
      // at short durations. Sin is good enough for the eye.
      const p = tInStep / SLIDE_MS; // 0..1
      const phase = Math.sin(p * Math.PI); // 0 → 1 → 0
      // Chase toward lockCol at the end so the settle feels earned.
      sliderX = (1 - p) * (phase * maxX) + p * cur.lockCol;
    } else {
      // Settle phase: frozen at lockCol, lockT drives a small pop.
      sliderX = cur.lockCol;
      lockT = (tInStep - SLIDE_MS) / SETTLE_MS;
      // On the settle of an imperfect row, spawn a falling shard.
      if (!cur.perfect) {
        const shardAge = lockT; // 0..1 within settle, continues via fade
        shard = {
          row: stepIndex,
          // chopped-off right edge — the slider was wider, lockCol
          // matches the overlap, so the shard lives to the right of
          // lockCol + width.
          col: cur.lockCol + cur.width,
          width: 1,
          vy: shardAge * 18,
          rot: shardAge * 1.8,
          alpha: 1 - shardAge,
        };
      }
    }
  }

  // End-of-loop: hold the finished stack, show prize ring, then fade.
  let prizeRing = 0;
  let fade = 1;
  const tAfterRun = t - completeMs;
  if (stepIndex >= totalSteps) {
    // Hold: show full stack + pulsing ring
    if (tAfterRun < END_HOLD_MS) {
      prizeRing = 1;
      fade = 1;
    } else {
      const fadeT = (tAfterRun - END_HOLD_MS) / FADE_MS;
      prizeRing = Math.max(0, 1 - fadeT);
      fade = Math.max(0, 1 - fadeT);
    }
  }

  // Shard continues falling into the fade window if it was born near
  // the end of the run. Extend visibility past the settle phase.
  if (shard === null && stepIndex > 6 && stepIndex <= totalSteps) {
    // Check if the imperfect row (index 6) is still within shard life.
    // Shard lifespan = settle + ~400ms fall.
    const imperfectStart = 6 * STEP_MS + SLIDE_MS;
    const ageMs = t - imperfectStart;
    if (ageMs > 0 && ageMs < 900) {
      const a = ageMs / 900;
      shard = {
        row: 6,
        col: HERO_SCRIPT[6].lockCol + HERO_SCRIPT[6].width,
        width: 1,
        vy: a * 22,
        rot: a * 2.4,
        alpha: Math.max(0, 1 - a),
      };
    }
  }

  return { placed, currentRow, sliderX, sliderW, lockT, shard, fade, prizeRing };
}

function HeroTower() {
  const reduced = useReducedMotion();
  const [t, setT] = useState(0);

  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    let start = performance.now();
    // Virtual clock: accumulates elapsed time that the animation
    // should see. Decouples t from wall-clock so we can pause
    // cleanly when the tab hides and resume without a jump.
    let accumulated = 0;
    let hiddenAt = 0;
    const tick = () => {
      setT(accumulated + (performance.now() - start));
      raf = requestAnimationFrame(tick);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        cancelAnimationFrame(raf);
        raf = 0;
        hiddenAt = performance.now();
        // Lock in the elapsed time so resuming continues from here.
        accumulated += hiddenAt - start;
      } else if (raf === 0) {
        // Resume: reset the window clock; accumulated holds history.
        start = performance.now();
        raf = requestAnimationFrame(tick);
      }
    };
    raf = requestAnimationFrame(tick);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [reduced]);

  // When reduced motion, freeze at a frame that shows the finished
  // tower so the visual story still reads.
  const frame = useMemo(
    () =>
      computeHeroFrame(
        reduced
          ? HERO_SCRIPT.length * STEP_MS + 400 // just past completion
          : t,
      ),
    [t, reduced],
  );

  // Which row label to show top-left. While running, surfaces the live
  // row count; while fading, holds 15/15.
  const displayRow =
    frame.currentRow === null
      ? HERO_GRID_ROWS
      : Math.min(HERO_GRID_ROWS, frame.currentRow + 1);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6, delay: 0.1 }}
      className="relative mx-auto w-full max-w-[360px]"
      // CLS guard: aspect-[3/5] on the inner div reserves the box,
      // but framer-motion's SSR path occasionally emits a collapsed
      // wrapper in the brief window before hydration resolves the
      // `initial` prop. A CSS containIntrinsicSize + content-visibility
      // hint pins the layout contribution to the expected 360×600
      // rectangle regardless, so the hero never shifts content below
      // it during the fade-in. No visible effect on the modern path.
      style={{
        contentVisibility: "auto",
        containIntrinsicSize: "360px 600px",
      }}
    >
      <div
        className="relative aspect-[3/5] rounded-2xl border border-white/10 overflow-hidden shadow-2xl"
        style={{
          background:
            "radial-gradient(600px 500px at 50% -10%, rgba(34,211,238,0.18), transparent 60%), linear-gradient(180deg,#071a2e,#020b18)",
        }}
      >
        <svg
          aria-hidden
          viewBox={`0 0 ${HERO_GRID_COLS * 20} ${HERO_GRID_ROWS * 20}`}
          preserveAspectRatio="xMidYMid meet"
          className="absolute inset-0 w-full h-full p-4"
        >
          {/* Grid dots */}
          {Array.from({ length: HERO_GRID_ROWS }, (_, r) =>
            Array.from({ length: HERO_GRID_COLS }, (_, c) => (
              <circle
                key={`${r}-${c}`}
                cx={c * 20 + 10}
                cy={(HERO_GRID_ROWS - 1 - r) * 20 + 10}
                r={0.8}
                fill="rgba(255,255,255,0.08)"
              />
            )),
          )}

          {/* Placed stack — each block pops into existence in its row */}
          <g style={{ opacity: frame.fade }}>
            {frame.placed.map((cell) => {
              const color = heroColor(cell.row);
              const x = cell.col * 20 + 1.5;
              const y = (HERO_GRID_ROWS - 1 - cell.row) * 20 + 1.5;
              const w = cell.width * 20 - 3;
              const h = 20 - 3;
              return (
                <rect
                  key={`${cell.row}-${cell.col}`}
                  x={x}
                  y={y}
                  width={w}
                  height={h}
                  rx={2.5}
                  fill={color}
                  fillOpacity={0.92}
                  stroke={color}
                  strokeOpacity={0.4}
                  strokeWidth={0.4}
                  style={{
                    filter:
                      cell.row >= 12
                        ? "drop-shadow(0 0 4px rgba(250,204,21,0.6))"
                        : undefined,
                  }}
                />
              );
            })}
          </g>

          {/* Falling shard from the imperfect lock */}
          {frame.shard && frame.shard.alpha > 0 && (
            <g
              transform={`translate(${
                frame.shard.col * 20 + (frame.shard.width * 20) / 2
              }, ${
                (HERO_GRID_ROWS - 1 - frame.shard.row) * 20 +
                10 +
                frame.shard.vy
              }) rotate(${frame.shard.rot * 57.3})`}
              style={{ opacity: frame.shard.alpha }}
            >
              <rect
                x={-(frame.shard.width * 20 - 3) / 2}
                y={-(20 - 3) / 2}
                width={frame.shard.width * 20 - 3}
                height={20 - 3}
                rx={2.5}
                fill={heroColor(frame.shard.row)}
                fillOpacity={0.85}
              />
            </g>
          )}

          {/* Active slider — renders only while a row is active.
              Includes a tiny pop on lockT. */}
          {frame.currentRow !== null && frame.fade > 0.6 && (
            <g style={{ opacity: frame.fade }}>
              {(() => {
                const color = heroColor(frame.currentRow);
                const x = frame.sliderX * 20 + 1.5;
                const y = (HERO_GRID_ROWS - 1 - frame.currentRow) * 20 + 1.5;
                const w = frame.sliderW * 20 - 3;
                const h = 20 - 3;
                // Pop: scale 1 → 1.08 → 1 over the settle phase
                const pop = frame.lockT > 0
                  ? 1 + Math.sin(frame.lockT * Math.PI) * 0.08
                  : 1;
                const cx = x + w / 2;
                const cy = y + h / 2;
                return (
                  <g transform={`translate(${cx} ${cy}) scale(${pop}) translate(${-cx} ${-cy})`}>
                    <rect
                      x={x}
                      y={y}
                      width={w}
                      height={h}
                      rx={2.5}
                      fill={color}
                      fillOpacity={0.95}
                      stroke={color}
                      strokeOpacity={0.7}
                      strokeWidth={0.6}
                      style={{
                        filter: `drop-shadow(0 0 ${2 + frame.lockT * 5}px ${color})`,
                      }}
                    />
                    {/* Lock ripple */}
                    {frame.lockT > 0 && (
                      <circle
                        cx={cx}
                        cy={cy}
                        r={frame.lockT * 14}
                        fill="none"
                        stroke={color}
                        strokeOpacity={1 - frame.lockT}
                        strokeWidth={0.6}
                      />
                    )}
                  </g>
                );
              })()}
            </g>
          )}

          {/* End-of-loop prize ring around the top block */}
          {frame.prizeRing > 0 && frame.placed.length > 0 && (
            (() => {
              const top = frame.placed[frame.placed.length - 1];
              const cx = top.col * 20 + (top.width * 20) / 2;
              const cy = (HERO_GRID_ROWS - 1 - top.row) * 20 + 10;
              // Pulsing ring — radius drives from a sin of t
              const pulse = 0.5 + 0.5 * Math.sin((t / 400) * Math.PI * 2);
              return (
                <g style={{ opacity: frame.prizeRing }}>
                  <circle
                    cx={cx}
                    cy={cy}
                    r={10 + pulse * 6}
                    fill="none"
                    stroke="rgba(250,204,21,0.85)"
                    strokeWidth={0.8}
                  />
                  <circle
                    cx={cx}
                    cy={cy}
                    r={18 + pulse * 10}
                    fill="none"
                    stroke="rgba(250,204,21,0.35)"
                    strokeWidth={0.5}
                  />
                </g>
              );
            })()
          )}

          {/* SUPER-16 — drifting embers rising from the top of the
              stack. 12 particles, each with its own deterministic
              lifecycle seeded off its index so the loop reads as
              natural turbulence rather than a looped pattern. Each
              ember:
                - spawns at a random-feeling column near the top
                  block's center
                - rises linearly, drifts horizontally on a slow sine
                - fades out as a quadratic on life (slow start, fast
                  end) so the bottom of the flame pool stays dense
                - radius shrinks linearly from 1.0 → 0.3
              Respects reduced-motion: lifecycle freezes at life=0.5
              so a static halo remains. */}
          {!reduced && frame.placed.length > 0 && (() => {
            const top = frame.placed[frame.placed.length - 1];
            const topX = top.col * 20 + (top.width * 20) / 2;
            const topY = (HERO_GRID_ROWS - 1 - top.row) * 20;
            const EMBER_COUNT = 12;
            const EMBER_PERIOD = 3800;
            return (
              <g opacity={frame.fade * 0.85}>
                {Array.from({ length: EMBER_COUNT }, (_, i) => {
                  // Deterministic per-ember offset + drift seed.
                  // (i * 0x9e3779b9) % 1 picks an evenly-spread hash
                  // in [0..1] for the phase offset; separate seeds
                  // drive the x-jitter and color bias.
                  const phaseOff = ((i * 0x9e3779b9) >>> 0) / 2 ** 32;
                  const xSeed = (((i + 1) * 0x85ebca6b) >>> 0) / 2 ** 32;
                  const life = ((t / EMBER_PERIOD + phaseOff) % 1);
                  // Rise 22 svg units above the top block
                  const rise = life * 22;
                  // Horizontal drift: sine over the life, amplitude
                  // proportional to xSeed so some embers barely
                  // wobble and others trace a longer arc.
                  const drift = Math.sin(life * Math.PI * 2 + xSeed * 6) * (2 + xSeed * 4);
                  // Opacity: quadratic fade — ramps in for first
                  // 15% of life, then decays as (1 - life)^2 so the
                  // plume tightens as it rises.
                  const alpha =
                    life < 0.15
                      ? (life / 0.15) * 0.9
                      : Math.pow(1 - life, 1.6) * 0.9;
                  const r = 1.0 - life * 0.7;
                  // Color bias: cyan at the base, fading to yellow
                  // at the tips. Linear interpolation between the
                  // two endpoint RGBs.
                  const cR = Math.round(34 + (250 - 34) * life);
                  const cG = Math.round(211 + (204 - 211) * life);
                  const cB = Math.round(238 + (21 - 238) * life);
                  const cx = topX + drift + (xSeed - 0.5) * (top.width * 20) * 0.7;
                  const cy = topY - rise;
                  return (
                    <circle
                      key={`ember-${i}`}
                      cx={cx}
                      cy={cy}
                      r={r}
                      fill={`rgb(${cR},${cG},${cB})`}
                      opacity={alpha}
                      style={{
                        filter: `drop-shadow(0 0 2px rgb(${cR},${cG},${cB}))`,
                      }}
                    />
                  );
                })}
              </g>
            );
          })()}

          {/* SUPER-16 — perfect-lock radial burst. When a row locks
              cleanly (HERO_SCRIPT[row].perfect === true), emit a
              brief radial-glow disc that expands and fades inside
              the settle window. Layered over the existing ripple
              so you get ring + fill + glow as a compound beat. */}
          {frame.currentRow !== null &&
            frame.lockT > 0 &&
            HERO_SCRIPT[frame.currentRow]?.perfect &&
            !reduced &&
            (() => {
              const row = HERO_SCRIPT[frame.currentRow];
              const cx = row.lockCol * 20 + (row.width * 20) / 2;
              const cy = (HERO_GRID_ROWS - 1 - frame.currentRow) * 20 + 10;
              // Ease-out radial: bursts quickly then fades. 0..1 on
              // lockT → radius 0..24 and opacity 0.9 → 0.
              const burstR = frame.lockT * 24;
              const burstA = Math.pow(1 - frame.lockT, 1.4) * 0.9;
              return (
                <g>
                  {/* Outer soft halo */}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={burstR}
                    fill="rgba(250,204,21,0.18)"
                    opacity={burstA}
                  />
                  {/* Inner tight core */}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={burstR * 0.5}
                    fill="rgba(253,224,71,0.45)"
                    opacity={burstA}
                  />
                  {/* Four radial flare lines (N/E/S/W) */}
                  {[0, 90, 180, 270].map((deg) => {
                    const rad = (deg * Math.PI) / 180;
                    const x2 = cx + Math.cos(rad) * burstR * 1.4;
                    const y2 = cy + Math.sin(rad) * burstR * 1.4;
                    return (
                      <line
                        key={deg}
                        x1={cx}
                        y1={cy}
                        x2={x2}
                        y2={y2}
                        stroke="rgba(250,204,21,0.6)"
                        strokeWidth={0.5}
                        strokeLinecap="round"
                        opacity={burstA}
                      />
                    );
                  })}
                </g>
              );
            })()}
        </svg>

        {/* Corner badges */}
        <div className="absolute left-3 top-3 text-[10px] uppercase tracking-widest text-cyan-300 font-mono">
          Row <span className="text-white">{displayRow} / 15</span>
        </div>
        <div className="absolute right-3 top-3 text-[10px] uppercase tracking-widest text-yellow-300 font-mono">
          × 3 prize
        </div>
        <div className="absolute left-3 bottom-3 text-[10px] uppercase tracking-widest text-gray-500 font-mono">
          demo preview
        </div>

        {/* Flashing "PERFECT" text on each non-chop lock during settle. */}
        {frame.currentRow !== null &&
          frame.lockT > 0 &&
          HERO_SCRIPT[frame.currentRow]?.perfect && (
            <div
              className="absolute right-3 bottom-3 text-[10px] uppercase tracking-widest text-yellow-300 font-mono font-bold"
              style={{ opacity: Math.sin(frame.lockT * Math.PI) }}
            >
              Perfect
            </div>
          )}
      </div>
    </motion.div>
  );
}

// =============================================================
// Difficulty ladder — visual speed ramp
// =============================================================

function DifficultyLadder() {
  const reduced = useReducedMotion();
  return (
    <section className="lw-section relative z-10 max-w-7xl mx-auto px-5 md:px-8 py-10">
      <div className="mb-6 max-w-xl">
        <div className="text-[10px] uppercase tracking-widest text-orange-300 mb-2">
          The climb
        </div>
        <h2 className="text-2xl md:text-3xl font-black tracking-tight mb-2">
          Easy at the bottom. Brutal at the top.
        </h2>
        <p className="text-sm text-gray-400 leading-snug">
          Speed ramps cubically across the tower. Past row 6 the slider can
          spawn on either side — past row 8 the speed jitters on two irrational
          sines so there&apos;s no rhythm to lock onto.
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 md:p-6">
        <div className="grid gap-4 md:grid-cols-[1.2fr_1fr] items-center">
          {/* Speed bars */}
          <div>
            <div className="text-[10px] uppercase tracking-widest text-gray-400 mb-3">
              Slider speed (cells/sec)
            </div>
            <div className="flex items-end gap-1 h-32">
              {Array.from({ length: 15 }, (_, row) => {
                const t = row / 14;
                const speed = 3.6 + t * t * t * 9.9;
                const heightPct = (speed / 14) * 100;
                const hot = row >= 8;
                const veryHot = row >= 12;
                return (
                  <motion.div
                    key={row}
                    className="flex-1 rounded-t-sm relative"
                    initial={reduced ? {} : { height: 0 }}
                    whileInView={{ height: `${heightPct}%` }}
                    viewport={{ once: true, margin: "-50px" }}
                    transition={
                      reduced
                        ? { duration: 0 }
                        : { delay: row * 0.025, duration: 0.35, ease: "easeOut" }
                    }
                    style={{
                      background: veryHot
                        ? "linear-gradient(180deg,#facc15,#f59e0b)"
                        : hot
                          ? "linear-gradient(180deg,#fb923c,#f97316)"
                          : "linear-gradient(180deg,#22d3ee,#0891b2)",
                      minHeight: "4px",
                      boxShadow: veryHot
                        ? "0 0 8px rgba(250,204,21,0.35)"
                        : undefined,
                    }}
                    aria-label={`Row ${row}: ${speed.toFixed(1)} cells/sec`}
                  />
                );
              })}
            </div>
            <div className="mt-2 flex justify-between text-[10px] font-mono text-gray-500">
              <span>row 0 · 3.6</span>
              <span className="text-orange-300">row 8 · 8.3</span>
              <span className="text-yellow-300">row 14 · 13.5+</span>
            </div>
          </div>

          {/* Mechanics list */}
          <ul className="space-y-3">
            <LadderRule
              tone="cyan"
              row="0–5"
              title="Warm-up"
              body="Predictable left-to-right slider. Missing here is on you."
            />
            <LadderRule
              tone="orange"
              row="6+"
              title="Random spawn side"
              body="Slider can appear on either edge moving either direction. Muscle memory stops working."
            />
            <LadderRule
              tone="yellow"
              row="8+"
              title="Speed jitter"
              body="Two irrational sines layer over the base speed. No BPM to lock. Good luck."
            />
          </ul>
        </div>
      </div>
    </section>
  );
}

function LadderRule({
  tone,
  row,
  title,
  body,
}: {
  tone: "cyan" | "orange" | "yellow";
  row: string;
  title: string;
  body: string;
}) {
  const fg =
    tone === "cyan"
      ? "text-cyan-300"
      : tone === "orange"
        ? "text-orange-300"
        : "text-yellow-300";
  const dot =
    tone === "cyan"
      ? "bg-cyan-300"
      : tone === "orange"
        ? "bg-orange-400"
        : "bg-yellow-300";
  return (
    <li className="flex items-start gap-3">
      <span className={`mt-1.5 inline-block h-2 w-2 rounded-full ${dot} shrink-0`} />
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <span className={`text-[10px] uppercase tracking-widest font-mono ${fg}`}>
            row {row}
          </span>
          <span className="text-sm font-semibold text-white">{title}</span>
        </div>
        <div className="text-xs text-gray-400 leading-snug mt-0.5">{body}</div>
      </div>
    </li>
  );
}

// =============================================================
// How it works
// =============================================================

function HowItWorks() {
  const cards = [
    {
      idx: "01",
      title: "Slider bounces across",
      body:
        "A row of blocks slides left and right above your stack. It never stops on its own.",
      visual: <SliderAnim />,
      tone: "cyan" as const,
    },
    {
      idx: "02",
      title: "Tap to lock",
      body:
        "Space, Enter, click, or tap. Whatever overlaps the block below stays — anything hanging off falls off.",
      visual: <LockAnim />,
      tone: "violet" as const,
    },
    {
      idx: "03",
      title: "Don't let it hit zero",
      body:
        "Each imperfect lock narrows the window. Zero width is game over. A perfect lock keeps the width and chains into a streak bonus.",
      visual: <ChopAnim />,
      tone: "orange" as const,
    },
  ];

  return (
    <section id="how" className="lw-section relative z-10 max-w-7xl mx-auto px-5 md:px-8 py-10">
      <div className="mb-6 max-w-xl">
        <div className="text-[10px] uppercase tracking-widest text-cyan-300 mb-2">
          How it works
        </div>
        <h2 className="text-2xl md:text-3xl font-black tracking-tight mb-2">
          Three rules. Fifteen rows.
        </h2>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {cards.map((c) => (
          <motion.div
            key={c.idx}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.4 }}
            whileHover={{ y: -2 }}
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 overflow-hidden transition-[border-color,background-color] hover:border-white/25 hover:bg-white/[0.05]"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-mono tracking-widest text-gray-500">
                {c.idx}
              </span>
              <Pill status={c.tone === "cyan" ? "demo" : c.tone === "violet" ? "beta" : "soon"}>
                {c.tone === "cyan" ? "core" : c.tone === "violet" ? "tap" : "decay"}
              </Pill>
            </div>
            <div className="relative aspect-[5/3] mb-4 rounded-xl overflow-hidden border border-white/5 bg-black/40">
              {c.visual}
            </div>
            <h3 className="text-lg font-semibold text-white mb-1">{c.title}</h3>
            <p className="text-sm text-gray-400 leading-snug">{c.body}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

// ---- How-it-works mini animations ----

function SliderAnim() {
  const reduced = useReducedMotion();
  return (
    <svg viewBox="0 0 100 60" className="absolute inset-0 w-full h-full p-3">
      {[0, 1, 2].map((i) => (
        <rect
          key={i}
          x={20 + i * 20}
          y={45}
          width={18}
          height={10}
          rx={2}
          fill="rgba(34,211,238,0.3)"
        />
      ))}
      <motion.rect
        x={0}
        y={15}
        width={30}
        height={10}
        rx={2}
        fill="#22d3ee"
        initial={{ x: 5 }}
        animate={reduced ? {} : { x: [5, 65, 5] }}
        transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
      />
    </svg>
  );
}

function LockAnim() {
  const reduced = useReducedMotion();
  return (
    <svg viewBox="0 0 100 60" className="absolute inset-0 w-full h-full p-3">
      <rect x={25} y={42} width={50} height={10} rx={2} fill="rgba(139,92,246,0.3)" />
      <motion.rect
        x={28}
        y={22}
        width={50}
        height={10}
        rx={2}
        fill="#a78bfa"
        initial={{ x: 28, y: 22 }}
        animate={reduced ? {} : { x: [28, 28], y: [22, 22, 32] }}
        transition={{ duration: 2.4, repeat: Infinity, times: [0, 0.6, 1], ease: "easeIn" }}
      />
      {/* "tap" ripple */}
      {!reduced && (
        <motion.circle
          cx={50}
          cy={42}
          r={4}
          fill="none"
          stroke="rgba(167,139,250,0.7)"
          strokeWidth={1}
          initial={{ r: 0, opacity: 0 }}
          animate={{ r: [0, 18], opacity: [0.8, 0] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: 1.4 }}
        />
      )}
    </svg>
  );
}

function ChopAnim() {
  const reduced = useReducedMotion();
  return (
    <svg viewBox="0 0 100 60" className="absolute inset-0 w-full h-full p-3">
      <rect x={35} y={42} width={30} height={10} rx={2} fill="rgba(251,146,60,0.25)" />
      <motion.rect
        x={25}
        y={22}
        width={50}
        height={10}
        rx={2}
        fill="#f97316"
        initial={{ x: 25, opacity: 1 }}
        animate={reduced ? {} : { x: [25, 25, 35], width: [50, 50, 30], opacity: [1, 1, 1] }}
        transition={{ duration: 2.6, repeat: Infinity, times: [0, 0.55, 0.7] }}
      />
      {/* Falling chop */}
      {!reduced && (
        <motion.rect
          x={66}
          y={22}
          width={9}
          height={10}
          rx={2}
          fill="#f97316"
          initial={{ y: 22, opacity: 0 }}
          animate={{ y: [22, 22, 60], opacity: [0, 1, 0], rotate: [0, 0, 25] }}
          transition={{ duration: 2.6, repeat: Infinity, times: [0, 0.55, 0.95] }}
        />
      )}
    </svg>
  );
}

// =============================================================
// Wager primer
// =============================================================

function WagerPrimer() {
  const chips: Array<{ label: string; sub: string; accent: string }> = [
    { label: "Free", sub: "no stake", accent: "bg-white/30" },
    { label: "5 LWP", sub: "→ 15", accent: "bg-cyan-300" },
    { label: "25 LWP", sub: "→ 75", accent: "bg-orange-300" },
    { label: "100 LWP", sub: "→ 300", accent: "bg-yellow-300" },
  ];
  return (
    <section className="lw-section relative z-10 max-w-7xl mx-auto px-5 md:px-8 py-10">
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-white/[0.02] p-6 md:p-8">
        <div className="grid gap-6 md:grid-cols-[1fr_1.1fr] items-center">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-yellow-300 mb-2">
              Wager · demo mode
            </div>
            <h2 className="text-2xl md:text-3xl font-black tracking-tight mb-2">
              Skin in the game, without the risk.
            </h2>
            <p className="text-sm text-gray-300 leading-snug mb-4 max-w-md">
              Pick a chip before you start. Reach the top and you&apos;d win{" "}
              <span className="text-yellow-300 font-semibold">
                {PAYOUT_MULTIPLIER.win}×
              </span>{" "}
              your stake. Collapse and it&apos;s gone. The demo round doesn&apos;t
              actually move LWP on-chain — the mechanic is real, the ledger call
              is not (yet).
            </p>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
              <Pill status="demo">demo</Pill>
              <span>ICRC-1 wager canister shipping next.</span>
              <Link
                href={ROUTES.fairPlay}
                className="ml-1 underline underline-offset-2 text-cyan-300/80 hover:text-cyan-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60 rounded-sm"
              >
                How fair play works →
              </Link>
            </div>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {chips.map((c, i) => (
                <motion.div
                  key={c.label}
                  initial={{ opacity: 0, y: 8 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-50px" }}
                  transition={{ duration: 0.3, delay: i * 0.06 }}
                  className="relative overflow-hidden rounded-xl border border-white/10 bg-black/40 p-3 text-center"
                >
                  {/* SUPER-18 — tier accent bar. Cool → warm ramp
                      (white/30 → cyan → orange → yellow) so the
                      'bigger stake, hotter reward' story reads as
                      a visual gradient across the 4 chips without
                      needing to scan the sub-values. 2px top bar,
                      full width of each chip. */}
                  <span aria-hidden className={`absolute inset-x-0 top-0 h-[2px] ${c.accent}`} />
                  <div className="text-sm font-bold text-white">{c.label}</div>
                  <div className="text-[10px] uppercase tracking-widest text-yellow-300/90 font-mono mt-1">
                    {c.sub}
                  </div>
                </motion.div>
              ))}
            </div>

            {/* STACKER-R1 + SUPER-13 + SUPER-15 — primary CTA on
                the wager panel. Originally a full-bleed orange bar
                stretching the entire right column (~540px wide), which
                visually crushed the 4 chip tiles above it. Now pill-
                sized: inline-flex with its own width (not w-full),
                centered under the chip grid via a flex wrapper. Reads
                as 'here's one clear action' rather than 'here's a
                massive orange stripe'. Routes to /deposit — the only
                way to grow LWP beyond the 15-free starter. */}
            <div className="flex justify-center pt-1">
              <Link href={ROUTES.deposit} aria-label="Deposit LWP to unlock bigger chips">
                <motion.span
                  initial={{ opacity: 0, y: 6 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.35, delay: 0.28 }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="relative inline-flex items-center gap-2 overflow-hidden rounded-full cursor-pointer py-2 px-5 border border-orange-300/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 shadow-[0_8px_22px_-10px_rgba(249,115,22,0.65)]"
                  style={{
                    background:
                      "linear-gradient(90deg, #fdba74, #f97316 50%, #ea580c)",
                  }}
                >
                  {/* Sheen sweep */}
                  <motion.span
                    aria-hidden
                    className="absolute inset-y-0 -left-1/3 w-1/3 pointer-events-none"
                    style={{
                      background:
                        "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.35) 50%, rgba(255,255,255,0) 100%)",
                      mixBlendMode: "soft-light",
                    }}
                    animate={{ left: ["-33%", "133%"] }}
                    transition={{
                      duration: 2.6,
                      repeat: Infinity,
                      ease: "easeInOut",
                      repeatDelay: 1.2,
                    }}
                  />
                  <span className="relative font-black uppercase tracking-widest text-sm text-black">
                    Deposit now →
                  </span>
                </motion.span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// =============================================================
// Tip (play section)
// =============================================================

function Tip({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="text-[10px] uppercase tracking-widest text-cyan-300 mb-1.5">
        {title}
      </div>
      <div className="text-sm text-gray-200 leading-snug">{children}</div>
    </div>
  );
}
