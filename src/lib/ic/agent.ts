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
  await agent.fetchRootKey().catch(() => {
    /* swallow — calls will surface the error with a cleaner stack */
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

// ==========================================================
// Identity roster — multiple Ed25519 keypairs per browser
// ==========================================================
//
// Every keypair the browser has ever created or imported is stored
// in a single localStorage array. The UI uses this to show "you've
// used N keys on this device" on the signed-out splash and let the
// user hop between them without losing history.
//
// Storage shape:
//   localStorage["lw-identity-roster-v2"] = IdentityRosterV2 JSON
//
// Older slots (v1) from earlier deploys are auto-migrated on load:
//   - lw-dev-identity-v1          (active session key)
//   - lw-dev-identity-archive-v1  (last-used key)
// Both get folded into the v2 roster as a "migrated" entry and
// removed from the old slots.

const ROSTER_KEY = "lw-identity-roster-v2";
const LEGACY_ACTIVE_KEY = "lw-dev-identity-v1";
const LEGACY_ARCHIVE_KEY = "lw-dev-identity-archive-v1";

export interface RosterEntry {
  /** Principal text — stable, unique across the roster. */
  principal: string;
  /** User-assigned nickname. Optional. */
  label?: string;
  /** Serialized Ed25519 JSON (["pub hex", "secret hex"]). */
  secretJson: string;
  /** ms epoch when this entry was first added. */
  createdAt: number;
  /** ms epoch when this entry was last the active session. */
  lastUsedAt: number;
  /** How this entry joined the roster. */
  source: "new" | "imported" | "migrated" | "seed";
}

export interface IdentityRosterV2 {
  version: 2;
  entries: RosterEntry[];
  /** Principal of the entry currently "signed in". Null = signed out. */
  activePrincipal: string | null;
}

/** Read roster + migrate legacy slots if present. Idempotent. */
export function loadRoster(): IdentityRosterV2 {
  if (typeof window === "undefined") {
    return { version: 2, entries: [], activePrincipal: null };
  }
  let roster: IdentityRosterV2;
  try {
    const raw = window.localStorage.getItem(ROSTER_KEY);
    roster = raw
      ? (JSON.parse(raw) as IdentityRosterV2)
      : { version: 2, entries: [], activePrincipal: null };
  } catch {
    roster = { version: 2, entries: [], activePrincipal: null };
  }

  // Migrate legacy slots. Never overwrites an existing entry with
  // the same principal — if the user had one key in v1 and it's
  // already in the roster, we just prune the legacy slot.
  try {
    const legacyActive = window.localStorage.getItem(LEGACY_ACTIVE_KEY);
    const legacyArchive = window.localStorage.getItem(LEGACY_ARCHIVE_KEY);
    const legacyJsons: string[] = [];
    if (legacyActive) legacyJsons.push(legacyActive);
    if (legacyArchive && legacyArchive !== legacyActive) {
      legacyJsons.push(legacyArchive);
    }
    let changed = false;
    for (const json of legacyJsons) {
      try {
        const id = Ed25519KeyIdentity.fromJSON(json);
        const p = id.getPrincipal().toText();
        if (!roster.entries.find((e) => e.principal === p)) {
          const now = Date.now();
          roster.entries.push({
            principal: p,
            secretJson: json,
            createdAt: now,
            lastUsedAt: now,
            source: "migrated",
          });
          changed = true;
          // If the legacy was the active session, make it active.
          if (json === legacyActive && !roster.activePrincipal) {
            roster.activePrincipal = p;
          }
        }
      } catch {
        /* corrupt legacy entry — ignore */
      }
    }
    // Drop legacy slots either way — they're fully represented in
    // the roster now, and leaving them would confuse future migrations.
    if (legacyActive) window.localStorage.removeItem(LEGACY_ACTIVE_KEY);
    if (legacyArchive) window.localStorage.removeItem(LEGACY_ARCHIVE_KEY);
    if (changed) saveRoster(roster);
  } catch {
    /* legacy read failed — carry on with roster as-is */
  }

  return roster;
}

function saveRoster(r: IdentityRosterV2): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ROSTER_KEY, JSON.stringify(r));
  } catch {
    /* private mode */
  }
}

/** Convenience — is any key currently marked active. */
export function activePrincipalText(): string | null {
  return loadRoster().activePrincipal;
}

/** Load the Ed25519 identity for the active principal, if any. */
export function loadActiveIdentity(): Ed25519KeyIdentity | null {
  const r = loadRoster();
  if (!r.activePrincipal) return null;
  const entry = r.entries.find((e) => e.principal === r.activePrincipal);
  if (!entry) return null;
  try {
    return Ed25519KeyIdentity.fromJSON(entry.secretJson);
  } catch {
    return null;
  }
}

