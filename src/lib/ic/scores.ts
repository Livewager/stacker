"use client";

/**
 * @dfinity/agent wrapper for the game_scores canister.
 *
 * Mirrors the points_ledger agent shape in src/lib/ic/agent.ts so
 * call sites use the same identity/host plumbing — get the active
 * roster identity, build an HTTP agent against the local replica,
 * fetch the root key, instantiate the typed actor.
 *
 * Tag convention:
 *   GAME_TAG_STACKER = "stacker" — used by /stacker round-end submit
 *   Future games pick their own lowercase tag (a–z, 0–9, underscore,
 *   max 32 chars enforced canister-side).
 */

import { Actor, HttpAgent } from "@dfinity/agent";
import type { Identity } from "@dfinity/agent";
import { idlFactory } from "@/declarations/game_scores/game_scores.did.js";
import type {
  _SERVICE,
  ScoreEntry,
  PrincipalStats,
  Period,
  GameOverview,
  ConfigView,
} from "@/declarations/game_scores/game_scores.did";

export const GAME_TAG_STACKER = "stacker";

const HOST =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_IC_HOST) ||
  "http://127.0.0.1:4943";

export function gameScoresCanisterId(): string {
  return (
    process.env.NEXT_PUBLIC_GAME_SCORES_CANISTER_ID ||
    process.env.NEXT_PUBLIC_CANISTER_ID_GAME_SCORES ||
    process.env.CANISTER_ID_GAME_SCORES ||
    // Local-dev fallback. Updated to whatever dfx actually assigned.
    "umunu-kh777-77774-qaaca-cai"
  );
}

let cachedAgent: HttpAgent | null = null;
let cachedIdentityFingerprint: string | null = null;

async function getAgent(identity?: Identity): Promise<HttpAgent> {
  const fp = identity ? identity.getPrincipal().toText() : "anonymous";
  if (cachedAgent && cachedIdentityFingerprint === fp) return cachedAgent;
  const agent = new HttpAgent({ host: HOST, identity });
  await agent.fetchRootKey().catch(() => {
    /* swallow — local-only call cleans up later */
  });
  cachedAgent = agent;
  cachedIdentityFingerprint = fp;
  return agent;
}

export async function getScoresActor(identity?: Identity) {
  const agent = await getAgent(identity);
  return Actor.createActor<_SERVICE>(idlFactory, {
    agent,
    canisterId: gameScoresCanisterId(),
  });
}

export type { ScoreEntry, PrincipalStats, Period, GameOverview, ConfigView };
