/**
 * ErrorScaffold catalogue contract.
 *
 * The error-boundary copy contract (POLISH-304, pinned in CONTRIBUTING)
 * fixes four per-surface decisions at each error.tsx call site:
 *
 *   - tone:      "danger" on money-touching surfaces (catch-all + /wallet),
 *                "muted"  on read-only / game routes.
 *   - secondary: the nearest sibling the user was likely heading to —
 *                NOT the marketing landing. Catch-all → /wallet,
 *                /wallet → /stacker (wallet itself crashed; get out),
 *                /account → /wallet, /stacker → /play,
 *                /fair-play → /play, 404 → /wallet.
 *   - autoRetry: autoRetrySeconds={5} on every error.tsx, NONE on 404
 *                (no retry for missing URLs).
 *   - primary:   always reset() via onClick on error.tsx; always an
 *                href (not a retry) on 404.
 *
 * This test reads each page as source text, extracts the props via
 * regex, and asserts the catalogue. It catches future drift where
 * someone "improves" /account/error.tsx by pointing secondary at
 * /play instead of /wallet — the copy contract says "nearest sibling
 * the user was likely heading to," and /wallet is that sibling for a
 * read-only account page.
 *
 * global-error.tsx is intentionally NOT covered — it's a last-resort
 * inline scaffold (no ErrorScaffold, no Tailwind) so its catalogue
 * is a separate concern. Verified separately by inspecting the file.
 *
 * Run: `node --test test/errorScaffoldCatalogue.contract.test.mjs`
 *      (or `npm test`).
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

function readSrc(rel) {
  return readFileSync(resolve(repoRoot, rel), "utf8");
}

// Pull one prop off an ErrorScaffold JSX block. We scan for
// `toneProp=` and capture whatever follows — a quoted literal for
// tone/eyebrow, a braced expression for primary/secondary, a
// braced literal for autoRetrySeconds.
function extractProp(src, prop) {
  // tone="muted", eyebrow="Stacker · error"
  const quoted = src.match(new RegExp(`${prop}="([^"]*)"`));
  if (quoted) return { kind: "string", value: quoted[1] };
  // primary={{ label: …, onClick/href: … }} — capture the inner {…}
  // We allow nested braces within the expression via a bounded scan
  // because the values we care about live within one pair of braces.
  const expr = src.match(new RegExp(`${prop}=\\{([\\s\\S]*?)\\}\\s`));
  if (expr) return { kind: "expr", value: expr[1].trim() };
  return null;
}

function extractAutoRetry(src) {
  // autoRetrySeconds={5}  or  no occurrence at all
  const m = src.match(/autoRetrySeconds=\{(\d+)\}/);
  return m ? Number(m[1]) : null;
}

// Finds the ROUTES key referenced inside a `secondary=` or `primary=`
// expression — `href: ROUTES.play` → "play", `href: ROUTES.fairPlay` →
// "fairPlay". Returns null when the expression uses onClick instead
// of href.
function routesKeyIn(exprValue) {
  const m = exprValue.match(/ROUTES\.([a-zA-Z][a-zA-Z0-9]*)/);
  return m ? m[1] : null;
}

function hasOnClick(exprValue) {
  return /onClick\s*:/.test(exprValue);
}

// ------------------------------------------------------------------
// Per-surface catalogue. The test table + shared assertion helpers.
// ------------------------------------------------------------------

const CATALOGUE = [
  {
    file: "src/app/error.tsx",
    label: "generic catch-all",
    tone: "danger",
    secondaryRoute: "wallet",
    autoRetry: 5,
    primaryIsReset: true,
  },
  {
    file: "src/app/wallet/error.tsx",
    label: "/wallet",
    tone: "danger",
    secondaryRoute: "stacker",
    autoRetry: 5,
    primaryIsReset: true,
  },
  {
    file: "src/app/account/error.tsx",
    label: "/account",
    tone: "muted",
    secondaryRoute: "wallet",
    autoRetry: 5,
    primaryIsReset: true,
  },
  {
    file: "src/app/stacker/error.tsx",
    label: "/stacker",
    tone: "muted",
    secondaryRoute: "play",
    autoRetry: 5,
    primaryIsReset: true,
  },
  {
    file: "src/app/fair-play/error.tsx",
    label: "/fair-play",
    tone: "muted",
    secondaryRoute: "play",
    autoRetry: 5,
    primaryIsReset: true,
  },
  {
    file: "src/app/not-found.tsx",
    label: "404",
    tone: "muted",
    secondaryRoute: "wallet",
    // 404 never auto-retries — missing URLs don't become valid by
    // reloading, and a ticking countdown on a "page not found" is
    // noise. Pinned here as null so a future "be consistent, add
    // autoRetry everywhere" refactor fails this test.
    autoRetry: null,
    primaryIsReset: false, // 404 primary is an href (Games hub)
  },
];

for (const entry of CATALOGUE) {
  test(`${entry.label} → tone="${entry.tone}"`, () => {
    const src = readSrc(entry.file);
    const tone = extractProp(src, "tone");
    assert.ok(tone, `${entry.file} must set tone=`);
    assert.equal(tone.kind, "string");
    assert.equal(tone.value, entry.tone);
  });

  test(`${entry.label} → secondary.href = ROUTES.${entry.secondaryRoute}`, () => {
    const src = readSrc(entry.file);
    const secondary = extractProp(src, "secondary");
    assert.ok(secondary, `${entry.file} must set secondary=`);
    assert.equal(secondary.kind, "expr");
    const key = routesKeyIn(secondary.value);
    assert.equal(
      key,
      entry.secondaryRoute,
      `${entry.file}: secondary.href should reference ROUTES.${entry.secondaryRoute}; ` +
        `saw ${key ? `ROUTES.${key}` : secondary.value}`,
    );
  });

  test(`${entry.label} → autoRetry = ${entry.autoRetry ?? "omitted"}`, () => {
    const src = readSrc(entry.file);
    assert.equal(extractAutoRetry(src), entry.autoRetry);
  });

  test(`${entry.label} → primary is ${entry.primaryIsReset ? "reset()" : "href"}`, () => {
    const src = readSrc(entry.file);
    const primary = extractProp(src, "primary");
    assert.ok(primary, `${entry.file} must set primary=`);
    assert.equal(primary.kind, "expr");
    if (entry.primaryIsReset) {
      assert.ok(
        hasOnClick(primary.value),
        `${entry.file}: primary must call reset() via onClick; saw ${primary.value}`,
      );
    } else {
      assert.ok(
        /href\s*:/.test(primary.value),
        `${entry.file}: primary must be an href; saw ${primary.value}`,
      );
    }
  });
}

// ------------------------------------------------------------------
// Cross-cutting invariants.
// ------------------------------------------------------------------

test("every ErrorScaffold call site has an eyebrow", () => {
  // The copy contract leads with eyebrow as the route-scoped label.
  // Catches a future "streamline the scaffold, drop the eyebrow"
  // refactor that would leave error pages without their surface id.
  for (const entry of CATALOGUE) {
    const src = readSrc(entry.file);
    const eyebrow = extractProp(src, "eyebrow");
    assert.ok(
      eyebrow && eyebrow.kind === "string" && eyebrow.value.length > 0,
      `${entry.file} must set a non-empty eyebrow=`,
    );
  }
});

test("tone is always one of the two allowed values", () => {
  // ErrorScaffold exposes only "muted" | "danger"; anything else
  // would typecheck-fail in TS but could slip through a .js author
  // or a typo in a future hand-edit.
  const allowed = new Set(["muted", "danger"]);
  for (const entry of CATALOGUE) {
    const src = readSrc(entry.file);
    const tone = extractProp(src, "tone");
    assert.ok(tone && allowed.has(tone.value));
  }
});

test("danger-toned boundaries are only on money-touching surfaces", () => {
  // Pinned invariant: "danger" eyebrow red is reserved for errors
  // that implicate a money-touching surface. If /account or /stacker
  // flip to danger, the user reads it as "something is wrong with
  // my money" and the actual read-only context gets lost.
  const moneyTouching = new Set(["src/app/error.tsx", "src/app/wallet/error.tsx"]);
  for (const entry of CATALOGUE) {
    const src = readSrc(entry.file);
    const tone = extractProp(src, "tone");
    if (tone.value === "danger") {
      assert.ok(
        moneyTouching.has(entry.file),
        `${entry.file}: tone="danger" is reserved for money-touching ` +
          `surfaces; this file is read-only or game-surface and should ` +
          `use tone="muted" instead`,
      );
    }
  }
});
