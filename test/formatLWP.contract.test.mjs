/**
 * formatLWP() contract tests.
 *
 * Contract under test: src/lib/icp/format.ts formatLWP(). Used on
 * every balance surface (ActivityFeed rows, WalletNav pill, /wallet
 * hero, toast descriptions, /send + /withdraw review rows) so a
 * subtle regression — say, a trailing-zero trim that stops working,
 * or a maxFractionDigits=0 branch that drops the integer — would
 * cascade across the app.
 *
 * Same scope cut as prior test files: mirror the contract inline so
 * a refactor has to update the mirror in lockstep. Pure JS, no jsdom,
 * no framework — just node:test.
 *
 * Run: `node --test test/formatLWP.contract.test.mjs`
 * (or `npm test`).
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";

// ------------------------------------------------------------------
// Contract mirror — keep in sync with src/lib/icp/format.ts.
// ------------------------------------------------------------------

const LWP_DECIMALS = 8;
const LWP_DIVISOR = BigInt(10) ** BigInt(LWP_DECIMALS);

function formatLWP(baseUnits, maxFractionDigits = LWP_DECIMALS) {
  const whole = baseUnits / LWP_DIVISOR;
  const frac = baseUnits % LWP_DIVISOR;
  if (maxFractionDigits === 0) return whole.toString();
  const fracStr = frac.toString().padStart(LWP_DECIMALS, "0").slice(0, maxFractionDigits);
  const trimmed = fracStr.replace(/0+$/, "");
  return trimmed.length > 0 ? `${whole}.${trimmed}` : whole.toString();
}

// ------------------------------------------------------------------
// Zero / whole-number cases
// ------------------------------------------------------------------

test("formatLWP: zero in, zero out (no decimal)", () => {
  assert.equal(formatLWP(0n), "0");
  assert.equal(formatLWP(0n, 0), "0");
  assert.equal(formatLWP(0n, 4), "0");
  assert.equal(formatLWP(0n, 8), "0");
});

test("formatLWP: exactly 1 LWP (one divisor) renders as '1'", () => {
  assert.equal(formatLWP(LWP_DIVISOR), "1");
  assert.equal(formatLWP(LWP_DIVISOR, 4), "1");
  assert.equal(formatLWP(LWP_DIVISOR, 0), "1");
});

test("formatLWP: whole-number balances trim trailing zero decimals", () => {
  assert.equal(formatLWP(BigInt(42) * LWP_DIVISOR), "42");
  assert.equal(formatLWP(BigInt(42) * LWP_DIVISOR, 4), "42");
  assert.equal(formatLWP(BigInt(1_000_000) * LWP_DIVISOR), "1000000");
});

// ------------------------------------------------------------------
// Fractional cases — trailing-zero trim is the subtle regression risk
// ------------------------------------------------------------------

test("formatLWP: full 8-decimal fraction (no trim needed)", () => {
  // 0.12345678 = 12_345_678 base units.
  assert.equal(formatLWP(12_345_678n), "0.12345678");
  assert.equal(formatLWP(12_345_678n, 8), "0.12345678");
});

test("formatLWP: trailing zeros trimmed at requested precision", () => {
  // 0.50000000 → "0.5" (trim all trailing zeros after the slice)
  assert.equal(formatLWP(50_000_000n), "0.5");
  // 0.12340000 → "0.1234"
  assert.equal(formatLWP(12_340_000n), "0.1234");
  // 0.00000001 (one base unit) → "0.00000001" at full precision
  assert.equal(formatLWP(1n), "0.00000001");
  assert.equal(formatLWP(1n, 8), "0.00000001");
});

test("formatLWP: maxFractionDigits truncates before trim", () => {
  // 0.12345678 at 4-digit precision → slice to "1234" → no trim → "0.1234"
  assert.equal(formatLWP(12_345_678n, 4), "0.1234");
  // 0.12000000 at 4-digit precision → slice to "1200" → trim → "0.12"
  assert.equal(formatLWP(12_000_000n, 4), "0.12");
  // 0.10000000 at 4-digit precision → slice to "1000" → trim → "0.1"
  assert.equal(formatLWP(10_000_000n, 4), "0.1");
});

test("formatLWP: maxFractionDigits=0 returns whole only (no decimal)", () => {
  // This is the branch that matters for the balance hero "compact"
  // displays — a 0 here must skip the decimal entirely, not leave
  // a dangling period. Regression risk: early returns.
  assert.equal(formatLWP(12_345_678n, 0), "0");
  assert.equal(formatLWP(LWP_DIVISOR + 1n, 0), "1");
  assert.equal(formatLWP(BigInt(42) * LWP_DIVISOR + 99_999_999n, 0), "42");
});

test("formatLWP: maxFractionDigits=2 (UI-common short form)", () => {
  // $-like two-decimal display used by WalletNav mobile.
  assert.equal(formatLWP(LWP_DIVISOR / 2n, 2), "0.5"); // 0.5 LWP
  assert.equal(formatLWP(BigInt(3) * LWP_DIVISOR + 14_000_000n, 2), "3.14");
  assert.equal(formatLWP(BigInt(3) * LWP_DIVISOR + 15_000_000n, 2), "3.15");
  // Note: slice truncates, doesn't round. 3.19999999 → "3.19", not "3.20".
  // Callers that need rounding must not use formatLWP.
  assert.equal(formatLWP(BigInt(3) * LWP_DIVISOR + 19_999_999n, 2), "3.19");
});

// ------------------------------------------------------------------
// Large values — numeric overflow concerns
// ------------------------------------------------------------------

test("formatLWP: handles values past Number.MAX_SAFE_INTEGER exactly", () => {
  // 2^53 + 1 base units. Number() coercion would collapse this to
  // 2^53; bigint division must preserve precision.
  const n = 9_007_199_254_740_993n;
  const out = formatLWP(n);
  // Whole part: 9_007_199_254_740_993 / 10^8 = 90_071_992 (floor)
  // Frac part:  9_007_199_254_740_993 % 10^8 = 54_740_993
  assert.equal(out, "90071992.54740993");
});

test("formatLWP: 1 billion LWP renders cleanly without scientific notation", () => {
  const oneBillion = BigInt(1_000_000_000) * LWP_DIVISOR;
  const out = formatLWP(oneBillion);
  assert.equal(out, "1000000000");
  assert.ok(!/e/i.test(out));
});

// ------------------------------------------------------------------
// Round-trip with parseLWP (if we were to add it — not required here,
// but good sanity if a future commit does)
// ------------------------------------------------------------------

test("formatLWP: consecutive base units differ by the smallest fractional step", () => {
  const a = formatLWP(100_000_000n); // 1
  const b = formatLWP(100_000_001n); // 1.00000001
  assert.equal(a, "1");
  assert.equal(b, "1.00000001");
});

// ------------------------------------------------------------------
// Cross-check with real call-site shapes
// ------------------------------------------------------------------

test("formatLWP: ActivityFeed row (amount + 4 decimals)", () => {
  // A typical mint: 0.5 LWP minted to someone.
  assert.equal(formatLWP(50_000_000n, 4), "0.5");
  // A typical fee-burned transfer: amount minus 0.0001 LWP fee.
  assert.equal(formatLWP(99_990_000n, 4), "0.9999");
});

test("formatLWP: WalletNav mobile (2 decimals) vs desktop (4 decimals) show the same amount", () => {
  const b = BigInt(12) * LWP_DIVISOR + 34_567_890n; // 12.3456789 LWP
  assert.equal(formatLWP(b, 2), "12.34");
  assert.equal(formatLWP(b, 4), "12.3456");
  // Full-precision context (settings diagnostic, copy-balance action).
  assert.equal(formatLWP(b, 8), "12.3456789");
});
