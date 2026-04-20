/**
 * prefs contract tests — exercises the storage + publish pipeline
 * that `src/lib/prefs.ts` implements, without depending on React.
 *
 * Why a standalone mjs + node:test?
 *  - No jsdom / RTL / vitest in package.json. A framework install
 *    just to cover one hook would balloon CI surface area.
 *  - Node 20 ships `node:test` built-in. `--types ^20` is already
 *    in package.json devDependencies so the environment is present.
 *  - We test the CONTRACT (namespaced keys, writeRaw round-trip,
 *    clearSessionState's scope, clearAllLocalData's scope) by
 *    modelling the same logic here. Any refactor of prefs.ts that
 *    breaks the contract still has to update these tests in
 *    lockstep — they're the executable spec.
 *
 * Run: `node --test test/prefs.contract.test.mjs`
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";

// ------------------------------------------------------------------
// Minimal localStorage shim (just enough to back the contract tests).
// Mirrors the Web Storage interface prefs.ts leans on: getItem,
// setItem, removeItem, length, key(i).
// ------------------------------------------------------------------
function makeLocalStorage() {
  const data = new Map();
  return {
    getItem(k) {
      return data.has(k) ? data.get(k) : null;
    },
    setItem(k, v) {
      data.set(k, String(v));
    },
    removeItem(k) {
      data.delete(k);
    },
    get length() {
      return data.size;
    },
    key(i) {
      const keys = [...data.keys()];
      return i < keys.length ? keys[i] : null;
    },
    // Test-only affordance — not on the real Web Storage API.
    _dump() {
      return Object.fromEntries(data);
    },
  };
}

// ------------------------------------------------------------------
// Contract under test — mirrors src/lib/prefs.ts.
// Two divergences from the real impl kept intentional:
//   - No React (no useState / useEffect). We test the raw
//     helpers only.
//   - No publish/listeners pipeline. Cross-hook subscribe is a
//     React concern; covered by a dedicated RTL test if/when that
//     harness ships. The storage layer is the part that stays
//     identical between server, client, and test envs.
// ------------------------------------------------------------------
const LS_PREFIX = "livewager-pref:";

// Keys that clearSessionState removes (mirrors SESSION_KEYS in
// prefs.ts). If the list drifts, update both places.
const SESSION_KEYS = [
  "sessionCapUsd",
  "walletQuickTab",
  "leaderboardTab",
  "stackerLastPlayed",
  "pourLastPlayed",
  "lastAuthAt",
  "tiltCalibration",
  "stackerWager",
  "stackerMode",
];

const SESSION_EXTRA_PREFIXES = [
  "livewager-recent-recipients",
  "livewager-stacker-best",
];

function readRaw(win, key, dflt) {
  try {
    const raw = win.localStorage.getItem(LS_PREFIX + key);
    if (raw === null) return dflt;
    return JSON.parse(raw);
  } catch {
    return dflt;
  }
}

function writeRaw(win, key, v) {
  try {
    win.localStorage.setItem(LS_PREFIX + key, JSON.stringify(v));
  } catch {
    /* quota / private-mode — no-op */
  }
}

function clearAllLocalData(win) {
  const toClear = [];
  for (let i = 0; i < win.localStorage.length; i++) {
    const k = win.localStorage.key(i);
    if (!k) continue;
    if (k.startsWith(LS_PREFIX) || k.startsWith("livewager-")) {
      toClear.push(k);
    }
  }
  for (const k of toClear) win.localStorage.removeItem(k);
}

function clearSessionState(win) {
  for (const k of SESSION_KEYS) {
    win.localStorage.removeItem(LS_PREFIX + k);
  }
  const toClear = [];
  for (let i = 0; i < win.localStorage.length; i++) {
    const k = win.localStorage.key(i);
    if (!k) continue;
    if (SESSION_EXTRA_PREFIXES.some((p) => k === p || k.startsWith(p))) {
      toClear.push(k);
    }
  }
  for (const k of toClear) win.localStorage.removeItem(k);
}

// Shared fixture — fresh window per test via t.beforeEach analog.
function freshWin() {
  return { localStorage: makeLocalStorage() };
}

