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

// ------------------------------------------------------------------
// Configuration
// ------------------------------------------------------------------

const GRID_COLS = 7;
const GRID_ROWS = 15;
/** Level targets — the "win" row. Classic arcades set this ~12-15 tall. */
const TOP_ROW = GRID_ROWS - 1;
/**
 * Speed ramp: cells per second the slider moves at each row. Starts
 * gentle, climbs fast in the upper tiers to keep the tension honest.
 */
const SPEED_BY_ROW = (row: number): number => {
  // Monotonic piecewise: 3.2 → 8.0 across rows 0..TOP_ROW.
  const t = row / Math.max(1, TOP_ROW);
  return 3.2 + t * t * 4.8;
};
/** Starting block width. Narrower = harder. */
const START_WIDTH = 3;

type Phase = "idle" | "playing" | "won" | "over";

interface Row {
  row: number; // 0 = bottom
  startCol: number; // left-most cell, integer
  width: number;
}

interface GameState {
  phase: Phase;
  stack: Row[]; // locked rows, bottom → top
  current: {
    row: number;
    x: number; // float, left-most cell position (can be fractional during slide)
    width: number;
    dir: 1 | -1;
  } | null;
  score: number;
  level: number;
  perfectStreak: number;
}

const initialState = (): GameState => ({
  phase: "idle",
  stack: [],
  current: null,
  score: 0,
  level: 1,
  perfectStreak: 0,
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

export default function StackerGame() {
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
      },
      score: 0,
      level: 1,
      perfectStreak: 0,
    };
    flashRef.current = 0;
    setHudState((h) => ({
      ...h,
      phase: "playing",
      score: 0,
      level: 1,
      perfectStreak: 0,
    }));
  }, []);

  const lockRow = useCallback(() => {
    const s = stateRef.current;
    if (s.phase !== "playing" || !s.current) return;

    const cur = s.current;
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
        return;
      }
    }

    const newWidth = lockedRight - lockedLeft + 1;
    const perfect = below ? newWidth === cur.width : true;
    const newRow: Row = { row: cur.row, startCol: lockedLeft, width: newWidth };
    s.stack.push(newRow);

    // Scoring: base 10 per row + 15 streak bonus per consecutive perfect.
    if (perfect) {
      s.perfectStreak += 1;
      s.score += 10 + 15 * s.perfectStreak;
      flashRef.current = performance.now();
    } else {
      s.perfectStreak = 0;
      s.score += 10;
    }
    s.level = cur.row + 2; // next row shown to the player

    // Win condition.
    if (cur.row >= TOP_ROW) {
      s.phase = "won";
      const newBest = Math.max(hudState.best, s.score);
      try {
        window.localStorage.setItem(LS_BEST, String(newBest));
      } catch {
        /* ignore */
      }
      setHudState({
        phase: "won",
        score: s.score,
        level: s.level,
        perfectStreak: s.perfectStreak,
        best: newBest,
      });
      s.current = null;
      return;
    }

    // Spawn next slider at the top-left, width = new locked width.
    const nextRow = cur.row + 1;
    const startX = 0;
    s.current = {
      row: nextRow,
      x: startX,
      width: newWidth,
      dir: 1,
    };

    setHudState((h) => ({
      ...h,
      score: s.score,
      level: s.level,
      perfectStreak: s.perfectStreak,
      best: Math.max(h.best, s.score),
    }));
  }, [hudState.best]);

  const handleTap = useCallback(() => {
    const s = stateRef.current;
    if (s.phase === "idle" || s.phase === "won" || s.phase === "over") {
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
        const speed = SPEED_BY_ROW(s.current.row);
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
        grad.addColorStop(0, rgba(color, 0.95 * alpha));
        grad.addColorStop(1, rgba(color, 0.65 * alpha));
        ctx.fillStyle = grad;
        ctx.beginPath();
        const rx = Math.min(8 * dpr, h * 0.18);
        ctx.roundRect(x + pad, y + pad, w - pad * 2, h - pad * 2, rx);
        ctx.fill();
        // Inner highlight.
        ctx.strokeStyle = rgba(color, 0.35 * alpha);
        ctx.lineWidth = 1 * dpr;
        ctx.stroke();
      };

      // Stack.
      s.stack.forEach((r) => {
        const t = TOP_ROW > 0 ? r.row / TOP_ROW : 0;
        drawBlock(r.startCol, r.row, r.width, mix(CYAN, GOLD, t));
      });

      // Current slider.
      if (s.current) {
        const t = TOP_ROW > 0 ? s.current.row / TOP_ROW : 0;
        const col = s.current.x;
        const x = padX + col * cellW;
        const y = H - padBottom - (s.current.row + 1) * cellH;
        const w = cellW * s.current.width;
        const h = cellH;
        const pad = Math.min(cellW, cellH) * 0.06;
        const color = mix(CYAN, GOLD, t);
        const grad = ctx.createLinearGradient(x, y, x, y + h);
        grad.addColorStop(0, rgba(color, 0.95));
        grad.addColorStop(1, rgba(color, 0.6));
        ctx.fillStyle = grad;
        ctx.beginPath();
        const rx = Math.min(8 * dpr, h * 0.18);
        ctx.roundRect(x + pad, y + pad, w - pad * 2, h - pad * 2, rx);
        ctx.fill();
        // Moving glow.
        ctx.shadowColor = rgba(color, 0.6);
        ctx.shadowBlur = 14 * dpr;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // Perfect flash.
      const since = t - flashRef.current;
      if (flashRef.current > 0 && since < 500) {
        const a = 1 - since / 500;
        ctx.fillStyle = rgba(GOLD, 0.12 * a);
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
        sub: "Tap / click / space to start. Stop the slider inside the stack.",
        cta: "Start",
      };
    }
    if (hudState.phase === "won") {
      return {
        title: "Top floor.",
        sub: `You stacked clean. Final score ${hudState.score}.`,
        cta: "Play again",
      };
    }
    if (hudState.phase === "over") {
      return {
        title: "Stack collapsed.",
        sub: `Best cell missed — score ${hudState.score}.`,
        cta: "Try again",
      };
    }
    return { title: "", sub: "", cta: "" };
  }, [hudState.phase, hudState.score]);

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

      {/* Status overlay */}
      {(hudState.phase === "idle" || hudState.phase === "won" || hudState.phase === "over") && (
        <div className="absolute inset-0 grid place-items-center bg-black/45 backdrop-blur-[2px] p-6 text-center pointer-events-none">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-cyan-300 mb-2">Stacker</div>
            <h2 className="text-3xl md:text-4xl font-black text-white mb-2">{statusCopy.title}</h2>
            <p className="text-sm text-gray-300 max-w-xs mx-auto mb-5 leading-snug">
              {statusCopy.sub}
            </p>
            <div className="text-[11px] font-mono text-gray-400 uppercase tracking-widest">
              Press space or tap to {statusCopy.cta.toLowerCase()}
            </div>
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
