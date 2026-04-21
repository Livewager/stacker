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
import { useLocalPref, PREF_KEYS } from "@/lib/prefs";
import { postScore } from "@/lib/scoreboard";
import { BottomSheet } from "@/components/ui/BottomSheet";

// ------------------------------------------------------------------
// Configuration
// ------------------------------------------------------------------

const GRID_COLS = 7;
const GRID_ROWS = 15;
/** Level targets — the "win" row. Classic arcades set this ~12-15 tall. */
const TOP_ROW = GRID_ROWS - 1;
/**
 * Speed ramp: cells per second the slider moves at each row. Previous
 * curve started at 3.6 which read as "free warm-up" — users looping
 * the demo were clearing rows 0–3 without any tension. Rebalanced to
 * a quicker base + flatter cubic so the opening floors demand real
 * tracking from tap 1, while the top end stays at ~13.5 so the
 * DifficultyLadder's "approaching unplayable" narrative still holds.
 *
 *   row 0:  ~5.2 cells/sec  (no free ride — classic stacker first-tier feel)
 *   row 5:  ~6.3
 *   row 10: ~8.2
 *   row 14: ~13.5 + jitter  (approaching unplayable without rhythm)
 *
 * Cubic coefficient dropped from 9.9 → 8.3 so the ramp reaches the
 * same ceiling from the higher floor. Base bumped 3.6 → 5.2 (+44%).
 */
const SPEED_BY_ROW = (row: number): number => {
  const t = row / Math.max(1, TOP_ROW);
  // 5.2 base + cubic ramp to ~13.5 by the top row.
  return 5.2 + t * t * t * 8.3;
};

/**
 * Per-frame speed jitter amplitude (fraction of SPEED_BY_ROW). Kicks
 * in from row JITTER_ROW. Moved from row 8 → 6 so the mid-game
 * transition to "no rhythm" happens earlier — aligns with the earlier
 * RANDOM_DIR_ROW shift and keeps the tower from having a 5-row easy
 * stretch before anything interesting happens.
 */
const JITTER_ROW = 6;
const JITTER_AMP = 0.18; // ±18% at full strength

/**
 * From this row, spawn direction is randomized instead of always
 * starting left-to-right. Moved from row 6 → 3 so muscle memory
 * breaks earlier — you can't coast the first 5 rows on a pure
 * left-to-right reflex anymore, which is exactly the "first level
 * way too easy" complaint this tune addresses.
 */
const RANDOM_DIR_ROW = 3;

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
  /** Running high-water mark of perfectStreak for this round. perfectStreak
   *  itself resets to 0 on any non-perfect lock; this one never resets
   *  mid-round. Used at end-of-round to decide whether to bump the
   *  persisted best. */
  runMaxStreak: number;
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
  runMaxStreak: 0,
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
const LS_BEST_STREAK = "livewager-stacker-best-streak";
const LS_LAST_PLAYED = "livewager-pref:stackerLastPlayed";

type StackerGameProps = {
  /** Demo-labeled stake, in whole LWP. 0 = free play. */
  stake?: number;
  /** Prize multiplier applied on "won". */
  winMultiplier?: number;
  /** Notify parent about phase transitions — lets the wager panel
   *  re-open for the next round. */
  onPhaseChange?: (phase: Phase) => void;
  /**
   * One-shot seed override for the first round. When set, the first
   * startRound() uses this instead of randomSeed() — pairs with the
   * /stacker?seed=0x... URL param so a shared share-line reproduces
   * the exact same RNG sequence. Consumed on first use; subsequent
   * rounds in the same mount use fresh random seeds.
   */
  initialSeed?: number | null;
  /**
   * Async gate invoked on every round-start request (tap/click/space
   * on idle/won/over, plus the "R" restart). Must resolve to `true`
   * for the round to begin; `false` or a thrown error cancels.
   *
   * This is the hook the /stacker page uses to burn the ICRC-1 entry
   * fee before any mechanics run. The fee burn happens inside the
   * gate; if the ledger rejects, this returns false and the player
   * sees a toast from the gate itself. The game stays in its current
   * phase (idle / won / over) so a retry just means tapping again.
   */
  beforeStart?: () => Promise<boolean>;
  /**
   * Fired exactly once per round-end. Carries the final score, the
   * peak perfect-streak observed during the run, and the outcome
   * variant. Best place for the parent to submit to game_scores or
   * persist any post-round telemetry.
   *
   * Note: fires on both "won" and "over" outcomes. For Practice
   * rounds the parent should ignore this (don't pollute the public
   * leaderboard with practice runs).
   */
  onRoundEnd?: (info: { score: number; streak: number; outcome: "won" | "over" }) => void;
};

