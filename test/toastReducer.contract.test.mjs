/**
 * Toast reducer contract tests.
 *
 * POLISH-335. Toast has complex state transitions:
 *   - push (new entry)
 *   - push (collapse: same kind + title within 2s → repeatCount++)
 *   - push (error throttle: same title within 10s → silent drop)
 *   - dismiss (manual × or action or auto-TTL)
 *   - pause-on-hover (remaining-ms preservation) — runtime, not in
 *     scope of the pure-reducer mirror
 *
 * This file mirrors the *pure decision functions* that sit inside
 * WalletProvider's push() closure in src/components/dunk/Toast.tsx
 * and tests them by example, matching the pattern already used by
 * mapTransferError / mapLtcWithdrawError / mapBuyError tests.
 *
 * What this file pins:
 *
 *   1. shouldCollapse — the predicate that decides whether an
 *      incoming push merges into the most recent toast. All four
 *      conjuncts are load-bearing; drop any and the collapse
 *      contract breaks. The `same-kind` check prevents an error
 *      toast from merging into a success toast with the same
 *      title (rare but possible when error copy mirrors the happy
 *      path).
 *
 *   2. shouldThrottleError — the predicate that silently drops a
 *      repeated error toast within ERROR_THROTTLE_MS *after* the
 *      first one dismisses. This is the "re-throwing effect pumping
 *      the same error" protection — without it, a permanent replica-
 *      down state produces an uncapped error cascade. Only applies
 *      to error kinds; success/info chimes bypass.
 *
 *   3. resolveTtl — `input.ttlMs ?? 4500`. Simple but callers
 *      rely on omitting ttlMs to get the default, and a refactor
 *      that changed the fallback would silently shift TTL across
 *      every call site.
 *
 *   4. collapseMerge — the actual merge shape. Bumps repeatCount by
 *      +1 (not arbitrary), keeps the existing id (so the TTL timer
 *      + return-focus anchor stay valid), replaces description only
 *      when the new push provides one, resets createdAt so the next
 *      collapse window starts from "now" not from the original
 *      toast's birth.
 *
 *   5. throttle-map-eviction — prune-stale eviction for the
 *      recentErrors Map. Without this, the map leaks entries whose
 *      ERROR_THROTTLE_MS has long elapsed.
 *
 * Mirror-the-contract pattern: functions copied verbatim from the
 * Toast provider; test asserts behavior-by-example. React timers /
 * focus-return / pause-on-hover are runtime concerns (need jsdom
 * + fake timers) and stay un-tested here by design.
 *
 * Run: `node --test test/toastReducer.contract.test.mjs` (or
 * `npm test`).
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";

// ------------------------------------------------------------------
// Contract mirror — keep in sync with Toast.tsx WalletProvider push().
// ------------------------------------------------------------------

const COLLAPSE_WINDOW_MS = 2000;
const ERROR_THROTTLE_MS = 10_000;
const DEFAULT_TTL_MS = 4500;

/**
 * Does the incoming push merge into `last` rather than spawning a
 * new toast entry? Mirrors the predicate inside setToasts() in
 * push(). All four conjuncts are load-bearing.
 */
function shouldCollapse(last, input, now) {
  return (
    !!last &&
    last.kind === input.kind &&
    last.title === input.title &&
    now - last.createdAt < COLLAPSE_WINDOW_MS
  );
}

/**
 * Does this error push get silently dropped by the post-dismiss
 * throttle? Returns true when the same title has fired within
 * ERROR_THROTTLE_MS. Non-error kinds always return false.
 */
function shouldThrottleError(kind, title, recentErrors, now) {
  if (kind !== "error") return false;
  const last = recentErrors.get(title);
  if (last === undefined) return false;
  return now - last < ERROR_THROTTLE_MS;
}

/** TTL resolution. */
function resolveTtl(inputTtlMs) {
  return inputTtlMs ?? DEFAULT_TTL_MS;
}

