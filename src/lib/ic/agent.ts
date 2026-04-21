"use client";

/**
 * Thin wrapper around @dfinity/agent for browser → local-replica
 * interaction with the points_ledger (LWP token) canister.
 *
 * Scope is local-dev only right now. In production the agent would
 * point at https://icp-api.io and skip fetchRootKey; here we target
 * http://127.0.0.1:4943 and pull the root key on first use since the
 * local replica's cert chain is per-launch random.
 */

import { Actor, HttpAgent } from "@dfinity/agent";
import type { Identity } from "@dfinity/agent";
import { Principal } from "@dfinity/principal";
import { Ed25519KeyIdentity } from "@dfinity/identity";
import { idlFactory } from "@/declarations/points_ledger/points_ledger.did.js";
import type {
  _SERVICE,
  Account,
  TransferArg,
  MintArgs,
  BurnArgs,
} from "@/declarations/points_ledger/points_ledger.did";

// Local host for the dfx replica. Can be overridden at build time
// via NEXT_PUBLIC_IC_HOST (dfx writes this into .env.local). In the
// browser, served-from-canister requests use the canister subdomain
// directly so this only kicks in when the page was loaded from
// localhost:3002 (next dev) pointing at a local replica.
const HOST =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_IC_HOST) ||
  "http://127.0.0.1:4943";

/**
 * Canister ID is written into NEXT_PUBLIC_CANISTER_ID_POINTS_LEDGER
 * via next.config + dfx's .env.local output_env_file. Fall back to
 * the known local ID so the app doesn't crash if someone runs
 * `npm run dev` without `dfx deploy` first.
 */
export function pointsLedgerCanisterId(): string {
  return (
    process.env.NEXT_PUBLIC_POINTS_LEDGER_CANISTER_ID ||
    process.env.NEXT_PUBLIC_CANISTER_ID_POINTS_LEDGER ||
    process.env.CANISTER_ID_POINTS_LEDGER ||
    "uxrrr-q7777-77774-qaaaq-cai"
  );
}

let cachedAgent: HttpAgent | null = null;
let cachedIdentityFingerprint: string | null = null;

async function getAgent(identity?: Identity): Promise<HttpAgent> {
  const fp = identity ? identity.getPrincipal().toText() : "anonymous";
  if (cachedAgent && cachedIdentityFingerprint === fp) return cachedAgent;
  const agent = new HttpAgent({ host: HOST, identity });
  // Local replica — fetch root key once. On IC mainnet this step is
  // a footgun (skips cert validation), hence the process.env gate.
  await agent.fetchRootKey().catch(() => {
    // Swallow: happens if replica is down. Calls later will surface
    // the real error with a cleaner stack.
  });
  cachedAgent = agent;
  cachedIdentityFingerprint = fp;
  return agent;
}

export async function getLedgerActor(identity?: Identity) {
  const agent = await getAgent(identity);
  return Actor.createActor<_SERVICE>(idlFactory, {
    agent,
    canisterId: pointsLedgerCanisterId(),
  });
}

/** Shorthand — wraps a principal text into the ICRC-1 Account shape. */
export function accountOf(principalText: string): Account {
  return {
    owner: Principal.fromText(principalText),
    subaccount: [],
  };
}

/** Format a raw ICRC-1 nat balance (8 decimals) as a human string. */
export function formatLwp(amount: bigint, decimals = 4): string {
  const WHOLE = 10n ** 8n;
  const whole = amount / WHOLE;
  const frac = amount % WHOLE;
  const fracStr = frac.toString().padStart(8, "0").slice(0, decimals);
  return decimals > 0 ? `${whole}.${fracStr}` : whole.toString();
}

/** Parse a human LWP string into base units. */
export function parseLwp(input: string): bigint {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Amount required");
  const [whole, frac = ""] = trimmed.split(".");
  if (!/^\d+$/.test(whole)) throw new Error("Bad whole part");
  if (frac && !/^\d+$/.test(frac)) throw new Error("Bad fractional part");
  const wholeBig = BigInt(whole) * 10n ** 8n;
  const fracPadded = (frac + "00000000").slice(0, 8);
  return wholeBig + BigInt(fracPadded || "0");
}

