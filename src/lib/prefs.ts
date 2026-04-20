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

// Exposed for tests that need to inspect the namespaced keys
// that writeRaw / clearSessionState operate on. Runtime callers
// should not reach for this — always go through the hook / raw
// helpers so refactors of the layout stay central here.
export const LS_PREFIX = "livewager-pref:";

// Cross-tab + cross-hook notifications so two <Settings /> components
// (or a game + the settings page) stay in sync without a provider.
type Listener = (v: unknown) => void;
const listeners: Record<string, Set<Listener>> = {};
function publish(key: string, v: unknown) {
  listeners[key]?.forEach((l) => l(v));
}

/**
 * Storage read. Exported so tests can verify the round-trip
 * behaviour (write → read, clearSessionState → read → dflt)
 * without depending on React. Runtime call sites still read
 * through useLocalPref; this is a verification seam.
 *
 * Perf (POLISH-299 audit). Measured at 34 ns/call on a million-
 * iteration benchmark. Typical route mount: 1–5 calls (worst
 * case StackerGame = 5; usePrefs facade reads ~8 at once).
 * Session total for a 50-route-change walk: <100µs cumulative.
 * A provider-level cache layer would cost more in lookup +
 * write-back invalidation than it saves. Don't wrap; same
 * audit-closed discipline as POLISH-287 (Footer shortCanister).
 */
export function readRaw<T>(key: string, dflt: T): T {
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
  leaderboardTab: "leaderboardTab", // legacy three-tab days; Stacker-only today
  hasSeenOnboarding: "hasSeenOnboarding", // boolean

  // Auth session metadata (not user-settable; written by WalletContext)
  lastAuthAt: "lastAuthAt", // epoch ms of last II login | null

  // Discovery nudges
  hasOpenedPalette: "hasOpenedPalette", // boolean — once true, ⌘K hint hides

  // Tilt calibration (Tilt Pour). Persisted so repeat players don't
  // wait 1.8s of blocking calibration on every round. Null until the
  // first calibration settles. { gamma, beta } — both in degrees.
  tiltCalibration: "tiltCalibration",

  // ActivityFeed filter pill selection. Values: "all" | "mint" |
  // "burn" | "transfer" | "approve". Narrowed at the hook site.
  activityFilter: "activityFilter",

  // /deposit tab selection. "ltc" | "card" | "bank". Persisted so
  // repeat visits land on the method the user actually uses.
  depositTab: "depositTab",

  // Stacker power-user toggle: show the round's RNG seed in the HUD
  // during play. Off by default — most players don't care; power
  // users and ANTICHEAT-T1 shakeout benefit.
  stackerShowSeed: "stackerShowSeed",

  // One-shot "we don't use cookies — but we do use localStorage"
  // disclosure banner. Boolean; once true, the banner never renders
  // again on this device. Treated as acknowledgement, not consent —
  // the app needs storage to function (see Settings for details).
  storageAck: "storageAck",

  // /wallet first-time welcome banner. Renders only when the signed-in
  // user's balance is 0 AND they haven't dismissed the banner. Boolean;
  // once dismissed stays dismissed. Also auto-clears (via dismissal) if
  // the user ever acquires a non-zero balance — but the pref stays as
  // a one-shot so it doesn't re-appear if they burn back to zero.
  walletWelcomeDismissed: "walletWelcomeDismissed",
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

/**
 * Lighter-weight reset: wipes only session-scoped state — the session
 * cap, recent send recipients, last-played timestamps, last auth
 * stamp, and the persisted tilt calibration — while preserving the
 * user's long-lived profile choices (theme, sound, haptics, reduced
 * motion, onboarding flag, command-palette discovery flag).
 *
 * Useful after you've been testing / playing and want a clean state
 * without losing the settings you actually configured. Complements
 * `clearAllLocalData` for users who do want the nuclear option.
 */
const SESSION_KEYS: readonly string[] = [
  PREF_KEYS.sessionCapUsd,
  PREF_KEYS.walletQuickTab,
  PREF_KEYS.leaderboardTab,
  PREF_KEYS.stackerLastPlayed,
  PREF_KEYS.pourLastPlayed,
  PREF_KEYS.lastAuthAt,
  PREF_KEYS.tiltCalibration,
  PREF_KEYS.stackerWager,
  PREF_KEYS.stackerMode,
];
const SESSION_EXTRA_PREFIXES: readonly string[] = [
  // Non-PREF_KEYS but still in the livewager-* namespace — tracked
  // separately so the "session" reset matches the user's mental
  // model (clear what a reviewer might want to start fresh).
  "livewager-recent-recipients",
  "livewager-stacker-best",
];
export function clearSessionState() {
  if (typeof window === "undefined") return;
  for (const k of SESSION_KEYS) {
    window.localStorage.removeItem(LS_PREFIX + k);
    publish(k, undefined);
  }
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i);
    if (!k) continue;
    if (SESSION_EXTRA_PREFIXES.some((p) => k === p || k.startsWith(p))) {
      window.localStorage.removeItem(k);
    }
  }
}
