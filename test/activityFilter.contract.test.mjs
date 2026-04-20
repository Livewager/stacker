/**
 * ActivityFeed filter-derivation tests.
 *
 * Contract under test: narrowFilter() + the downstream
 * `events.filter(e => e.kind === filter)` application the feed
 * uses when rendering a kind-scoped slice.
 *
 * Same scope cut as prior test files (prefs/clipboard/ltc): mirror
 * the contract so a future refactor has to update the mirror in
 * lockstep. Pure JS, no jsdom, no framework — just node:test.
 *
 * Run: `node --test test/activityFilter.contract.test.mjs`
 * (or `npm test`).
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";

// ------------------------------------------------------------------
// Contract mirror — keep in sync with ActivityFeed.narrowFilter and
// the render-time filter predicate.
// ------------------------------------------------------------------

const VALID = /** @type {const} */ (["mint", "burn", "transfer", "approve"]);

function narrowFilter(v) {
  return v === "mint" || v === "burn" || v === "transfer" || v === "approve"
    ? v
    : "all";
}

function applyFilter(events, filter) {
  if (filter === "all") return events;
  return events.filter((e) => e.kind === filter);
}

// ------------------------------------------------------------------
// narrowFilter — defensive coercion.
// ------------------------------------------------------------------

test("narrowFilter accepts each of the four valid kinds verbatim", () => {
  for (const k of VALID) {
    assert.equal(narrowFilter(k), k);
  }
});

test("narrowFilter falls back to 'all' for unknown strings", () => {
  assert.equal(narrowFilter("all"), "all");
  assert.equal(narrowFilter("anything-else"), "all");
  assert.equal(narrowFilter(""), "all");
  assert.equal(narrowFilter("MINT"), "all"); // case-sensitive
  assert.equal(narrowFilter("approves"), "all"); // close-but-no-cigar
});

test("narrowFilter tolerates non-string shapes (pref corruption)", () => {
  // The real hook narrows via useLocalPref which already typed-
  // guards, but a hand-edited localStorage value could return
  // anything after JSON.parse. Simulate that.
  assert.equal(narrowFilter(null), "all");
  assert.equal(narrowFilter(undefined), "all");
  assert.equal(narrowFilter(42), "all");
  assert.equal(narrowFilter({}), "all");
  assert.equal(narrowFilter([]), "all");
});

// ------------------------------------------------------------------
// applyFilter — downstream render predicate.
// ------------------------------------------------------------------

const FIXTURES = [
  { txId: 1n, kind: "mint" },
  { txId: 2n, kind: "transfer" },
  { txId: 3n, kind: "burn" },
  { txId: 4n, kind: "approve" },
  { txId: 5n, kind: "transfer" },
  { txId: 6n, kind: "mint" },
];

test("applyFilter 'all' returns the input list unchanged", () => {
  const out = applyFilter(FIXTURES, "all");
  assert.equal(out, FIXTURES); // identity reference — no slice
  assert.equal(out.length, 6);
});

test("applyFilter 'mint' keeps only mint events in order", () => {
  const out = applyFilter(FIXTURES, "mint");
  assert.equal(out.length, 2);
  assert.deepEqual(out.map((e) => Number(e.txId)), [1, 6]);
  assert.ok(out.every((e) => e.kind === "mint"));
});

test("applyFilter 'transfer' keeps only transfer events in order", () => {
  const out = applyFilter(FIXTURES, "transfer");
  assert.deepEqual(out.map((e) => Number(e.txId)), [2, 5]);
});

test("applyFilter 'burn' + 'approve' each match one fixture", () => {
  assert.equal(applyFilter(FIXTURES, "burn").length, 1);
  assert.equal(applyFilter(FIXTURES, "approve").length, 1);
});

test("applyFilter returns an empty list when no events match", () => {
  const onlyApprove = [{ txId: 9n, kind: "approve" }];
  const out = applyFilter(onlyApprove, "mint");
  assert.deepEqual(out, []);
});

test("applyFilter on empty input returns empty regardless of filter", () => {
  assert.deepEqual(applyFilter([], "all"), []);
  assert.deepEqual(applyFilter([], "mint"), []);
});

test("combined flow: narrowFilter + applyFilter survives bad input", () => {
  // Simulate a pref that got corrupted to "bogus" on disk and
  // flowed in through useLocalPref → narrow → applyFilter.
  const f = narrowFilter("bogus");
  assert.equal(f, "all");
  const out = applyFilter(FIXTURES, f);
  assert.equal(out.length, FIXTURES.length);
});
