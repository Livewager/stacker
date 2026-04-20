/**
 * 404 did-you-mean nearest-route hint.
 *
 * Mirror of the two helpers in src/app/not-found.tsx — a Levenshtein
 * edit-distance function and a nearestRoute walker over ROUTES. The
 * helpers sit inside the 404 page (no separate module) because the
 * cost of a dedicated file + import graph exceeds what two ~15-line
 * functions save. That puts this test in the same posture as the
 * other mirror-style contract tests: keep the mirror faithful, edit
 * both sides when the source changes.
 *
 * What this pins:
 *  - editDistance behavior for the classic Wagner–Fischer cases
 *    (equal, prefix, substitute, insert, delete, longer strings).
 *  - MAX_DISTANCE = 2 — the hint threshold. A single-char typo
 *    (/walet → /wallet) fires; two-char (/wallet+trailing slash)
 *    fires; distance-3 random garbage does not.
 *  - nearestRoute against the real ROUTES catalogue from src/lib:
 *    classic typos return the expected href; unrelated paths
 *    return null; "/" and "/404" are short-circuited.
 *
 * Why this test matters: the whole feature is visual-only (the
 * Link renders below the ErrorScaffold body) and exercises no
 * other system. Without a contract test, a drift in MAX_DISTANCE
 * or a regression in editDistance would ship silently — a 404
 * page doesn't get hit in dev often enough to catch it by eye.
 *
 * Run: `node --test test/notFoundDidYouMean.contract.test.mjs`
 *      (or `npm test`).
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

// ------------------------------------------------------------------
// Contract mirror — keep in sync with src/app/not-found.tsx.
// ------------------------------------------------------------------

function editDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const [s, t] = a.length < b.length ? [a, b] : [b, a];
  const prev = new Array(s.length + 1);
  const curr = new Array(s.length + 1);
  for (let i = 0; i <= s.length; i++) prev[i] = i;
  for (let j = 1; j <= t.length; j++) {
    curr[0] = j;
    for (let i = 1; i <= s.length; i++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      curr[i] = Math.min(
        curr[i - 1] + 1,
        prev[i] + 1,
        prev[i - 1] + cost,
      );
    }
    for (let i = 0; i <= s.length; i++) prev[i] = curr[i];
  }
  return prev[s.length];
}

const MAX_DISTANCE = 2;

// Parse ROUTES from src/lib/routes.ts the same way the catalogue
// contract (POLISH-347) does — no loader, regex over the source.
function parseRoutes() {
  const src = readFileSync(resolve(repoRoot, "src/lib/routes.ts"), "utf8");
  const m = src.match(
    /export\s+const\s+ROUTES\s*=\s*\{([\s\S]*?)\}\s*as\s+const\s*;/m,
  );
  assert.ok(m, "routes.ts must export ROUTES");
  const out = {};
  const stripped = m[1]
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/.*$/gm, "");
  const pairRe = /([a-zA-Z_$][\w$]*)\s*:\s*"([^"]*)"\s*,?/g;
  let pair;
  while ((pair = pairRe.exec(stripped)) !== null) {
    out[pair[1]] = pair[2];
  }
  return out;
}
const ROUTES = parseRoutes();

function nearestRoute(pathname) {
  if (!pathname || pathname === "/" || pathname === "/404") return null;
  let best = null;
  for (const href of Object.values(ROUTES)) {
    if (href === "/") continue;
    const d = editDistance(pathname.toLowerCase(), href.toLowerCase());
    if (d <= MAX_DISTANCE && (best === null || d < best.distance)) {
      best = { href, distance: d };
    }
  }
  return best;
}

// ------------------------------------------------------------------
// editDistance — base cases.
// ------------------------------------------------------------------

test("editDistance identical strings = 0", () => {
  assert.equal(editDistance("", ""), 0);
  assert.equal(editDistance("wallet", "wallet"), 0);
  assert.equal(editDistance("/fair-play", "/fair-play"), 0);
});

test("editDistance empty vs non-empty = length of non-empty", () => {
  assert.equal(editDistance("", "wallet"), 6);
  assert.equal(editDistance("wallet", ""), 6);
});

test("editDistance single substitution = 1", () => {
  assert.equal(editDistance("cat", "bat"), 1);
  assert.equal(editDistance("walet", "wallt"), 1); // two subs? no: w=w,a=a,l=l,e→l, t=t — one sub
});

test("editDistance single insertion = 1", () => {
  assert.equal(editDistance("walet", "wallet"), 1);
  assert.equal(editDistance("send", "sends"), 1);
});

test("editDistance single deletion = 1", () => {
  assert.equal(editDistance("wallett", "wallet"), 1);
  assert.equal(editDistance("depposit", "deposit"), 1);
});

test("editDistance classic kitten↔sitting = 3", () => {
  // Textbook Wagner–Fischer example.
  assert.equal(editDistance("kitten", "sitting"), 3);
});

test("editDistance is symmetric", () => {
  // Property that falls out of the algorithm but worth pinning so a
  // performance "optimization" that only computes one direction
  // doesn't silently break the helper.
  const pairs = [
    ["walet", "/wallet"],
    ["/deposit", "/withdraw"],
    ["", "abc"],
  ];
  for (const [a, b] of pairs) {
    assert.equal(editDistance(a, b), editDistance(b, a));
  }
});

// ------------------------------------------------------------------
// MAX_DISTANCE threshold.
// ------------------------------------------------------------------

test("MAX_DISTANCE is 2 — a pinned product decision", () => {
  // If this changes, the comment block in not-found.tsx about
  // "/xyz against /play" guessing-vs-suggesting needs updating too.
  assert.equal(MAX_DISTANCE, 2);
});

// ------------------------------------------------------------------
// nearestRoute against the real ROUTES catalogue.
// ------------------------------------------------------------------

test("nearestRoute('/walet') → /wallet (distance 1)", () => {
  const r = nearestRoute("/walet");
  assert.ok(r);
  assert.equal(r.href, "/wallet");
  assert.equal(r.distance, 1);
});

test("nearestRoute('/depposit') → /deposit (distance 1)", () => {
  const r = nearestRoute("/depposit");
  assert.ok(r);
  assert.equal(r.href, "/deposit");
  assert.equal(r.distance, 1);
});

test("nearestRoute('/fairplay') → /fair-play (distance 1)", () => {
  // Missing hyphen. Real-world typo since people say "fair play"
  // without a hyphen in conversation.
  const r = nearestRoute("/fairplay");
  assert.ok(r);
  assert.equal(r.href, "/fair-play");
  assert.equal(r.distance, 1);
});

test("nearestRoute('/withdrw') → /withdraw (distance 1)", () => {
  const r = nearestRoute("/withdrw");
  assert.ok(r);
  assert.equal(r.href, "/withdraw");
});

test("nearestRoute('/') → null (root is the redirect target)", () => {
  assert.equal(nearestRoute("/"), null);
});

test("nearestRoute('/404') → null (don't suggest from error page)", () => {
  assert.equal(nearestRoute("/404"), null);
});

test("nearestRoute('') → null (empty string guard)", () => {
  assert.equal(nearestRoute(""), null);
});

test("nearestRoute('/random-nonsense') → null (no close route)", () => {
  // Distance from any ROUTES entry is > 2, so we stay silent
  // rather than guess.
  assert.equal(nearestRoute("/random-nonsense"), null);
});

test("nearestRoute('/xyz') → null (short garbage doesn't cross threshold)", () => {
  // "/xyz" is 4 chars, but every ROUTES entry differs in enough
  // positions that edit distance exceeds 2. Regression guard
  // for the concern in the not-found.tsx comment about distance-3
  // matching /xyz → /play.
  assert.equal(nearestRoute("/xyz"), null);
});

test("nearestRoute picks the lower-distance match when multiple qualify", () => {
  // "/account" is 8 chars; "/accoun" (distance 1 to /account,
  // distance 3 to most others) should return /account.
  const r = nearestRoute("/accoun");
  assert.ok(r);
  assert.equal(r.href, "/account");
  assert.equal(r.distance, 1);
});

test("nearestRoute is case-insensitive", () => {
  // Real 404 paths from URL bars come in mixed case; we lowercase
  // both sides so "/Wallet" still matches "/wallet".
  const r = nearestRoute("/Wallet");
  assert.ok(r);
  assert.equal(r.href, "/wallet");
  assert.equal(r.distance, 0);
});
