"use client";

/**
 * Per-segment error boundary. Next.js renders this when a rendering
 * error bubbles up from a route segment. Must be a client component.
 *
 * We surface the `digest` Next stamps onto server errors so support
 * can correlate reports to server logs, and expose a "Try again"
 * that calls Next's `reset()` to attempt a fresh render without a
 * full reload.
 */

import { useEffect } from "react";
import { ErrorScaffold } from "@/components/ErrorScaffold";
import { ROUTES } from "@/lib/routes";

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to console in dev; production telemetry hook goes here.
    // eslint-disable-next-line no-console
    console.error("[stacker] route error:", error);
  }, [error]);

  const detail =
    [
      error.name ? `name: ${error.name}` : null,
      error.message ? `message: ${error.message}` : null,
      error.digest ? `digest: ${error.digest}` : null,
    ]
      .filter(Boolean)
      .join("\n") || undefined;

  // POLISH-304 — this is the catch-all error boundary, mounted at the
  // root segment. It catches /send, /withdraw, /deposit, /leaderboard,
  // /play, /settings — anything without a segment-scoped
  // error.tsx above it. The previous copy ("glitched mid-pour", "Back
  // to the game") presumed a game context and was wrong for the
  // wallet-flow and utility routes that actually dominate this
  // boundary's catchment. Rewritten to stay route-agnostic, keep the
  // "nothing on the ledger moved" reassurance (the most load-bearing
  // bit — money routes use this boundary too), and point the
  // secondary at /wallet since that's the most-visited authed
  // surface and a useful next stop from nearly anywhere.
  return (
    <ErrorScaffold
      tone="danger"
      eyebrow="Runtime error"
      title="This page hit a snag."
      body={
        <>
          Something threw while rendering. Nothing on the ledger moved —
          your balance, principal, and any pending tx are untouched. Try
          again, or head to the wallet.
        </>
      }
      primary={{ onClick: () => reset(), label: "Try again" }}
      secondary={{ href: ROUTES.wallet, label: "Open wallet" }}
      detail={detail}
      autoRetrySeconds={5}
    />
  );
}
