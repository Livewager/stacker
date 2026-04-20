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

      <nav
        aria-label="Site"
        className="relative z-20 max-w-7xl mx-auto px-5 md:px-8 py-5 flex items-center justify-between gap-3"
      >
        <Link href={ROUTES.dunk} className="flex items-center" aria-label="Livewager Dunk home">
          <Image
            src="/assets/logo43.png"
            alt="Livewager · Dunk"
            width={440}
            height={144}
            priority
            sizes="(max-width: 768px) 320px, 440px"
            style={{ height: 80, width: "auto", objectFit: "contain" }}
          />
        </Link>
        <div className="flex items-center gap-2">
          <Link href={ROUTES.play}>
            <Button variant="outline" size="sm">
              ← All games
            </Button>
          </Link>
          <a href="#play">
            <Button tone="cyan" size="sm">
              Play now
            </Button>
          </a>
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

      {/* Fair play explainer lives on its own /fair-play route (linked
          from AppHeader). Previously inlined here; moved out so the
          /stacker landing stays focused on the game itself. */}

      {/* -------------- PLAY -------------- */}
      <section
        id="play"
        className="lw-section relative z-10 max-w-7xl mx-auto px-5 md:px-8 pt-8 pb-16 scroll-mt-20"
      >
        <div className="mb-6">
          <div className="text-[10px] uppercase tracking-widest text-cyan-300 mb-2">
            Your round
          </div>
          <h2 className="text-3xl md:text-4xl font-black tracking-tight">
            Lock in. Stack clean.
          </h2>
          <p className="text-sm text-gray-400 mt-1 max-w-lg">
            Pick a chip, then tap to start. Space or Enter works too.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-[minmax(0,560px)_1fr] items-start">
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
            className="flex items-center gap-2 mb-4"
          >
            <Pill status="demo">Arcade · demo</Pill>
            <span className="text-[10px] uppercase tracking-widest text-gray-500">
              Stacker · Livewager
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.05 }}
            className="text-5xl md:text-7xl font-black tracking-tight leading-[0.95] mb-4"
          >
            Stack to the{" "}
            <span
              className="bg-clip-text text-transparent"
              style={{
                backgroundImage:
                  "linear-gradient(90deg,#22d3ee,#fdba74 50%,#facc15)",
              }}
            >
              top.
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
            // Desktop (sm+): falls back to the original flex-wrap. Mirrors
            // the /dunk landing treatment so the two game hero strips stay
            // siblings (POLISH-223).
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
    </section>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 shrink-0 snap-start">
      <span className="uppercase tracking-widest text-gray-500">{label}</span>
      <span className="font-mono text-white">{value}</span>
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
    <section id="how" className="lw-section relative z-10 max-w-7xl mx-auto px-5 md:px-8 py-10 scroll-mt-20">
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
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 overflow-hidden"
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
  const chips = [
    { label: "Free", sub: "no stake" },
    { label: "5 LWP", sub: "→ 15" },
    { label: "25 LWP", sub: "→ 75" },
    { label: "100 LWP", sub: "→ 300" },
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
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {chips.map((c, i) => (
              <motion.div
                key={c.label}
                initial={{ opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.3, delay: i * 0.06 }}
                className="rounded-xl border border-white/10 bg-black/40 p-3 text-center"
              >
                <div className="text-sm font-bold text-white">{c.label}</div>
                <div className="text-[10px] uppercase tracking-widest text-yellow-300/90 font-mono mt-1">
                  {c.sub}
                </div>
              </motion.div>
            ))}
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
