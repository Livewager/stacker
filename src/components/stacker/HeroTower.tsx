"use client";

/**
 * Stacker hero tower animation — the headline visual on /stacker's
 * hero section. Extracted into its own module so /play can render
 * the same animation inside its game-picker card without /play
 * pulling in the whole /stacker page module.
 *
 * A pure-SVG, rAF-driven simulation of a Stacker round playing
 * itself. Sized by the outer container (fills parent via w-full /
 * h-full). The SVG viewBox is fixed at 7×15 grid units × 20 px
 * each, preserveAspectRatio="xMidYMid meet" — so it scales to fit
 * whatever the parent's aspect ratio is, always centered.
 *
 * Timing is driven by performance.now inside a single rAF tick so
 * everything stays in sync. Pauses when the tab hides; resumes
 * from the same virtual-clock offset so there's no jump.
 */

import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

// ------------------------------------------------------------------
// Configuration + simulation script
// ------------------------------------------------------------------

export const HERO_GRID_COLS = 7;
export const HERO_GRID_ROWS = 15;

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
const LOOP_MS = HERO_SCRIPT.length * STEP_MS + END_HOLD_MS + FADE_MS;

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
  currentRow: number | null;
  sliderX: number;
  sliderW: number;
  lockT: number;
  shard:
    | null
    | {
        row: number;
        col: number;
        width: number;
        vy: number;
        rot: number;
        alpha: number;
      };
  fade: number;
  prizeRing: number;
};

