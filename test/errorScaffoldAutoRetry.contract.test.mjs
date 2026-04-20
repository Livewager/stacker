/**
 * ErrorScaffold auto-retry reduced-motion gate — contract tests.
 *
 * POLISH-306 wired a dual-gate reduced-motion suppression into the
 * auto-retry timer (src/components/ErrorScaffold.tsx). POLISH-323
 * pins the contract so a future refactor can't silently drop any
 * of the load-bearing branches.
 *
 * Mirror-the-contract pattern matching every other contract test in
 * this suite (mapTransferError, mapBuyError, shortenPrincipal): the
 * gate logic is copied into a plain JS function below and tested by
 * example. The actual React timer + setState plumbing stays
 * un-tested here (that's runtime integration territory and would
 * need jsdom); what we lock down is:
 *
 *   1. canAutoRetry() — the boolean predicate that decides whether
 *      the countdown starts at all on mount.
 *   2. initialSeconds() — what the countdown is seeded to. Must be
 *      null under reduced-motion so no timer chain ever starts.
 *   3. shouldCancelMidFlight() — the runtime predicate that fires
 *      from the effect which watches motionReduced to cancel an
 *      in-flight countdown if the pref flips true mid-retry.
 *      Explicitly does NOT re-arm if it flips back.
 *
 * These three predicates together define every observable state
 * transition in the auto-retry lifecycle that's under this
 * ticket's scope. If the refactor renames variables or reshapes
 * the effect, re-point the mirror, but the example-driven
 * assertions below must still pass.
 *
 * Run: `node --test test/errorScaffoldAutoRetry.contract.test.mjs`
 * (or `npm test`).
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";

// ------------------------------------------------------------------
// Contract mirror — keep in sync with ErrorScaffold.tsx.
// ------------------------------------------------------------------

/**
 * Does auto-retry arm on mount? Mirrors the `canAutoRetry`
 * expression in ErrorScaffold. Each conjunct is load-bearing:
 *   - autoRetrySeconds typeof number + > 0    → caller opted in
 *   - primary.onClick typeof function          → there's an action to fire
 *   - !motionReduced                          → user motion gate
 */
function canAutoRetry(autoRetrySeconds, primary, motionReduced) {
  return (
    typeof autoRetrySeconds === "number" &&
    autoRetrySeconds > 0 &&
    typeof primary?.onClick === "function" &&
    !motionReduced
  );
}

/**
 * OR-gate dual reduced-motion signal (OS or in-app).
 * Either flag is sufficient to opt out.
 *   - osReduced  : boolean | null  (null during SSR / first paint)
 *   - userReduced: boolean          (in-app pref)
 *
 * Strict-equal-to-true on osReduced is load-bearing: POLISH-306
 * chose to treat `null` as "assume motion OK" to avoid the
 * countdown flickering on/off at hydration.
 */
function motionReduced(osReduced, userReduced) {
  return osReduced === true || userReduced === true;
}

/**
 * Initial countdown seed. Mirrors the useState initializer on
 * `secondsLeft`. Must be null when auto-retry is gated off so
 * the render path never starts a timer chain.
 */
function initialSeconds(autoRetrySeconds, primary, motionReduced) {
  return canAutoRetry(autoRetrySeconds, primary, motionReduced)
    ? autoRetrySeconds
    : null;
}

/**
 * Runtime predicate: does an in-flight countdown cancel when the
 * motionReduced signal flips to true? Mirrors the effect in
 * ErrorScaffold:
 *   if (motionReduced && secondsLeft !== null) setSecondsLeft(null);
 * Returns true when the effect would fire (set null), false
 * otherwise.
 */
function shouldCancelMidFlight(motionReducedNow, secondsLeft) {
  return motionReducedNow === true && secondsLeft !== null;
}

// ------------------------------------------------------------------
// canAutoRetry — predicate arming logic
// ------------------------------------------------------------------

test("arms when all conjuncts are true (motion allowed)", () => {
  assert.equal(canAutoRetry(5, { onClick: () => {} }, false), true);
});

