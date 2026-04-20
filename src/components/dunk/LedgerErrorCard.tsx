"use client";

/**
 * Persistent error card shown on /wallet and /account when the ICRC
 * ledger can't be reached or rejects a call. Transient errors still
 * fire toasts from WalletContext; this is for the case where the
 * replica is down and the page would otherwise look silently broken.
 *
 * Exposes a retry affordance, a copy-error button for bug reports,
 * and a link to /settings → data reset as a last resort.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { useToast } from "./Toast";
import { useCopyable } from "@/lib/clipboard";

type Props = {
  error: string;
  /** Fires the caller's refresh(). Should re-read balance + supply. */
  onRetry: () => Promise<void> | void;
  /** Optional context label shown in the header — "Wallet" vs "Account" etc. */
  scope?: string;
};

/**
 * Shape the user-facing copy to the likely cause. Three cases:
 *
 *   - browser offline — navigator.onLine is false. The replica is
 *     irrelevant; nothing works until the device reconnects.
 *   - network / fetch-class error — the message looks like the
 *     agent-js fetch path failed (TypeError: Failed to fetch, NetworkError,
 *     ERR_NETWORK, etc). Most likely the dfx replica stopped or the
 *     host env var points somewhere unreachable.
 *   - anything else — likely a canister-side error (Reject,
 *     CertificateVerificationFailed, a typed ICRC reject). Keep
 *     the copy generic; the technical detail section has the specifics.
 *
 * The match is intentionally substring-based and case-insensitive
 * — agent-js surfaces these strings slightly differently across
 * versions and we don't want to over-narrow.
 */
type Cause = "browser-offline" | "network" | "canister";

function classify(error: string, browserOffline: boolean): Cause {
  if (browserOffline) return "browser-offline";
  const e = error.toLowerCase();
  if (
    e.includes("failed to fetch") ||
    e.includes("networkerror") ||
    e.includes("err_network") ||
    e.includes("err_connection") ||
    e.includes("fetch failed")
  ) {
    return "network";
  }
  return "canister";
}

const COPY: Record<Cause, { title: string; body: string }> = {
  "browser-offline": {
    title: "You're offline.",
    body: "Your device reports no internet connection. Balance + activity are cached locally from the last successful read. Reconnect and retry — nothing has been lost.",
  },
  network: {
    title: "Can't reach the ledger right now.",
    body: "Your balance is cached locally and may be out of date. The most common cause in demo mode is that the local dfx replica stopped — restart it and retry. On prod, this usually clears itself within a few seconds.",
  },
  canister: {
    title: "The ledger rejected a call.",
    body: "Your device reached the canister but the call came back with an error. This is less common than a network drop — the Technical detail below has the exact reject string. Retry often works; if it doesn't, Copy error and share it in a bug report.",
  },
};

export function LedgerErrorCard({ error, onRetry, scope = "Ledger" }: Props) {
  const toast = useToast();
  const copy = useCopyable();
  const [retrying, setRetrying] = useState(false);
  // Track navigator.onLine so the user's browser being offline gets
  // its own copy, distinct from a replica-down read. `online` and
  // `offline` events cover the transitions; the initial value reads
  // directly on mount to avoid a flash of the wrong copy.
  const [browserOffline, setBrowserOffline] = useState(false);
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const update = () => setBrowserOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  const cause = classify(error, browserOffline);
  const { title, body } = COPY[cause];

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await onRetry();
      toast.push({ kind: "success", title: "Reconnected" });
    } catch (e) {
      toast.push({
        kind: "error",
        title: "Still unreachable",
        description: (e as Error).message,
      });
    } finally {
      setRetrying(false);
    }
  };

  const copyError = () => copy(error, { label: "Error" });

  return (
    <section
      role="alert"
      aria-live="polite"
      className="rounded-2xl border border-red-500/30 bg-red-500/[0.06] p-5"
    >
      <div className="flex items-start gap-3">
        <div
          aria-hidden
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-500/15 text-red-300"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path d="M10 2a1 1 0 0 1 .894.553l7.5 15A1 1 0 0 1 17.5 19h-15a1 1 0 0 1-.894-1.447l7.5-15A1 1 0 0 1 10 2Zm0 6a1 1 0 0 0-1 1v3a1 1 0 1 0 2 0V9a1 1 0 0 0-1-1Zm0 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <div className="text-[10px] uppercase tracking-widest text-red-300">
              {scope} ·{" "}
              {cause === "browser-offline"
                ? "no connection"
                : cause === "network"
                  ? "offline"
                  : "rejected"}
            </div>
          </div>
          <div className="text-sm font-semibold text-white mb-1">{title}</div>
          <div className="text-xs text-gray-300 leading-snug mb-3">{body}</div>
          <details className="mb-4 rounded-md bg-black/30 border border-white/10 text-[11px] font-mono text-red-200 open:pb-2">
            <summary className="cursor-pointer px-3 py-2 select-none text-gray-300 hover:text-white transition">
              Technical detail
            </summary>
            <div className="px-3 pb-1 break-all">{error}</div>
          </details>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleRetry}
              disabled={retrying}
              className="rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-500/20 transition disabled:opacity-60"
            >
              {retrying ? "Retrying…" : "Retry connection"}
            </button>
            <button
              onClick={copyError}
              className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-gray-300 hover:text-white hover:border-white/25 transition"
            >
              Copy error
            </button>
            <Link
              href="/settings"
              className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-gray-300 hover:text-white hover:border-white/25 transition"
            >
              Settings · reset data
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
