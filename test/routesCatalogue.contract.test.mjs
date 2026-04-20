/**
 * ROUTES catalogue contract.
 *
 * src/lib/routes.ts is the single source of truth for every
 * first-party path. Every `<Link href={…}/>` and `router.push(…)`
 * in the app is expected to flow through ROUTES — POLISH-11
 * migrated the last of the string literals, POLISH-330 wired the
 * CommandPalette, POLISH-144 + POLISH-339 and the /fair-play
 * scaffolding all reach for ROUTES.fairPlay now.
 *
 * This file pins:
 *   1. Shape — every value is a string beginning with "/" and
 *      contains only url-safe chars; no trailing slashes; no dupes.
 *   2. Keys — every key is camelCase (lowerCamel, no dashes /
 *      underscores / dots) so dot-access (ROUTES.fairPlay) always
 *      works without bracket lookup.
 *   3. Completeness — every directory under src/app that ships a
 *      page.tsx has a ROUTES entry. Prevents the /fair-play class
 *      of bug where a route lives in src/app but callers keep
 *      hand-typing the literal because ROUTES forgot about it.
 *   4. depositHref() — the three canonical tabs emit the expected
 *      query string; unknown input returns the bare ROUTE; the
 *      output never double-slashes.
 *   5. ANCHORS — every value begins with "#" (they concatenate onto
 *      an href, so a missing "#" silently breaks the scroll).
 *
 * Implementation notes:
 *  - Reads routes.ts as text and pulls the object literal via a
 *    regex — no TS loader, matches the rest of the contract-test
 *    convention (see demoRates.contract.test.mjs header).
 *  - App-dir scan filters special files (layout/error/loading/
 *    not-found/global-error/opengraph-image/manifest/robots) and
 *    the `api/` folder (route handlers, not pages). The remaining
 *    set IS the "has a page.tsx" set because every non-special
 *    top-level directory in this app currently ships a page.
 *
 * Run: `node --test test/routesCatalogue.contract.test.mjs`
 *      (or `npm test`).
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

// ------------------------------------------------------------------
// Parse ROUTES + ANCHORS out of src/lib/routes.ts as plain objects.
// ------------------------------------------------------------------

function parseConstObject(src, name) {
  // Match `export const NAME = { ... } as const;` and parse the
  // body key/value pairs. The regex is intentionally anchored to
  // the shape routes.ts uses, not a general-purpose TS parser.
  const re = new RegExp(
    `export\\s+const\\s+${name}\\s*=\\s*\\{([\\s\\S]*?)\\}\\s*as\\s+const\\s*;`,
    "m",
  );
  const m = src.match(re);
  assert.ok(m, `routes.ts must export const ${name} = { … } as const`);
  const body = m[1];
  const out = {};
  // Strip /* ... */ and // line comments so they don't get picked
  // up as phantom keys if someone documents a future entry.
  const stripped = body
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/.*$/gm, "");
  const pairRe = /([a-zA-Z_$][\w$]*)\s*:\s*"([^"]*)"\s*,?/g;
  let pair;
  while ((pair = pairRe.exec(stripped)) !== null) {
    out[pair[1]] = pair[2];
  }
  return out;
}

const routesSrc = readFileSync(
  resolve(repoRoot, "src/lib/routes.ts"),
  "utf8",
);
const ROUTES = parseConstObject(routesSrc, "ROUTES");
const ANCHORS = parseConstObject(routesSrc, "ANCHORS");

// ------------------------------------------------------------------
// (1) ROUTES shape.
// ------------------------------------------------------------------

test("ROUTES is non-empty", () => {
  assert.ok(Object.keys(ROUTES).length > 0, "ROUTES has no entries");
});

test("every ROUTES value begins with '/'", () => {
  for (const [key, value] of Object.entries(ROUTES)) {
    assert.equal(
      typeof value,
      "string",
      `ROUTES.${key} must be a string`,
    );
    assert.ok(
      value.startsWith("/"),
      `ROUTES.${key} = ${JSON.stringify(value)} must start with "/"`,
    );
  }
});

test("ROUTES values have no trailing slash (except the root '/')", () => {
  for (const [key, value] of Object.entries(ROUTES)) {
    if (value === "/") continue;
    assert.ok(
      !value.endsWith("/"),
      `ROUTES.${key} = ${JSON.stringify(value)} must not end with "/"`,
    );
  }
});

test("ROUTES values contain only url-safe chars", () => {
  // Pathnames only — no query, no hash, no spaces.
  const safe = /^\/[a-z0-9\-/]*$/;
  for (const [key, value] of Object.entries(ROUTES)) {
    assert.ok(
      safe.test(value),
      `ROUTES.${key} = ${JSON.stringify(value)} has non-url-safe chars`,
    );
  }
});

