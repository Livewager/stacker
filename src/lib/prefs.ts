"use client";

/**
 * Device-local preferences (theme, audio, haptics, reduced motion,
 * session cap, last-known wallet prefs). No server involvement —
 * these are cosmetic + session guardrails. Everything lives in
 * localStorage.
 *
 * The store is a tiny custom hook `useLocalPref(key, default)` plus
 * a convenience `usePrefs()` facade. Kept dependency-free so we
 * don't reach for zustand/jotai for five booleans.
 */

import { useCallback, useEffect, useRef, useState } from "react";

const LS_PREFIX = "livewager-pref:";

// Cross-tab + cross-hook notifications so two <Settings /> components
// (or a game + the settings page) stay in sync without a provider.
type Listener = (v: unknown) => void;
const listeners: Record<string, Set<Listener>> = {};
function publish(key: string, v: unknown) {
  listeners[key]?.forEach((l) => l(v));
}

function readRaw<T>(key: string, dflt: T): T {
  if (typeof window === "undefined") return dflt;
  try {
    const raw = window.localStorage.getItem(LS_PREFIX + key);
    if (raw === null) return dflt;
    return JSON.parse(raw) as T;
  } catch {
    return dflt;
  }
}

/**
 * Writes a value to the shared pref store + fans out to same-tab
 * subscribers. Exposed for non-component callers (e.g. WalletContext
 * needs to stamp lastAuthAt from outside the React tree). Still goes
 * through the same prefix + publish pipeline as useLocalPref, so
 * listeners hear the change uniformly.
 */
export function writeRaw<T>(key: string, v: T) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_PREFIX + key, JSON.stringify(v));
  } catch {
    /* quota or private-mode — no-op */
  }
  publish(key, v);
}

export function useLocalPref<T>(
  key: string,
  dflt: T,
): [T, (v: T | ((prev: T) => T)) => void] {
  // Initialize to the default on SSR so hydration matches; then read
  // localStorage in an effect. Two-render pattern is intentional.
  const [val, setVal] = useState<T>(dflt);
  const hydrated = useRef(false);

  useEffect(() => {
    setVal(readRaw<T>(key, dflt));
    hydrated.current = true;
    // Subscribe to cross-hook publishes.
    const l: Listener = (v) => setVal(v as T);
    (listeners[key] ||= new Set()).add(l);
    // Subscribe to cross-tab storage events too.
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_PREFIX + key && e.newValue !== null) {
        try {
          setVal(JSON.parse(e.newValue) as T);
        } catch {
          /* ignore */
        }
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners[key]?.delete(l);
      window.removeEventListener("storage", onStorage);
    };
    // dflt is allowed to change between renders; we intentionally only
    // read it on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const set = useCallback(
    (v: T | ((prev: T) => T)) => {
      setVal((prev) => {
        const next =
          typeof v === "function" ? (v as (p: T) => T)(prev) : v;
        writeRaw(key, next);
        return next;
      });
    },
    [key],
  );

  return [val, set];
}

// --------------- keys + canonical defaults ------------------------

export const PREF_KEYS = {
  // Audio / motion
  sound: "sound",
  haptics: "haptics",
  reducedMotion: "reducedMotion",
  stackerSFX: "stackerSFX",

  // Session guardrails
  sessionCapUsd: "sessionCapUsd", // number | null

  // Flow / UI state
  walletQuickTab: "walletQuickTab", // "buy" | "deposit" | "send" | "withdraw"
  stackerWager: "stackerWager", // 0 | 5 | 25 | 100 (LWP)
  stackerMode: "stackerMode", // "ranked" | "unranked"
  stackerLastPlayed: "stackerLastPlayed", // epoch ms | null
  pourLastPlayed: "pourLastPlayed", // epoch ms | null
  leaderboardTab: "leaderboardTab", // "dunk" | "pour" | "stacker"
  hasSeenOnboarding: "hasSeenOnboarding", // boolean

  // Auth session metadata (not user-settable; written by WalletContext)
  lastAuthAt: "lastAuthAt", // epoch ms of last II login | null

  // Discovery nudges
  hasOpenedPalette: "hasOpenedPalette", // boolean — once true, ⌘K hint hides

  // Tilt calibration (Tilt Pour). Persisted so repeat players don't
  // wait 1.8s of blocking calibration on every round. Null until the
  // first calibration settles. { gamma, beta } — both in degrees.
  tiltCalibration: "tiltCalibration",
} as const;

export type PrefKey = (typeof PREF_KEYS)[keyof typeof PREF_KEYS];

/**
 * Convenience facade: reads the most-used flags at once.
 * Components that only need one flag can still use useLocalPref directly.
 */
export function usePrefs() {
  const [sound, setSound] = useLocalPref<boolean>(PREF_KEYS.sound, true);
  const [haptics, setHaptics] = useLocalPref<boolean>(PREF_KEYS.haptics, true);
  const [reducedMotion, setReducedMotion] = useLocalPref<boolean>(
    PREF_KEYS.reducedMotion,
    false,
  );
  const [sessionCapUsd, setSessionCapUsd] = useLocalPref<number | null>(
    PREF_KEYS.sessionCapUsd,
    null,
  );
  return {
    sound,
    setSound,
    haptics,
    setHaptics,
    reducedMotion,
    setReducedMotion,
    sessionCapUsd,
    setSessionCapUsd,
  };
}

/**
 * Wipe everything this device stored locally. Used by the Settings
 * "clear device data" button. Does NOT touch the Internet Computer —
 * balances and chain history are canonical there.
 */
export function clearAllLocalData() {
  if (typeof window === "undefined") return;
  const toClear: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i);
    if (!k) continue;
    if (k.startsWith(LS_PREFIX) || k.startsWith("livewager-")) {
      toClear.push(k);
    }
  }
  for (const k of toClear) window.localStorage.removeItem(k);
  // Publish best-effort notifications so open hooks re-read defaults.
  Object.values(PREF_KEYS).forEach((k) => publish(k, undefined));
}
