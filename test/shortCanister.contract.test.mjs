/**
 * shortCanister (AppFooter) formatter contract.
 *
 * AppFooter.tsx:38 carries the shortCanister helper with a
 * POLISH-287 inline perf note. The function is tiny — 4 lines —
 * but it ships in the footer on every route, so its behavior
 * touches the whole site. This file pins:
 *
 *   - Short-id passthrough: when `id.length <= h + t + 1`, return
 *     the full string (no ellipsis on ids that would look worse
 *     truncated than whole).
 *   - Truncated form: `${head}…${tail}` with the U+2026 horizontal
 *     ellipsis (NOT three dots). The single char reads better at
 *     10px mono font and is the glyph Footer visually ships today.
 *   - Default h=5, t=3 — the 5+3 split is tuned for the 11px mono
 *     Footer rendering of a ~27-char mainnet canister id. A
 *     "improve readability" refactor that bumps the defaults would
 *     shift the footer's layout; this test catches it.
 *   - Custom h/t overrides work (the function isn't baked to its
 *     defaults internally).
 *   - Edge cases: empty string, exact-threshold length, very short
 *     ids, ids that are all the same char.
 *
 * Runs: `node --test test/shortCanister.contract.test.mjs`
 *       (or `npm test`).
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

// ------------------------------------------------------------------
// Contract mirror — keep in sync with src/components/AppFooter.tsx.
// ------------------------------------------------------------------

function shortCanister(id, h = 5, t = 3) {
  if (id.length <= h + t + 1) return id;
  return `${id.slice(0, h)}…${id.slice(-t)}`;
}

// Mirror-sync guard: read the source and confirm the mirror above
// matches. Catches the classic drift pattern where someone tweaks
// the helper but forgets the test. Extracts the function body as
// text and compares the relevant substrings — not a full AST
// parse, just enough to notice a default-arg or ellipsis change.
test("shortCanister mirror matches AppFooter.tsx source", () => {
  const src = readFileSync(
    resolve(repoRoot, "src/components/AppFooter.tsx"),
    "utf8",
  );
  // Pattern: `function shortCanister(id: string, h = 5, t = 3): string {`
  const sigMatch = src.match(
    /function shortCanister\(id: string, h = (\d+), t = (\d+)\): string \{/,
  );
  assert.ok(sigMatch, "AppFooter must declare function shortCanister with default h/t");
  assert.equal(sigMatch[1], "5", "default h drifted — update mirror or revert");
  assert.equal(sigMatch[2], "3", "default t drifted — update mirror or revert");

  // Body must use the U+2026 horizontal ellipsis (single char), not
  // three ASCII dots. Grep for the literal glyph.
  const bodyMatch = src.match(
    /function shortCanister[\s\S]*?return `\$\{id\.slice\(0, h\)\}(…)\$\{id\.slice\(-t\)\}`;/,
  );
  assert.ok(
    bodyMatch,
    "AppFooter shortCanister body must use the U+2026 ellipsis, not '...'",
  );
  assert.equal(bodyMatch[1], "…");
});

// ------------------------------------------------------------------
// Short-id passthrough.
// ------------------------------------------------------------------

test("short id (<= h+t+1) returns unchanged", () => {
  // With defaults h=5, t=3, threshold is length 9. Ids at exactly
  // 9 chars return whole — the ellipsis would only save 1 char.
  assert.equal(shortCanister("abc"), "abc");
  assert.equal(shortCanister("abcdefghi"), "abcdefghi"); // 9 chars, <= 9
  assert.equal(shortCanister(""), "");
});

test("10-char id DOES truncate (first over threshold)", () => {
  // Length 10 crosses the threshold; the 9-vs-10 boundary is the
  // one that often regresses when someone tweaks the comparison.
  assert.equal(shortCanister("abcdefghij"), "abcde…hij");
});

// ------------------------------------------------------------------
// Canonical truncated form.
// ------------------------------------------------------------------

test("long id returns head + U+2026 ellipsis + tail", () => {
  const principalish = "ryjl3-tyaaa-aaaaa-aaaba-cai";
  // Default h=5, t=3 → "ryjl3…cai"
  const out = shortCanister(principalish);
  assert.equal(out, "ryjl3…cai");
  // Must be the U+2026 glyph, not three dots.
  assert.ok(out.includes("…"));
  assert.ok(!out.includes("..."));
});

test("ellipsis is exactly one character (not three dots)", () => {
  const out = shortCanister("aaaaaaaaaaaaaaaaaa"); // 18 a's
  // head(5) + 1-char ellipsis + tail(3) = 9 chars
  assert.equal(out.length, 9);
  assert.equal(out, "aaaaa…aaa");
});

// ------------------------------------------------------------------
// Custom h/t overrides.
// ------------------------------------------------------------------

test("custom h/t overrides are honored", () => {
  // h=3, t=3, threshold = 7. 10-char input truncates.
  assert.equal(shortCanister("abcdefghij", 3, 3), "abc…hij");
  // h=7, t=5, threshold = 13. 20-char input truncates.
  assert.equal(
    shortCanister("abcdefghijklmnopqrst", 7, 5),
    "abcdefg…pqrst",
  );
});

test("custom h/t passthrough threshold tracks h+t+1", () => {
  // With h=2, t=2, threshold is 5. Length-5 input returns whole.
  assert.equal(shortCanister("abcde", 2, 2), "abcde");
  // Length-6 crosses — now truncate.
  assert.equal(shortCanister("abcdef", 2, 2), "ab…ef");
});

// ------------------------------------------------------------------
// Edge cases.
// ------------------------------------------------------------------

test("all-same-char long id still renders the classic pattern", () => {
  // Shouldn't treat same-chars specially (no dedupe, no short-circuit).
  assert.equal(shortCanister("xxxxxxxxxxxxxxxxxxxx"), "xxxxx…xxx");
});

test("exact-threshold length is the PASSTHROUGH side, not truncate", () => {
  // Defaults: h+t+1 = 9. Length 9 = passthrough. This is the branch
  // most likely to get "fixed" to `< h + t + 1` by someone reading
  // the condition as "drop the equality for consistency" — which
  // would break a legitimate passthrough case.
  assert.equal(shortCanister("abcdefghi"), "abcdefghi");
});

test("head/tail of 0 hits a JS slice(-0) gotcha — documented", () => {
  // h=0, t=0, threshold=1. Empty/single-char passthrough is fine.
  // But `id.slice(-0)` returns the whole string (because -0 === 0
  // in JS, and slice(0) is the whole string), so a truncate call
  // with t=0 produces `ellipsis + whole-id` rather than just the
  // ellipsis. Not a bug in the helper — it's a JS slice quirk —
  // but worth pinning so a future defaults change to (0, 0)
  // doesn't ship a confusing output. Don't call with t=0.
  assert.equal(shortCanister("", 0, 0), "");
  assert.equal(shortCanister("a", 0, 0), "a");
  assert.equal(shortCanister("abc", 0, 0), "…abc"); // not "…" — slice(-0) === slice(0)
});
