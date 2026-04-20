/**
 * Livewager Points Ledger — agent-js actor factory.
 *
 * Non-custodial: the actor uses whatever Identity the caller gives it.
 * The default anonymous actor supports reads (queries) only — any update
 * call requires a signing identity, normally produced by Internet
 * Identity via `auth.ts`.
 */

import { Actor, type ActorSubclass, HttpAgent, type Identity } from "@dfinity/agent";
import { Principal } from "@dfinity/principal";
import { idlFactory } from "./idl";
import type { PointsLedgerService } from "./types";

/**
 * Resolution order for the canister ID:
 *   1. NEXT_PUBLIC_POINTS_LEDGER_CANISTER_ID (prod / preview env var)
 *   2. localStorage `points_ledger_canister_id` (dev convenience)
 *   3. Fallback: canister id dfx assigned on my box. Safe to ignore in
 *      prod because env var takes precedence; kept so `npm run dev`
 *      against a local replica Just Works for teammates who ran dfx.
 */
const DEFAULT_LOCAL_CANISTER = "uxrrr-q7777-77774-qaaaq-cai";

export function resolveCanisterId(): Principal {
  if (typeof process !== "undefined") {
    const envId = process.env.NEXT_PUBLIC_POINTS_LEDGER_CANISTER_ID;
    if (envId) return Principal.fromText(envId);
  }
  if (typeof window !== "undefined") {
    const stored = window.localStorage.getItem("points_ledger_canister_id");
    if (stored) return Principal.fromText(stored);
  }
  return Principal.fromText(DEFAULT_LOCAL_CANISTER);
}

/**
 * Resolution order for the gateway host:
 *   1. NEXT_PUBLIC_IC_HOST (explicit override)
 *   2. `http://127.0.0.1:4943` when running against a local replica
 *      (detected via localhost / 127.0.0.1 hostnames)
 *   3. `https://icp-api.io` for mainnet.
 */
export function resolveHost(): string {
  if (typeof process !== "undefined") {
    const envHost = process.env.NEXT_PUBLIC_IC_HOST;
    if (envHost) return envHost;
  }
  if (typeof window !== "undefined") {
    const h = window.location.hostname;
    if (h === "localhost" || h === "127.0.0.1") return "http://127.0.0.1:4943";
  }
  return "https://icp-api.io";
}

export interface PointsLedgerOpts {
  identity?: Identity;
  /** For unit tests or custom replica hosts. */
  host?: string;
  /** Override canister id (prefer env var in prod). */
  canisterId?: Principal | string;
}

/**
 * Creates a typed PointsLedger actor. Anonymous by default (read-only);
 * pass an Internet Identity `identity` to enable update calls.
 */
export async function pointsLedger(
  opts: PointsLedgerOpts = {},
): Promise<ActorSubclass<PointsLedgerService>> {
  const host = opts.host ?? resolveHost();
  const canisterId =
    typeof opts.canisterId === "string"
      ? Principal.fromText(opts.canisterId)
      : opts.canisterId ?? resolveCanisterId();

  const agent = await HttpAgent.create({
    host,
    identity: opts.identity,
    // Disable automatic root-key fetch in production; required locally.
    shouldFetchRootKey: host.includes("127.0.0.1") || host.includes("localhost"),
  });

  return Actor.createActor<PointsLedgerService>(idlFactory, {
    agent,
    canisterId,
  });
}
