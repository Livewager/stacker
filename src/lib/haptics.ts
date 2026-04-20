"use client";

/**
 * Shared haptics helper. Uses the standard Vibration API, which on
 * iOS Safari silently no-ops — that's fine; we treat haptics as an
 * enhancement, never a required signal.
 *
 * Respects the user's `haptics` preference at call time so flipping
 * the toggle takes effect immediately.
 */

import { PREF_KEYS } from "./prefs";

function hapticsEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(
      "livewager-pref:" + PREF_KEYS.haptics,
    );
    if (raw === null) return true;
    return JSON.parse(raw) === true;
  } catch {
    return true;
  }
}

function vibrate(pattern: number | number[]) {
  if (!hapticsEnabled()) return;
  if (typeof navigator === "undefined") return;
  const n = navigator as Navigator & { vibrate?: (p: number | number[]) => boolean };
  try {
    n.vibrate?.(pattern);
  } catch {
    /* ignore */
  }
}

export const haptics = {
  /** Soft tick — button taps, lock. */
  tick() {
    vibrate(8);
  },
  /** Short double-tap — perfect stack, confirmation. */
  perfect() {
    vibrate([12, 40, 12]);
  },
  /** Longer thud — game over. */
  over() {
    vibrate([25, 30, 60]);
  },
  /** Celebratory triple — win. */
  win() {
    vibrate([20, 40, 20, 40, 40]);
  },
};