export default function StackerGame({
  stake = 0,
  winMultiplier = 3,
  onPhaseChange,
  initialSeed = null,
  beforeStart,
  onRoundEnd,
}: StackerGameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Wrapper ref so we can snap SR focus to the game region when a
  // round ends, triggering the updated aria-label ("You cleared the
  // tower!" / "Game over.") to be announced and making the wrapper
  // the keyboard target for Space/Enter/R without requiring a prior
  // tab. Only bump focus when the wrapper isn't already focused;
  // otherwise we'd steal it from a legitimately interactive overlay
  // child (Share Run button, Seed copy).
  const wrapperRef = useRef<HTMLDivElement | null>(null);
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
    bestStreak: number;
    /** Set to the new best-streak value when the just-finished round
     *  beat the persisted record. The overlay reads this flag on
     *  won/over to render a "new best streak" flourish. Cleared on
     *  the next start. */
    newBestStreak: number | null;
    /** Set to the delta (new best − previous best) when the just-finished
     *  round beat the score record. Same pattern as newBestStreak —
     *  lives only for the duration of the end-of-round card, cleared
     *  on next start. Null when the round didn't set a new best. */
    newBestDelta: number | null;
  }>({
    phase: "idle",
    score: 0,
    level: 1,
    perfectStreak: 0,
    best: 0,
    bestStreak: 0,
    newBestStreak: null,
    newBestDelta: null,
  });

  // Transient difficulty-ramp flare: renders "Random spawn" when
  // entering row RANDOM_DIR_ROW and "Jitter on" at JITTER_ROW. Cleared
  // by a 2s timeout so the HUD stays calm the rest of the time.
  const [flare, setFlare] = useState<null | "spawn" | "jitter">(null);
  const flareRow = useRef<number>(-1);
  // One-shot holder for an injected seed. initialSeed is read once on
  // the first startRound; subsequent rounds revert to randomSeed().
  // Kept as a ref so the value survives the multiple renders that
  // happen between prop-receive and user-start without re-inflating
  // each time.
  const pendingSeed = useRef<number | null>(initialSeed);

  // Pause-on-tab-hidden. When document.hidden flips true during a
  // live round, we freeze the simulate branch of the render loop
  // and show an overlay. Any click / Space / Enter resumes after
  // the tab is visible again.
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);

  // Anti-cheat groundwork: local tap-entropy buffer per round. No
  // network calls — finalize result is logged to console in dev only.
  const roundRef = useRef<Round | null>(null);
  const rngRef = useRef<SeededRng | null>(null);
  const [lastTranscript, setLastTranscript] = useState<RoundTranscript | null>(null);
  const [lastSeed, setLastSeed] = useState<number | null>(null);
  const [showSeed, setShowSeed] = useLocalPref<boolean>(
    PREF_KEYS.stackerShowSeed,
    false,
  );
  // Mid-round prefs for the in-game settings sheet (POLISH-248). The
  // sfx + haptics libs read their own pref from localStorage on each
  // call, so flipping these hooks — which publishes through useLocalPref —
  // takes effect on the very next SFX invocation without a reload.
  const [sound, setSound] = useLocalPref<boolean>(PREF_KEYS.sound, true);
  const [stackerHaptics, setStackerHaptics] = useLocalPref<boolean>(
    PREF_KEYS.haptics,
    true,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Fullscreen toggle. Uses the native Fullscreen API; some Safari
  // versions prefix it, so we check both. Falls back to a soft
  // "expanded" CSS class if the API is blocked (iframes in strict
  // policies, file://) — better to render SOMETHING than fail silent.
  const toggleFullscreen = useCallback(async () => {
    const el = wrapperRef.current;
    if (!el) return;
    const doc = document as Document & {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => Promise<void>;
    };
    const elx = el as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void>;
    };
    const alreadyFs = doc.fullscreenElement || doc.webkitFullscreenElement;
    try {
      if (alreadyFs) {
        if (doc.exitFullscreen) await doc.exitFullscreen();
        else if (doc.webkitExitFullscreen) await doc.webkitExitFullscreen();
      } else if (elx.requestFullscreen) {
        await elx.requestFullscreen();
      } else if (elx.webkitRequestFullscreen) {
        await elx.webkitRequestFullscreen();
      } else {
        // Fallback: CSS-based soft fullscreen.
        setIsFullscreen((v) => !v);
      }
    } catch {
      // iOS Safari on iPhone refuses fullscreen on non-<video>
      // elements; gracefully fall through to the soft mode.
      setIsFullscreen((v) => !v);
    }
  }, []);

  // Sync local state with browser fullscreen changes so the icon
  // flips correctly when the user hits ESC.
  useEffect(() => {
    const onChange = () => {
      const doc = document as Document & {
        webkitFullscreenElement?: Element | null;
      };
      const active = !!(doc.fullscreenElement || doc.webkitFullscreenElement);
      setIsFullscreen(active);
    };
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
    };
  }, []);
  const copy = useCopyable();

  // Restore best score + best streak once on mount.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(LS_BEST);
      const best = raw ? Number(raw) : 0;
      const rawStreak = window.localStorage.getItem(LS_BEST_STREAK);
      const bestStreak = rawStreak ? Number(rawStreak) : 0;
      setHudState((h) => ({
        ...h,
        best: Number.isFinite(best) && best > 0 ? best : h.best,
        bestStreak:
          Number.isFinite(bestStreak) && bestStreak > 0 ? bestStreak : h.bestStreak,
      }));
    } catch {
      /* ignore */
    }
  }, []);

  // Pause-on-hide wiring. Only meaningful mid-round; hidden from
  // idle/won/over so switching tabs on a results screen doesn't
  // pop a redundant paused overlay. Resumed explicitly by the
  // user tapping or pressing Space/Enter (see handleTap).
  useEffect(() => {
    const onVis = () => {
      if (document.hidden && stateRef.current.phase === "playing") {
        pausedRef.current = true;
        setPaused(true);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
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

  // End-of-round SR hand-off: when phase flips to "won"/"over",
  // programmatically focus the game wrapper so the updated
  // aria-label (e.g. "Game over. Score 42.") gets announced and
  // Space/Enter/R land on a focused target without requiring the
  // user to tab. Skip when focus is inside the wrapper already
  // (user was keyboard-playing, or clicking an overlay control
  // like "Share run" / Seed copy — we don't want to steal focus
  // from their active interaction). preventScroll so the page
  // doesn't jump during the lw-reveal-pop.
  useEffect(() => {
    if (hudState.phase !== "won" && hudState.phase !== "over") return;
    const el = wrapperRef.current;
    if (!el) return;
    const active = typeof document !== "undefined" ? document.activeElement : null;
    if (active && el.contains(active)) return;
    const id = requestAnimationFrame(() => {
      try {
        el.focus({ preventScroll: true });
      } catch {
        /* focus may race with a rapid unmount — safe to ignore */
      }
    });
    return () => cancelAnimationFrame(id);
  }, [hudState.phase]);

  // ----------------------------------------------------------------
  // Game mechanics
  // ----------------------------------------------------------------

  // Keep the latest beforeStart in a ref so handleTap + key handler
  // don't close over a stale copy when the parent re-renders with a
  // new burn function (e.g. after a toast hook rebind).
  const beforeStartRef = useRef(beforeStart);
  useEffect(() => {
    beforeStartRef.current = beforeStart;
  }, [beforeStart]);

  /**
   * Serialize round-start requests through the optional beforeStart
   * gate. While a gate call is in flight a second tap is ignored —
   * avoids double-charging users who mash space while the burn
   * round-trip is pending.
   */
  const startingRef = useRef(false);
  const gateStart = useCallback(async (): Promise<boolean> => {
    if (startingRef.current) return false;
    const gate = beforeStartRef.current;
    if (!gate) return true;
    startingRef.current = true;
    try {
      const ok = await gate();
      return ok;
    } catch {
      return false;
    } finally {
      startingRef.current = false;
    }
  }, []);

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
      runMaxStreak: 0,
      perfectAt: null,
    };
    flashRef.current = 0;
    flareRow.current = -1;
    setFlare(null);
    roundRef.current = createRound();
    // Consume the one-shot injected seed if the parent provided one
    // (e.g. /stacker?seed=0x...). After first use, pendingSeed is
    // null'd so the next round falls back to the normal random path.
    const seed = pendingSeed.current !== null ? pendingSeed.current : randomSeed();
    pendingSeed.current = null;
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
      // Fresh round — clear any leftover "new best" flash from the
      // previous end-of-round card. bestStreak itself stays as-is so
      // the player can see what they're chasing.
      newBestStreak: null,
      newBestDelta: null,
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
        // Coyote-time: if the slider's unrounded fractional position
        // still overlaps the row beneath (i.e. the user tapped just
        // after the visible cell edge but before the slider had
        // really cleared), rescue the lock with a 1-column overlap
        // at the near edge. Threshold kept tight (~0.35 cells) so
        // genuinely-cleared misses still end the round — this is a
        // "I swear that was on" rescue, not a free save.
        const sliderLeftF = cur.x;
        const sliderRightF = cur.x + cur.width - 1;
        const COYOTE_COLS = 0.35;
        let rescued = false;
        if (curRight < belowLeft) {
          // Overshot to the right of the row below.
          if (belowLeft - sliderRightF <= COYOTE_COLS) {
            lockedLeft = belowLeft;
            lockedRight = belowLeft;
            rescued = true;
          }
        } else if (curLeft > belowRight) {
          // Overshot to the left of the row below.
          if (sliderLeftF - belowRight <= COYOTE_COLS) {
            lockedLeft = belowRight;
            lockedRight = belowRight;
            rescued = true;
          }
        }
        if (!rescued) {
        // No overlap — game over.
        sfx.over();
        haptics.over();
        s.phase = "over";
        const newBest = Math.max(hudState.best, s.score);
        const newBestStreak = Math.max(hudState.bestStreak, s.runMaxStreak);
        const streakBeaten = newBestStreak > hudState.bestStreak;
        try {
          window.localStorage.setItem(LS_BEST, String(newBest));
          if (streakBeaten) {
            window.localStorage.setItem(LS_BEST_STREAK, String(newBestStreak));
          }
        } catch {
          /* ignore */
        }
        // Delta lives only when score beats the prior best by ≥1.
        // Prior best of 0 (first ever round) → render the whole new
        // best as a delta; feels like a proper "opening best" beat.
        const scoreBeaten = newBest > hudState.best;
        const newBestDelta = scoreBeaten ? newBest - hudState.best : null;
        setHudState({
          phase: "over",
          score: s.score,
          level: s.level,
          perfectStreak: s.perfectStreak,
          best: newBest,
          bestStreak: newBestStreak,
          newBestStreak: streakBeaten ? newBestStreak : null,
          newBestDelta,
        });
        const t = roundRef.current?.finalize() ?? null;
        if (t) setLastTranscript(t);
        onPhaseChange?.("over");
        onRoundEnd?.({
          score: s.score,
          streak: s.runMaxStreak,
          outcome: "over",
        });
        return;
        }
        // Rescued: fall through to the normal lock path with the
        // 1-col overlap we pinned above. Reads as a minimum-width
        // block placed on the near edge of the row beneath.
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
      // Running high-water for the round — persisted at end-of-round
      // so "longest streak" survives reload even if the run itself
      // ended below the previous best score.
      if (s.perfectStreak > s.runMaxStreak) s.runMaxStreak = s.perfectStreak;
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
      // Streak best is orthogonal — a long perfect streak in a run
      // that ends below the score record still counts as a new best
      // streak. Both persist independently.
      const newBestStreak = Math.max(hudState.bestStreak, s.runMaxStreak);
      const streakBeaten = newBestStreak > hudState.bestStreak;
      try {
        window.localStorage.setItem(LS_BEST, String(newBest));
        if (streakBeaten) {
          window.localStorage.setItem(LS_BEST_STREAK, String(newBestStreak));
        }
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
      const scoreBeaten = newBest > hudState.best;
      const newBestDelta = scoreBeaten ? newBest - hudState.best : null;
      setHudState({
        phase: "won",
        score: s.score,
        level: s.level,
        perfectStreak: s.perfectStreak,
        best: newBest,
        bestStreak: newBestStreak,
        newBestStreak: streakBeaten ? newBestStreak : null,
        newBestDelta,
      });
      const t = roundRef.current?.finalize() ?? null;
      if (t) setLastTranscript(t);
      onPhaseChange?.("won");
      onRoundEnd?.({
        score: s.score,
        streak: s.runMaxStreak,
        outcome: "won",
      });
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
  }, [hudState.best, onPhaseChange, onRoundEnd]);

  const handleTap = useCallback(() => {
    unlockAudio();
    const s = stateRef.current;
    // Paused branch: first tap resumes the round rather than firing
    // a lock — protects the player from an accidental bad lock on
    // the very first click after the tab regains focus.
    if (pausedRef.current) {
      pausedRef.current = false;
      setPaused(false);
      sfx.ping();
      return;
    }
    if (s.phase === "idle" || s.phase === "won" || s.phase === "over") {
      // Gate the start on the parent's async hook — burns the ICRC-1
      // entry fee before any mechanics run. We play the ping + haptic
      // optimistically so the tap feels responsive; on gate failure
      // the toast from the hook is the user-visible feedback and the
      // game sits right where it was.
      sfx.ping();
      haptics.tick();
      gateStart().then((ok) => {
        if (ok) startRound();
      });
      return;
    }
    lockRow();
  }, [lockRow, startRound, gateStart]);

  // ----------------------------------------------------------------
  // Input
  // ----------------------------------------------------------------

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      // Escape exits soft-fullscreen (native browser fullscreen
      // already handles ESC itself — this branch only runs when
      // the Fullscreen API was unavailable and we fell back to
      // the CSS-based fixed-inset mode).
      if (e.key === "Escape" && isFullscreen) {
        const doc = document as Document & {
          webkitFullscreenElement?: Element | null;
        };
        if (!doc.fullscreenElement && !doc.webkitFullscreenElement) {
          e.preventDefault();
          setIsFullscreen(false);
          return;
        }
      }
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        handleTap();
        return;
      }
      // "r" restarts after a round ends. Ignored during live play so
      // a stray keystroke can't abort a climb, and skipped when the
      // user is typing into a text field (share memo, search, etc).
      if (e.key === "r" || e.key === "R") {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        const t = e.target as HTMLElement | null;
        const tag = t?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || t?.isContentEditable) return;
        const s = stateRef.current;
        if (s.phase !== "won" && s.phase !== "over") return;
        e.preventDefault();
        sfx.ping();
        haptics.tick();
        // Same gate as tap-to-start — the restart is a new round,
        // so it needs to burn a fresh entry fee.
        gateStart().then((ok) => {
          if (ok) startRound();
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleTap, startRound, gateStart, isFullscreen]);

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
      if (s.phase === "playing" && s.current && !pausedRef.current) {
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
      // POLISH-273 decay audit. Previous shape was a hard onset
      // (peak at frame 1) + linear fall over 420ms — read as a
      // thump rather than a flash because the canvas jumped
      // from no-tint to full-peak in a single frame. New curve:
      //   0–80ms   rise: linear 0→1 (brief but not instantaneous,
      //                  so the eye reads an arrival, not a pop)
      //   80–500ms fall: ease-out 1→0 (lingers just enough to
      //                  feel celebratory; still out of the way
      //                  before the next stack request)
      // Total duration bumped 420→500ms; the extended tail gives
      // the fall visible room without raising the peak opacity
      // (still 9% gold — the flash should read as a confirmation,
      // not a distraction). Matches the rise/fall philosophy
      // POLISH-261 used on lw-btn-success.
      // Reduced motion: the render loop is rAF-driven, not a CSS
      // animation, so the global motion clamp doesn't apply. The
      // visibility-gate below still cancels rAF in background
      // tabs, which is the main power-saving concern; this
      // celebratory flash is subtle enough (peak 9%) that a
      // reduced-motion hard-skip isn't warranted.
      const since = t - flashRef.current;
      if (flashRef.current > 0 && since < 500) {
        let a: number;
        if (since < 80) {
          // Rise: linear 0 → 1 over 80ms.
          a = since / 80;
        } else {
          // Fall: ease-out cubic over 420ms.
          const p = (since - 80) / 420; // 0 → 1
          a = 1 - p * p * p;
        }
        ctx.fillStyle = rgba(GOLD, 0.09 * a);
        ctx.fillRect(0, 0, W, H);
      }

      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    // Visibility-gate the render loop. Background tabs throttle rAF to
    // ~1 Hz but still tick: the frame fn runs clearRect + gradient +
    // grid-dots + shard sim + HUD draws every tick, which is pure
    // waste on an invisible canvas and keeps the GPU warm on battery.
    // Cancel the rAF when the tab goes hidden and restart on show.
    // Also zero lastTRef on resume so the first post-resume frame's dt
    // is 0, not multi-second — the simulate branch already guards
    // with pausedRef (POLISH-82), but belts-and-braces: background
    // canvas re-arm should not jump any animation forward.
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      } else if (rafRef.current === 0) {
        lastTRef.current = 0;
        rafRef.current = requestAnimationFrame(frame);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(rafRef.current);
      document.removeEventListener("visibilitychange", onVisibility);
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

  // Soft-fullscreen class — kicks in only when isFullscreen is true
  // AND the browser API path didn't succeed (no :fullscreen pseudo-
  // class). In browser fullscreen, the native behavior fills the
  // viewport and this class is a no-op (z-index + fixed just keep
  // paint consistent); in soft mode, it pins the wrapper to fill
  // the viewport with the bg-background backdrop.
  const wrapperCls = isFullscreen
    ? "fixed inset-0 z-[100] w-full h-full max-w-none aspect-auto rounded-none ring-0 shadow-none bg-background select-none"
    : "relative mx-auto w-full max-w-[560px] aspect-[3/5] rounded-2xl overflow-hidden ring-1 ring-white/10 shadow-2xl select-none";

  return (
    <div
      className={wrapperCls}
      // touchAction: "manipulation" suppresses the 300ms double-tap-
      // to-zoom wait iOS Safari imposes on ad-hoc tappable elements
      // that aren't obvious buttons. Without it, rhythm taps on the
      // Stacker surface feel rubbery in the first third of a run.
      // We don't use "none" here — the stake-chip row above can live
      // just outside the canvas on smaller viewports and the page
      // itself still needs scroll recovery if an overlay stacks
      // weirdly. "manipulation" keeps scroll + pinch, kills the
      // tap-delay timer.
      ref={wrapperRef}
      style={{ touchAction: "manipulation" }}
      onPointerDown={(e) => {
        // Avoid double-firing on keyboard focus.
        (e.currentTarget as HTMLElement).focus();
        handleTap();
      }}
      tabIndex={0}
      role="button"
      aria-label={statusCopy.title}
      // Round-end announcements: the phase-transition effect above
      // pulls focus to this wrapper, and aria-live="polite" makes
      // the SR re-announce the updated aria-label even when focus
      // was already here (keyboard player finishing a run).
      aria-live="polite"
    >
      <canvas ref={canvasRef} className="absolute inset-0" />

      {/* HUD */}
      <div className="absolute top-3 left-3 right-3 flex items-start justify-between gap-3 pointer-events-none">
        <div className="flex gap-2 flex-wrap">
          <HudPill label="Score" value={String(hudState.score)} />
          <HudPill label="Row" value={`${hudState.level}/${GRID_ROWS}`} />
          {hudState.perfectStreak > 1 && (
            <HudPill label="Streak" value={`×${hudState.perfectStreak}`} accent="gold" />
          )}
          {showSeed && lastSeed !== null && (
            <HudPill
              label="Seed"
              value={`0x${lastSeed.toString(16).padStart(8, "0")}`}
            />
          )}
        </div>
        <div className="flex items-center gap-2">
          <HudPill label="Best" value={String(hudState.best || "—")} />
          {/* Fullscreen toggle. Uses the native Fullscreen API on
              the wrapper div so the whole game surface — canvas +
              HUD + end-of-round overlay — goes edge-to-edge. ESC
              exits in both browser-fullscreen and soft-fullscreen
              paths (handled via the global keydown effect below). */}
          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            className="pointer-events-auto cursor-pointer rounded-full border border-white/15 bg-black/40 backdrop-blur-sm p-1.5 text-gray-300 hover:text-white hover:border-white/30 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60"
          >
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4"
              aria-hidden
            >
              {isFullscreen ? (
                <path d="M8 4a1 1 0 1 0-2 0v2H4a1 1 0 1 0 0 2h3a1 1 0 0 0 1-1V4Zm4 0a1 1 0 1 1 2 0v2h2a1 1 0 1 1 0 2h-3a1 1 0 0 1-1-1V4Zm-4 12a1 1 0 1 1-2 0v-2H4a1 1 0 1 1 0-2h3a1 1 0 0 1 1 1v3Zm4 0a1 1 0 1 0 2 0v-2h2a1 1 0 1 0 0-2h-3a1 1 0 0 0-1 1v3Z" />
              ) : (
                <path d="M4 3a1 1 0 0 0-1 1v3a1 1 0 0 0 2 0V5h2a1 1 0 0 0 0-2H4Zm12 0a1 1 0 0 1 1 1v3a1 1 0 1 1-2 0V5h-2a1 1 0 1 1 0-2h3Zm-12 14a1 1 0 0 1-1-1v-3a1 1 0 1 1 2 0v2h2a1 1 0 1 1 0 2H4Zm12 0a1 1 0 0 0 1-1v-3a1 1 0 1 0-2 0v2h-2a1 1 0 1 0 0 2h3Z" />
              )}
            </svg>
          </button>
          {/* In-game settings gear (POLISH-248). Opens a BottomSheet
              with the three most-relevant toggles so the player
              doesn't have to leave the round to /settings. Gated
              pointer-events because the HUD row is pointer-events-none
              by default (canvas taps pass through to lockRow). */}
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="In-game settings"
            title="In-game settings"
            className="pointer-events-auto cursor-pointer rounded-full border border-white/15 bg-black/40 backdrop-blur-sm p-1.5 text-gray-300 hover:text-white hover:border-white/30 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M8.86 2.35a1.5 1.5 0 0 1 2.28 0l.36.41a1.5 1.5 0 0 0 1.58.43l.52-.17a1.5 1.5 0 0 1 1.97 1.14l.1.54a1.5 1.5 0 0 0 1.16 1.16l.54.1a1.5 1.5 0 0 1 1.14 1.97l-.17.52a1.5 1.5 0 0 0 .43 1.58l.41.36a1.5 1.5 0 0 1 0 2.28l-.41.36a1.5 1.5 0 0 0-.43 1.58l.17.52a1.5 1.5 0 0 1-1.14 1.97l-.54.1a1.5 1.5 0 0 0-1.16 1.16l-.1.54a1.5 1.5 0 0 1-1.97 1.14l-.52-.17a1.5 1.5 0 0 0-1.58.43l-.36.41a1.5 1.5 0 0 1-2.28 0l-.36-.41a1.5 1.5 0 0 0-1.58-.43l-.52.17a1.5 1.5 0 0 1-1.97-1.14l-.1-.54a1.5 1.5 0 0 0-1.16-1.16l-.54-.1a1.5 1.5 0 0 1-1.14-1.97l.17-.52a1.5 1.5 0 0 0-.43-1.58l-.41-.36a1.5 1.5 0 0 1 0-2.28l.41-.36a1.5 1.5 0 0 0 .43-1.58l-.17-.52a1.5 1.5 0 0 1 1.14-1.97l.54-.1a1.5 1.5 0 0 0 1.16-1.16l.1-.54a1.5 1.5 0 0 1 1.97-1.14l.52.17a1.5 1.5 0 0 0 1.58-.43l.36-.41ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* In-game settings sheet. Wired up three toggles that cover
          the mid-round "mute the bar sounds / stop the vibration /
          show me the seed" asks. Anything else lives in /settings;
          this sheet intentionally doesn't duplicate the whole page. */}
      <BottomSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title="Quick settings"
        description="Flip these on or off without leaving the round."
      >
        <div className="space-y-3">
          <QuickToggle
            label="Sound"
            description="SFX on tap, perfect-lock, win, and game-over."
            checked={sound}
            onChange={setSound}
          />
          <QuickToggle
            label="Haptics"
            description="Vibration on tap and round-end events. iOS + Android only."
            checked={stackerHaptics}
            onChange={setStackerHaptics}
          />
          <QuickToggle
            label="Show seed"
            description="Reveal the round's RNG seed in the HUD for self-auditing."
            checked={showSeed}
            onChange={setShowSeed}
          />
        </div>
      </BottomSheet>

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

      {/* Paused overlay — only mid-round. Any tap on the game
          surface resumes (handleTap's paused branch). */}
      {paused && hudState.phase === "playing" && (
        <div className="absolute inset-0 grid place-items-center bg-black/55 backdrop-blur-[2px] p-6 text-center pointer-events-none">
          <div className="lw-reveal">
            <div className="text-[10px] uppercase tracking-widest text-orange-300 mb-2">
              Paused
            </div>
            <h2 className="text-3xl md:text-4xl font-black text-white mb-2">
              Tab switched away.
            </h2>
            <p className="text-sm text-gray-300 max-w-xs mx-auto mb-3 leading-snug">
              Slider frozen — tap or press space to resume. Your stack is
              right where you left it.
            </p>
          </div>
        </div>
      )}

      {/* Status overlay */}
      {(hudState.phase === "idle" || hudState.phase === "won" || hudState.phase === "over") && (
        <div className="absolute inset-0 grid place-items-center bg-black/45 backdrop-blur-[2px] p-6 text-center pointer-events-none">
          {/* Inner card animates in on won/over so the end-of-round
              has a deliberate punch instead of appearing abruptly.
              Uses lw-reveal-pop (transform + opacity only) so the
              browser composites on the GPU — no layout thrash on
              low-end mobile. key= forces a fresh mount on phase
              change so the animation replays. Idle skips the pop
              so the initial state feels quiet. */}
          <div
            key={hudState.phase}
            className={
              hudState.phase === "idle"
                ? undefined
                : "lw-reveal-pop"
            }
          >
            <div className="text-[10px] uppercase tracking-widest text-cyan-300 mb-2">Stacker</div>
            <h2 className="text-3xl md:text-4xl font-black text-white mb-2">{statusCopy.title}</h2>
            <p className="text-sm text-gray-300 max-w-xs mx-auto mb-5 leading-snug">
              {statusCopy.sub}
            </p>

            {/* Pre-round difficulty hint. Rows match the live
                breakpoints in SPEED_BY_ROW / RANDOM_DIR_ROW=3 /
                JITTER_ROW=6. HARDER-01 tightened those constants
                but this UI copy was still quoting the old 0-5/6+/8+
                split — misleading first-time players. Now honest:
                warm-up is only rows 0-2, random spawn kicks at 3,
                jitter at 6. */}
            {hudState.phase === "idle" && (
              <ul className="mb-5 mx-auto max-w-[260px] space-y-1 text-left">
                <DifficultyCue
                  dot="bg-cyan-300"
                  tone="text-cyan-300"
                  rows="0–2"
                  text="Predictable slider"
                />
                <DifficultyCue
                  dot="bg-orange-400"
                  tone="text-orange-300"
                  rows="3+"
                  text="Spawn side randomizes"
                />
                <DifficultyCue
                  dot="bg-yellow-300"
                  tone="text-yellow-300"
                  rows="6+"
                  text="Speed jitters — no rhythm"
                />
              </ul>
            )}

            <div className="text-[11px] font-mono text-gray-400 uppercase tracking-widest">
              Press space or tap to {statusCopy.cta.toLowerCase()}
              {(hudState.phase === "won" || hudState.phase === "over") && (
                <span className="hidden md:inline"> · R to replay</span>
              )}
            </div>

            {/* "New best streak!" flourish — only when the round
                just beat the persisted record. Rendered above the
                transcript block so it lands in the celebratory beat
                of the end-of-round read. Pulses via the shared
                lw-reveal keyframe so it doesn't fight the card's
                own entrance animation.

                Reduced-motion: lw-reveal keyframes end at
                opacity:1/transform:0, so the global
                prefers-reduced-motion clamp (style.css) lands this
                flourish on its terminal frame without stripping the
                visual. No local guard needed. Audited 2026-04-20 —
                no animate-pulse or animate-ping in the HUD; the
                only pulse on the Stacker surface is the loading
                skeleton, covered by the same global rule. */}
            {hudState.newBestStreak !== null &&
              (hudState.phase === "won" || hudState.phase === "over") && (
                <div
                  className="lw-reveal mt-4 inline-flex items-center gap-2 rounded-full border border-yellow-300/60 bg-yellow-300/[0.08] px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-yellow-200"
                  role="status"
                  aria-live="polite"
                >
                  <span aria-hidden>★</span>
                  New best streak · ×{hudState.newBestStreak}
                </div>
              )}

            {/* "New best score!" flourish — sibling to the streak
                flash above. Cyan tone matches the rest of the scoring
                UI (HudPill "Best" pill, score text) so the eye reads
                this as a score beat, not a streak beat.

                Reduced-motion: same reasoning as the streak flourish
                — lw-reveal keyframes terminate at opacity 1 / transform
                0, and the global prefers-reduced-motion clamp in
                style.css flattens the transition, so this lands
                statically without a local guard. */}
            {hudState.newBestDelta !== null &&
              (hudState.phase === "won" || hudState.phase === "over") && (
                <div
                  className="lw-reveal mt-2 inline-flex items-center gap-2 rounded-full border border-cyan-300/60 bg-cyan-300/[0.08] px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-cyan-200"
                  role="status"
                  aria-live="polite"
                >
                  <span aria-hidden>▲</span>
                  New best · +{hudState.newBestDelta}
                </div>
              )}

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
                    {hudState.bestStreak > 0 && (
                      <> · streak best ×{hudState.bestStreak}</>
                    )}
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
                        onClick={async (e) => {
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
                          // Prefer the native share sheet when
                          // available (mobile browsers + some
                          // desktop). If the user cancels, the API
                          // throws AbortError — treat that as a
                          // terminal decision, not a fallback
                          // trigger. Only fall back to clipboard
                          // when share is truly unavailable.
                          const nav =
                            typeof navigator !== "undefined"
                              ? navigator
                              : null;
                          if (nav && typeof nav.share === "function") {
                            try {
                              await nav.share({
                                title: "Stacker run",
                                text: line,
                              });
                              return;
                            } catch (err) {
                              const name = (err as Error)?.name;
                              if (name === "AbortError") return;
                              // NotAllowedError / unknown failure —
                              // fall through to clipboard so the
                              // click still produces something.
                            }
                          }
                          copy(line, { label: "Run" });
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        className="text-[10px] uppercase tracking-widest px-3 py-1.5 rounded-full border border-white/15 text-gray-200 hover:text-white hover:border-white/30 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60"
                        aria-label="Share run details"
                      >
                        Share run
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

/**
 * Compact toggle row for the in-game settings sheet. Same semantic
 * shape as /settings Toggle but inlined here so the StackerGame
 * bundle doesn't pull the whole Settings component tree.
 *
 * Uses a real `<button role="switch">` for SR/keyboard parity: space
 * and enter toggle; aria-checked carries the current state.
 */
function QuickToggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-white">{label}</div>
        <div className="text-[11px] text-gray-500 leading-snug mt-0.5">
          {description}
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`shrink-0 relative inline-flex h-6 w-10 items-center rounded-full border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60 ${
          checked
            ? "bg-cyan-300/30 border-cyan-300/60"
            : "bg-white/[0.04] border-white/15"
        }`}
      >
        <span
          aria-hidden
          className={`inline-block h-4 w-4 rounded-full bg-white transition ${
            checked ? "translate-x-[20px]" : "translate-x-1"
          }`}
        />
      </button>
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
