/**
 * Internet Identity helpers — non-custodial auth.
 *
 * `getAuthClient()` lazily boots a shared AuthClient singleton. Sessions
 * persist in IndexedDB across reloads. No private key ever touches
 * application state.
 */

import { AuthClient } from "@dfinity/auth-client";
import type { Identity } from "@dfinity/agent";

const II_MAINNET = "https://identity.ic0.app";
const II_LOCAL_FALLBACK = "http://rdmx6-jaaaa-aaaaa-aaadq-cai.localhost:4943";

let clientPromise: Promise<AuthClient> | null = null;

export function getAuthClient(): Promise<AuthClient> {
  if (!clientPromise) {
    clientPromise = AuthClient.create({
      idleOptions: {
        // 30-min idle timeout — UI should re-prompt after.
        idleTimeout: 30 * 60 * 1000,
        disableDefaultIdleCallback: false,
      },
    });
  }
  return clientPromise;
}

export function identityProviderUrl(): string {
  if (typeof process !== "undefined") {
    const explicit = process.env.NEXT_PUBLIC_II_URL;
    if (explicit) return explicit;
  }
  if (typeof window !== "undefined") {
    const h = window.location.hostname;
    if (h === "localhost" || h === "127.0.0.1") return II_LOCAL_FALLBACK;
  }
  return II_MAINNET;
}

/**
 * Returns the authenticated Identity if the user has a live session,
 * otherwise null. Never throws — callers decide how to handle
 * anonymous state.
 */
export async function currentIdentity(): Promise<Identity | null> {
  const client = await getAuthClient();
  if (!client.isAuthenticated()) return null;
  return client.getIdentity();
}

/**
 * Kicks off the II login popup. Resolves with the Identity on success
 * or rejects on user cancel / error. Call from a user-gesture handler
 * so the popup isn't blocked.
 */
export async function loginWithII(): Promise<Identity> {
  const client = await getAuthClient();
  return new Promise((resolve, reject) => {
    client.login({
      identityProvider: identityProviderUrl(),
      // 8 hours. Long enough that the game doesn't log the user out
      // mid-session, short enough that a forgotten laptop eventually expires.
      maxTimeToLive: BigInt(8 * 60 * 60 * 1_000_000_000),
      onSuccess: () => resolve(client.getIdentity()),
      onError: (err) => reject(new Error(err ?? "II login failed")),
    });
  });
}

export async function logout(): Promise<void> {
  const client = await getAuthClient();
  await client.logout();
  // Drop the cached client so subsequent login creates a fresh one.
  clientPromise = null;
}
