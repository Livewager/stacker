/**
 * Livestream POOL + cycle contract — POLISH-389.
 *
 * Mirrors the push logic in src/components/stacker/Livestream.tsx.
 * Pure data shape + advancement invariants — no DOM, no React,
 * no framer-motion. Keeps the mirror explicit (edit POOL /
 * advanceFeed here in lockstep with Livestream.tsx) per the
 * "mirror the contract" convention used across test/*.mjs.
 *
 * What this pins:
 *   - POOL shape: every entry has {id, user, tone, body} with
 *     valid types.
 *   - POOL.tone is one of the 5 allowed toneClasses keys.
 *   - POOL ids are strictly monotonic starting at 1 — the
 *     Livestream's "initial feed uses POOL ids 1..N" assumption
 *     depends on this, and POLISH-381's lw-chat-slide gate
 *     (`id > initialIdMax`) would break if a pool row landed
 *     with id <= POOL.length after being pushed.
 *   - advanceFeed preserves length === VISIBLE after every tick.
 *   - Newest entry always lands at the end of the feed (twitch-
 *     style chat growth, matches mobile overlay + desktop column
 *     rendering which both slice from the end).
 *   - Pushed ids are strictly greater than initialIdMax
 *     (= POOL.length), so the lw-chat-slide gate lights up only
 *     for mid-session pushes, never for the initial paint.
 *   - seqRef monotonicity holds across N ticks of wraparound
 *     through the pool.
 *
 * Run: `node --test test/livestreamCycle.contract.test.mjs`.
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";

// ------------------------------------------------------------------
// Mirror: POOL (src/components/stacker/Livestream.tsx L59-72)
// ------------------------------------------------------------------
const POOL = [
  { id: 1,  user: "stax_main",   tone: "cyan",    body: "clean tower run incoming" },
  { id: 2,  user: "queenpour",   tone: "amber",   body: "nah the 12th row got me" },
  { id: 3,  user: "ftboi",       tone: "violet",  body: "ranked only cowards" },
  { id: 4,  user: "r3m",         tone: "rose",    body: "someone tip the streamer lmao" },
  { id: 5,  user: "atxdunk",     tone: "emerald", body: "that perfect streak was nuts" },
  { id: 6,  user: "lowroll",     tone: "cyan",    body: "im up 40 LWP tonight" },
  { id: 7,  user: "mimic",       tone: "amber",   body: "go fair-play tier 3 bro" },
  { id: 8,  user: "halfdecaf",   tone: "violet",  body: "seeds are public check fair play" },
  { id: 9,  user: "op_five",     tone: "rose",    body: "tap tap TAP tap 🙏" },
  { id: 10, user: "civic",       tone: "emerald", body: "the slider easing tho" },
  { id: 11, user: "dropship",    tone: "cyan",    body: "wen mobile replay" },
  { id: 12, user: "caligula",    tone: "amber",   body: "that was a perfect stack??" },
];

const VISIBLE = 5;
const ALLOWED_TONES = new Set(["cyan", "amber", "violet", "rose", "emerald"]);

// Mirror of Livestream's initial feed slice.
function initialFeed() {
  return POOL.slice(POOL.length - VISIBLE);
}

// Mirror of the advanceFeed push logic (Livestream.tsx L115-118).
// Takes prev feed + next pool index + current seqRef; returns next
// feed + updated seqRef. Matches the setFeed((prev) => ...) body
// in the setInterval callback.
function advanceFeed(prev, nextIdx, seqRef) {
  const source = POOL[nextIdx % POOL.length];
  const newSeq = seqRef + 1;
  const next = [...prev.slice(1), { ...source, id: newSeq }];
  return { feed: next, seqRef: newSeq };
}

// ------------------------------------------------------------------
// 1. POOL shape
// ------------------------------------------------------------------
test("every POOL entry has the required fields", () => {
  for (const row of POOL) {
    assert.ok(typeof row.id === "number", "id must be number");
    assert.ok(typeof row.user === "string" && row.user.length > 0, "user must be non-empty string");
    assert.ok(typeof row.tone === "string", "tone must be string");
    assert.ok(typeof row.body === "string" && row.body.length > 0, "body must be non-empty string");
  }
});

test("every POOL tone is one of the 5 toneClasses keys", () => {
  for (const row of POOL) {
    assert.ok(
      ALLOWED_TONES.has(row.tone),
      `row id=${row.id} has invalid tone "${row.tone}" — toneClasses() would fall through`,
    );
  }
});

test("POOL ids are strictly monotonic from 1", () => {
  // Load-bearing for POLISH-381's lw-chat-slide gate — the test
  // `id > initialIdMax` (= POOL.length) assumes every initial
  // feed row has id <= POOL.length. If a POOL row ever lands with
  // an out-of-order id, the gate fires on the wrong rows.
  for (let i = 0; i < POOL.length; i += 1) {
    assert.equal(POOL[i].id, i + 1, `POOL[${i}].id must be ${i + 1}`);
  }
});

test("POOL has at least VISIBLE entries so initial feed fills", () => {
  assert.ok(POOL.length >= VISIBLE, `POOL.length (${POOL.length}) must be >= VISIBLE (${VISIBLE})`);
});

// ------------------------------------------------------------------
// 2. Initial feed
// ------------------------------------------------------------------
test("initialFeed returns exactly VISIBLE entries", () => {
  assert.equal(initialFeed().length, VISIBLE);
});

test("initialFeed carries POOL ids <= POOL.length", () => {
  // Every initial row has an id from the unmodified POOL, so it
  // must land at or below POOL.length. The lw-chat-slide gate
  // filters on `id > POOL.length` — every initial row has to fail
  // that check so the animation skips them.
  const initial = initialFeed();
  for (const row of initial) {
    assert.ok(row.id <= POOL.length, `initial row id=${row.id} must be <= POOL.length (${POOL.length})`);
  }
});

test("initialFeed is the tail of POOL (newest at end)", () => {
  const initial = initialFeed();
  const expectedTail = POOL.slice(POOL.length - VISIBLE);
  assert.deepEqual(initial, expectedTail);
});

// ------------------------------------------------------------------
// 3. Advancement invariants
// ------------------------------------------------------------------
test("advanceFeed preserves length === VISIBLE", () => {
  let feed = initialFeed();
  let seq = POOL.length;
  for (let i = 0; i < 100; i += 1) {
    ({ feed, seqRef: seq } = advanceFeed(feed, i, seq));
    assert.equal(feed.length, VISIBLE, `after tick ${i} feed length drifted to ${feed.length}`);
  }
});

test("advanceFeed places newest entry at the end", () => {
  let feed = initialFeed();
  let seq = POOL.length;
  for (let i = 0; i < 20; i += 1) {
    const beforeSeq = seq;
    ({ feed, seqRef: seq } = advanceFeed(feed, i, seq));
    const newest = feed[feed.length - 1];
    assert.equal(newest.id, beforeSeq + 1, `newest entry must carry the bumped seqRef`);
  }
});

test("advanceFeed ids are strictly > POOL.length (lw-chat-slide gate)", () => {
  // POLISH-381's gate: `id > initialIdMax` where initialIdMax = POOL.length.
  // Every pushed row must pass that gate so only mid-session pushes
  // animate.
  let feed = initialFeed();
  let seq = POOL.length;
  for (let i = 0; i < 30; i += 1) {
    ({ feed, seqRef: seq } = advanceFeed(feed, i, seq));
    const newest = feed[feed.length - 1];
    assert.ok(
      newest.id > POOL.length,
      `newest row id=${newest.id} must be > POOL.length (${POOL.length})`,
    );
  }
});

test("advanceFeed seqRef is strictly monotonic across ticks", () => {
  let feed = initialFeed();
  let seq = POOL.length;
  let prev = seq;
  for (let i = 0; i < 50; i += 1) {
    ({ feed, seqRef: seq } = advanceFeed(feed, i, seq));
    assert.ok(seq > prev, `seqRef must grow (prev=${prev}, next=${seq})`);
    prev = seq;
  }
});

test("advanceFeed wraps POOL index safely past POOL.length", () => {
  // Livestream's setInterval bumps nextIdx without ever resetting,
  // so after POOL.length ticks we're reading POOL[POOL.length % POOL.length]
  // = POOL[0]. Confirm that doesn't crash and produces valid shape.
  let feed = initialFeed();
  let seq = POOL.length;
  const ticks = POOL.length * 3 + 1; // 3 full cycles + 1
  for (let i = 0; i < ticks; i += 1) {
    ({ feed, seqRef: seq } = advanceFeed(feed, i, seq));
  }
  const newest = feed[feed.length - 1];
  assert.ok(ALLOWED_TONES.has(newest.tone), `wrapped row must still have valid tone`);
  assert.equal(seq, POOL.length + ticks, `seqRef after ${ticks} ticks must equal POOL.length + ticks`);
});

test("advanceFeed drops the oldest entry each tick", () => {
  let feed = initialFeed();
  let seq = POOL.length;
  const oldest = feed[0];
  ({ feed, seqRef: seq } = advanceFeed(feed, 0, seq));
  assert.notDeepEqual(feed[0], oldest, "oldest row must shift out after one tick");
  assert.equal(feed.length, VISIBLE);
});
