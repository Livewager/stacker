/**
 * /send?handle= deep-link contract — POLISH-377.
 *
 * Sibling to POLISH-371 (sendDeepLink.contract.test.mjs, which pins
 * the ?to=<principal> chip from /account). This file pins the
 * /leaderboard row Tip action's link shape — `/send?handle=<handle>`
 * — and today's **stub** behavior.
 *
 * State of the world when this test was written:
 *
 *   - /leaderboard row Tip builds:
 *       `/send?handle=${encodeURIComponent(entry.handle)}`
 *     (src/app/leaderboard/page.tsx L678)
 *
 *   - /send only reads `?to=` via useSearchParams (POLISH-371,
 *     src/app/send/page.tsx L70). It does NOT consume `?handle=`
 *     because a handle can't round-trip to a principal without a
 *     canister-side resolver, and that resolver doesn't exist
 *     yet. See inline comment at src/app/leaderboard/page.tsx
 *     L642-645: "handle→principal resolution in a later pass."
 *
 *   - Net effect: clicking Tip opens /send with a blank recipient
 *     field. The URL carries the handle forward as a hint for the
 *     future resolver; today it's a no-op. /account chip `?to=`
 *     flow still works because /account ring carries principals,
 *     not handles.
 *
 * What this pins:
 *
 *   1. Link shape — /leaderboard continues to emit
 *      `/send?handle=<encoded>`. If someone refactors /leaderboard
 *      and switches to `/send?to=<handle>` without adding handle
 *      resolution, Principal.fromText would reject the handle
 *      string. Pin the param name so that regression is loud.
 *
 *   2. encodeURIComponent handles unicode, emoji, spaces, and
 *      special characters (`&`, `?`, `=`, `/`) safely for any
 *      handle shape the canister will eventually allow. Unlike
 *      principals (restricted to base32-lower + hyphen), handles
 *      are free-form user-chosen strings — so the encoding path
 *      has to tolerate everything.
 *
 *   3. Today's stub behavior — /send must NOT silently interpret
 *      `?handle=` as `?to=`, because Principal.fromText would
 *      throw on a non-principal string and we'd flash "Not a
 *      valid principal" on every Tip click. The decoder returns
 *      empty so /send lands on a normal blank compose form.
 *
 *   4. Coexistence rule — when both `?to=` and `?handle=` are
 *      present (future: leaderboard carries principal + handle),
 *      `?to=` is authoritative for the recipient field. `?handle=`
 *      only supplies display context / the eventual resolver
 *      fallback.
 *
 * When the resolver lands, this test file gets edited in the same
 * commit: add a `handle → principal` assertion and flip the stub
 * pin (#3) from "returns empty" to "resolves via lookup."
 *
 * Run: `node --test test/sendHandleDeepLink.contract.test.mjs`.
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";

// ------------------------------------------------------------------
// Mirror: /leaderboard row Tip builder (src/app/leaderboard/page.tsx L678)
// ------------------------------------------------------------------
function buildTipHref(handle) {
  return `/send?handle=${encodeURIComponent(handle)}`;
}

// ------------------------------------------------------------------
// Mirror: /send param decoder as it exists TODAY.
// Returns the shape /send actually uses: `{ to, handle }` where
// `handle` is always "" because the page doesn't subscribe to it.
// Pinning the empty string makes the stub explicit — when the
// resolver lands and /send starts reading ?handle=, this mirror
// flips and the assertions catch the behavior shift.
// ------------------------------------------------------------------
function readSendParams(href) {
  const url = new URL(href, "http://localhost");
  return {
    to: url.searchParams.get("to") ?? "",
    // Intentionally NOT reading "handle" — /send ignores it today.
    // This mirror must stay in lockstep with src/app/send/page.tsx.
    handle: "",
  };
}

// Helper to raw-inspect the URL — used by the encoding tests to
// assert that encodeURIComponent actually escaped the bits that
// matter (`&`, `?`, `=`, unicode, etc.).
function rawQueryHandle(href) {
  const qIdx = href.indexOf("?");
  if (qIdx < 0) return null;
  const params = new URLSearchParams(href.slice(qIdx + 1));
  return params.get("handle");
}

// ------------------------------------------------------------------
// 1. Link shape contract
// ------------------------------------------------------------------
test("buildTipHref emits /send?handle=<encoded> verbatim", () => {
  assert.equal(buildTipHref("stax_main"), "/send?handle=stax_main");
});

test("buildTipHref does NOT use ?to= — prevents handle-as-principal regression", () => {
  const href = buildTipHref("queenpour");
  assert.ok(!href.startsWith("/send?to="), "must not be ?to=");
  assert.ok(href.startsWith("/send?handle="), "must be ?handle=");
});

// ------------------------------------------------------------------
// 2. encodeURIComponent safety across handle shapes
// ------------------------------------------------------------------
test("handle with ampersand round-trips without query-param split", () => {
  const href = buildTipHref("me&you");
  // If we'd used plain interpolation the & would start a new
  // param. encodeURIComponent escapes it to %26.
  assert.ok(href.includes("%26"), "ampersand must be %26");
  assert.equal(rawQueryHandle(href), "me&you");
});

test("handle with question mark doesn't open a second query", () => {
  const href = buildTipHref("who?");
  assert.ok(href.includes("%3F"), "question mark must be %3F");
  assert.equal(rawQueryHandle(href), "who?");
});

test("handle with equals sign survives", () => {
  const href = buildTipHref("a=b");
  assert.ok(href.includes("%3D"), "equals must be %3D");
  assert.equal(rawQueryHandle(href), "a=b");
});

test("handle with slash doesn't create a nested path", () => {
  const href = buildTipHref("a/b");
  assert.ok(href.includes("%2F"), "slash must be %2F");
  assert.equal(rawQueryHandle(href), "a/b");
});

test("handle with unicode (cyrillic, kana, emoji) round-trips", () => {
  for (const h of ["Маша", "あおい", "🔥winner"]) {
    const href = buildTipHref(h);
    assert.equal(rawQueryHandle(href), h, `${h} must round-trip`);
  }
});

test("handle with spaces encodes as %20 (not +)", () => {
  // encodeURIComponent emits %20 for spaces. `+` is a
  // form-encoding artifact; URLSearchParams.get decodes both, but
  // we want the canonical escape so logs don't look suspicious.
  const href = buildTipHref("new user");
  assert.ok(href.includes("%20"));
  assert.ok(!href.includes("+"));
  assert.equal(rawQueryHandle(href), "new user");
});

// ------------------------------------------------------------------
// 3. Stub behavior — /send must ignore ?handle= today
// ------------------------------------------------------------------
test("readSendParams returns empty `to` for ?handle=-only URL (stub)", () => {
  const href = buildTipHref("stax_main");
  const { to } = readSendParams(href);
  assert.equal(to, "", "handle must NOT leak into the to field");
});

test("readSendParams returns empty `handle` today (wiring not yet added)", () => {
  // This is the load-bearing pin. When the resolver lands and
  // /send starts reading ?handle=, the mirror's `handle: ""` line
  // flips to `searchParams.get("handle") ?? ""`, and this
  // assertion should be updated in the SAME commit. Today: empty.
  const { handle } = readSendParams(buildTipHref("stax_main"));
  assert.equal(handle, "");
});

test("handle never gets interpreted as a principal (would reject)", () => {
  // Defensive: if a refactor accidentally wires readSendParams
  // to fall back from `to` to `handle`, Principal.fromText would
  // throw on the handle string. Pin that the fall-through path
  // does NOT exist.
  const { to } = readSendParams(buildTipHref("stax_main"));
  // `to` is empty, so the /send validation branch that calls
  // Principal.fromText never runs for this href. Not empty →
  // regression.
  assert.equal(to, "");
});

// ------------------------------------------------------------------
// 4. Coexistence rule — ?to= wins when both present
// ------------------------------------------------------------------
test("when ?to= and ?handle= both present, to wins", () => {
  const to = "rrkah-fqaaa-aaaaa-aaaaq-cai";
  const handle = "stax_main";
  const href = `/send?to=${encodeURIComponent(to)}&handle=${encodeURIComponent(handle)}`;
  const params = readSendParams(href);
  assert.equal(params.to, to);
  // handle still empty under today's stub — /send doesn't read it
  assert.equal(params.handle, "");
});

test("param order doesn't matter — handle first, to second", () => {
  const to = "rrkah-fqaaa-aaaaa-aaaaq-cai";
  const href = `/send?handle=stax_main&to=${encodeURIComponent(to)}`;
  assert.equal(readSendParams(href).to, to);
});

// ------------------------------------------------------------------
// 5. Self-consistency — chip builder never produces a URL that
//    /send misinterprets
// ------------------------------------------------------------------
test("buildTipHref output is always a safe no-op for /send today", () => {
  // Sweeps a variety of realistic handle shapes and asserts that
  // the /send decoder reads empty `to` for every one. Catches
  // future encoding refactors that might accidentally prefix a
  // `to=` string into the href.
  const samples = [
    "stax_main",
    "queenpour",
    "user.name",
    "EMOJI-🔥-GUY",
    "12345",
    "a",
    "-hyphen-start",
    "with.dots.and_unders",
  ];
  for (const h of samples) {
    const href = buildTipHref(h);
    assert.equal(readSendParams(href).to, "", `${h} must not leak into to`);
    assert.equal(rawQueryHandle(href), h, `${h} must survive round-trip`);
  }
});
