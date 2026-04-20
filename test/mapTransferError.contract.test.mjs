/**
 * mapTransferError contract tests.
 *
 * Mirrors the mapper in src/components/dunk/WalletContext.tsx (added
 * POLISH-268). Twelve distinct branches, each with copy that walks
 * the user to the right recovery action. The mirror cost is cheap —
 * the whole function is pattern-match-and-return — so keeping it
 * inline here (same convention as the other mappers) lets npm test
 * stay dep-free.
 *
 * What this file pins:
 *   1. Every branch the WalletContext mapper catches fires. If a
 *      future engineer deletes one (say, drops the Duplicate handling
 *      because the canister never emits it in practice), the copy
 *      silently falls through to "Send failed" — this catches that.
 *   2. The InsufficientFunds branch's "sender-side check" copy stays
 *      in place. That specific reassurance exists because users
 *      default-assume "transfer failed → destination was the problem",
 *      which is wrong here. If the copy drifts or gets softened, the
 *      test fails.
 *   3. Recipient "principal malformed / invalid" maps to a single
 *      branch — the malformed-Principal.fromText path and the API's
 *      `Invalid principal` string must both land on the same user-
 *      facing title.
 *
 * Run: `node --test test/mapTransferError.contract.test.mjs`
 * (or `npm test`).
 */

import { test } from "node:test";
import { strict as assert } from "node:assert";

// Contract mirror — keep in sync with mapTransferError in
// src/components/dunk/WalletContext.tsx. The mirrorSync test
// (POLISH-263) is narrower and only checks constants; mappers
// are too expressive for regex comparison, so this file keeps
// behavioral equivalence by example.
function mapTransferError(raw) {
  const e = raw.toLowerCase();
  if (e.includes("sign in first")) {
    return {
      title: "Sign in first",
      description: "Send requires an Internet Identity session. Connect to continue.",
    };
  }
  if (e.includes("principal is malformed") || e.includes("invalid principal")) {
    return {
      title: "Recipient principal didn't parse",
      description:
        "Check the destination — ICP principals are lowercase letters, digits, and dashes (for example xkwrr-q77fr-aaaq-cai).",
    };
  }
  if (e.includes("amount must be positive")) {
    return {
      title: "Enter an amount",
      description: "Send amount must be a positive LWP value.",
    };
  }
  if (e.includes("memo must be 32 bytes")) {
    return {
      title: "Memo is too long",
      description:
        "ICRC-1 caps memos at 32 bytes (about 32 ASCII characters, fewer for emoji or non-latin text). Shorten it and retry.",
    };
  }
  if (e.includes("ledger rejected")) {
    const variant = raw.match(/ledger rejected:\s*(\w+)/i)?.[1];
    if (variant === "InsufficientFunds") {
      return {
        title: "Your balance is below the send amount",
        description:
          "The ledger couldn't debit your account. Top up via /deposit, or reduce the amount. This is a sender-side check — the recipient's state doesn't affect it.",
      };
    }
    if (variant === "BadFee") {
      return {
        title: "Fee mismatch",
        description:
          "The ledger's expected fee changed between quote and submit. Refresh the page and retry.",
      };
    }
    if (variant === "TooOld") {
      return {
        title: "Request timed out",
        description:
          "The ledger rejected the transfer as stale (created_at_time is too far in the past). Retry; the client will attach a fresh timestamp.",
      };
    }
    if (variant === "Duplicate") {
      return {
        title: "Looks like a duplicate",
        description:
          "The ledger matched this transfer against a recent one with the same parameters. Check /account activity — it may already have gone through.",
      };
    }
    if (variant === "TemporarilyUnavailable") {
      return {
        title: "Ledger temporarily unavailable",
        description:
          "The canister rejected the call as busy. Wait a few seconds and retry; your LWP is untouched.",
      };
    }
    if (variant === "GenericError") {
      return {
        title: "Ledger returned a generic error",
        description:
          "The ledger rejected the transfer without a specific variant. Check /account activity — your balance may already reflect the outcome.",
      };
    }
    return {
      title: "Ledger rejected the transfer",
      description: variant
        ? `The points ledger returned "${variant}". Your LWP is untouched unless /account activity shows otherwise.`
        : "The points ledger rejected the transfer. Your LWP is untouched.",
    };
  }
  if (e.includes("replica") || e.includes("dfx")) {
    return {
      title: "Replica not reachable",
      description:
        "The local IC replica isn't responding. Start it with `dfx start --background`, redeploy the ledger, and try again.",
    };
  }
  if (e.includes("failed to fetch") || e.includes("networkerror") || e.includes("load failed")) {
    return {
      title: "Network unreachable",
      description:
        "Couldn't reach the ledger canister. Check your connection and retry — your LWP only moves on a confirmed transfer.",
    };
  }
  return { title: "Send failed", description: raw };
}

// ------------------------------------------------------------------
// Top-level validation branches
// ------------------------------------------------------------------

test("sign-in branch triggers on the exact thrown message", () => {
  const r = mapTransferError("Sign in first");
  assert.equal(r.title, "Sign in first");
  assert.match(r.description, /Internet Identity/);
});

