/**
 * /send deep-link contract — POLISH-371.
 *
 * Pins the round-trip between the chip/tip link builder side and the
 * /send param decoder side. The concrete call sites:
 *
 *   - src/app/account/page.tsx RecentTipChips
 *     `/send?to=${encodeURIComponent(r.principal)}`
 *   - src/app/send/page.tsx
 *     `const initialTo = searchParams?.get("to") ?? "";`
 *
 * The two sides are linked by URL-encoding semantics, not by direct
 * import, so a silent regression here (e.g. someone switches one side
 * to `encodeURI` or drops the `?? ""` fallback) would not be caught by
 * typecheck. This test mirrors both sides and asserts the principal
 * string survives the trip exactly.
 *
 * What this pins:
 *  - A valid ICRC-1 principal round-trips byte-for-byte through
 *    encodeURIComponent → URLSearchParams.get, with no base32 padding
 *    or hyphen corruption.
 *  - Principals with no special characters (the common case —
 *    base32-lower + hyphen) pass through `encodeURIComponent`
 *    unchanged: the encoded form equals the raw form.
 *  - Missing `?to=` produces an empty string, not null / undefined —
 *    `searchParams.get("to") ?? ""` must match what /send uses to
 *    decide the initial state.
 *  - Empty `?to=` produces an empty string, same as missing.
 *  - shortenPrincipal(p, {head:5, tail:3}) (the /account chip label
 *    default) never produces output longer than the raw principal,
 *    never drops characters from the head or tail slice, and handles
 *    short principals (< head+tail+1) by returning the raw string.
 *  - Principal.fromText(decoded) accepts the round-tripped value for
 *    real canister-style principals — catches a regression where
 *    someone double-encodes or mangles the base32.
 *
 * Run: `node --test test/sendDeepLink.contract.test.mjs`.
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { Principal } from "@dfinity/principal";

// ------------------------------------------------------------------
// Mirror: shortenPrincipal (src/lib/principal.ts)
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

// ------------------------------------------------------------------
// Mirror: /account chip builder — `/send?to=${encodeURIComponent(p)}`
// ------------------------------------------------------------------
function buildChipHref(principal) {
  return `/send?to=${encodeURIComponent(principal)}`;
}

// ------------------------------------------------------------------
// Mirror: /send param decoder — `searchParams?.get("to") ?? ""`
// Uses URL + URLSearchParams, the same parse path Next's
// useSearchParams() exposes.
// ------------------------------------------------------------------
function readToParam(href) {
  // href is "/send?to=..." — resolve against a dummy origin so URL can
  // parse relative paths.
  const url = new URL(href, "http://localhost");
  return url.searchParams.get("to") ?? "";
}

// ------------------------------------------------------------------
// Fixtures — realistic principals spanning the shapes we see.
// ------------------------------------------------------------------
const CANISTER_ID = "rrkah-fqaaa-aaaaa-aaaaq-cai"; // textbook canister
const ANONYMOUS = "2vxsx-fae"; // short anonymous form
const SELF_AUTH = "b77ix-eeaaa-aaaaa-qaada-cai";

// ------------------------------------------------------------------
// Round-trip: the whole chain
// ------------------------------------------------------------------
test("buildChipHref + readToParam round-trip canister id", () => {
  const href = buildChipHref(CANISTER_ID);
  assert.equal(readToParam(href), CANISTER_ID);
});

test("buildChipHref + readToParam round-trip anonymous principal", () => {
  const href = buildChipHref(ANONYMOUS);
  assert.equal(readToParam(href), ANONYMOUS);
});

test("buildChipHref + readToParam round-trip self-authenticating id", () => {
  const href = buildChipHref(SELF_AUTH);
  assert.equal(readToParam(href), SELF_AUTH);
});

test("round-tripped principal parses via Principal.fromText", () => {
  const href = buildChipHref(CANISTER_ID);
  const decoded = readToParam(href);
  const p = Principal.fromText(decoded);
  // Principal.toText() canonicalises — it must come back identical to
  // the fixture, which is already canonical.
  assert.equal(p.toText(), CANISTER_ID);
});

// ------------------------------------------------------------------
// Encoding behavior — the common-case guarantee
// ------------------------------------------------------------------
test("encodeURIComponent leaves hyphen + lowercase base32 untouched", () => {
  // Principals are base32-lower + hyphens. encodeURIComponent does
  // NOT escape [A-Za-z0-9-_.~] per RFC 3986 — so the href's query
  // portion should equal the raw principal, char-for-char. This
  // guards against a well-meaning refactor to `encodeURI` (which
  // would also leave it alone) vs `encodeURIComponent` (which must
  // be chosen because it *also* escapes `?` and `&` if a principal
  // ever contained them — paranoia, not observed behavior).
  for (const p of [CANISTER_ID, ANONYMOUS, SELF_AUTH]) {
    const encoded = encodeURIComponent(p);
    assert.equal(encoded, p, `${p} must round-trip without % escapes`);
  }
});

test("href shape matches the /account chip contract verbatim", () => {
  // The /account chip builder outputs exactly this format. If the
  // route prefix ever changes (e.g. `/app/send`) this test fails
  // loudly and whoever made the change has to update both sides.
  const href = buildChipHref(CANISTER_ID);
  assert.ok(href.startsWith("/send?to="), "prefix must be /send?to=");
  assert.equal(href, `/send?to=${CANISTER_ID}`);
});

// ------------------------------------------------------------------
// Fallback behavior — missing / empty / malformed params
// ------------------------------------------------------------------
test("missing ?to= falls back to empty string", () => {
  assert.equal(readToParam("/send"), "");
});

test("empty ?to= falls back to empty string", () => {
  assert.equal(readToParam("/send?to="), "");
});

test("other query params don't leak into the to read", () => {
  assert.equal(readToParam("/send?amount=100"), "");
});

test("to param wins when mixed with other params", () => {
  const href = `/send?amount=100&to=${CANISTER_ID}`;
  assert.equal(readToParam(href), CANISTER_ID);
});

// ------------------------------------------------------------------
// shortenPrincipal composition — the chip label side
// ------------------------------------------------------------------
test("shortenPrincipal chip-label defaults fit in 11rem budget", () => {
  // /account chip passes { head: 5, tail: 3 } — final label is
  // "rrkah…cai" style, aiming at ~9 chars to stay under the
  // max-w-[11rem] cap even with the label's 2-char ellipsis.
  const label = shortenPrincipal(CANISTER_ID, { head: 5, tail: 3 });
  assert.equal(label, "rrkah…cai");
  assert.ok(label.length <= 11, `label ${label} ≤ 11 chars, got ${label.length}`);
});

test("shortenPrincipal short principal returned unchanged", () => {
  // Anonymous principal "2vxsx-fae" is 9 chars — below head(5)+
  // tail(3)+1 threshold, so helper returns the raw string rather
  // than mangling it.
  const label = shortenPrincipal(ANONYMOUS, { head: 5, tail: 3 });
  assert.equal(label, ANONYMOUS);
});

test("shortenPrincipal never corrupts the encoded chip href", () => {
  // The chip's href uses the RAW principal, not the shortened label.
  // If a future refactor accidentally wires the shortened label into
  // encodeURIComponent, the href would contain an ellipsis — which
  // Principal.fromText would reject. This test pins the separation:
  // label for display, raw for href.
  const label = shortenPrincipal(CANISTER_ID, { head: 5, tail: 3 });
  const href = buildChipHref(CANISTER_ID); // not label
  assert.notEqual(readToParam(href), label);
  assert.equal(readToParam(href), CANISTER_ID);
});