/**
 * Apply the collapse merge to a matched toast entry. Returns a new
 * entry that preserves id + kind + title (caller needs id stability
 * to re-arm the TTL timer) and bumps repeatCount, replacing
 * description only when a new one is provided.
 */
function collapseMerge(existing, input, now) {
  return {
    ...existing,
    repeatCount: existing.repeatCount + 1,
    description: input.description ?? existing.description,
    createdAt: now,
  };
}

/**
 * Mutating prune — drops entries from recentErrors where
 * ERROR_THROTTLE_MS has elapsed. Matches the "for … delete" loop
 * in push(). Returns the same Map for fluency.
 */
function pruneStaleErrors(recentErrors, now) {
  for (const [title, ts] of recentErrors) {
    if (now - ts >= ERROR_THROTTLE_MS) {
      recentErrors.delete(title);
    }
  }
  return recentErrors;
}

// ------------------------------------------------------------------
// shouldCollapse — merge predicate
// ------------------------------------------------------------------

test("collapses when same kind + same title within the window", () => {
  const last = { kind: "error", title: "Network down", createdAt: 1000 };
  const input = { kind: "error", title: "Network down" };
  // 500 ms later — well within the 2s window.
  assert.equal(shouldCollapse(last, input, 1500), true);
});

test("does NOT collapse when titles differ", () => {
  // A rapid burst of distinct errors should stack, not merge —
  // each carries different recovery copy and the user needs to
  // see all of them.
  const last = { kind: "error", title: "Withdraw failed", createdAt: 1000 };
  const input = { kind: "error", title: "Send failed" };
  assert.equal(shouldCollapse(last, input, 1500), false);
});

test("does NOT collapse across kinds (error into success)", () => {
  // A success toast with the same title as a prior error must not
  // merge — they carry opposite semantics. Rare but possible
  // (retry succeeds with the same operation name).
  const last = { kind: "error", title: "Withdraw", createdAt: 1000 };
  const input = { kind: "success", title: "Withdraw" };
  assert.equal(shouldCollapse(last, input, 1500), false);
});

test("does NOT collapse once the 2s window has elapsed", () => {
  // At exactly 2000 ms the window expires — strict-less-than
  // so the boundary case does NOT collapse.
  const last = { kind: "info", title: "Copied", createdAt: 1000 };
  const input = { kind: "info", title: "Copied" };
  assert.equal(shouldCollapse(last, input, 3000), false);
  // One millisecond before the boundary still collapses.
  assert.equal(shouldCollapse(last, input, 2999), true);
});

test("does NOT collapse when there is no prior toast", () => {
  // `last` is undefined when the stack is empty; !!last guard fires.
  const input = { kind: "info", title: "Hello" };
  assert.equal(shouldCollapse(undefined, input, 1000), false);
  assert.equal(shouldCollapse(null, input, 1000), false);
});

// ------------------------------------------------------------------
// shouldThrottleError — post-dismiss re-fire protection
// ------------------------------------------------------------------

test("throttles repeated error within the 10s window", () => {
  // Same error fires 5s after the previous one cleared.
  const recent = new Map([["Replica down", 1000]]);
  assert.equal(shouldThrottleError("error", "Replica down", recent, 6000), true);
});

test("lets error through once the 10s window has elapsed", () => {
  // 10 s is inclusive of the boundary — `< ERROR_THROTTLE_MS` means
  // >= ERROR_THROTTLE_MS releases.
  const recent = new Map([["Replica down", 1000]]);
  assert.equal(shouldThrottleError("error", "Replica down", recent, 11_000), false);
  assert.equal(shouldThrottleError("error", "Replica down", recent, 11_001), false);
});

test("non-error kinds bypass the throttle even with identical titles", () => {
  // success / info / warning chimes stay snappy; only error has the
  // post-dismiss suppression.
  const recent = new Map([["Uploaded", 1000]]);
  assert.equal(shouldThrottleError("success", "Uploaded", recent, 1500), false);
  assert.equal(shouldThrottleError("info", "Uploaded", recent, 1500), false);
  assert.equal(shouldThrottleError("warning", "Uploaded", recent, 1500), false);
});