/** Make the given principal the active session. No-op if absent from roster. */
export function setActiveRosterEntry(principal: string): Ed25519KeyIdentity | null {
  const r = loadRoster();
  const entry = r.entries.find((e) => e.principal === principal);
  if (!entry) return null;
  entry.lastUsedAt = Date.now();
  r.activePrincipal = principal;
  saveRoster(r);
  cachedAgent = null;
  cachedIdentityFingerprint = null;
  try {
    return Ed25519KeyIdentity.fromJSON(entry.secretJson);
  } catch {
    return null;
  }
}

/** Add a brand-new keypair to the roster + make it active. */
export function createAndActivateRosterEntry(label?: string): Ed25519KeyIdentity {
  const id = Ed25519KeyIdentity.generate();
  const p = id.getPrincipal().toText();
  const now = Date.now();
  const r = loadRoster();
  r.entries.push({
    principal: p,
    label,
    secretJson: JSON.stringify(id.toJSON()),
    createdAt: now,
    lastUsedAt: now,
    source: "new",
  });
  r.activePrincipal = p;
  saveRoster(r);
  cachedAgent = null;
  cachedIdentityFingerprint = null;
  return id;
}

/** Import a JSON keypair, add it to the roster, make it active. */
export function importAndActivateRosterEntry(
  json: string,
  label?: string,
): Ed25519KeyIdentity {
  const id = Ed25519KeyIdentity.fromJSON(json);
  const p = id.getPrincipal().toText();
  const now = Date.now();
  const r = loadRoster();
  let entry = r.entries.find((e) => e.principal === p);
  if (!entry) {
    entry = {
      principal: p,
      label,
      secretJson: json,
      createdAt: now,
      lastUsedAt: now,
      source: "imported",
    };
    r.entries.push(entry);
  } else {
    // Already known — just refresh lastUsedAt + maybe label.
    entry.lastUsedAt = now;
    if (label && !entry.label) entry.label = label;
  }
  r.activePrincipal = p;
  saveRoster(r);
  cachedAgent = null;
  cachedIdentityFingerprint = null;
  return id;
}

/** Rename a roster entry. */
export function renameRosterEntry(principal: string, label: string): void {
  const r = loadRoster();
  const entry = r.entries.find((e) => e.principal === principal);
  if (!entry) return;
  entry.label = label.trim() || undefined;
  saveRoster(r);
}

/** Remove one entry from the roster. If it was active, log out. */
export function removeRosterEntry(principal: string): void {
  const r = loadRoster();
  r.entries = r.entries.filter((e) => e.principal !== principal);
  if (r.activePrincipal === principal) r.activePrincipal = null;
  saveRoster(r);
  cachedAgent = null;
  cachedIdentityFingerprint = null;
}

/** Wipe everything — all keys, active state, roster itself. */
export function clearRoster(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(ROSTER_KEY);
  } catch {
    /* ignore */
  }
  cachedAgent = null;
  cachedIdentityFingerprint = null;
}

/** Log out without touching the roster. */
export function logoutActiveRosterEntry(): void {
  const r = loadRoster();
  r.activePrincipal = null;
  saveRoster(r);
  cachedAgent = null;
  cachedIdentityFingerprint = null;
}

/** Export a roster entry's JSON for backup. */
export function exportRosterEntryJson(principal: string): string | null {
  const r = loadRoster();
  const entry = r.entries.find((e) => e.principal === principal);
  return entry ? entry.secretJson : null;
}

/**
 * Add a seed-phrase-derived identity to the roster and make it
 * active. Marks the entry as source="seed" so the UI can show it
 * with a distinct chip.
 */
import { seedPhraseToIdentity } from "./seed";

export function loginFromSeedPhrase(phrase: string, label?: string): Ed25519KeyIdentity {
  const id = seedPhraseToIdentity(phrase);
  const p = id.getPrincipal().toText();
  const now = Date.now();
  const r = loadRoster();
  let entry = r.entries.find((e) => e.principal === p);
  if (!entry) {
    entry = {
      principal: p,
      label: label ?? "Seed phrase key",
      secretJson: JSON.stringify(id.toJSON()),
      createdAt: now,
      lastUsedAt: now,
      source: "seed" as RosterEntry["source"],
    };
    r.entries.push(entry);
  } else {
    entry.lastUsedAt = now;
  }
  r.activePrincipal = p;
  saveRoster(r);
  cachedAgent = null;
  cachedIdentityFingerprint = null;
  return id;
}

export type { Account, TransferArg, MintArgs, BurnArgs, _SERVICE };
