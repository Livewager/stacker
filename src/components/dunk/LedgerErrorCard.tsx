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
import { useState } from "react";
import { useToast } from "./Toast";
import { useCopyable } from "@/lib/clipboard";

type Props = {
  error: string;
  /** Fires the caller's refresh(). Should re-read balance + supply. */
  onRetry: () => Promise<void> | void;
  /** Optional context label shown in the header — "Wallet" vs "Account" etc. */
  scope?: string;
};

export function LedgerErrorCard({ error, onRetry, scope = "Ledger" }: Props) {
  const toast = useToast();
  const copy = useCopyable();
  const [retrying, setRetrying] = useState(false);

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
              {scope} · offline
            </div>
          </div>
          <div className="text-sm font-semibold text-white mb-1">
            Can&apos;t reach the ledger right now.
          </div>
          <div className="text-xs text-gray-300 leading-snug mb-3">
            Your balance is cached locally and may be out of date. The most
            common cause in demo mode is that the local dfx replica stopped —
            restart it and retry. On prod, this usually clears itself within a
            few seconds.
          </div>
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