test("throttle is title-scoped, not kind-scoped", () => {
  // Two different error titles within the window both pass the
  // throttle (each has its own entry in recentErrors).
  const recent = new Map([["Withdraw failed", 1000]]);
  assert.equal(shouldThrottleError("error", "Send failed", recent, 2000), false);
  assert.equal(shouldThrottleError("error", "Withdraw failed", recent, 2000), true);
});

test("empty recentErrors lets everything through", () => {
  assert.equal(
    shouldThrottleError("error", "anything", new Map(), 9999999),
    false,
  );
});

// ------------------------------------------------------------------
// resolveTtl — default fallback
// ------------------------------------------------------------------

test("resolveTtl returns the caller value when provided", () => {
  assert.equal(resolveTtl(3000), 3000);
  assert.equal(resolveTtl(10_000), 10_000);
  // Zero is a valid "no auto-dismiss" signal, NOT the default.
  assert.equal(resolveTtl(0), 0);
});

test("resolveTtl defaults to 4500ms when ttlMs is absent", () => {
  assert.equal(resolveTtl(undefined), 4500);
});

test("resolveTtl null is coerced to default via ?? (not ||)", () => {
  // `??` treats null + undefined both as "use default." Lock this
  // in explicitly — a refactor to `||` would swallow 0 as well,
  // which would break the "0 = sticky toast" contract.
  assert.equal(resolveTtl(null), 4500);
});

// ------------------------------------------------------------------
// collapseMerge — the merge shape
// ------------------------------------------------------------------

test("collapseMerge bumps repeatCount by exactly 1", () => {
  const existing = {
    id: "abc",
    kind: "error",
    title: "Network",
    description: "old",
    repeatCount: 1,
    createdAt: 1000,
  };
  const merged = collapseMerge(existing, { kind: "error", title: "Network" }, 1500);
  assert.equal(merged.repeatCount, 2);

  // Applied successively: 2 → 3 → 4. Never jumps.
  const twice = collapseMerge(merged, { kind: "error", title: "Network" }, 1700);
  assert.equal(twice.repeatCount, 3);
});

test("collapseMerge preserves id (TTL timer + focus anchor depend on it)", () => {
  const existing = {
    id: "abc",
    kind: "error",
    title: "Network",
    description: "old",
    repeatCount: 1,
    createdAt: 1000,
  };
  const merged = collapseMerge(existing, { kind: "error", title: "Network" }, 1500);
  assert.equal(merged.id, "abc");
});

test("collapseMerge replaces description only when provided", () => {
  const existing = {
    id: "abc",
    kind: "error",
    title: "Network",
    description: "Original detail.",
    repeatCount: 1,
    createdAt: 1000,
  };
  // No description on the new push → keep the old one.
  const kept = collapseMerge(existing, { kind: "error", title: "Network" }, 1500);
  assert.equal(kept.description, "Original detail.");

  // New description provided → replace.
  const replaced = collapseMerge(
    existing,
    { kind: "error", title: "Network", description: "Fresher detail." },
    1500,
  );
  assert.equal(replaced.description, "Fresher detail.");
});

test("collapseMerge resets createdAt so the next collapse window starts fresh", () => {
  // Without this reset, 3 rapid repeats at t=0, t=1500, t=3000 would
  // stop collapsing at t=3000 because the original toast is >2s old.
  // With the reset, each collapse refreshes the window so the count
  // keeps climbing as long as repeats keep arriving within 2s of
  // the PREVIOUS one.
  const existing = { id: "abc", kind: "info", title: "x", description: "", repeatCount: 1, createdAt: 1000 };
  const merged = collapseMerge(existing, { kind: "info", title: "x" }, 2500);
  assert.equal(merged.createdAt, 2500);
});

// ------------------------------------------------------------------
// pruneStaleErrors — map-leak guard
// ------------------------------------------------------------------

test("pruneStaleErrors drops entries at or past the throttle window", () => {
  const m = new Map([
    ["old", 1000], // 11s old by now=12000 → evicted
    ["fresh", 5000], // 7s old → kept
  ]);
  pruneStaleErrors(m, 12_000);
  assert.equal(m.has("old"), false);
  assert.equal(m.has("fresh"), true);
});

