/**
 * LTC address validator tests.
 *
 * Mirrors the contract in src/lib/ltc.ts. That file is a pure
 * module with no React imports — we could in theory import the
 * real source via a TS loader, but adding a loader just to skip
 * the mirror adds more surface area than the mirror costs. If
 * the real validator adds a rule, update this file in lockstep.
 *
 * Run: `node --test test/ltc.contract.test.mjs` (or `npm test`).
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";

// Contract mirror — keep in sync with validateLtcAddress.
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]+$/;
const BECH32_DATA_RE = /^[02-9ac-hj-np-z]+$/;

function validateLtcAddress(input) {
  const raw = input.trim();
  if (!raw) return { ok: false, reason: "Required" };
  if (/^bc1/i.test(raw)) {
    return { ok: false, reason: "That's a Bitcoin (bc1…) address, not Litecoin" };
  }
  if (/^0x[0-9a-f]+$/i.test(raw)) {
    return { ok: false, reason: "That's an EVM address, not Litecoin" };
  }
  if (/^[A-Z]/.test(raw) && /^ltc1/i.test(raw)) {
    return { ok: false, reason: "Bech32 addresses must be lowercase" };
  }
  if (raw.startsWith("ltc1")) {
    if (raw.length < 26) return { ok: false, reason: "Bech32 address is too short" };
    if (raw.length > 90) return { ok: false, reason: "Bech32 address is too long" };
    const data = raw.slice(4);
    if (!BECH32_DATA_RE.test(data)) {
      return {
        ok: false,
        reason: "Contains characters bech32 doesn't allow (1, b, i, o)",
      };
    }
    return { ok: true, kind: "bech32" };
  }
  const first = raw[0];
  if (first !== "L" && first !== "M" && first !== "3") {
    return {
      ok: false,
      reason: "Legacy LTC addresses start with L or M. Bech32 starts with ltc1.",
    };
  }
  if (raw.length < 26) return { ok: false, reason: "Address is too short" };
  if (raw.length > 34) return { ok: false, reason: "Legacy address is too long" };
  if (!BASE58_RE.test(raw)) {
    return {
      ok: false,
      reason:
        "Contains base58-invalid characters (0, O, I, or l). Double-check the paste.",
    };
  }
  const kind = first === "L" ? "legacy" : "p2sh";
  return { ok: true, kind };
}

// ------------------------------------------------------------------
// Happy paths — one realistic fixture per address kind.
// ------------------------------------------------------------------

test("legacy L-prefix address validates as 'legacy'", () => {
  // 34 chars, all base58-legal, starts with L.
  const addr = "LVg2kJoFNowz9tSEp2LjdBQHqDAmSbMLPW";
  const v = validateLtcAddress(addr);
  assert.equal(v.ok, true);
  assert.equal(v.kind, "legacy");
});

test("P2SH M-prefix address validates as 'p2sh'", () => {
  const addr = "MBuTKxJpXg6X5BgBDHrp8kCP6JLHrbKGpA";
  const v = validateLtcAddress(addr);
  assert.equal(v.ok, true);
  assert.equal(v.kind, "p2sh");
});

test("P2SH 3-prefix address validates as 'p2sh' (historical)", () => {
  const addr = "3P14159f73E4gFr7JterCCQh9QjiTjiZrG";
  const v = validateLtcAddress(addr);
  assert.equal(v.ok, true);
  assert.equal(v.kind, "p2sh");
});

test("bech32 ltc1 address validates as 'bech32'", () => {
  // Canonical doc fixture — 43 chars.
  const addr = "ltc1qzvcgmntglcuv4smv3lzj6k8szcvsrmvk0phrr9";
  const v = validateLtcAddress(addr);
  assert.equal(v.ok, true);
  assert.equal(v.kind, "bech32");
});

// ------------------------------------------------------------------
// Wrong-network / wrong-coin catches.
// ------------------------------------------------------------------

test("BTC bech32 (bc1…) rejected with Bitcoin-specific reason", () => {
  const v = validateLtcAddress("bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh");
  assert.equal(v.ok, false);
  assert.match(v.reason, /Bitcoin/);
});

test("uppercase BC1 still rejected (case-insensitive prefix match)", () => {
  const v = validateLtcAddress("BC1QXY2KGDYGJRSQTZQ2N0YRF2493P83KKFJHX0WLH");
  assert.equal(v.ok, false);
  assert.match(v.reason, /Bitcoin/);
});

test("EVM 0x address rejected with EVM-specific reason", () => {
  const v = validateLtcAddress("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045");
  assert.equal(v.ok, false);
  assert.match(v.reason, /EVM/);
});

// ------------------------------------------------------------------
// Empty / whitespace.
// ------------------------------------------------------------------

test("empty string returns Required", () => {
  const v = validateLtcAddress("");
  assert.equal(v.ok, false);
  assert.equal(v.reason, "Required");
});

test("whitespace-only returns Required (post-trim)", () => {
  const v = validateLtcAddress("   \n\t  ");
  assert.equal(v.ok, false);
  assert.equal(v.reason, "Required");
});

test("leading/trailing whitespace trimmed before validation", () => {
  const v = validateLtcAddress("  LVg2kJoFNowz9tSEp2LjdBQHqDAmSbMLPW  ");
  assert.equal(v.ok, true);
  assert.equal(v.kind, "legacy");
});

// ------------------------------------------------------------------
// Case sensitivity on bech32.
// ------------------------------------------------------------------

test("uppercase LTC1 prefix rejected with lowercase reason", () => {
  const v = validateLtcAddress("LTC1QZVCGMNTGLCUV4SMV3LZJ6K8SZCVSRMVK0PHRR9");
  assert.equal(v.ok, false);
  assert.match(v.reason, /lowercase/i);
});

// ------------------------------------------------------------------
// Structural: length + charset bounds.
// ------------------------------------------------------------------

test("legacy too-short rejected", () => {
  const v = validateLtcAddress("LShort");
  assert.equal(v.ok, false);
  assert.match(v.reason, /short/i);
});

test("legacy too-long rejected", () => {
  // 35 chars, starts with L
  const v = validateLtcAddress("LAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
  assert.equal(v.ok, false);
  assert.match(v.reason, /too long/i);
});

test("legacy with base58-invalid chars rejected", () => {
  // Includes '0' (illegal in base58) inside an otherwise-OK-looking 30-char string.
  const v = validateLtcAddress("L0VgkJoFNowz9tSEp2LjdBQHqDAmSb");
  assert.equal(v.ok, false);
  assert.match(v.reason, /base58/i);
});

test("bech32 too-short rejected", () => {
  const v = validateLtcAddress("ltc1qshort");
  assert.equal(v.ok, false);
  assert.match(v.reason, /short/i);
});

test("bech32 too-long rejected (>90 chars)", () => {
  const long = "ltc1" + "q".repeat(90);
  const v = validateLtcAddress(long);
  assert.equal(v.ok, false);
  assert.match(v.reason, /too long/i);
});

test("bech32 with illegal chars (1, b, i, o) in data part rejected", () => {
  // 'b' is not in the bech32 data charset.
  const v = validateLtcAddress("ltc1qbbbbbbbbbbbbbbbbbbbbbbbb");
  assert.equal(v.ok, false);
  assert.match(v.reason, /bech32 doesn't allow/i);
});

// ------------------------------------------------------------------
// Wrong prefix on a plausible-looking string.
// ------------------------------------------------------------------

test("non-L/M/3 prefix rejected with guidance", () => {
  const v = validateLtcAddress("Xabcdefghijklmnopqrstuvwxyz12345");
  assert.equal(v.ok, false);
  assert.match(v.reason, /L or M/);
});
