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
 * Dev identity — a localStorage-backed Ed25519 keypair. Used on the
 * /icrc test surface so faucet_claim (which rejects anonymous) has
 * a stable principal to call from. NOT suitable for production; a
 * real deploy uses Internet Identity instead. The key is stored in
 * plain JSON (insecure) since local dfx is already a single-user
 * plaintext environment — matches the scope the user asked for.
 */
const DEV_IDENTITY_KEY = "lw-dev-identity-v1";

export function getOrCreateDevIdentity(): Ed25519KeyIdentity {
  if (typeof window === "undefined") {
    // SSR path — just mint a fresh one; the real browser session
    // will re-hit this and create/load its own.
    return Ed25519KeyIdentity.generate();
  }
  try {
    const raw = window.localStorage.getItem(DEV_IDENTITY_KEY);
    if (raw) {
      return Ed25519KeyIdentity.fromJSON(raw);
    }
  } catch {
    /* storage disabled — fall through to new identity */
  }
  const fresh = Ed25519KeyIdentity.generate();
  try {
    window.localStorage.setItem(DEV_IDENTITY_KEY, JSON.stringify(fresh.toJSON()));
  } catch {
    /* ignore — session-only identity */
  }
  return fresh;
}

/** Wipe the dev identity (used by "regenerate" button on the /icrc page). */
export function clearDevIdentity(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(DEV_IDENTITY_KEY);
  } catch {
    /* ignore */
  }
  // Also bust the agent cache so the next call re-binds with fresh identity.
  cachedAgent = null;
  cachedIdentityFingerprint = null;
}

export type { Account, TransferArg, MintArgs, BurnArgs, _SERVICE };