test("does NOT arm when motionReduced is true", () => {
  // The POLISH-306 core guarantee: reduced-motion blocks arming
  // entirely, not just suppresses the tick.
  assert.equal(canAutoRetry(5, { onClick: () => {} }, true), false);
});

test("does NOT arm when autoRetrySeconds is undefined (opt-in)", () => {
  assert.equal(canAutoRetry(undefined, { onClick: () => {} }, false), false);
});

test("does NOT arm when autoRetrySeconds is 0", () => {
  assert.equal(canAutoRetry(0, { onClick: () => {} }, false), false);
});

test("does NOT arm when autoRetrySeconds is negative", () => {
  assert.equal(canAutoRetry(-1, { onClick: () => {} }, false), false);
});

test("does NOT arm when primary.onClick is missing (href-only primary)", () => {
  // Href-based primaries point at a navigation target; auto-retry
  // has nothing to invoke. The predicate must treat this as opt-out
  // so the countdown never renders for a link CTA.
  assert.equal(canAutoRetry(5, { href: "/wallet" }, false), false);
});

test("does NOT arm when primary is undefined", () => {
  assert.equal(canAutoRetry(5, undefined, false), false);
});

test("does NOT arm when primary.onClick is a non-function value", () => {
  // Defensive: a TS refactor that accidentally widens the onClick
  // type shouldn't turn a stale value into a firing timer.
  assert.equal(canAutoRetry(5, { onClick: "oops" }, false), false);
  assert.equal(canAutoRetry(5, { onClick: null }, false), false);
});

// ------------------------------------------------------------------
// motionReduced — dual-gate OR semantics
// ------------------------------------------------------------------

test("OS true alone trips the gate", () => {
  assert.equal(motionReduced(true, false), true);
});

test("in-app pref true alone trips the gate", () => {
  assert.equal(motionReduced(false, true), true);
});

test("both true → gate tripped (redundant-but-safe)", () => {
  assert.equal(motionReduced(true, true), true);
});

test("both false → gate open", () => {
  assert.equal(motionReduced(false, false), false);
});

test("OS null (SSR / pre-hydrate) is treated as motion-allowed", () => {
  // POLISH-306 chose this deliberately: if we treated null as
  // "reduced," the countdown would flicker on/off at hydration
  // which is the exact UX this flag is trying to avoid. Lock it in.
  assert.equal(motionReduced(null, false), false);
});

test("OS null + user true still trips the gate", () => {
  // The in-app pref is authoritative even when we're pre-hydrate
  // on the OS signal.
  assert.equal(motionReduced(null, true), true);
});

// ------------------------------------------------------------------
// initialSeconds — useState seed
// ------------------------------------------------------------------

test("seed equals autoRetrySeconds when armed", () => {
  assert.equal(initialSeconds(5, { onClick: () => {} }, false), 5);
});

test("seed is null when motion-reduced", () => {
  // Load-bearing: if the effect ever observes a non-null seed
  // under reduced-motion, it would fire the first tick and the
  // user sees a flash of countdown before it self-cancels.
  // Seeding null means the effect chain never starts.
  assert.equal(initialSeconds(5, { onClick: () => {} }, true), null);
});

test("seed is null when primary is href-only", () => {
  assert.equal(initialSeconds(5, { href: "/wallet" }, false), null);
});

test("seed is null when autoRetrySeconds is absent", () => {
  assert.equal(initialSeconds(undefined, { onClick: () => {} }, false), null);
});

test("seed honors whatever autoRetrySeconds the caller picked", () => {
  // POLISH-304 contract docs 5s for everything except 404. The
  // predicate doesn't hard-code 5 — it takes the caller's number
  // verbatim so per-surface tuning stays possible without changing
  // the primitive.
  assert.equal(initialSeconds(3, { onClick: () => {} }, false), 3);
  assert.equal(initialSeconds(10, { onClick: () => {} }, false), 10);
  assert.equal(initialSeconds(1, { onClick: () => {} }, false), 1);
});

// ------------------------------------------------------------------
// shouldCancelMidFlight — motion flip during countdown
// ------------------------------------------------------------------

