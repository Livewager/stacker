/**
 * mapLtcWithdrawError contract tests.
 *
 * Mirrors the mapper in src/components/dunk/WalletContext.tsx added
 * by POLISH-262. Eight distinct branches, each walking the user to
 * the right recovery action. Behavioral by-example since mappers
 * are too expressive for the mirrorSync regex approach.
 *
 * What this file pins:
 *  - Every branch fires on its real thrown message.
 *  - The oracle-queue-failed branch keeps the "LWP already
 *    debited → contact support with burn tx id" copy — that's the
 *    one branch where retry won't help, and the support-reconcile
 *    pointer is the whole reason the branch exists. If a well-
 *    intentioned refactor softens it to "try again later," users
 *    would chase the wrong fix.
 *  - Burn-rejected branches include the "your LWP is untouched"
 *    reassurance, because chain users default-assume "failed →
 *    funds stuck" from other L1s. ICRC-1 failed burns are atomic;
 *    users should know they can retry without risk.
 *  - Unknown ICRC-1 Err variants (future canister upgrades) still
 *    surface the variant name in the fallback branch rather than
 *    getting silently demoted to "Withdraw failed."
 *
 * Run: `node --test test/mapLtcWithdrawError.contract.test.mjs`
 * (or `npm test`).
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";

// Contract mirror — keep in sync with mapLtcWithdrawError in
// src/components/dunk/WalletContext.tsx.
function mapLtcWithdrawError(raw) {
  const e = raw.toLowerCase();
  if (e.includes("sign in first")) {
    return {
      title: "Sign in first",
      description: "Withdraw requires an Internet Identity session. Connect to continue.",
    };
  }
  if (e.includes("address looks wrong") || e.includes("address doesn't look valid")) {
    return {
      title: "LTC address rejected",
      description:
        "The destination address failed format checks. Double-check the paste — legacy L/M addresses, P2SH 3 addresses, and bech32 ltc1… are all supported.",
    };
  }
  if (e.includes("burn rejected")) {
    const variant = raw.match(/burn rejected:\s*(\w+)/i)?.[1];
    return {
      title: "Ledger rejected the burn",
      description: variant
        ? `The points ledger returned "${variant}". Your LWP is untouched; fix the condition and retry.`
        : "The points ledger rejected the burn call. Your LWP is untouched; retry when the condition is resolved.",
    };
  }
  if (e.includes("replica") || e.includes("dfx")) {
    return {
      title: "Replica not reachable",
      description:
        "The local IC replica isn't responding. Start it with `dfx start --background`, redeploy the ledger, and try again.",
    };
  }
  if (e.includes("invalid principal")) {
    return {
      title: "Invalid principal",
      description: "The signed-in II principal didn't parse. Try signing out and back in.",
    };
  }
  if (e.includes("demo cap")) {
    return {
      title: "Demo cap reached",
      description:
        "The demo caps each withdrawal so a typo can't drain unbounded LWP. Lower the amount and try again.",
    };
  }
  if (e.includes("amount must be")) {
    return {
      title: "Invalid amount",
      description: "Amount must be a positive whole LWP value.",
    };
  }
  if (e.includes("payout queue failed") || e.includes("broadcast")) {
    return {
      title: "Oracle couldn't queue the payout",
      description:
        "Your burn succeeded but the off-chain oracle couldn't queue the LTC send. Your LWP is already debited — contact support with the burn tx id (see /account activity) to reconcile.",
    };
  }
  if (e.includes("failed to fetch") || e.includes("networkerror") || e.includes("load failed")) {
    return {
      title: "Network unreachable",
      description:
        "Couldn't reach the withdraw endpoint. Check your connection and retry — your LWP only moves on a confirmed burn.",
    };
  }
  return { title: "Withdraw failed", description: raw };
}

// ------------------------------------------------------------------
// Pre-flight validation branches
// ------------------------------------------------------------------

test("sign-in branch triggers", () => {
  const r = mapLtcWithdrawError("Sign in first");
  assert.equal(r.title, "Sign in first");
  assert.match(r.description, /Internet Identity/);
});

test("address-looks-wrong branch catches client-side guard", () => {
  const r = mapLtcWithdrawError("LTC address looks wrong");
  assert.equal(r.title, "LTC address rejected");
  // Lists the three supported address forms so the user knows what to
  // check. Lock this in — a generic "try again" would lose the guidance.
  assert.match(r.description, /legacy L\/M/);
  assert.match(r.description, /P2SH 3/);
  assert.match(r.description, /bech32 ltc1/);
});

test("address-doesn't-look-valid branch catches server-side wording", () => {
  // /api/dunk/ltc-withdraw uses slightly different wording; both must
  // route to the same user-facing title for UX consistency.
  const r = mapLtcWithdrawError("LTC address doesn't look valid.");
  assert.equal(r.title, "LTC address rejected");
});

// ------------------------------------------------------------------
// Canister-side burn rejection — ICRC-1 Err variants
// ------------------------------------------------------------------

test("burn-rejected with a variant surfaces the variant name", () => {
  const r = mapLtcWithdrawError("Burn rejected: InsufficientFunds");
  assert.equal(r.title, "Ledger rejected the burn");
  assert.match(r.description, /InsufficientFunds/);
  // Reassurance that the user's LWP is untouched — the whole point of
  // this copy. ICRC-1 burn failures are atomic; users from other
  // chains default-assume "failed → funds stuck" which is wrong here.
  assert.match(r.description, /your LWP is untouched/i);
});

test("burn-rejected without a variant still renders reassurance", () => {
  // Defensive — covers a refactor that drops the colon before the
  // variant name. Should still land in the variant-less sub-branch
  // rather than crashing.
  const r = mapLtcWithdrawError("Burn rejected");
  assert.equal(r.title, "Ledger rejected the burn");
  assert.match(r.description, /untouched/i);
});

test("any burn-rejected variant (known or unknown) goes through the same branch", () => {
  const knownVariants = [
    "InsufficientFunds",
    "BadFee",
    "TooOld",
    "CreatedInFuture",
    "Duplicate",
    "TemporarilyUnavailable",
    "GenericError",
    // Hypothetical future variant — the mapper must still route it
    // without demoting to the default "Withdraw failed" bucket.
    "PolicyViolation",
  ];
  for (const v of knownVariants) {
    const r = mapLtcWithdrawError(`Burn rejected: ${v}`);
    assert.equal(
      r.title,
      "Ledger rejected the burn",
      `${v} should route through the burn-rejected branch`,
    );
    assert.match(r.description, new RegExp(v), `description should surface "${v}"`);
  }
});

// ------------------------------------------------------------------
// Infrastructure branches
// ------------------------------------------------------------------

test("replica branch catches both 'replica' and 'dfx' phrasings", () => {
  assert.equal(
    mapLtcWithdrawError("dfx replica not responding").title,
    "Replica not reachable",
  );
  assert.equal(
    mapLtcWithdrawError("local replica unreachable").title,
    "Replica not reachable",
  );
});

test("invalid-principal branch triggers", () => {
  const r = mapLtcWithdrawError("Invalid principal.");
  assert.equal(r.title, "Invalid principal");
  assert.match(r.description, /sign(ing)? out and back in/i);
});

test("demo-cap branch triggers", () => {
  const r = mapLtcWithdrawError("demo cap is 10000 LWP per withdrawal.");
  assert.equal(r.title, "Demo cap reached");
});

test("amount-must-be branch catches client + server phrasings", () => {
  // Client: "Amount must be positive"; server: "amount must be > 0".
  // Both must route through the same title.
  const client = mapLtcWithdrawError("Amount must be positive");
  const server = mapLtcWithdrawError("amount must be > 0.");
  assert.equal(client.title, "Invalid amount");
  assert.equal(server.title, "Invalid amount");
});

// ------------------------------------------------------------------
// The broadcast-failed branch — this is the real POLISH-262 win
// ------------------------------------------------------------------

test("oracle-queue-failed branch triggers on 'payout queue failed'", () => {
  const r = mapLtcWithdrawError("payout queue failed");
  assert.equal(r.title, "Oracle couldn't queue the payout");
  // The three load-bearing strings in this branch's copy. Any one
  // missing would drop a key user-action signal:
  //   - "already debited": the retry is NOT the fix
  //   - "burn tx id": what support needs to reconcile
  //   - "/account activity": where to find the tx id
  assert.match(r.description, /already debited/i);
  assert.match(r.description, /burn tx id/i);
  assert.match(r.description, /\/account activity/i);
});

test("oracle-queue-failed branch also triggers on 'broadcast'", () => {
  // The API throws several broadcast-related strings across its
  // failure modes ("broadcast timeout", "broadcast rejected").
  // They all land on the same branch because the user-facing action
  // is the same — their LWP is debited, support must reconcile.
  const r = mapLtcWithdrawError("broadcast timeout");
  assert.equal(r.title, "Oracle couldn't queue the payout");
});

// ------------------------------------------------------------------
// Network + default
// ------------------------------------------------------------------

test("network branch catches all three common browser error strings", () => {
  for (const msg of ["Failed to fetch", "NetworkError when attempting", "Load failed"]) {
    assert.equal(
      mapLtcWithdrawError(msg).title,
      "Network unreachable",
      `${msg} should map to Network unreachable`,
    );
  }
});

test("network branch copy calls out the atomic-burn contract", () => {
  // Reassures the user that failed network reach ≠ money moved.
  const r = mapLtcWithdrawError("Failed to fetch");
  assert.match(r.description, /only moves on a confirmed burn/i);
});

test("unknown message falls through to Withdraw-failed + raw description", () => {
  const raw = "something utterly novel broke";
  const r = mapLtcWithdrawError(raw);
  assert.equal(r.title, "Withdraw failed");
  assert.equal(r.description, raw);
});

test("every branch returns a non-empty title and description", () => {
  // Paranoid guard — if a future refactor drops a return, the test
  // catches it here rather than "undefined" in a production toast.
  const cases = [
    "Sign in first",
    "LTC address looks wrong",
    "LTC address doesn't look valid.",
    "Burn rejected: InsufficientFunds",
    "Burn rejected",
    "dfx replica",
    "Invalid principal.",
    "demo cap is 10000 LWP",
    "Amount must be positive",
    "amount must be > 0.",
    "payout queue failed",
    "broadcast timeout",
    "Failed to fetch",
    "random",
  ];
  for (const input of cases) {
    const r = mapLtcWithdrawError(input);
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
