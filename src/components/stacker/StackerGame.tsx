"use client";

/**
 * Stacker — web port of the classic arcade.
 *
 * A row of `blockWidth` cells slides left↔right across the playfield.
 * Tap / click / space locks it. Cells that don't overlap the row
 * beneath get chopped off; the new block width = overlap width.
 * Stack until you reach the top. If width hits zero before you reach
 * the top, it's game over.
 *
 * Preserves the Tilt Pour game untouched — this lives at its own route.
 *
 * Design principles:
 *  - Canvas for the actual play surface so motion is cheap; HUD is
 *    rendered as overlaid React so copy tweaks stay fast.
 *  - requestAnimationFrame loop clamped against tab-switch dt.
 *  - All motion respects prefers-reduced-motion (swaps to instant).
 *  - Works equally on pointer + touch + keyboard (space / enter).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sfx, unlockAudio } from "@/lib/audio";
import { haptics } from "@/lib/haptics";
import { createRound, type Round, type RoundTranscript } from "@/lib/anticheat/tapEntropy";
import { createRng, randomSeed, type SeededRng } from "@/lib/anticheat/rng";
import { useCopyable } from "@/lib/clipboard";
import { postScore } from "@/components/dunk/scoreboard";

// ------------------------------------------------------------------
// Configuration
// ------------------------------------------------------------------

const GRID_COLS = 7;
const GRID_ROWS = 15;
/** Level targets — the "win" row. Classic arcades set this ~12-15 tall. */
const TOP_ROW = GRID_ROWS - 1;
/**
 * Speed ramp: cells per second the slider moves at each row. Starts
 * gentle, climbs hard in the upper tiers so the top floors really
 * punish late taps.
 *
 *   row 0:  ~3.6 cells/sec  (easy warm-up)
 *   row 5:  ~5.7
 *   row 10: ~9.7
 *   row 14: ~13.5 + jitter  (approaching unplayable without rhythm)
 *
 * Cubic ease past the midpoint plus a base that's a bit quicker than
 * the old 3.2 baseline to keep early rows interesting.
 */
const SPEED_BY_ROW = (row: number): number => {
  const t = row / Math.max(1, TOP_ROW);
  // 3.6 base + cubic ramp to ~13.5 by the top row.
  return 3.6 + t * t * t * 9.9;
};

/**
 * Per-frame speed jitter amplitude (fraction of SPEED_BY_ROW). Kicks
 * in from row JITTER_ROW so early rows stay learnable — only the
 * later levels get the rhythm-breaking variance.
 */
const JITTER_ROW = 8;
const JITTER_AMP = 0.18; // ±18% at full strength

/**
 * From this row, spawn direction is randomized instead of always
 * starting left-to-right. Breaks the habit of "it always appears at
 * position 0 moving right", so the upper floors demand real tracking.
 */
const RANDOM_DIR_ROW = 6;

/** Starting block width. Narrower = harder. */
const START_WIDTH = 3;

type Phase = "idle" | "playing" | "won" | "over";

interface Row {
  row: number; // 0 = bottom
  startCol: number; // left-most cell, integer
  width: number;
}

/** Ephemeral chopped-off shard that falls after an imperfect lock. */
interface Shard {
  row: number;
  startCol: number; // fractional cells
  width: number; // fractional cells
  vy: number; // cells/sec downward
  vx: number; // cells/sec sideways
  rot: number; // radians
  vrot: number; // radians/sec
  born: number; // ms, performance.now
  color: readonly [number, number, number];
}

interface GameState {
  phase: Phase;
  stack: Row[]; // locked rows, bottom → top
  current: {
    row: number;
    x: number; // float, left-most cell position (can be fractional during slide)
    width: number;
    dir: 1 | -1;
    spawnedAt: number; // ms, used for spawn pop animation
  } | null;
  shards: Shard[];
  score: number;
  level: number;
  perfectStreak: number;
  /** Last perfect-lock row — used to draw an expanding ring on that block. */
  perfectAt: { row: number; col: number; width: number; at: number } | null;
}

const initialState = (): GameState => ({
  phase: "idle",
  stack: [],
  current: null,
  shards: [],
  score: 0,
  level: 1,
  perfectStreak: 0,
  perfectAt: null,
});

