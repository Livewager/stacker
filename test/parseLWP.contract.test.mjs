/**
 * parseLWP() contract tests.
 *
 * Contract under test: src/lib/icp/format.ts parseLWP(). Mirror of
 * the formatLWP coverage in test/formatLWP.contract.test.mjs — this
 * is the inverse direction (user string → base-unit bigint).
 *
 * parseLWP sits on /send's amount input, /withdraw's amount input,
 * /wallet's Buy LWP field, and the Stacker wager selector. Any
 * regression here leaks into the base-unit math everywhere and shows
 * up as "my transfer rejected with weird precision" reports.
 *
 * Same scope cut as prior files: mirror the contract inline so a
 * refactor has to update the mirror in lockstep. Pure JS, node:test.
 *
 * Run: `node --test test/parseLWP.contract.test.mjs` (or `npm test`).
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";

// ------------------------------------------------------------------
// Contract mirror — keep in sync with src/lib/icp/format.ts.
// ------------------------------------------------------------------

const LWP_DECIMALS = 8;
const LWP_DIVISOR = BigInt(10) ** BigInt(LWP_DECIMALS);

function parseLWP(input) {
  const trimmed = input.trim();
  if (!/^\d+(\.\d{1,8})?$/.test(trimmed)) return null;
  const [whole, frac = ""] = trimmed.split(".");
  const padded = (frac + "0".repeat(LWP_DECIMALS)).slice(0, LWP_DECIMALS);
  return BigInt(whole) * LWP_DIVISOR + BigInt(padded || "0");
}

// ------------------------------------------------------------------
// Happy path — integers and common decimals
// ------------------------------------------------------------------

test("parseLWP: integer zero → 0n", () => {
  assert.equal(parseLWP("0"), 0n);
});

test("parseLWP: integer one → one divisor", () => {
  assert.equal(parseLWP("1"), LWP_DIVISOR);
});

test("parseLWP: large integer scales exactly", () => {
  assert.equal(parseLWP("1000000"), BigInt(1_000_000) * LWP_DIVISOR);
});

test("parseLWP: round-trips small fractional values", () => {
  // 0.5 LWP = 50_000_000 base units
  assert.equal(parseLWP("0.5"), 50_000_000n);
  // 0.1 LWP = 10_000_000
  assert.equal(parseLWP("0.1"), 10_000_000n);
  // 0.00000001 (one base unit) = the minimum representable amount
  assert.equal(parseLWP("0.00000001"), 1n);
});

test("parseLWP: exactly 8 decimal places is accepted", () => {
  assert.equal(parseLWP("0.12345678"), 12_345_678n);
  assert.equal(parseLWP("1.12345678"), LWP_DIVISOR + 12_345_678n);
});

test("parseLWP: partial decimals right-pad to 8 places", () => {
  // "0.5" → frac "5", padded to "50000000", parsed as 50M
  assert.equal(parseLWP("0.5"), 50_000_000n);
  // "0.12" → "12" → "12000000"
  assert.equal(parseLWP("0.12"), 12_000_000n);
  // "0.123" → "123" → "12300000"
  assert.equal(parseLWP("0.123"), 12_300_000n);
});

// ------------------------------------------------------------------
// Whitespace handling
// ------------------------------------------------------------------

test("parseLWP: trims leading/trailing whitespace", () => {
  assert.equal(parseLWP("  1.5  "), LWP_DIVISOR + 50_000_000n);
  assert.equal(parseLWP("\n\t42\t\n"), BigInt(42) * LWP_DIVISOR);
});

test("parseLWP: interior whitespace is rejected", () => {
  // Leading spaces around the string trim off, but a space inside
  // the number is a parse error — no "thousand separator" tolerance.
  assert.equal(parseLWP("1 000"), null);
  assert.equal(parseLWP("1.5 0"), null);
});

// ------------------------------------------------------------------
// Rejection cases — these must all return null
// ------------------------------------------------------------------

test("parseLWP: empty string returns null", () => {
  assert.equal(parseLWP(""), null);
  assert.equal(parseLWP("   "), null);
});

test("parseLWP: missing integer part (leading dot) returns null", () => {
  // ".5" is a common loose JS float input; parseLWP explicitly
  // rejects so the caller can't sneak in partial floats and
  // round-trip inconsistently.
  assert.equal(parseLWP(".5"), null);
  assert.equal(parseLWP(".00000001"), null);
});

test("parseLWP: too many decimal places returns null", () => {
  // 9 decimals exceeds LWP precision; base units would round off
  // silently. Reject so callers surface a UX error.
  assert.equal(parseLWP("0.123456789"), null);
  assert.equal(parseLWP("1.123456789"), null);
});

test("parseLWP: trailing dot is rejected", () => {
  assert.equal(parseLWP("1."), null);
  assert.equal(parseLWP("0."), null);
});

test("parseLWP: negative numbers return null", () => {
  // LWP is non-negative; a leading minus is a parse error,
  // not a zero or abs-value coerce.
  assert.equal(parseLWP("-1"), null);
  assert.equal(parseLWP("-0.5"), null);
});

test("parseLWP: scientific/hex/exponent forms return null", () => {
  // Users pasting from a spreadsheet / calculator could send these;
  // the regex gate blocks them so base-unit math can't go sideways.
  assert.equal(parseLWP("1e2"), null);
  assert.equal(parseLWP("1.5e3"), null);
  assert.equal(parseLWP("0x1"), null);
  assert.equal(parseLWP("NaN"), null);
  assert.equal(parseLWP("Infinity"), null);
});

test("parseLWP: non-numeric characters return null", () => {
  assert.equal(parseLWP("1,5"), null); // EU-style comma
  assert.equal(parseLWP("$5"), null);
  assert.equal(parseLWP("5 LWP"), null);
  assert.equal(parseLWP("abc"), null);
});

test("parseLWP: leading zeros are accepted (not octal-sensitive)", () => {
  // BigInt("007") in JS would throw — and we use BigInt(whole) here.
  // The regex allows \d+, so "007" reaches BigInt. Node 20 + modern
  // V8 accept BigInt("007") without a SyntaxError. Pin that.
  assert.equal(parseLWP("007"), BigInt(7) * LWP_DIVISOR);
  assert.equal(parseLWP("00.5"), 50_000_000n);
});

// ------------------------------------------------------------------
// Precision under large values
// ------------------------------------------------------------------

test("parseLWP: preserves precision past Number.MAX_SAFE_INTEGER", () => {
  // 90_071_992.54740993 LWP = 9_007_199_254_740_993 base units.
  // Number() would collapse this; BigInt does not.
  const input = "90071992.54740993";
  assert.equal(parseLWP(input), 9_007_199_254_740_993n);
});

// ------------------------------------------------------------------
// Round-trip with formatLWP mirror (not importing formatLWP; same
// mirror semantics as the formatLWP contract file)
// ------------------------------------------------------------------

function formatLWP(baseUnits, maxFractionDigits = LWP_DECIMALS) {
  const whole = baseUnits / LWP_DIVISOR;
  const frac = baseUnits % LWP_DIVISOR;
  if (maxFractionDigits === 0) return whole.toString();
  const fracStr = frac.toString().padStart(LWP_DECIMALS, "0").slice(0, maxFractionDigits);
  const trimmed = fracStr.replace(/0+$/, "");
  return trimmed.length > 0 ? `${whole}.${trimmed}` : whole.toString();
}

test("parseLWP ↔ formatLWP: round-trip at full precision", () => {
  const cases = ["0", "1", "0.5", "0.00000001", "42.13370000", "12.34567890"];
  for (const input of cases) {
    const base = parseLWP(input);
    assert.ok(base !== null, `parseLWP rejected valid input ${JSON.stringify(input)}`);
    const formatted = formatLWP(base);
    // formatLWP trims trailing zeros, so we re-parse to compare
    // bigint-to-bigint rather than string-to-string.
    const reparsed = parseLWP(formatted);
    assert.equal(reparsed, base);
  }
});
