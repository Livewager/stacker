/**
 * mapBuyError contract tests.
 *
 * Mirrors the mapper in src/components/dunk/WalletContext.tsx added by
 * POLISH-298. Nine distinct branches, one for each recovery path the
 * buy flow can land on. Behavioral by-example — mappers are too
 * expressive for the mirrorSync regex approach used on simpler
 * helpers.
 *
 * What this file pins:
 *  - Every branch fires on the real string the API / mutation throws.
 *  - The "ledger rejected the mint" branch carries the atomic-mint
 *    reassurance ("no LWP was credited and nothing was charged") —
 *    that's the one branch where the user's instinct "did money
 *    move?" needs a hard No. POLISH-298 put that guarantee in place;
 *    a well-intentioned softening ("try again") would quietly drop
 *    the contract and leave users chasing phantom charges.
 *  - The network branch emphasizes "mint only credits on a confirmed
 *    response" for the same reason — retrying after a failed fetch
 *    is safe and doesn't double-mint.
 *  - Unknown ICRC-1 Err variants (future canister upgrades) still
 *    surface the variant name in the fallback path rather than
 *    getting silently demoted to "Buy failed."
 *  - The rule-of-four mapper set stays distinct — no branch here
 *    accidentally mirrors the withdraw/send/deposit copy. If copy
 *    drifts identical across mappers, the CONTRIBUTING note says
 *    that's a sign to extract; until then, each route stays
 *    explicit.
 *
 * Run: `node --test test/mapBuyError.contract.test.mjs` (or `npm test`).
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";

// Contract mirror — keep in sync with mapBuyError in
// src/components/dunk/WalletContext.tsx.
function mapBuyError(raw) {
  const e = raw.toLowerCase();
  if (e.includes("sign in first")) {
    return {
      title: "Sign in first",
      description: "Buy requires an Internet Identity session. Connect to continue.",
    };
  }
  if (e.includes("enter a positive number") || e.includes("amount must be > 0")) {
    return {
      title: "Enter an amount",
      description: "Buy amount must be a positive whole LWP value.",
    };
  }
  if (e.includes("amount must be an integer")) {
    return {
      title: "Amount must be whole LWP",
      description:
        "Demo buy takes integer LWP (no fractional digits). Round to the nearest whole number.",
    };
  }
  if (e.includes("exceeds demo cap")) {
    return {
      title: "Demo cap reached",
      description:
        "The demo caps each buy so a typo can't mint unbounded LWP. Lower the amount and try again.",
    };
  }
  if (e.includes("points ledger canister not configured")) {
    return {
      title: "Ledger not configured",
      description:
        "NEXT_PUBLIC_POINTS_LEDGER_CANISTER_ID isn't set in this environment. Deploy the ledger and set the env var before retrying.",
    };
  }
  if (e.includes("invalid principal")) {
    return {
      title: "Invalid principal",
      description: "The signed-in II principal didn't parse. Try signing out and back in.",
    };
  }
  if (e.includes("mint rejected")) {
    const variant = raw.match(/mint rejected:\s*(\w+)/i)?.[1];
    return {
      title: "Ledger rejected the mint",
      description: variant
        ? `The points ledger returned "${variant}". The mint never happened; no LWP was credited and nothing was charged.`
        : "The points ledger rejected the mint call. The mint never happened; no LWP was credited.",
    };
  }
  if (e.includes("mint call failed") || e.includes("replica") || e.includes("dfx")) {
    return {
      title: "Replica not reachable",
      description:
        "The local IC replica isn't responding. Start it with `dfx start --background`, redeploy the ledger, and retry. The API's detail field has the raw error if you need it.",
    };
  }
  if (e.includes("body must be json")) {
    return {
      title: "Buy request didn't parse",
      description:
        "The client sent a malformed request body. This is almost certainly a bug — please report it with the build SHA from /settings.",
    };
  }
  if (e.includes("failed to fetch") || e.includes("networkerror") || e.includes("load failed")) {
    return {
      title: "Network unreachable",
      description:
        "Couldn't reach the buy endpoint. Check your connection and retry — the mint only credits on a confirmed response.",
    };
  }
  return { title: "Buy failed", description: raw };
}

// ------------------------------------------------------------------
// Pre-flight validation branches
// ------------------------------------------------------------------

test("sign-in branch triggers on client guard", () => {
  const r = mapBuyError("Sign in first");
  assert.equal(r.title, "Sign in first");
  assert.match(r.description, /Internet Identity/);
});

test("positive-number branch catches client phrasing", () => {
  // Client emits "Enter a positive number" before it even dispatches
  // the fetch. The branch routes to the same title as the server's
  // "amount must be > 0" phrasing so UX stays stable regardless of
  // which side rejects first.
  const r = mapBuyError("Enter a positive number");
  assert.equal(r.title, "Enter an amount");
  assert.match(r.description, /positive whole LWP/i);
});

test("positive-number branch catches server phrasing", () => {
  const r = mapBuyError("amount must be > 0.");
  assert.equal(r.title, "Enter an amount");
});

test("integer-only branch distinct from positive-number", () => {
  // "Amount must be an integer" fires when the user types 12.5 — not
  // the same recovery action as "enter an amount," and the copy
  // explicitly names "whole LWP" + "no fractional digits" so keyboard
  // users know what to change. Lock the two branches apart so a later
  // refactor doesn't collapse them into a single "Invalid amount."
  const r = mapBuyError("Amount must be an integer");
  assert.equal(r.title, "Amount must be whole LWP");
  assert.match(r.description, /no fractional digits/i);
});

test("demo-cap branch triggers on 'exceeds demo cap'", () => {
  // The API throws "N exceeds demo cap of M"; the branch matches on
  // the phrase "exceeds demo cap" so the exact limit + amount don't
  // affect routing.
  const r = mapBuyError("50000 exceeds demo cap of 10000");
  assert.equal(r.title, "Demo cap reached");
  assert.match(r.description, /can't mint unbounded LWP/i);
});

// ------------------------------------------------------------------
// Canister-side mint rejection — ICRC-1 Err variants
// ------------------------------------------------------------------

test("mint-rejected with a variant surfaces the variant name", () => {
  const r = mapBuyError("Mint rejected: InsufficientFunds");
  assert.equal(r.title, "Ledger rejected the mint");
  assert.match(r.description, /InsufficientFunds/);
  // The atomic-mint contract — the one thing the user most needs to
  // know on a failed mint. If this reassurance drops out, users will
  // assume the money moved and chase a phantom charge.
  assert.match(r.description, /no LWP was credited/i);
  assert.match(r.description, /nothing was charged/i);
});

test("mint-rejected without a variant still renders reassurance", () => {
  // Defensive — covers a refactor that drops the colon before the
  // variant name. Should still land in the variant-less sub-branch
  // rather than crashing, and still carry the "no LWP credited" line.
  const r = mapBuyError("Mint rejected");
  assert.equal(r.title, "Ledger rejected the mint");
  assert.match(r.description, /no LWP was credited/i);
});

test("any mint-rejected variant (known or unknown) routes through the same branch", () => {
  const variants = [
    "InsufficientFunds",
    "BadFee",
    "TooOld",
    "CreatedInFuture",
    "Duplicate",
    "TemporarilyUnavailable",
    "GenericError",
    // Hypothetical future variant — the mapper must still route it
    // without demoting to the default "Buy failed" bucket.
    "PolicyViolation",
  ];
  for (const v of variants) {
    const r = mapBuyError(`Mint rejected: ${v}`);
    assert.equal(
      r.title,
      "Ledger rejected the mint",
      `${v} should route through the mint-rejected branch`,
    );
    assert.match(
      r.description,
      new RegExp(v),
      `description should surface variant name "${v}"`,
    );
  }
});

// ------------------------------------------------------------------
// Infrastructure branches
// ------------------------------------------------------------------

test("replica branch catches 'replica', 'dfx', and 'mint call failed'", () => {
  // Three distinct strings the backend throws depending on which layer
  // of the IC stack failed first. All three land on the same
  // user-facing action ("start the replica") so copy stays stable.
  for (const msg of ["dfx replica not responding", "local replica down", "mint call failed"]) {
    assert.equal(
      mapBuyError(msg).title,
      "Replica not reachable",
      `${msg} should route to replica branch`,
    );
  }
});

test("ledger-not-configured branch points at the env var", () => {
  const r = mapBuyError("Points ledger canister not configured");
  assert.equal(r.title, "Ledger not configured");
  // Names the exact env var and says "deploy the ledger" — without
  // these two pieces, the user has no path forward. Lock in.
  assert.match(r.description, /NEXT_PUBLIC_POINTS_LEDGER_CANISTER_ID/);
  assert.match(r.description, /deploy the ledger/i);
});

test("invalid-principal branch suggests sign-out-sign-in", () => {
  const r = mapBuyError("Invalid principal.");
  assert.equal(r.title, "Invalid principal");
  assert.match(r.description, /sign(ing)? out and back in/i);
});

test("body-must-be-json branch points users at build SHA", () => {
  // Defensive branch — shouldn't fire in practice (we build the body
  // client-side via JSON.stringify). If it does, the copy directs the
  // user to /settings → copy diagnostics → report with build SHA.
  // That pointer is the branch's whole reason to exist; don't let it
  // collapse into a generic "Buy failed."
  const r = mapBuyError("body must be JSON");
  assert.equal(r.title, "Buy request didn't parse");
  assert.match(r.description, /build SHA/i);
});

// ------------------------------------------------------------------
// Network + default
// ------------------------------------------------------------------

test("network branch catches all three common browser error strings", () => {
  // Each browser / platform throws a different string for the same
  // underlying "couldn't reach the endpoint" failure. Chrome throws
  // "Failed to fetch"; Firefox emits "NetworkError when attempting to
  // fetch resource"; Safari surfaces "Load failed." All three must
  // route identically.
  for (const msg of ["Failed to fetch", "NetworkError when attempting", "Load failed"]) {
    assert.equal(
      mapBuyError(msg).title,
      "Network unreachable",
      `${msg} should map to Network unreachable`,
    );
  }
});

test("network branch copy calls out the atomic-mint contract", () => {
  // Same load-bearing reassurance as the mint-rejected branch, in
  // different framing: "the mint only credits on a confirmed
  // response." Retrying after a network failure is safe; without this
  // line users assume double-mint risk.
  const r = mapBuyError("Failed to fetch");
  assert.match(r.description, /only credits on a confirmed response/i);
});

test("unknown message falls through to Buy-failed + raw description", () => {
  const raw = "something utterly novel broke";
  const r = mapBuyError(raw);
  assert.equal(r.title, "Buy failed");
  // Raw message surfaces in the toast description so a curious user
  // (or someone filing a bug) can copy the unmapped string verbatim.
  assert.equal(r.description, raw);
});

// ------------------------------------------------------------------
// Structural invariants
// ------------------------------------------------------------------

test("every branch returns a non-empty title and description", () => {
  // Paranoid guard — if a future refactor drops a return, this
  // catches it here rather than "undefined" in a production toast.
  const cases = [
    "Sign in first",
    "Enter a positive number",
    "amount must be > 0",
    "Amount must be an integer",
    "50000 exceeds demo cap of 10000",
    "Points ledger canister not configured",
    "Invalid principal",
    "Mint rejected: InsufficientFunds",
    "Mint rejected",
    "mint call failed",
    "dfx replica",
    "body must be JSON",
    "Failed to fetch",
    "random",
  ];
  for (const input of cases) {
    const r = mapBuyError(input);
    assert.ok(
      typeof r.title === "string" && r.title.length > 0,
      `bad title for ${JSON.stringify(input)}: ${r.title}`,
    );
    assert.ok(
      typeof r.description === "string" && r.description.length > 0,
      `bad description for ${JSON.stringify(input)}: ${r.description}`,
    );
  }
});

test("buy-specific copy distinct from withdraw/send mappers", () => {
  // The four mappers (deposit / withdraw / send / buy) share a
  // structure but carry route-specific copy (see CONTRIBUTING's
  // rule-of-four note). If a refactor accidentally copy-pastes
  // another mapper's strings here, this test catches the drift.
  // Spot-check three unambiguously buy-side branches against their
  // expected route-specific wording.
  const cap = mapBuyError("exceeds demo cap");
  assert.match(cap.description, /mint unbounded LWP/i);
  // NOT "drain unbounded LWP" (withdraw) or "send unbounded" (send).

  const mint = mapBuyError("Mint rejected: BadFee");
  assert.match(mint.title, /mint/i);
  // NOT "Ledger rejected the burn" (withdraw) or "Ledger rejected
  // the transfer" (send).

  const net = mapBuyError("Failed to fetch");
  assert.match(net.description, /buy endpoint/i);
  // NOT "withdraw endpoint" or "transfer endpoint."
});