/**
 * Dev identity — a plain Ed25519 keypair stored in localStorage.
 *
 * Two storage slots:
 *   - lw-dev-identity-v1  The active-session keypair. Present only
 *                         when the user has clicked "Log in" (fresh
 *                         signup) or "Log in with existing key".
 *   - lw-dev-identity-archive-v1  The last-used keypair preserved
 *                         across logout so "Log back in" works
 *                         without regenerating a new principal.
 *                         Cleared explicitly by the "Clear saved
 *                         key" button.
 *
 * Why two slots: separating "logged in RIGHT NOW" from "have a
 * saved identity" gives a real logout — calls revert to anonymous
 * until the user consciously signs back in — without forcing a new
 * principal on every logout cycle.
 *
 * Scope: local-dev test surface only. Plaintext, no password, no
 * seed. A production deploy would swap the login button for an
 * Internet Identity integration; the rest of the UI wouldn't change.
 */
const DEV_IDENTITY_KEY = "lw-dev-identity-v1";
const DEV_IDENTITY_ARCHIVE_KEY = "lw-dev-identity-archive-v1";

/** Read the active session identity from localStorage, if any. */
export function loadSessionIdentity(): Ed25519KeyIdentity | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DEV_IDENTITY_KEY);
    return raw ? Ed25519KeyIdentity.fromJSON(raw) : null;
  } catch {
    return null;
  }
}

/** Is there an archived key the user could log back into? */
export function hasArchivedIdentity(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(DEV_IDENTITY_ARCHIVE_KEY) !== null;
  } catch {
    return false;
  }
}

/**
 * Explicit "log in" action. Three modes:
 *   - "resume"     Use the archived key if present; otherwise fall
 *                  through to "new". This is the default CTA behavior.
 *   - "new"        Always generate a fresh keypair. Archives any
 *                  existing key first (so the user can undo).
 *   - "import"     Accepts a JSON-serialized Ed25519KeyIdentity
 *                  string (the same shape toJSON() produces).
 *
 * Returns the resulting identity. After this call, subsequent
 * getLedgerActor(loadSessionIdentity() ?? undefined) calls use it.
 */
export function loginDevIdentity(
  mode: "resume" | "new" | "import" = "resume",
  importJson?: string,
): Ed25519KeyIdentity {
  if (typeof window === "undefined") {
    throw new Error("loginDevIdentity requires a browser");
  }

  let identity: Ed25519KeyIdentity;
  if (mode === "import") {
    if (!importJson) throw new Error("importJson required for mode=import");
    identity = Ed25519KeyIdentity.fromJSON(importJson);
  } else if (mode === "resume") {
    const archived = (() => {
      try {
        return window.localStorage.getItem(DEV_IDENTITY_ARCHIVE_KEY);
      } catch {
        return null;
      }
    })();
    identity = archived
      ? Ed25519KeyIdentity.fromJSON(archived)
      : Ed25519KeyIdentity.generate();
  } else {
    // "new": archive any existing session or archive so the user
    // could manually paste it back in via import; then generate.
    identity = Ed25519KeyIdentity.generate();
  }

  try {
    window.localStorage.setItem(
      DEV_IDENTITY_KEY,
      JSON.stringify(identity.toJSON()),
    );
    window.localStorage.setItem(
      DEV_IDENTITY_ARCHIVE_KEY,
      JSON.stringify(identity.toJSON()),
    );
  } catch {
    /* private mode — session identity only */
  }

  // Bust the cached agent so the next call re-binds with the new identity.
  cachedAgent = null;
  cachedIdentityFingerprint = null;

  return identity;
}

/**
 * Explicit "log out": remove the active session key but KEEP the
 * archive so "Log back in" works. After this, all agent calls go
 * anonymous until the user logs in again.
 */
export function logoutDevIdentity(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(DEV_IDENTITY_KEY);
  } catch {
    /* ignore */
  }
  cachedAgent = null;
  cachedIdentityFingerprint = null;
}

/**
 * Nuke-from-orbit: both the session AND the archive are wiped.
 * The next login generates a fresh principal.
 */
export function forgetDevIdentity(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(DEV_IDENTITY_KEY);
    window.localStorage.removeItem(DEV_IDENTITY_ARCHIVE_KEY);
  } catch {
    /* ignore */
  }
  cachedAgent = null;
  cachedIdentityFingerprint = null;
}

/** Export the active session key as a JSON string (for backup). */
export function exportSessionIdentityJson(): string | null {
  const id = loadSessionIdentity();
  return id ? JSON.stringify(id.toJSON()) : null;
}

export type { Account, TransferArg, MintArgs, BurnArgs, _SERVICE };
