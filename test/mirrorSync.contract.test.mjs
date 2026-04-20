/**
 * Mirror-sync guard.
 *
 * The node:test contract files ship a "mirror the module" block near
 * the top (e.g. the BASE58_RE regex copy in ltc.contract.test.mjs,
 * the DEMO_USD_PER_LWP literal in demoRates.contract.test.mjs). The
 * convention keeps the tests dependency-free — no TS loader, no
 * esbuild — at the price of a silent-drift risk: a well-intentioned
 * edit to the source can leave the mirror stale, and the test still
 * passes because it's testing the frozen copy.
 *
 * This file reads the source modules as text, extracts the exact
 * tokens the mirrors claim, and compares them. It's intentionally
 * narrow: only constants + regex literals that other contract tests
 * already lean on. Function bodies stay un-checked (matching full
 * TS source against a mirrored JS function would need a parser, and
 * the other contract tests already exercise the behavior by example).
 *
 * When this file fails, the fix is always: edit the mirror in the
 * contract test to match the source, not the other way around.
 *
 * POLISH-263 — drift-guard for the mirror convention. Ticket asked
 * to add the check to txIdDisplay.contract specifically, but that
 * file doesn't mirror a helper (POLISH-211 audit: there is no
 * shortenTxId in src/). So the drift concern is real, but the
 * right home is this cross-cutting file, not the txIdDisplay file.
 *
 * Run: `node --test test/mirrorSync.contract.test.mjs` (or
 * `npm test` which picks it up via the default glob).
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

function readSrc(relPath) {
  return readFileSync(resolve(repoRoot, relPath), "utf8");
}

// Shared regex utility: pull the right-hand side of a `const NAME = …;`
// declaration out of a source string. Returns the matched text
// trimmed, or null if not found. Uses a non-greedy match up to `;`
// so multiline declarations fit.
function extractConstRhs(src, name) {
  const re = new RegExp(
    `(?:export\\s+)?const\\s+${name}\\s*(?::[^=]+)?=\\s*([\\s\\S]*?);`,
    "m",
  );
  const m = src.match(re);
  return m ? m[1].trim() : null;
}

// ------------------------------------------------------------------
// src/lib/ltc.ts ↔ test/ltc.contract.test.mjs
// ------------------------------------------------------------------

test("ltc.ts BASE58_RE matches the contract-test mirror", () => {
  const src = readSrc("src/lib/ltc.ts");
  const mirror = readSrc("test/ltc.contract.test.mjs");

  const srcRhs = extractConstRhs(src, "BASE58_RE");
  const mirrorRhs = extractConstRhs(mirror, "BASE58_RE");

  assert.ok(srcRhs, "src/lib/ltc.ts must declare const BASE58_RE");
  assert.ok(mirrorRhs, "ltc.contract.test.mjs must mirror BASE58_RE");
  assert.equal(
    mirrorRhs,
    srcRhs,
    "BASE58_RE drift: update test/ltc.contract.test.mjs mirror to match src/lib/ltc.ts",
  );
});

test("ltc.ts BECH32_DATA_RE matches the contract-test mirror", () => {
  const src = readSrc("src/lib/ltc.ts");
  const mirror = readSrc("test/ltc.contract.test.mjs");

  const srcRhs = extractConstRhs(src, "BECH32_DATA_RE");
  const mirrorRhs = extractConstRhs(mirror, "BECH32_DATA_RE");

  assert.ok(srcRhs, "src/lib/ltc.ts must declare const BECH32_DATA_RE");
  assert.ok(mirrorRhs, "ltc.contract.test.mjs must mirror BECH32_DATA_RE");
  assert.equal(
    mirrorRhs,
    srcRhs,
    "BECH32_DATA_RE drift: update test/ltc.contract.test.mjs mirror to match src/lib/ltc.ts",
  );
});

// ------------------------------------------------------------------
// src/lib/demoRates.ts ↔ test/demoRates.contract.test.mjs
// ------------------------------------------------------------------

test("demoRates.ts DEMO_USD_PER_LWP matches the contract-test mirror", () => {
  const src = readSrc("src/lib/demoRates.ts");
  const mirror = readSrc("test/demoRates.contract.test.mjs");

  const srcRhs = extractConstRhs(src, "DEMO_USD_PER_LWP");
  const mirrorRhs = extractConstRhs(mirror, "DEMO_USD_PER_LWP");

  assert.ok(srcRhs, "src/lib/demoRates.ts must declare DEMO_USD_PER_LWP");
  assert.ok(mirrorRhs, "demoRates.contract.test.mjs must mirror it");
  assert.equal(
    mirrorRhs,
    srcRhs,
    "DEMO_USD_PER_LWP drift: update test/demoRates.contract.test.mjs mirror",
  );
});

test("demoRates.ts LWP_PER_LTC matches the contract-test mirror", () => {
  const src = readSrc("src/lib/demoRates.ts");
  const mirror = readSrc("test/demoRates.contract.test.mjs");

  const srcRhs = extractConstRhs(src, "LWP_PER_LTC");
  const mirrorRhs = extractConstRhs(mirror, "LWP_PER_LTC");

  assert.ok(srcRhs, "src/lib/demoRates.ts must declare LWP_PER_LTC");
  assert.ok(mirrorRhs, "demoRates.contract.test.mjs must mirror it");
  assert.equal(
    mirrorRhs,
    srcRhs,
    "LWP_PER_LTC drift: update test/demoRates.contract.test.mjs mirror",
  );
});

// ------------------------------------------------------------------
// src/lib/principal.ts ↔ test/principal.contract.test.mjs
// ------------------------------------------------------------------
//
// principal.contract.test.mjs mirrors shortenPrincipal() and the two
// DEFAULT_HEAD / DEFAULT_TAIL literals it leans on. A silent change
// to the source defaults (e.g. bumping head from 10 to 12 to fit a
// longer principal display) would leave the mirror stale and every
// existing behavioral assertion would keep passing against the old
// values — the exact failure mode POLISH-263 set up this file to
// catch. Guard both constants here.

test("principal.ts DEFAULT_HEAD matches the contract-test mirror", () => {
  const src = readSrc("src/lib/principal.ts");
  const mirror = readSrc("test/principal.contract.test.mjs");

  const srcRhs = extractConstRhs(src, "DEFAULT_HEAD");
  const mirrorRhs = extractConstRhs(mirror, "DEFAULT_HEAD");

  assert.ok(srcRhs, "src/lib/principal.ts must declare const DEFAULT_HEAD");
  assert.ok(mirrorRhs, "principal.contract.test.mjs must mirror DEFAULT_HEAD");
  assert.equal(
    mirrorRhs,
    srcRhs,
    "DEFAULT_HEAD drift: update test/principal.contract.test.mjs mirror to match src/lib/principal.ts",
  );
});

test("principal.ts DEFAULT_TAIL matches the contract-test mirror", () => {
  const src = readSrc("src/lib/principal.ts");
  const mirror = readSrc("test/principal.contract.test.mjs");

  const srcRhs = extractConstRhs(src, "DEFAULT_TAIL");
  const mirrorRhs = extractConstRhs(mirror, "DEFAULT_TAIL");

  assert.ok(srcRhs, "src/lib/principal.ts must declare const DEFAULT_TAIL");
  assert.ok(mirrorRhs, "principal.contract.test.mjs must mirror DEFAULT_TAIL");
  assert.equal(
    mirrorRhs,
    srcRhs,
    "DEFAULT_TAIL drift: update test/principal.contract.test.mjs mirror to match src/lib/principal.ts",
  );
});

// The shortenPrincipal function body itself is mirrored line-for-line
// in the contract test. A full-source equality check would be too
// brittle (whitespace / type annotations in TS vs JS diverge by
// design), but we can at least assert that every load-bearing token
// the mirror relies on still exists in the source. If a refactor
// renames `tailSlice`, drops the `!principal` guard, or collapses
// `principal.slice(-tail)` into something else, the mirror's
// behavior will diverge from production even if the constants match.
// Token-level guard catches the four anchors that define the
// function's shape without coupling to formatting.

test("shortenPrincipal source body still contains the load-bearing tokens the mirror assumes", () => {
  const src = readSrc("src/lib/principal.ts");
  // Four anchors, each load-bearing for a distinct contract clause:
  //   !principal              → null/empty guard returns ""
  //   head + tail + 1         → threshold check (len ≤ head+tail+1 = no shorten)
  //   tail === 0              → the slice(-0) footgun guard
  //   principal.slice(-tail)  → the actual tail extraction
  // If any of these disappear, the mirror's behavioral tests keep
  // passing but the live function no longer matches. Token probe
  // only — not a full parse; whitespace / type annotations are free
  // to drift.
  for (const anchor of [
    "!principal",
    "head + tail + 1",
    "tail === 0",
    "principal.slice(-tail)",
  ]) {
    assert.ok(
      src.includes(anchor),
      `shortenPrincipal token "${anchor}" missing from src/lib/principal.ts — the mirror in test/principal.contract.test.mjs assumes this logic. If the refactor is intentional, update the mirror in lockstep.`,
    );
  }
});

// ------------------------------------------------------------------
// Source-shape assertions — catch accidental deletes of the mirrored
// identifier. If someone renames DEMO_USD_PER_LWP → DEMO_USD_RATE in
// source, the `extractConstRhs` call above returns null and the test
// fails with "must declare …" rather than a silent equality pass.
// ------------------------------------------------------------------

test("every mirrored identifier still exists in its source module", () => {
  const pairs = [
    { src: "src/lib/ltc.ts", name: "BASE58_RE" },
    { src: "src/lib/ltc.ts", name: "BECH32_DATA_RE" },
    { src: "src/lib/demoRates.ts", name: "DEMO_USD_PER_LWP" },
    { src: "src/lib/demoRates.ts", name: "LWP_PER_LTC" },
    { src: "src/lib/principal.ts", name: "DEFAULT_HEAD" },
    { src: "src/lib/principal.ts", name: "DEFAULT_TAIL" },
  ];
  for (const { src, name } of pairs) {
    const body = readSrc(src);
    assert.ok(
      extractConstRhs(body, name),
      `expected ${name} to still be declared in ${src}`,
    );
  }
});
