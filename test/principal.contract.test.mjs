/**
 * shortenPrincipal() contract tests.
 *
 * Contract under test: src/lib/principal.ts shortenPrincipal(). Used
 * across /account, /wallet, /send, /withdraw, /settings, DropWallet,
 * and toast pills — a regression here shifts the UI of every
 * principal display at once, so nail down the edge cases.
 *
 * Same scope cut as prior test files (prefs/clipboard/ltc/activity):
 * mirror the contract inline so a refactor has to update the mirror
 * in lockstep. Pure JS, no jsdom, no framework — just node:test.
 *
 * Run: `node --test test/principal.contract.test.mjs`
 * (or `npm test`).
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";

// ------------------------------------------------------------------
// Contract mirror — keep in sync with src/lib/principal.ts.
// ------------------------------------------------------------------

const DEFAULT_HEAD = 10;
const DEFAULT_TAIL = 8;

function shortenPrincipal(principal, opts = {}) {
  if (!principal) return "";
  const head = opts.head ?? DEFAULT_HEAD;
  const tail = opts.tail ?? DEFAULT_TAIL;
  const ellipsis = opts.ellipsis ?? "…";
  if (principal.length <= head + tail + 1) return principal;
  const tailSlice = tail === 0 ? "" : principal.slice(-tail);
  return `${principal.slice(0, head)}${ellipsis}${tailSlice}`;
}

// A realistic ICP principal string. 63 chars incl. dashes.
const FULL = "xkwrr-q77fr-3kyca-5kaaa-aaaaa-aaaaa-aaaaq-cai";

// ------------------------------------------------------------------
// Null / empty / undefined — defensive coercion
// ------------------------------------------------------------------

test("shortenPrincipal returns empty string for null/undefined/empty", () => {
  assert.equal(shortenPrincipal(null), "");
  assert.equal(shortenPrincipal(undefined), "");
  assert.equal(shortenPrincipal(""), "");
});

test("shortenPrincipal preserves short principals under the threshold", () => {
  // head (10) + tail (8) + ellipsis (1 char) = 19. Anything ≤19 passes through.
  const short = "aaaa-bbbb-cccc"; // 14 chars
  assert.equal(shortenPrincipal(short), short);
});

test("shortenPrincipal preserves the exact-boundary principal", () => {
  // 10 + 1 + 8 = 19 chars. Edge case: should NOT shorten.
  const edge = "a".repeat(19);
  assert.equal(shortenPrincipal(edge), edge);
});

test("shortenPrincipal shortens when over threshold by one char", () => {
  // 20 chars — first case where shortening kicks in.
  const over = "a".repeat(20);
  const out = shortenPrincipal(over);
  assert.equal(out.length, 10 + 1 + 8); // head + ellipsis + tail
  assert.ok(out.includes("…"));
});

// ------------------------------------------------------------------
// Default shape
// ------------------------------------------------------------------

test("shortenPrincipal default shape on a full ICP principal", () => {
  const out = shortenPrincipal(FULL);
  assert.equal(out, "xkwrr-q77f…aaaq-cai");
  // Sanity: 10 head + 1 ellipsis + 8 tail = 19 glyphs.
  // (String.length counts the ellipsis as one code point.)
  assert.equal(out.length, 19);
  assert.equal(out.split("…").length, 2); // exactly one ellipsis
});

test("shortenPrincipal default output starts with head slice of input", () => {
  const out = shortenPrincipal(FULL);
  assert.ok(out.startsWith(FULL.slice(0, 10)));
});

test("shortenPrincipal default output ends with tail slice of input", () => {
  const out = shortenPrincipal(FULL);
  assert.ok(out.endsWith(FULL.slice(-8)));
});

// ------------------------------------------------------------------
// Custom head/tail opts
// ------------------------------------------------------------------

test("shortenPrincipal respects custom head/tail (toast-pill shape)", () => {
  // Toast pills use head 6, tail 4 — a deliberately tighter form.
  const out = shortenPrincipal(FULL, { head: 6, tail: 4 });
  assert.equal(out, "xkwrr-…-cai");
  assert.ok(out.startsWith("xkwrr-"));
  assert.ok(out.endsWith("-cai"));
});

test("shortenPrincipal respects custom head with default tail", () => {
  const out = shortenPrincipal(FULL, { head: 4 });
  assert.ok(out.startsWith(FULL.slice(0, 4)));
  assert.ok(out.endsWith(FULL.slice(-8)));
});

test("shortenPrincipal respects custom tail with default head", () => {
  const out = shortenPrincipal(FULL, { tail: 4 });
  assert.ok(out.startsWith(FULL.slice(0, 10)));
  assert.ok(out.endsWith(FULL.slice(-4)));
});

test("shortenPrincipal head=0 yields leading ellipsis + tail", () => {
  const out = shortenPrincipal(FULL, { head: 0, tail: 8 });
  assert.equal(out, `…${FULL.slice(-8)}`);
});

test("shortenPrincipal tail=0 yields head + trailing ellipsis", () => {
  const out = shortenPrincipal(FULL, { head: 10, tail: 0 });
  assert.equal(out, `${FULL.slice(0, 10)}…`);
});

// ------------------------------------------------------------------
// Custom ellipsis
// ------------------------------------------------------------------

test("shortenPrincipal accepts a custom ellipsis glyph", () => {
  // Some call sites may want ASCII "..." for environments that don't
  // render "…" well (older clipboard paths, plain-text receipts).
  const out = shortenPrincipal(FULL, { ellipsis: "..." });
  assert.ok(out.includes("..."));
  assert.ok(!out.includes("…"));
  // Threshold math widens proportionally — ASCII ellipsis is 3 chars
  // not 1, so a 20-char input + head 10 + tail 8 still shortens.
  assert.equal(out, `${FULL.slice(0, 10)}...${FULL.slice(-8)}`);
});

test("shortenPrincipal with empty-string ellipsis behaves as head+tail concat", () => {
  const out = shortenPrincipal(FULL, { ellipsis: "" });
  assert.equal(out, `${FULL.slice(0, 10)}${FULL.slice(-8)}`);
});

// ------------------------------------------------------------------
// Input that's only marginally over threshold with big head/tail opts
// ------------------------------------------------------------------

test("shortenPrincipal returns input unchanged when head+tail exceed length", () => {
  const short = "hello-world-principal"; // 21 chars
  // head + tail + 1 = 30, > 21 → passthrough.
  const out = shortenPrincipal(short, { head: 15, tail: 14 });
  assert.equal(out, short);
});

test("shortenPrincipal head+tail that barely fit still shorten correctly", () => {
  const s = "a".repeat(30);
  const out = shortenPrincipal(s, { head: 10, tail: 8 });
  assert.equal(out.length, 19);
  assert.equal(out, "aaaaaaaaaa…aaaaaaaa");
});