// Colors cycle as the tower grows — cyan floor → gold top.
const CYAN: [number, number, number] = [34, 211, 238];
const GOLD: [number, number, number] = [250, 204, 21];
const mix = (a: [number, number, number], b: [number, number, number], t: number) =>
  [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ] as const;
const rgba = (c: readonly [number, number, number], a = 1) =>
  `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;

// ------------------------------------------------------------------
// Component
// ------------------------------------------------------------------

const LS_BEST = "livewager-stacker-best";
const LS_LAST_PLAYED = "livewager-pref:stackerLastPlayed";

type StackerGameProps = {
  /** Demo-labeled stake, in whole LWP. 0 = free play. */
  stake?: number;
  /** Prize multiplier applied on "won". */
  winMultiplier?: number;
  /** Notify parent about phase transitions — lets the wager panel
   *  re-open for the next round. */
  onPhaseChange?: (phase: Phase) => void;
};

export default function StackerGame({
  stake = 0,
  winMultiplier = 3,
  onPhaseChange,
}: StackerGameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<GameState>(initialState());
  const rafRef = useRef(0);
  const lastTRef = useRef<number>(0);
  /** Flash key: bumps on every perfect lock so the HUD pulses. */
  const flashRef = useRef(0);

  const [hudState, setHudState] = useState<{
    phase: Phase;
    score: number;
    level: number;
    perfectStreak: number;
    best: number;
  }>({ phase: "idle", score: 0, level: 1, perfectStreak: 0, best: 0 });

  // Transient difficulty-ramp flare: renders "Random spawn" when
  // entering row RANDOM_DIR_ROW and "Jitter on" at JITTER_ROW. Cleared
  // by a 2s timeout so the HUD stays calm the rest of the time.
  const [flare, setFlare] = useState<null | "spawn" | "jitter">(null);
  const flareRow = useRef<number>(-1);

  // Anti-cheat groundwork: local tap-entropy buffer per round. No
  // network calls — finalize result is logged to console in dev only.
  const roundRef = useRef<Round | null>(null);
  const rngRef = useRef<SeededRng | null>(null);
  const [lastTranscript, setLastTranscript] = useState<RoundTranscript | null>(null);
  const [lastSeed, setLastSeed] = useState<number | null>(null);
  const copy = useCopyable();

  // Restore best score once on mount.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(LS_BEST);
      const best = raw ? Number(raw) : 0;
      if (Number.isFinite(best) && best > 0) {
        setHudState((h) => ({ ...h, best }));
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Hide the mobile BottomNav while a round is live. Fingers near
  // the bottom of the screen were misfiring into Wallet / Account
  // mid-stack. Class is cleaned on unmount in case the component
  // goes away mid-round.
  useEffect(() => {
    const root = document.documentElement;
    if (hudState.phase === "playing") {
      root.classList.add("lw-hide-bottomnav");
    } else {
      root.classList.remove("lw-hide-bottomnav");
    }
    return () => {
      root.classList.remove("lw-hide-bottomnav");
    };
  }, [hudState.phase]);

  // ----------------------------------------------------------------
  // Game mechanics
  // ----------------------------------------------------------------

  const startRound = useCallback(() => {
    stateRef.current = {
      phase: "playing",
      stack: [],
      current: {
        row: 0,
        x: 0,
        width: START_WIDTH,
        dir: 1,
        spawnedAt: performance.now(),
      },
      shards: [],
      score: 0,
      level: 1,
      perfectStreak: 0,
      perfectAt: null,
    };
    flashRef.current = 0;
    flareRow.current = -1;
    setFlare(null);
    roundRef.current = createRound();
    const seed = randomSeed();
    rngRef.current = createRng(seed);
    setLastSeed(seed);
    setLastTranscript(null);
    try {
      // Stamp the local play history so /play can surface
      // "Last played X ago" without any canister round-trip.
      window.localStorage.setItem(LS_LAST_PLAYED, JSON.stringify(Date.now()));
    } catch {
      /* ignore quota / private mode */
    }
    setHudState((h) => ({
      ...h,
      phase: "playing",
      score: 0,
      level: 1,
      perfectStreak: 0,
    }));
    onPhaseChange?.("playing");
  }, [onPhaseChange]);

  const lockRow = useCallback(() => {
    const s = stateRef.current;
    if (s.phase !== "playing" || !s.current) return;

    const cur = s.current;
    // Record tap event into the anti-cheat buffer BEFORE we decide
    // game-over — even failed locks teach the detector what a real
    // last-tap looks like.
    roundRef.current?.record({
      row: cur.row,
      sliderCol: cur.x,
      sliderDir: cur.dir,
      sliderWidth: cur.width,
    });
    // Top of the stack defines the window we're aligning against. If the
    // stack is empty (row 0), the first lock just snaps the current width.
    const below = s.stack.length > 0 ? s.stack[s.stack.length - 1] : null;

    const curLeft = Math.round(cur.x);
    const curRight = curLeft + cur.width - 1;

    let lockedLeft = curLeft;
    let lockedRight = curRight;

    if (below) {
      const belowLeft = below.startCol;
      const belowRight = below.startCol + below.width - 1;
      lockedLeft = Math.max(curLeft, belowLeft);
      lockedRight = Math.min(curRight, belowRight);
      if (lockedRight < lockedLeft) {
        // No overlap — game over.
        sfx.over();
        haptics.over();
        s.phase = "over";
        const newBest = Math.max(hudState.best, s.score);
        try {
          window.localStorage.setItem(LS_BEST, String(newBest));
        } catch {
          /* ignore */
        }
        setHudState({
          phase: "over",
          score: s.score,
          level: s.level,
          perfectStreak: s.perfectStreak,
          best: newBest,
        });
        const t = roundRef.current?.finalize() ?? null;
        if (t) setLastTranscript(t);
        onPhaseChange?.("over");
        return;
      }
    }

    const newWidth = lockedRight - lockedLeft + 1;
    const perfect = below ? newWidth === cur.width : true;
    const newRow: Row = { row: cur.row, startCol: lockedLeft, width: newWidth };
    s.stack.push(newRow);

    // Chop-off: anything in the slider that didn't overlap the block below
    // spawns as a falling shard for drama.
    if (below && newWidth < cur.width) {
      const t = TOP_ROW > 0 ? cur.row / TOP_ROW : 0;
      const color = mix(CYAN, GOLD, t);
      const leftChopWidth = lockedLeft - curLeft;
      const rightChopWidth = curRight - lockedRight;
      const now = performance.now();
      if (leftChopWidth > 0) {
        s.shards.push({
          row: cur.row,
          startCol: curLeft,
          width: leftChopWidth,
          vy: 8,
          vx: -3,
          rot: 0,
          vrot: -3.2,
          born: now,
          color,
        });
      }
      if (rightChopWidth > 0) {
        s.shards.push({
          row: cur.row,
          startCol: lockedRight + 1,
          width: rightChopWidth,
          vy: 8,
          vx: 3,
          rot: 0,
          vrot: 3.2,
          born: now,
          color,
        });
      }
    }

    // Scoring: base 10 per row + 15 streak bonus per consecutive perfect.
    if (perfect) {
      s.perfectStreak += 1;
      s.score += 10 + 15 * s.perfectStreak;
      flashRef.current = performance.now();
      s.perfectAt = {
        row: cur.row,
        col: lockedLeft,
        width: newWidth,
        at: performance.now(),
      };
      sfx.perfect();
      haptics.perfect();
    } else {
      s.perfectStreak = 0;
      s.score += 10;
      sfx.lock();
      haptics.tick();
    }
    s.level = cur.row + 2; // next row shown to the player

    // Win condition.
    if (cur.row >= TOP_ROW) {
      sfx.win();
      haptics.win();
      s.phase = "won";
      const newBest = Math.max(hudState.best, s.score);
      try {
        window.localStorage.setItem(LS_BEST, String(newBest));
      } catch {
        /* ignore */
      }
      // Cross-game leaderboard post. Seed is included so a future
      // replay/validator (ANTICHEAT-T1) can deterministically reject
      // claims that don't match. postScore is idempotent by entry id.
      try {
        postScore("stacker", s.score, rngRef.current?.seed);
      } catch {
        /* leaderboard post should never block the win screen */
      }
      setHudState({
        phase: "won",
        score: s.score,
        level: s.level,
        perfectStreak: s.perfectStreak,
        best: newBest,
      });
      const t = roundRef.current?.finalize() ?? null;
      if (t) setLastTranscript(t);
      onPhaseChange?.("won");
      s.current = null;
      return;
    }

    // Spawn next slider. Early rows: predictable left-to-right start
    // at x=0. From RANDOM_DIR_ROW up: flip a coin for starting side +
    // direction so the player has to actually track instead of relying
    // on muscle memory. Width = the new locked width.
    const nextRow = cur.row + 1;
    const randomize = nextRow >= RANDOM_DIR_ROW;
    // Seeded RNG so the whole round is replayable given (seed,
    // transcript). Falls back to Math.random only if something
    // exploded during startRound — belt and suspenders.
    const fromRight =
      randomize &&
      (rngRef.current?.coin() ?? Math.random() < 0.5);
    const startX = fromRight ? GRID_COLS - newWidth : 0;
    const dir: 1 | -1 = fromRight ? -1 : 1;
    s.current = {
      row: nextRow,
      x: startX,
      width: newWidth,
      dir,
      spawnedAt: performance.now(),
    };

    // Flare when we cross a difficulty tripwire for the first time
    // this round. flareRow ref guards against re-firing inside the
    // same round; startRound resets it.
    if (nextRow === RANDOM_DIR_ROW && flareRow.current < RANDOM_DIR_ROW) {
      flareRow.current = RANDOM_DIR_ROW;
      setFlare("spawn");
      window.setTimeout(() => setFlare(null), 2000);
    } else if (nextRow === JITTER_ROW && flareRow.current < JITTER_ROW) {
      flareRow.current = JITTER_ROW;
      setFlare("jitter");
      window.setTimeout(() => setFlare(null), 2000);
    }

    setHudState((h) => ({
      ...h,
      score: s.score,
      level: s.level,
      perfectStreak: s.perfectStreak,
      best: Math.max(h.best, s.score),
    }));
  }, [hudState.best, onPhaseChange]);

  const handleTap = useCallback(() => {
    unlockAudio();
    const s = stateRef.current;
    if (s.phase === "idle" || s.phase === "won" || s.phase === "over") {
      sfx.ping();
      haptics.tick();
      startRound();
      return;
    }
    lockRow();
  }, [lockRow, startRound]);

  // ----------------------------------------------------------------
  // Input
  // ----------------------------------------------------------------

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        handleTap();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleTap]);

  // ----------------------------------------------------------------
  // Render loop
  // ----------------------------------------------------------------

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 3);

    // Prefers-contrast probe. Beefier strokes + brighter stack
    // outlines when the OS or app-level pref asks for more contrast.
    // Re-check per-frame is cheap; avoids a separate event listener
    // and keeps the render loop self-contained.
    const contrastMq =
      typeof window !== "undefined" && window.matchMedia
        ? window.matchMedia("(prefers-contrast: more)")
        : null;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const r = parent.getBoundingClientRect();
      canvas.width = Math.floor(r.width * dpr);
      canvas.height = Math.floor(r.height * dpr);
      canvas.style.width = `${r.width}px`;
      canvas.style.height = `${r.height}px`;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement!);

    const frame = (t: number) => {
      const dtMs = Math.min(50, t - (lastTRef.current || t));
      lastTRef.current = t;
      const dt = dtMs / 1000;

      const s = stateRef.current;

      // ---- simulate ----
      if (s.phase === "playing" && s.current) {
        const baseSpeed = SPEED_BY_ROW(s.current.row);
        // Rhythm-breaking jitter kicks in on upper rows. Uses a sine of
        // wall-clock time at a deliberately-odd frequency so it doesn't
        // land on any predictable beat. Scales from 0 at JITTER_ROW to
        // full amplitude at TOP_ROW.
        let speed = baseSpeed;
        if (s.current.row >= JITTER_ROW) {
          const ramp = Math.min(
            1,
            (s.current.row - JITTER_ROW) / Math.max(1, TOP_ROW - JITTER_ROW),
          );
          const wobble =
            Math.sin(t * 0.017) * JITTER_AMP * ramp * baseSpeed +
            Math.sin(t * 0.0063 + 1.3) * (JITTER_AMP / 2) * ramp * baseSpeed;
          speed = Math.max(baseSpeed * 0.5, baseSpeed + wobble);
        }
        s.current.x += s.current.dir * speed * dt;
        const maxX = GRID_COLS - s.current.width;
        if (s.current.x > maxX) {
          s.current.x = maxX - (s.current.x - maxX);
          s.current.dir = -1;
        } else if (s.current.x < 0) {
          s.current.x = -s.current.x;
          s.current.dir = 1;
        }
      }

      // Simulate shards: gravity + spin. Cull below the board.
      if (s.shards.length > 0) {
        const g = 22; // cells/sec^2
        for (const sh of s.shards) {
          sh.vy += g * dt;
          sh.startCol += sh.vx * dt;
          sh.row -= sh.vy * dt;
          sh.rot += sh.vrot * dt;
        }
        s.shards = s.shards.filter((sh) => sh.row > -3);
      }

      // ---- draw ----
      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      // Background gradient.
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, "#071a2e");
      bg.addColorStop(1, "#020b18");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // Playfield dimensions. Maintain ~4:7 aspect (wider than tall).
      const padX = W * 0.06;
      const padTop = H * 0.05;
      const padBottom = H * 0.05;
      const playW = W - padX * 2;
      const playH = H - padTop - padBottom;
      const cellW = playW / GRID_COLS;
      const cellH = playH / GRID_ROWS;

      // Grid dots.
      ctx.fillStyle = "rgba(255,255,255,0.04)";
      for (let r = 0; r < GRID_ROWS; r++) {
        for (let c = 0; c < GRID_COLS; c++) {
          const cx = padX + (c + 0.5) * cellW;
          const cy = H - padBottom - (r + 0.5) * cellH;
          ctx.beginPath();
          ctx.arc(cx, cy, Math.min(cellW, cellH) * 0.04, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // When the user asks for more contrast, stack borders are
      // stronger (full-alpha stroke, 1.8× line width) and the bottom
      // of the gradient doesn't fade as much, so each block reads as
      // a distinct element even on a dim display.
      const highContrast = contrastMq?.matches ?? false;

      const drawBlock = (
        col: number,
        row: number,
        width: number,
        color: readonly [number, number, number],
        alpha = 1,
      ) => {
        const x = padX + col * cellW;
        const y = H - padBottom - (row + 1) * cellH;
        const w = cellW * width;
        const h = cellH;
        const pad = Math.min(cellW, cellH) * 0.06;
        const grad = ctx.createLinearGradient(x, y, x, y + h);
        const topAlpha = highContrast ? 1 : 0.95;
        const bottomAlpha = highContrast ? 0.85 : 0.65;
        grad.addColorStop(0, rgba(color, topAlpha * alpha));
        grad.addColorStop(1, rgba(color, bottomAlpha * alpha));
        ctx.fillStyle = grad;
        ctx.beginPath();
        const rx = Math.min(8 * dpr, h * 0.18);
        ctx.roundRect(x + pad, y + pad, w - pad * 2, h - pad * 2, rx);
        ctx.fill();
        // Inner highlight. High-contrast mode draws a full-alpha
        // outline at 1.8× line width.
        ctx.strokeStyle = rgba(color, (highContrast ? 0.9 : 0.35) * alpha);
        ctx.lineWidth = (highContrast ? 1.8 : 1) * dpr;
        ctx.stroke();
      };

      // Stack.
      s.stack.forEach((r) => {
        const tt = TOP_ROW > 0 ? r.row / TOP_ROW : 0;
        drawBlock(r.startCol, r.row, r.width, mix(CYAN, GOLD, tt));
      });

      // Overlap hint — dim rectangle marking where a lock would land
      // right now given the current slider position vs the top of the
      // stack. Training-wheels only: visible on early rows, fades out
      // by row 4 so experts aren't coddled. Skipped on row 0 since
      // there's nothing to align against yet.
      const HINT_FADE_ROW = 4;
      if (
        s.phase === "playing" &&
        s.current &&
        s.current.row > 0 &&
        s.current.row < HINT_FADE_ROW &&
        s.stack.length > 0
      ) {
        const below = s.stack[s.stack.length - 1];
        const curLeft = Math.round(s.current.x);
        const curRight = curLeft + s.current.width - 1;
        const belowLeft = below.startCol;
        const belowRight = below.startCol + below.width - 1;
        const ovLeft = Math.max(curLeft, belowLeft);
        const ovRight = Math.min(curRight, belowRight);
        if (ovRight >= ovLeft) {
          const ovWidth = ovRight - ovLeft + 1;
          const alpha =
            1 - s.current.row / HINT_FADE_ROW; // 1 at row 1, 0 at HINT_FADE_ROW
          const x = padX + ovLeft * cellW;
          const y = H - padBottom - (s.current.row + 1) * cellH;
          const w = cellW * ovWidth;
          const h = cellH;
          const pad = Math.min(cellW, cellH) * 0.1;
          ctx.setLineDash([4 * dpr, 3 * dpr]);
          ctx.strokeStyle = `rgba(255,255,255,${0.35 * alpha})`;
          ctx.lineWidth = 1 * dpr;
          ctx.beginPath();
          ctx.roundRect(
            x + pad,
            y + pad,
            w - pad * 2,
            h - pad * 2,
            Math.min(6 * dpr, h * 0.15),
          );
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      // Shards (chopped pieces, falling).
      if (s.shards.length > 0) {
        const now = performance.now();
        for (const sh of s.shards) {
          const age = (now - sh.born) / 1000;
          const alpha = Math.max(0, 1 - age / 1.2);
          const cx = padX + (sh.startCol + sh.width / 2) * cellW;
          const cy = H - padBottom - (sh.row + 0.5) * cellH;
          const w = cellW * sh.width;
          const h = cellH;
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(sh.rot);
          const pad = Math.min(cellW, cellH) * 0.06;
          const grad = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
          grad.addColorStop(0, rgba(sh.color, 0.9 * alpha));
          grad.addColorStop(1, rgba(sh.color, 0.55 * alpha));
          ctx.fillStyle = grad;
          ctx.beginPath();
          const rx = Math.min(8 * dpr, h * 0.18);
          ctx.roundRect(-w / 2 + pad, -h / 2 + pad, w - pad * 2, h - pad * 2, rx);
          ctx.fill();
          ctx.restore();
        }
      }

      // Perfect-lock expanding ring on the matched block.
      if (s.perfectAt) {
        const pa = s.perfectAt;
        const age = t - pa.at;
        if (age < 600) {
          const prog = age / 600;
          const a = 1 - prog;
          const bx = padX + pa.col * cellW;
          const by = H - padBottom - (pa.row + 1) * cellH;
          const bw = cellW * pa.width;
          const bh = cellH;
          const cx = bx + bw / 2;
          const cy = by + bh / 2;
          const maxR = Math.max(bw, bh) * (1 + prog * 1.5);
          ctx.strokeStyle = rgba(GOLD, 0.7 * a);
          ctx.lineWidth = 3 * dpr * (1 - prog * 0.6);
          ctx.beginPath();
          ctx.ellipse(cx, cy, maxR * 0.6, maxR * 0.3, 0, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          s.perfectAt = null;
        }
      }

      // Current slider with spawn pop.
      if (s.current) {
        const tt = TOP_ROW > 0 ? s.current.row / TOP_ROW : 0;
        const col = s.current.x;
        const x = padX + col * cellW;
        const y = H - padBottom - (s.current.row + 1) * cellH;
        const w = cellW * s.current.width;
        const h = cellH;
        const pad = Math.min(cellW, cellH) * 0.06;
        const color = mix(CYAN, GOLD, tt);

        // Spawn pop: scale from 0.7 → 1.0 over first 180ms.
        const sinceSpawn = t - s.current.spawnedAt;
        const popScale =
          sinceSpawn < 180 ? 0.7 + 0.3 * (sinceSpawn / 180) : 1;
        // Subtle bob: ±1.5% cellH at 2Hz (disabled during pop).
        const bob = sinceSpawn < 200 ? 0 : Math.sin(t * 0.006) * cellH * 0.015;

        const cx = x + w / 2;
        const cy = y + h / 2 + bob;
        const dw = w * popScale;
        const dh = h * popScale;

        const grad = ctx.createLinearGradient(cx, cy - dh / 2, cx, cy + dh / 2);
        grad.addColorStop(0, rgba(color, highContrast ? 1 : 0.95));
        grad.addColorStop(1, rgba(color, highContrast ? 0.85 : 0.6));
        ctx.fillStyle = grad;
        ctx.beginPath();
        const rx = Math.min(8 * dpr, dh * 0.18);
        ctx.roundRect(cx - dw / 2 + pad, cy - dh / 2 + pad, dw - pad * 2, dh - pad * 2, rx);
        ctx.fill();
        // High-contrast mode emphasises the outline over the glow so
        // the slider silhouette reads clearly even on dim screens.
        if (highContrast) {
          ctx.strokeStyle = rgba(color, 1);
          ctx.lineWidth = 2.2 * dpr;
          ctx.stroke();
        } else {
          ctx.shadowColor = rgba(color, 0.6);
          ctx.shadowBlur = 14 * dpr;
          ctx.strokeStyle = rgba(color, 0.7);
          ctx.lineWidth = 1 * dpr;
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
      }

      // Perfect flash (full-board warm tint). Brief, gentle.
      const since = t - flashRef.current;
      if (flashRef.current > 0 && since < 420) {
        const a = 1 - since / 420;
        ctx.fillStyle = rgba(GOLD, 0.09 * a);
        ctx.fillRect(0, 0, W, H);
      }

      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, []);

  // ----------------------------------------------------------------
  // Render
  // ----------------------------------------------------------------

  const statusCopy = useMemo(() => {
    if (hudState.phase === "idle") {
      return {
        title: "Stacker",
        sub:
          stake > 0
            ? `Stake ${stake} LWP — reach the top for ${stake * winMultiplier} LWP (demo). Tap, click, or press space to start.`
            : "Tap / click / space to start. Stop the slider inside the stack.",
        cta: "Start",
      };
    }
    if (hudState.phase === "won") {
      const prize = stake * winMultiplier;
      return {
        title: "Top floor.",
        sub:
          stake > 0
            ? `Final score ${hudState.score}. Demo prize: ${prize} LWP (not moved on-chain).`
            : `You stacked clean. Final score ${hudState.score}.`,
        cta: "Play again",
      };
    }
    if (hudState.phase === "over") {
      return {
        title: "Stack collapsed.",
        sub:
          stake > 0
            ? `Score ${hudState.score}. Demo stake ${stake} LWP lost (not moved on-chain).`
            : `Best cell missed — score ${hudState.score}.`,
        cta: "Try again",
      };
    }
    return { title: "", sub: "", cta: "" };
  }, [hudState.phase, hudState.score, stake, winMultiplier]);

  return (
    <div
      className="relative mx-auto w-full max-w-[560px] aspect-[3/5] rounded-2xl overflow-hidden ring-1 ring-white/10 shadow-2xl select-none"
      onPointerDown={(e) => {
        // Avoid double-firing on keyboard focus.
        (e.currentTarget as HTMLElement).focus();
        handleTap();
      }}
      tabIndex={0}
      role="button"
      aria-label={statusCopy.title}
    >
      <canvas ref={canvasRef} className="absolute inset-0" />

      {/* HUD */}
      <div className="absolute top-3 left-3 right-3 flex items-start justify-between gap-3 pointer-events-none">
        <div className="flex gap-2">
          <HudPill label="Score" value={String(hudState.score)} />
          <HudPill label="Row" value={`${hudState.level}/${GRID_ROWS}`} />
          {hudState.perfectStreak > 1 && (
            <HudPill label="Streak" value={`×${hudState.perfectStreak}`} accent="gold" />
          )}
        </div>
        <HudPill label="Best" value={String(hudState.best || "—")} />
      </div>

      {/* Transient difficulty flare. Centered under the HUD row so it
          doesn't fight the score pills for attention. Fades via CSS,
          cleared by its own 2s timer in the lock handler. */}
      {flare && hudState.phase === "playing" && (
        <div
          aria-live="polite"
          className="absolute top-14 left-0 right-0 flex justify-center pointer-events-none"
        >
          <div
            className={[
              "lw-reveal rounded-full border px-3 py-1 text-[10px] font-mono uppercase tracking-widest shadow-xl backdrop-blur-md",
              flare === "spawn"
                ? "border-orange-400/50 bg-orange-400/15 text-orange-200"
                : "border-yellow-400/50 bg-yellow-400/15 text-yellow-200",
            ].join(" ")}
          >
            {flare === "spawn" ? "Random spawn engaged" : "Speed jitter engaged"}
          </div>
        </div>
      )}

      {/* Status overlay */}
      {(hudState.phase === "idle" || hudState.phase === "won" || hudState.phase === "over") && (
        <div className="absolute inset-0 grid place-items-center bg-black/45 backdrop-blur-[2px] p-6 text-center pointer-events-none">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-cyan-300 mb-2">Stacker</div>
            <h2 className="text-3xl md:text-4xl font-black text-white mb-2">{statusCopy.title}</h2>
            <p className="text-sm text-gray-300 max-w-xs mx-auto mb-5 leading-snug">
              {statusCopy.sub}
            </p>

            {/* Pre-round difficulty hint. Only on idle — leaving it on
                won/over would bury the score. Cues match the actual
                mechanic rows in SPEED_BY_ROW / RANDOM_DIR_ROW / JITTER_ROW. */}
            {hudState.phase === "idle" && (
              <ul className="mb-5 mx-auto max-w-[260px] space-y-1 text-left">
                <DifficultyCue
                  dot="bg-cyan-300"
                  tone="text-cyan-300"
                  rows="0–5"
                  text="Predictable slider"
                />
                <DifficultyCue
                  dot="bg-orange-400"
                  tone="text-orange-300"
                  rows="6+"
                  text="Spawn side randomizes"
                />
                <DifficultyCue
                  dot="bg-yellow-300"
                  tone="text-yellow-300"
                  rows="8+"
                  text="Speed jitters — no rhythm"
                />
              </ul>
            )}

            <div className="text-[11px] font-mono text-gray-400 uppercase tracking-widest">
              Press space or tap to {statusCopy.cta.toLowerCase()}
            </div>

            {/* Fair-play transparency: show the transcript stats on
                won/over so players can see what was captured. No upload,
                local only until ANTICHEAT-T1 ships. */}
            {lastTranscript &&
              (hudState.phase === "won" || hudState.phase === "over") && (
                <div className="mt-4 space-y-1">
                  <div className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">
                    Captured {lastTranscript.stats.count} taps ·{" "}
                    {lastTranscript.stats.meanDt > 0
                      ? `μ Δt ${Math.round(lastTranscript.stats.meanDt)}ms`
                      : "—"}
                  </div>
                  {lastSeed !== null && (
                    <div className="text-[10px] font-mono text-gray-600 uppercase tracking-widest">
                      Seed · {lastSeed.toString(16).padStart(8, "0")}
                    </div>
                  )}

                  {lastSeed !== null && (
                    <div className="pt-2 flex justify-center pointer-events-auto">
                      <button
                        type="button"
                        onClick={(e) => {
                          // Don't let the tap bubble into the canvas
                          // handler (which would restart the round).
                          e.stopPropagation();
                          const seedHex = lastSeed
                            .toString(16)
                            .padStart(8, "0");
                          const score = hudState.score;
                          const taps = lastTranscript.stats.count;
                          const mean = Math.round(lastTranscript.stats.meanDt);
                          const outcome = hudState.phase === "won" ? "WON" : "OVER";
                          // Compact single-line payload — good for
                          // chat, short enough for Twitter, and easy
                          // to re-parse into a deterministic replay
                          // once ANTICHEAT-T1 ships.
                          const line = `Stacker · ${outcome} · score ${score} · row ${hudState.level}/${GRID_ROWS} · seed 0x${seedHex} · ${taps} taps · μΔt ${mean}ms · livewager.io/stacker`;
                          copy(line, { label: "Run" });
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        className="text-[10px] font-mono uppercase tracking-widest px-3 py-1.5 rounded-full border border-white/15 text-gray-200 hover:text-white hover:border-white/30 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60"
                        aria-label="Copy run details"
                      >
                        Copy run
                      </button>
                    </div>
                  )}
                </div>
              )}
          </div>
        </div>
      )}
    </div>
  );
}

function HudPill({
  label,
  value,
  accent = "cyan",
}: {
  label: string;
  value: string;
  accent?: "cyan" | "gold";
}) {
  const color = accent === "gold" ? "text-yellow-300" : "text-cyan-300";
  return (
    <div className="rounded-md bg-black/70 px-2 py-1 text-[10px] font-mono uppercase tracking-widest">
      <span className="text-gray-400">{label}</span>{" "}
      <span className={`${color} tabular-nums`}>{value}</span>
    </div>
  );
}

function DifficultyCue({
  dot,
  tone,
  rows,
  text,
}: {
  dot: string;
  tone: string;
  rows: string;
  text: string;
}) {
  return (
    <li className="flex items-center gap-2 text-[11px]">
      <span className={`h-1.5 w-1.5 rounded-full ${dot} shrink-0`} />
      <span className={`font-mono uppercase tracking-widest ${tone}`}>
        row {rows}
      </span>
      <span className="text-gray-300">{text}</span>
    </li>
  );
}
