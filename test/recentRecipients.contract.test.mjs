/**
 * recentRecipients contract tests.
 *
 * Mirrors src/lib/recentRecipients.ts. The source uses
 * window.localStorage directly, so the mirror ships a tiny in-test
 * localStorage shim + re-implements the three functions against it.
 * Keeping the mirror explicit (not importing the real module through
 * a shimmed DOM) preserves the dep-free-node:test convention and the
 * "edit the mirror in lockstep with the source" discipline.
 *
 * What this pins:
 *  - list() tolerates missing key, non-JSON, non-array, and entries
 *    missing the required shape — never throws, always returns an
 *    array.
 *  - remember() dedupes on principal (not on ts or label).
 *  - remember() caps at RING_CAP=5, evicting oldest first.
 *  - remember() writes newest-first: the most recent call becomes
 *    index 0 regardless of whether it was already in the list.
 *  - forget() removes by principal and no-ops when the principal
 *    isn't in the list.
 *  - remember() on an empty/whitespace principal is a no-op (the
 *    real module uses this to guard against stray paste-of-nothing).
 *
 * Run: `node --test test/recentRecipients.contract.test.mjs`.
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";

// ------------------------------------------------------------------
// localStorage shim — minimal surface matching what the real module
// calls: getItem, setItem, clear. Stored as a closure so each test
// can create a fresh instance.
// ------------------------------------------------------------------
function makeLocalStorage() {
  const store = new Map();
  return {
    getItem(k) {
      return store.has(k) ? store.get(k) : null;
    },
    setItem(k, v) {
      store.set(k, String(v));
    },
    removeItem(k) {
      store.delete(k);
    },
    clear() {
      store.clear();
    },
    get size() {
      return store.size;
    },
  };
}

// ------------------------------------------------------------------
// Contract mirror — keep in sync with src/lib/recentRecipients.ts.
// ------------------------------------------------------------------
const KEY = "livewager-pref:recentRecipients";
const RING_CAP = 5;

function makeRing(ls) {
  function list() {
    try {
      const raw = ls.getItem(KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (x) =>
          !!x &&
          typeof x === "object" &&
          typeof x.principal === "string" &&
          typeof x.ts === "number",
      );
    } catch {
      return [];
    }
  }
  function remember(principal, label) {
    const trimmed = principal.trim();
    if (!trimmed) return;
    try {
      const existing = list();
      const deduped = existing.filter((e) => e.principal !== trimmed);
      const next = [
        { principal: trimmed, ts: Date.now(), label },
        ...deduped,
      ].slice(0, RING_CAP);
      ls.setItem(KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }
  function forget(principal) {
    try {
      const existing = list();
      const next = existing.filter((e) => e.principal !== principal);
      ls.setItem(KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }
  return { list, remember, forget };
}

// ------------------------------------------------------------------
// list() — defensive parsing
// ------------------------------------------------------------------

test("list() returns [] on a missing key", () => {
  const { list } = makeRing(makeLocalStorage());
  assert.deepEqual(list(), []);
});

test("list() returns [] on malformed JSON", () => {
  const ls = makeLocalStorage();
  ls.setItem(KEY, "{not valid JSON");
  const { list } = makeRing(ls);
  assert.deepEqual(list(), []);
});

test("list() returns [] when stored value isn't an array", () => {
  const ls = makeLocalStorage();
  ls.setItem(KEY, JSON.stringify({ principal: "x", ts: 1 }));
  const { list } = makeRing(ls);
  assert.deepEqual(list(), []);
});

test("list() filters out entries missing the required shape", () => {
  const ls = makeLocalStorage();
  ls.setItem(
    KEY,
    JSON.stringify([
      { principal: "good-one", ts: 100 },
      null,
      { principal: "no-ts" },
      { ts: 200 },
      "a string",
      { principal: 42, ts: 300 }, // principal wrong type
      { principal: "ok-two", ts: 400, label: "friend" },
    ]),
  );
  const { list } = makeRing(ls);
  const out = list();
  assert.equal(out.length, 2);
  assert.equal(out[0].principal, "good-one");
  assert.equal(out[1].principal, "ok-two");
  assert.equal(out[1].label, "friend");
});

// ------------------------------------------------------------------
// remember() — dedup + newest-first + cap
// ------------------------------------------------------------------

test("remember() puts a new principal at index 0", () => {
  const ls = makeLocalStorage();
  const { remember, list } = makeRing(ls);
  remember("a");
  remember("b");
  remember("c");
  const out = list();
  assert.equal(out.length, 3);
  assert.equal(out[0].principal, "c");
  assert.equal(out[1].principal, "b");
  assert.equal(out[2].principal, "a");
});

test("remember() deduplicates on principal and moves it to the front", () => {
  const ls = makeLocalStorage();
  const { remember, list } = makeRing(ls);
  remember("a");
  remember("b");
  remember("a"); // already in list — should move to front, not duplicate
  const out = list();
  assert.equal(out.length, 2);
  assert.equal(out[0].principal, "a");
  assert.equal(out[1].principal, "b");
});

test("remember() caps at 5, evicting the oldest", () => {
  const ls = makeLocalStorage();
  const { remember, list } = makeRing(ls);
  for (const p of ["a", "b", "c", "d", "e", "f"]) remember(p);
  const out = list();
  assert.equal(out.length, 5);
  // Newest-first: the last inserted (f) is at index 0; "a" is evicted.
  assert.equal(out[0].principal, "f");
  assert.equal(out[4].principal, "b");
  assert.ok(!out.some((e) => e.principal === "a"));
});

test("remember() trims whitespace around the principal", () => {
  const ls = makeLocalStorage();
  const { remember, list } = makeRing(ls);
  remember("  padded-principal  ");
  const out = list();
  assert.equal(out[0].principal, "padded-principal");
});

test("remember() is a no-op on empty / whitespace-only input", () => {
  const ls = makeLocalStorage();
  const { remember, list } = makeRing(ls);
  remember("");
  remember("   ");
  remember("\t\n");
  assert.deepEqual(list(), []);
  // Storage should not have been touched either — the source returns
  // early before reading. Asserted via localStorage size.
  assert.equal(ls.size, 0);
});

test("remember() preserves the optional label on the newest entry", () => {
  const ls = makeLocalStorage();
  const { remember, list } = makeRing(ls);
  remember("x", "friend");
  assert.equal(list()[0].label, "friend");
});

test("remember() overwrites the label when the same principal is re-added", () => {
  const ls = makeLocalStorage();
  const { remember, list } = makeRing(ls);
  remember("x", "old-label");
  remember("x", "new-label");
  assert.equal(list()[0].label, "new-label");
});

// ------------------------------------------------------------------
// forget() — remove by principal
// ------------------------------------------------------------------

test("forget() removes the matching principal", () => {
  const ls = makeLocalStorage();
  const { remember, forget, list } = makeRing(ls);
  remember("keep");
  remember("drop");
  forget("drop");
  const out = list();
  assert.equal(out.length, 1);
  assert.equal(out[0].principal, "keep");
});

test("forget() is a no-op when the principal isn't in the list", () => {
  const ls = makeLocalStorage();
  const { remember, forget, list } = makeRing(ls);
  remember("keep");
  forget("never-added");
  const out = list();
  assert.equal(out.length, 1);
  assert.equal(out[0].principal, "keep");
});

test("forget() preserves order of remaining entries", () => {
  const ls = makeLocalStorage();
  const { remember, forget, list } = makeRing(ls);
  remember("a");
  remember("b");
  remember("c");
  forget("b"); // remove the middle
  const out = list().map((e) => e.principal);
  assert.deepEqual(out, ["c", "a"]);
});

// ------------------------------------------------------------------
// Integration: realistic usage pattern
// ------------------------------------------------------------------

test("realistic send flow — send, re-send same, send new, forget one", () => {
  const ls = makeLocalStorage();
  const { remember, forget, list } = makeRing(ls);
  remember("alice");
  remember("bob");
  remember("alice"); // re-send to alice
  remember("carol");
  remember("dave");
  remember("eve");
  forget("bob");
  const out = list().map((e) => e.principal);
  // After the full sequence, order should be newest-first with bob
  // gone. alice was re-sent mid-sequence, so she's behind carol/dave/
  // eve, not at the end.
  assert.deepEqual(out, ["eve", "dave", "carol", "alice"]);
});