test("cancels when motion flips true mid-countdown", () => {
  // User opens /settings, toggles reduce-motion on, countdown was
  // ticking at 3s → effect fires, sets secondsLeft = null.
  assert.equal(shouldCancelMidFlight(true, 3), true);
});

test("does not cancel when motion is off and countdown is running", () => {
  assert.equal(shouldCancelMidFlight(false, 3), false);
});

test("does not cancel when countdown is already null (no-op)", () => {
  // Countdown already stopped (user hovered to cancel, reached zero,
  // or never started). The effect's setState guard is important:
  // without the `secondsLeft !== null` check, a motion flip would
  // re-fire setState(null) on an already-null value, creating a
  // spurious render.
  assert.equal(shouldCancelMidFlight(true, null), false);
});

test("cancel does NOT re-arm when motion flips back off", () => {
  // After a cancel, secondsLeft is null. If motion then flips back
  // to false (user toggled off, OS pref changed), the effect must
  // NOT see that as "re-arm" — secondsLeft stays null. The
  // predicate encodes this by only firing when motionReducedNow
  // is true; the false→false transition returns false, no re-arm.
  assert.equal(shouldCancelMidFlight(false, null), false);
});

test("every predicate returns a boolean", () => {
  // Paranoid guard — each predicate is consumed as a truthy test
  // in production, so an accidental undefined/string return would
  // still work in the happy path and fail in edge cases.
  for (const v of [
    canAutoRetry(5, { onClick: () => {} }, false),
    canAutoRetry(5, undefined, false),
    motionReduced(null, false),
    motionReduced(true, true),
    shouldCancelMidFlight(true, 3),
    shouldCancelMidFlight(false, null),
  ]) {
    assert.equal(typeof v, "boolean");
  }
});

// ------------------------------------------------------------------
// End-to-end scenarios — the five POLISH-306 states the ticket
// names explicitly.
// ------------------------------------------------------------------

test("scenario 1: countdown fires when motion allowed", () => {
  const os = false;
  const user = false;
  const reduced = motionReduced(os, user);
  assert.equal(canAutoRetry(5, { onClick: () => {} }, reduced), true);
  assert.equal(initialSeconds(5, { onClick: () => {} }, reduced), 5);
});

test("scenario 2: countdown suppressed when OS reduced-motion matches", () => {
  const os = true;
  const user = false;
  const reduced = motionReduced(os, user);
  assert.equal(canAutoRetry(5, { onClick: () => {} }, reduced), false);
  assert.equal(initialSeconds(5, { onClick: () => {} }, reduced), null);
});

test("scenario 3: countdown suppressed when in-app pref set", () => {
  const os = false;
  const user = true;
  const reduced = motionReduced(os, user);
  assert.equal(canAutoRetry(5, { onClick: () => {} }, reduced), false);
  assert.equal(initialSeconds(5, { onClick: () => {} }, reduced), null);
});

test("scenario 4: mid-countdown pref flip cancels the timer", () => {
  // Start: both flags off, countdown seeded at 5, ticks to 3.
  let secondsLeft = 3;
  const flipToReduced = true;
  assert.equal(shouldCancelMidFlight(flipToReduced, secondsLeft), true);
  // Effect fires setSecondsLeft(null).
  secondsLeft = null;
  // Runtime now sees the cancelled state.
  assert.equal(secondsLeft, null);
});

test("scenario 5: re-enabling motion mid-retry does NOT re-arm the countdown", () => {
  // After a cancel: secondsLeft is null, motion flips back to off.
  // The effect must see this as a no-op: no predicate fires,
  // secondsLeft stays null.
  const secondsLeft = null;
  const flipBackToAllowed = false;
  assert.equal(shouldCancelMidFlight(flipBackToAllowed, secondsLeft), false);
  // initialSeconds would re-seed 5, but that only runs at mount —
  // the effect doesn't observe initialSeconds after mount, and the
  // POLISH-306 contract explicitly says "once cancelled, stays
  // cancelled for that error-boundary mount."
});