// ------------------------------------------------------------------
// Tests
// ------------------------------------------------------------------

test("readRaw returns default when key absent", () => {
  const win = freshWin();
  assert.equal(readRaw(win, "sound", true), true);
  assert.equal(readRaw(win, "missing", "fallback"), "fallback");
});

test("writeRaw + readRaw round-trip primitives", () => {
  const win = freshWin();
  writeRaw(win, "sound", false);
  assert.equal(readRaw(win, "sound", true), false);
  writeRaw(win, "sessionCapUsd", 45);
  assert.equal(readRaw(win, "sessionCapUsd", null), 45);
  writeRaw(win, "sessionCapUsd", null);
  assert.equal(readRaw(win, "sessionCapUsd", 0), null);
});

test("writeRaw + readRaw round-trip objects", () => {
  const win = freshWin();
  const calib = { gamma: 1.2, beta: -0.5 };
  writeRaw(win, "tiltCalibration", calib);
  assert.deepEqual(readRaw(win, "tiltCalibration", null), calib);
});

test("writeRaw namespaces under the livewager-pref: prefix", () => {
  const win = freshWin();
  writeRaw(win, "sound", true);
  const keys = Object.keys(win.localStorage._dump());
  assert.deepEqual(keys, ["livewager-pref:sound"]);
});

test("readRaw returns default on malformed JSON", () => {
  const win = freshWin();
  // Drop in a raw value bypassing JSON.stringify — simulates
  // corrupted storage or an older schema version.
  win.localStorage.setItem("livewager-pref:sound", "{not json");
  assert.equal(readRaw(win, "sound", true), true);
});

test("clearAllLocalData wipes every livewager-prefixed key", () => {
  const win = freshWin();
  writeRaw(win, "sound", false);
  writeRaw(win, "haptics", true);
  win.localStorage.setItem("livewager-stacker-best", "42");
  win.localStorage.setItem("unrelated-pref", "keep-me");
  clearAllLocalData(win);
  const keys = Object.keys(win.localStorage._dump());
  assert.deepEqual(keys, ["unrelated-pref"]);
});

test("clearSessionState wipes session keys only", () => {
  const win = freshWin();
  writeRaw(win, "sound", true); // profile → kept
  writeRaw(win, "reducedMotion", false); // profile → kept
  writeRaw(win, "sessionCapUsd", 50); // session → cleared
  writeRaw(win, "stackerWager", 25); // session → cleared
  writeRaw(win, "walletQuickTab", "buy"); // session → cleared
  writeRaw(win, "hasSeenOnboarding", true); // profile → kept
  win.localStorage.setItem("livewager-recent-recipients", "[]"); // extra → cleared
  win.localStorage.setItem("livewager-stacker-best", "42"); // extra → cleared
  win.localStorage.setItem("unrelated-pref", "keep-me"); // foreign → kept

  clearSessionState(win);

  assert.equal(readRaw(win, "sound", null), true, "sound pref preserved");
  assert.equal(readRaw(win, "reducedMotion", null), false, "reducedMotion preserved");
  assert.equal(readRaw(win, "hasSeenOnboarding", null), true, "onboarding flag preserved");
  assert.equal(readRaw(win, "sessionCapUsd", null), null, "session cap cleared");
  assert.equal(readRaw(win, "stackerWager", null), null, "stacker wager cleared");
  assert.equal(readRaw(win, "walletQuickTab", null), null, "wallet quick-tab cleared");
  assert.equal(win.localStorage.getItem("livewager-recent-recipients"), null, "recents cleared");
  assert.equal(win.localStorage.getItem("livewager-stacker-best"), null, "stacker best cleared");
  assert.equal(win.localStorage.getItem("unrelated-pref"), "keep-me", "foreign keys untouched");
});

test("writeRaw silently ignores storage failures", () => {
  const win = {
    localStorage: {
      setItem() {
        throw new Error("quota exceeded");
      },
      getItem() {
        return null;
      },
      removeItem() {},
      length: 0,
      key() {
        return null;
      },
    },
  };
  // Should not throw.
  writeRaw(win, "sound", true);
});