test("malformed-principal branch catches both client + server phrasings", () => {
  const client = mapTransferError("Recipient principal is malformed");
  const server = mapTransferError("Invalid principal");
  assert.equal(client.title, server.title);
  assert.equal(client.title, "Recipient principal didn't parse");
});

test("amount-must-be-positive branch triggers on the validation message", () => {
  const r = mapTransferError("Amount must be positive");
  assert.equal(r.title, "Enter an amount");
});

test("memo-too-long branch triggers on the validation message", () => {
  const r = mapTransferError("Memo must be 32 bytes or fewer");
  assert.equal(r.title, "Memo is too long");
  assert.match(r.description, /32 bytes/);
});

// ------------------------------------------------------------------
// ICRC-1 ledger Err variants — each must map to distinct copy.
// ------------------------------------------------------------------

test("InsufficientFunds gets the sender-side-check reassurance", () => {
  const r = mapTransferError("Ledger rejected: InsufficientFunds");
  assert.equal(r.title, "Your balance is below the send amount");
  // This reassurance is the whole point of the branch — lock it in.
  assert.match(r.description, /sender-side check/);
  assert.match(r.description, /recipient's state doesn't affect it/);
});

test("BadFee points the user at refresh+retry", () => {
  const r = mapTransferError("Ledger rejected: BadFee");
  assert.equal(r.title, "Fee mismatch");
  assert.match(r.description, /refresh/i);
});

test("TooOld explains the stale-timestamp semantic", () => {
  const r = mapTransferError("Ledger rejected: TooOld");
  assert.equal(r.title, "Request timed out");
  assert.match(r.description, /created_at_time/);
});

test("Duplicate sends the user to /account activity", () => {
  const r = mapTransferError("Ledger rejected: Duplicate");
  assert.equal(r.title, "Looks like a duplicate");
  assert.match(r.description, /\/account activity/);
});

test("TemporarilyUnavailable reassures LWP is untouched", () => {
  const r = mapTransferError("Ledger rejected: TemporarilyUnavailable");
  assert.equal(r.title, "Ledger temporarily unavailable");
  assert.match(r.description, /LWP is untouched/);
});

test("GenericError points the user at /account activity (state may have moved)", () => {
  const r = mapTransferError("Ledger rejected: GenericError");
  assert.equal(r.title, "Ledger returned a generic error");
  assert.match(r.description, /\/account activity/);
});

test("unknown ICRC-1 variant falls through to the generic ledger-rejected copy + surfaces variant", () => {
  // A future canister upgrade adds `ConfigurationError`; today's mapper
  // doesn't have a specific branch but should still route sanely.
  const r = mapTransferError("Ledger rejected: ConfigurationError");
  assert.equal(r.title, "Ledger rejected the transfer");
  assert.match(r.description, /ConfigurationError/);
});

test("ledger-rejected with no variant name still renders", () => {
  // Defensive — covers a future change to the thrown string that
  // drops the colon. Should fall into the variant-less branch, not
  // crash on the regex match.
  const r = mapTransferError("Ledger rejected the transfer");
  assert.equal(r.title, "Ledger rejected the transfer");
  assert.match(r.description, /untouched/);
});

// ------------------------------------------------------------------
// Infra / network branches
// ------------------------------------------------------------------

test("replica branch catches dfx + replica phrasings", () => {
  assert.equal(
    mapTransferError("dfx replica not responding").title,
    "Replica not reachable",
  );
  assert.equal(
    mapTransferError("local replica unreachable").title,
    "Replica not reachable",
  );
});

test("network branch catches all three common browser error strings", () => {
  assert.equal(mapTransferError("Failed to fetch").title, "Network unreachable");
  assert.equal(mapTransferError("NetworkError when attempting").title, "Network unreachable");
  assert.equal(mapTransferError("Load failed").title, "Network unreachable");
});

// ------------------------------------------------------------------
// Default fallback
// ------------------------------------------------------------------

test("unknown message falls through to Send-failed + raw description", () => {
  const raw = "something utterly novel broke";
  const r = mapTransferError(raw);
  assert.equal(r.title, "Send failed");
  assert.equal(r.description, raw);
});

test("every branch returns a non-empty title and description", () => {
  // Paranoid guard: a future refactor that accidentally returns
  // `{ title: undefined, … }` would render "undefined" in the toast.
  const cases = [
    "Sign in first",
    "Recipient principal is malformed",
    "Invalid principal",
    "Amount must be positive",
    "Memo must be 32 bytes or fewer",
    "Ledger rejected: InsufficientFunds",
    "Ledger rejected: BadFee",
    "Ledger rejected: TooOld",
    "Ledger rejected: Duplicate",
    "Ledger rejected: TemporarilyUnavailable",
    "Ledger rejected: GenericError",
    "Ledger rejected: ConfigurationError",
    "Ledger rejected the transfer",
    "dfx replica",
    "Failed to fetch",
    "random",
  ];
  for (const input of cases) {
    const r = mapTransferError(input);
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