function computeHeroFrame(tMs: number): HeroFrame {
  const t = tMs % LOOP_MS;

  const placed: HeroFrame["placed"] = [];
  let shard: HeroFrame["shard"] = null;

  const totalSteps = HERO_SCRIPT.length;
  const completeMs = totalSteps * STEP_MS;
  const stepIndex = Math.min(totalSteps, Math.floor(t / STEP_MS));
  const tInStep = t - stepIndex * STEP_MS;

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
      const p = tInStep / SLIDE_MS;
      const phase = Math.sin(p * Math.PI);
      sliderX = (1 - p) * (phase * maxX) + p * cur.lockCol;
    } else {
      sliderX = cur.lockCol;
      lockT = (tInStep - SLIDE_MS) / SETTLE_MS;
      if (!cur.perfect) {
        const shardAge = lockT;
        shard = {
          row: stepIndex,
          col: cur.lockCol + cur.width,
          width: 1,
          vy: shardAge * 18,
          rot: shardAge * 1.8,
          alpha: 1 - shardAge,
        };
      }
    }
  }

  let prizeRing = 0;
  let fade = 1;
  const tAfterRun = t - completeMs;
  if (stepIndex >= totalSteps) {
    if (tAfterRun < END_HOLD_MS) {
      prizeRing = 1;
      fade = 1;
    } else {
      const fadeT = (tAfterRun - END_HOLD_MS) / FADE_MS;
      prizeRing = Math.max(0, 1 - fadeT);
      fade = Math.max(0, 1 - fadeT);
    }
  }

  if (shard === null && stepIndex > 6 && stepIndex <= totalSteps) {
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

// ------------------------------------------------------------------
// Component
// ------------------------------------------------------------------

export interface HeroTowerProps {
  /** Payout multiplier to render in the top-right "×N prize" chip. Defaults to 3. */
  winMultiplier?: number;
  /** Show corner badges (row counter, prize chip, demo marker). Default true on /stacker, false for tight /play card. */
  showBadges?: boolean;
  /** Framer-motion `initial`/`animate` fade-in. Default true. */
  entrance?: boolean;
  /** Extra classes on the outer motion.div wrapper. */
  className?: string;
}

export function HeroTower({
  winMultiplier = 3,
  showBadges = true,
  entrance = true,
  className = "",
}: HeroTowerProps) {
  const reduced = useReducedMotion();
  const [t, setT] = useState(0);

  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    let start = performance.now();
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
        accumulated += hiddenAt - start;
      } else if (raf === 0) {
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

  const frame = useMemo(
    () =>
      computeHeroFrame(
        reduced ? HERO_SCRIPT.length * STEP_MS + 400 : t,
      ),
    [t, reduced],
  );

  const displayRow =
    frame.currentRow === null
      ? HERO_GRID_ROWS
      : Math.min(HERO_GRID_ROWS, frame.currentRow + 1);

  const initial = entrance ? { opacity: 0, scale: 0.96 } : false;
  const animate = entrance ? { opacity: 1, scale: 1 } : undefined;

  return (
    <motion.div
      initial={initial}
      animate={animate}
      transition={{ duration: 0.6, delay: 0.1 }}
      className={`relative w-full h-full ${className}`}
    >
      <div
        className="relative w-full h-full rounded-2xl border border-white/10 overflow-hidden shadow-2xl"
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

          {/* Placed stack */}
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

          {/* Falling shard */}
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

          {/* Active slider */}
          {frame.currentRow !== null && frame.fade > 0.6 && (
            <g style={{ opacity: frame.fade }}>
              {(() => {
                const color = heroColor(frame.currentRow);
                const x = frame.sliderX * 20 + 1.5;
                const y = (HERO_GRID_ROWS - 1 - frame.currentRow) * 20 + 1.5;
                const w = frame.sliderW * 20 - 3;
                const h = 20 - 3;
                const pop =
                  frame.lockT > 0
                    ? 1 + Math.sin(frame.lockT * Math.PI) * 0.08
                    : 1;
                const cx = x + w / 2;
                const cy = y + h / 2;
                return (
                  <g
                    transform={`translate(${cx} ${cy}) scale(${pop}) translate(${-cx} ${-cy})`}
                  >
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

          {/* Prize ring at end-of-loop */}
          {frame.prizeRing > 0 &&
            frame.placed.length > 0 &&
            (() => {
              const top = frame.placed[frame.placed.length - 1];
              const cx = top.col * 20 + (top.width * 20) / 2;
              const cy = (HERO_GRID_ROWS - 1 - top.row) * 20 + 10;
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
            })()}

          {/* Drifting embers */}
          {!reduced &&
            frame.placed.length > 0 &&
            (() => {
              const top = frame.placed[frame.placed.length - 1];
              const topX = top.col * 20 + (top.width * 20) / 2;
              const topY = (HERO_GRID_ROWS - 1 - top.row) * 20;
              const EMBER_COUNT = 12;
              const EMBER_PERIOD = 3800;
              return (
                <g opacity={frame.fade * 0.85}>
                  {Array.from({ length: EMBER_COUNT }, (_, i) => {
                    const phaseOff = ((i * 0x9e3779b9) >>> 0) / 2 ** 32;
                    const xSeed = (((i + 1) * 0x85ebca6b) >>> 0) / 2 ** 32;
                    const life = (t / EMBER_PERIOD + phaseOff) % 1;
                    const rise = life * 22;
                    const drift =
                      Math.sin(life * Math.PI * 2 + xSeed * 6) *
                      (2 + xSeed * 4);
                    const alpha =
                      life < 0.15
                        ? (life / 0.15) * 0.9
                        : Math.pow(1 - life, 1.6) * 0.9;
                    const r = 1.0 - life * 0.7;
                    const cR = Math.round(34 + (250 - 34) * life);
                    const cG = Math.round(211 + (204 - 211) * life);
                    const cB = Math.round(238 + (21 - 238) * life);
                    const cx =
                      topX + drift + (xSeed - 0.5) * (top.width * 20) * 0.7;
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

          {/* Perfect-lock radial burst */}
          {frame.currentRow !== null &&
            frame.lockT > 0 &&
            HERO_SCRIPT[frame.currentRow]?.perfect &&
            !reduced &&
            (() => {
              const row = HERO_SCRIPT[frame.currentRow];
              const cx = row.lockCol * 20 + (row.width * 20) / 2;
              const cy = (HERO_GRID_ROWS - 1 - frame.currentRow) * 20 + 10;
              const burstR = frame.lockT * 24;
              const burstA = Math.pow(1 - frame.lockT, 1.4) * 0.9;
              return (
                <g>
                  <circle
                    cx={cx}
                    cy={cy}
                    r={burstR}
                    fill="rgba(250,204,21,0.18)"
                    opacity={burstA}
                  />
                  <circle
                    cx={cx}
                    cy={cy}
                    r={burstR * 0.5}
                    fill="rgba(253,224,71,0.45)"
                    opacity={burstA}
                  />
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
        {showBadges && (
          <>
            <div className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full border border-cyan-300/30 bg-black/40 backdrop-blur-sm px-2 py-0.5 text-[10px] uppercase tracking-widest text-cyan-300 font-mono">
              <span
                aria-hidden
                className="h-1 w-1 rounded-full bg-cyan-300/80"
              />
              Row{" "}
              <span className="text-white tabular-nums">{displayRow}/15</span>
            </div>
            <div className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full border border-yellow-300/40 bg-yellow-400/[0.08] backdrop-blur-sm px-2 py-0.5 text-[10px] uppercase tracking-widest text-yellow-300 font-mono">
              <span aria-hidden className="h-1 w-1 rounded-full bg-yellow-300" />
              ×{winMultiplier} prize
            </div>
            <div className="absolute left-3 bottom-3 inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/50 backdrop-blur-sm px-2 py-0.5 text-[10px] uppercase tracking-widest text-gray-400 font-mono">
              demo preview
            </div>
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
          </>
        )}
      </div>
    </motion.div>
  );
}
