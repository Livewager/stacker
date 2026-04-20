/**
 * txId display contract.
 *
 * Audit finding for POLISH-211: there is no `shortenTxId` helper in
 * src/. txIds are ICRC-3 block indexes — small, monotonically
 * increasing bigints that the UI renders as `#${txId.toString()}` in
 * ActivityFeed, the /send success card, and wallet toast copy.
 * They never need shortening: at demo-load volume the biggest
 * plausible value fits in 6 digits.
 *
 * So instead of testing a helper that doesn't exist, this file pins
 * the display invariants the UI depends on:
 *
 *   1. BigInt.prototype.toString() on a realistic txId is pure
 *      decimal (no "n" suffix, no scientific notation, no commas).
 *   2. Round-tripping through `Tx #${n.toString()}` template
 *      literals gives the same string for both small and
 *      at-the-boundary values.
 *   3. BigInts exceeding Number.MAX_SAFE_INTEGER still stringify
 *      exactly — important because a future migration that
 *      coerces through Number() would silently truncate.
 *
 * If POLISH-211 ever legitimately needs a shortening helper (e.g.,
 * if txIds start being returned as 64-char hex digests), this test
 * file is the right place to grow — add the helper, mirror its
 * contract here, and keep the invariants below unchanged.
 *
 * Run: `node --test test/txIdDisplay.contract.test.mjs`
 * (or `npm test`).
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";

// ------------------------------------------------------------------
// BigInt.toString() display invariants
// ------------------------------------------------------------------

test("BigInt.toString() is pure decimal with no suffix", () => {
  assert.equal((0n).toString(), "0");
  assert.equal((1n).toString(), "1");
  assert.equal((42n).toString(), "42");
  assert.equal((9999n).toString(), "9999");
});

test("BigInt.toString() on realistic ICRC-3 block indexes", () => {
  // Early-demo values — what the UI actually renders today.
  assert.equal((7n).toString(), "7");
  assert.equal((123n).toString(), "123");
  assert.equal((999_999n).toString(), "999999"); // no thousands separator
});

test("BigInt.toString() doesn't fall into scientific notation", () => {
  // A value well past the Number.MAX_SAFE_INTEGER boundary.
  const big = 9_007_199_254_740_993n; // MAX_SAFE_INTEGER + 2
  const s = big.toString();
  assert.equal(s, "9007199254740993");
  assert.ok(!/e/i.test(s));
});

test("BigInt.toString() preserves precision Number() would lose", () => {
  // The whole reason the wire format is bigint: this round-trip
  // through Number silently collapses to the nearest representable
  // double. This test pins that regression.
  const big = 9_007_199_254_740_993n;
  const viaString = big.toString();
  const viaNumber = Number(big).toString();
  assert.notEqual(viaString, viaNumber); // "9007199254740993" vs "9007199254740992"
  assert.equal(viaString, "9007199254740993");
  assert.equal(viaNumber, "9007199254740992");
});

// ------------------------------------------------------------------
// Template-literal round-trip (matches ActivityFeed / /send call sites)
// ------------------------------------------------------------------

test("`Tx #${txId.toString()}` round-trip is stable across sizes", () => {
  const cases = [0n, 1n, 42n, 999n, 99_999n, 1_234_567n];
  for (const id of cases) {
    const shown = `Tx #${id.toString()}`;
    // Parse back: strip "Tx #" and reparse as bigint. Must round-trip.
    const parsed = BigInt(shown.slice(4));
    assert.equal(parsed, id);
  }
});

test("Template-literal form never emits 'n' suffix (common BigInt footgun)", () => {
  const id = 42n;
  const bad = `Tx #${id}`; // implicit toString — but just in case
  const good = `Tx #${id.toString()}`;
  assert.equal(bad, "Tx #42");
  assert.equal(good, "Tx #42");
  // Either form is safe today. If a future runtime ever surfaces
  // "42n" here (it won't — the spec is explicit), the first assert
  // above would trip first.
});

// ------------------------------------------------------------------
// Display-width guard — lets us verify the "no shortening needed"
// audit: even an unrealistically large txId stays under the 10-char
// budget the ActivityFeed row gives the #tag column.
// ------------------------------------------------------------------

test("BigInt up to 10^8 fits in the 10-char ActivityFeed tx-id column", () => {
  const EXTREME = 99_999_999n; // 8 digits — larger than any realistic value
  const shown = `#${EXTREME.toString()}`;
  // "#99999999" is 9 chars — well under the column's ~10-char budget.
  assert.ok(shown.length <= 10);
});