test("pruneStaleErrors uses >= boundary (inclusive) to release the throttle", () => {
  // Entry at t=0, now=10000 → exactly 10_000 ms elapsed → evict.
  // Matches shouldThrottleError's `< ERROR_THROTTLE_MS` predicate:
  // the throttle releases at the same moment prune starts dropping.
  const m = new Map([["exactly", 0]]);
  pruneStaleErrors(m, 10_000);
  assert.equal(m.has("exactly"), false);
});

test("pruneStaleErrors keeps entries still inside the window", () => {
  const m = new Map([["young", 9000]]);
  pruneStaleErrors(m, 9999);
  assert.equal(m.has("young"), true);
});

test("pruneStaleErrors on an empty map is a no-op", () => {
  const m = new Map();
  pruneStaleErrors(m, 10_000);
  assert.equal(m.size, 0);
});

// ------------------------------------------------------------------
// End-to-end scenarios
// ------------------------------------------------------------------

test("scenario: rage-click produces one collapsed toast not five", () => {
  // Five identical error pushes fired within 2s of each other.
  // Start with no toasts.
  let toasts = [];
  const now = 1000;
  for (let i = 0; i < 5; i++) {
    const t = now + i * 300; // 0, 300, 600, 900, 1200
    const last = toasts[toasts.length - 1];
    const input = { kind: "error", title: "Send failed" };
    if (shouldCollapse(last, input, t)) {
      toasts = toasts.map((x) => (x.id === last.id ? collapseMerge(x, input, t) : x));
    } else {
      toasts.push({
        id: `id-${i}`,
        kind: input.kind,
        title: input.title,
        description: undefined,
        repeatCount: 1,
        createdAt: t,
      });
    }
  }
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].repeatCount, 5);
  // createdAt should reflect the last collapse, not the first push.
  assert.equal(toasts[0].createdAt, 1000 + 4 * 300);
});

test("scenario: re-throwing effect pumps error after dismiss, gets throttled", () => {
  // First error fires at t=0 and dismisses at t=4500 (default TTL).
  // A re-throwing effect immediately re-pushes at t=5000. The
  // collapse window is expired (>2s), but the error throttle
  // catches it (within 10s of the original push).
  const recent = new Map();
  recent.set("Ledger down", 0);
  // Suppressed at 5000 (5s, < 10s window).
  assert.equal(shouldThrottleError("error", "Ledger down", recent, 5000), true);
  // Passes at 10001 (just past the window).
  assert.equal(shouldThrottleError("error", "Ledger down", recent, 10_001), false);
});

test("scenario: success + info chimes stay snappy regardless of recentErrors", () => {
  // A success + info toast fire in rapid succession on a /send
  // round-trip. Even though error throttle data is accumulating,
  // these must not get suppressed — they're user-initiated
  // confirmations, not re-throws.
  const recent = new Map([
    ["Send failed", 1000],
    ["Anything", 2000],
  ]);
  assert.equal(shouldThrottleError("success", "Sent", recent, 3000), false);
  assert.equal(shouldThrottleError("info", "Copied", recent, 3000), false);
});

test("structural: every predicate returns a boolean, resolveTtl a number", () => {
  // Paranoid guard — all predicates are consumed in conditionals,
  // an accidental undefined return would still work in the happy
  // path and fail in edge cases.
  for (const v of [
    shouldCollapse(undefined, { kind: "info", title: "x" }, 1000),
    shouldCollapse({ kind: "info", title: "x", createdAt: 0 }, { kind: "info", title: "x" }, 500),
    shouldThrottleError("error", "x", new Map(), 0),
    shouldThrottleError("success", "x", new Map([["x", 0]]), 500),
  ]) {
    assert.equal(typeof v, "boolean");
  }
  assert.equal(typeof resolveTtl(undefined), "number");
  assert.equal(typeof resolveTtl(3000), "number");
});