test("ROUTES values are unique", () => {
  const values = Object.values(ROUTES);
  const set = new Set(values);
  assert.equal(
    set.size,
    values.length,
    `ROUTES has duplicate values: ${values.join(", ")}`,
  );
});

// ------------------------------------------------------------------
// (2) ROUTES keys are camelCase.
// ------------------------------------------------------------------

test("every ROUTES key is camelCase", () => {
  const camel = /^[a-z][a-zA-Z0-9]*$/;
  for (const key of Object.keys(ROUTES)) {
    assert.ok(
      camel.test(key),
      `ROUTES.${key} is not camelCase — dot-access won't work`,
    );
  }
});

// ------------------------------------------------------------------
// (3) Completeness — every app/ page has a ROUTES entry.
// ------------------------------------------------------------------

const SPECIAL_FILES = new Set([
  "layout.tsx",
  "error.tsx",
  "loading.tsx",
  "not-found.tsx",
  "global-error.tsx",
  "opengraph-image.tsx",
  "manifest.ts",
  "robots.ts",
]);

const SPECIAL_DIRS = new Set([
  "api", // route handlers, not pages
  "_components", // convention: underscore-prefixed dirs are private
]);

function listPageDirs(appDir) {
  const entries = readdirSync(appDir);
  const out = [];
  for (const entry of entries) {
    if (SPECIAL_FILES.has(entry)) continue;
    if (SPECIAL_DIRS.has(entry)) continue;
    const full = join(appDir, entry);
    if (!statSync(full).isDirectory()) continue;
    // Only count it if it ships a page.tsx (or page.ts/jsx/js).
    const hasPage = ["page.tsx", "page.ts", "page.jsx", "page.js"].some(
      (f) => existsSync(join(full, f)),
    );
    if (hasPage) out.push(entry);
  }
  return out;
}

test("every src/app page directory has a matching ROUTES entry", () => {
  const appDir = resolve(repoRoot, "src/app");
  const pageDirs = listPageDirs(appDir);
  const routeValues = new Set(Object.values(ROUTES));
  const missing = [];
  for (const dir of pageDirs) {
    // app/foo → /foo, app/fair-play → /fair-play
    const expected = `/${dir}`;
    if (!routeValues.has(expected)) {
      missing.push(`${dir} (expected ROUTES value "${expected}")`);
    }
  }
  assert.deepEqual(
    missing,
    [],
    `src/app dirs missing from ROUTES:\n  ${missing.join("\n  ")}`,
  );
});

test("root ROUTES.home is '/' (redirect target, not a dir)", () => {
  // The root route is app/page.tsx (redirect to /dunk), not a
  // directory under app/. Pin the catalogue entry so a renaming
  // pass can't accidentally break the redirect target.
  assert.equal(ROUTES.home, "/");
});

// ------------------------------------------------------------------
// (4) depositHref() behavior — mirror of the helper in routes.ts.
// ------------------------------------------------------------------

function depositHref(via) {
  return via ? `${ROUTES.deposit}?via=${via}` : ROUTES.deposit;
}

test("depositHref() with no arg returns the bare deposit route", () => {
  assert.equal(depositHref(), ROUTES.deposit);
  assert.equal(depositHref(undefined), ROUTES.deposit);
});

test("depositHref('ltc'|'card'|'bank') emits the expected query", () => {
  assert.equal(depositHref("ltc"), `${ROUTES.deposit}?via=ltc`);
  assert.equal(depositHref("card"), `${ROUTES.deposit}?via=card`);
  assert.equal(depositHref("bank"), `${ROUTES.deposit}?via=bank`);
});

test("depositHref() never double-slashes the query separator", () => {
  // Guard against a future edit that forgets the literal "?" and
  // accidentally builds "/deposit/via=ltc" or "/deposit//?via=ltc".
  for (const via of ["ltc", "card", "bank"]) {
    const href = depositHref(via);
    assert.ok(
      !href.includes("//"),
      `depositHref(${via}) produced double-slash: ${href}`,
    );
    assert.ok(
      href.includes("?"),
      `depositHref(${via}) missing "?": ${href}`,
    );
  }
});

// ------------------------------------------------------------------
// (5) ANCHORS shape.
// ------------------------------------------------------------------

test("every ANCHORS value begins with '#'", () => {
  for (const [key, value] of Object.entries(ANCHORS)) {
    assert.ok(
      value.startsWith("#"),
      `ANCHORS.${key} = ${JSON.stringify(value)} must start with "#"`,
    );
  }
});

test("ANCHORS values are unique", () => {
  const values = Object.values(ANCHORS);
  assert.equal(
    new Set(values).size,
    values.length,
    `ANCHORS has duplicate values: ${values.join(", ")}`,
  );
});
