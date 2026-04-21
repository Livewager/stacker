"use client";

/**
 * Thin banner that surfaces WalletContext.error on every route
 * *except* /wallet and /account — those render the richer
 * LedgerErrorCard already and we don't want two red stripes stacked.
 *
 * Lives in AppShell so every page inherits it, with a route-aware
 * opt-out list. Collapsible: the user can dismiss for the current
 * session (sessionStorage) without losing the retry action.
 */

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useWalletState } from "@/components/shared/WalletContext";
import { useToast } from "@/components/shared/Toast";
import { ROUTES } from "@/lib/routes";

// Routes that render their own error surface.
const OWN_ERROR_UI: readonly string[] = [ROUTES.wallet, ROUTES.account];

const SS_DISMISSED = "lw-network-banner-dismissed";

export function NetworkBanner() {
  const pathname = usePathname() || "";
  const { error, refresh } = useWalletState();
  const toast = useToast();
  const [dismissed, setDismissed] = useState(false);
  const [retrying, setRetrying] = useState(false);

  // Rehydrate dismissal from sessionStorage on mount. Using session
  // (not local) storage so every new tab / day starts fresh — you
  // want the banner back when you care about the replica again.
  useEffect(() => {
    try {
      if (sessionStorage.getItem(SS_DISMISSED) === "1") setDismissed(true);
    } catch {
      /* private mode / disabled storage: act as not-dismissed */
    }
  }, []);

  // Reset the dismissal when the error clears — next time the ledger
  // goes sideways the user should see it again in this session.
  useEffect(() => {
    if (!error && dismissed) {
      setDismissed(false);
      try {
        sessionStorage.removeItem(SS_DISMISSED);
      } catch {
        /* ignore */
      }
    }
  }, [error, dismissed]);

  const onDismiss = useCallback(() => {
    setDismissed(true);
    try {
      sessionStorage.setItem(SS_DISMISSED, "1");
    } catch {
      /* ignore */
    }
  }, []);

  const onRetry = useCallback(async () => {
    setRetrying(true);
    try {
      await refresh();
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
  }, [refresh, toast]);

  if (!error) return null;
  if (dismissed) return null;
  if (OWN_ERROR_UI.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-30 border-b border-red-500/30 bg-red-500/[0.12] backdrop-blur-md"
    >
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2 md:px-8">
        <span
          aria-hidden
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-500/20 text-red-200"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
            <path d="M10 2a1 1 0 0 1 .894.553l7.5 15A1 1 0 0 1 17.5 19h-15a1 1 0 0 1-.894-1.447l7.5-15A1 1 0 0 1 10 2Zm0 6a1 1 0 0 0-1 1v3a1 1 0 1 0 2 0V9a1 1 0 0 0-1-1Zm0 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" />
          </svg>
        </span>
        <div className="min-w-0 flex-1 text-[12px] leading-snug">
          <span className="text-red-200 font-semibold">Ledger unreachable.</span>{" "}
          <span className="text-red-100/80">
            Balances + activity may be stale. Reads resume automatically once
            the replica is back.
          </span>
        </div>
        <button
          onClick={onRetry}
          disabled={retrying}
          className="shrink-0 rounded-md border border-red-400/50 bg-red-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-widest text-red-100 hover:bg-red-500/25 hover:border-red-400/70 hover:text-white transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {retrying ? "Retrying…" : "Retry"}
        </button>
        <button
          onClick={onDismiss}
          className="shrink-0 rounded-md p-1 text-red-200/80 hover:text-white hover:bg-red-500/15 transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-label="Dismiss network banner for this session"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
