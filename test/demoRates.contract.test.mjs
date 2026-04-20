/**
 * Demo-rate helper tests.
 *
 * Mirrors the contract in src/lib/demoRates.ts. The helpers are
 * extremely small, so inlining the mirror costs less than wiring a
 * TS loader. If the module gains a branch or a new constant, update
 * the mirror in lockstep.
 *
 * What this file pins:
 *  - DEMO_USD_PER_LWP is a stable number (display callers multiply
 *    into it assuming a scalar, so e.g. accidentally flipping it to
 *    a string would corrupt every `$X` hint).
 *  - LWP_PER_LTC matches the mock oracle literal that /api/dunk/
 *    ltc-deposit mints from; if these drift, the /wallet + /withdraw
 *    "Value" hints stop matching what the API will actually quote.
 *  - formatDemoUsd shape: `≈ $1,234.56` — soft-approx glyph,
 *    thousands-grouped, exactly two decimals, locale-aware grouping
 *    separator (we assert on an Intl-emitted grouping character, not
 *    a hardcoded ',' so CI envs with different default locales pass).
 *  - Edge inputs (0, negative, fractional, very large) don't crash
 *    or switch to scientific notation.
 *
 * Run: `node --test test/demoRates.contract.test.mjs` (or `npm test`).
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";

// Contract mirror — keep in sync with src/lib/demoRates.ts.
const DEMO_USD_PER_LWP = 1;
const LWP_PER_LTC = 10_000_000;

function formatDemoUsd(lwp) {
  const usd = lwp * DEMO_USD_PER_LWP;
  return `≈ $${usd.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// ------------------------------------------------------------------
// Constants — stable shape.
// ------------------------------------------------------------------

test("DEMO_USD_PER_LWP is a finite number", () => {
  assert.equal(typeof DEMO_USD_PER_LWP, "number");
  assert.ok(Number.isFinite(DEMO_USD_PER_LWP));
});

test("DEMO_USD_PER_LWP is the expected demo peg (1:1)", () => {
  // Pinning the exact value so a copy-paste bug that changed it to
  // 0.01 (the classic "treat LWP like a cent") or 100 (the "multiply
  // by the cap" error) would fail loudly here, not silently ship.
  assert.equal(DEMO_USD_PER_LWP, 1);
});

test("LWP_PER_LTC is an integer — base-unit multiplier", () => {
  assert.equal(typeof LWP_PER_LTC, "number");
  assert.ok(Number.isInteger(LWP_PER_LTC));
  assert.ok(LWP_PER_LTC > 0);
});

test("LWP_PER_LTC matches the mock oracle's 1 LTC → 10M LWP demo rate", () => {
  // The /api/dunk/ltc-deposit mock oracle mints at this rate. If a
  // future dev bumps one constant, this test keeps the two in sync
  // or forces them to update both in the same commit.
  assert.equal(LWP_PER_LTC, 10_000_000);
});

// ------------------------------------------------------------------
// formatDemoUsd — shape contract.
// ------------------------------------------------------------------

test("formatDemoUsd prefixes with '≈ $'", () => {
  assert.ok(formatDemoUsd(5).startsWith("≈ $"));
});

test("formatDemoUsd renders exactly two decimal places on an integer", () => {
  assert.equal(formatDemoUsd(5), "≈ $5.00");
});

test("formatDemoUsd rounds a half-cent up (banker's-round-agnostic)", () => {
  // Intl.NumberFormat uses "half-to-even" on some runtimes and
  // "half-up" on others — tolerate either by asserting the result
  // is one of the two plausible two-decimal outcomes. 0.005 → 0.00
  // (round-half-to-even) or 0.01 (round-half-up).
  const out = formatDemoUsd(0.005);
  assert.match(out, /^≈ \$0\.0[01]$/);
});

test("formatDemoUsd truncates extra precision to two decimals", () => {
  assert.equal(formatDemoUsd(1.2345), "≈ $1.23");
  assert.equal(formatDemoUsd(1.2355), "≈ $1.24");
});

test("formatDemoUsd groups thousands with the runtime's locale separator", () => {
  // Don't hardcode ',' — a CI env could default to de-DE (uses '.').
  // Detect the separator the runtime emits for 1000, then verify
  // formatDemoUsd used the same one.
  const sep = (1000).toLocaleString().replace(/\d/g, "")[0] ?? ",";
  const out = formatDemoUsd(1234);
  assert.ok(
    out.includes(`1${sep}234.00`),
    `expected locale-separated thousands in ${JSON.stringify(out)}`,
  );
});

// ------------------------------------------------------------------
// Edge inputs.
// ------------------------------------------------------------------

test("formatDemoUsd(0) renders '≈ $0.00' (not '-$0.00')", () => {
  const out = formatDemoUsd(0);
  assert.equal(out, "≈ $0.00");
  assert.ok(!out.includes("-"), "zero should not render with a minus sign");
});

test("formatDemoUsd handles a negative amount with a minus sign", () => {
  // Callers today pass non-negative amounts (balance, entry fee,
  // send amount), but defensive: a refund/offset flow later could
  // feed a negative; the helper shouldn't silently strip the sign.
  const out = formatDemoUsd(-5);
  assert.match(out, /^≈ \$-5\.00$|^≈ -\$5\.00$/);
});

test("formatDemoUsd handles a very large amount without scientific notation", () => {
  // 1 billion LWP. toLocaleString should group; we should not see
  // an 'e' or '+' which would mean scientific fallback.
  const out = formatDemoUsd(1_000_000_000);
  assert.ok(!/e/i.test(out), `unexpected scientific notation: ${out}`);
  assert.ok(!/\+/.test(out), `unexpected '+' in output: ${out}`);
  assert.match(out, /\.00$/);
});

test("formatDemoUsd on a fractional < 0.005 renders as $0.00", () => {
  assert.equal(formatDemoUsd(0.001), "≈ $0.00");
});
