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
    console.error("[dunk-app] route error:", error);
  }, [error]);

  const detail =
    [
      error.name ? `name: ${error.name}` : null,
      error.message ? `message: ${error.message}` : null,
      error.digest ? `digest: ${error.digest}` : null,
    ]
      .filter(Boolean)
      .join("\n") || undefined;

  return (
    <ErrorScaffold
      tone="danger"
      eyebrow="Oops · runtime snag"
      title="Something glitched mid-pour."
      body={
        <>
          The page hit an error while rendering. Nothing on the ledger was
          affected — your balance is intact.
        </>
      }
      primary={{ onClick: () => reset(), label: "Try again" }}
      secondary={{ href: "/dunk", label: "Back to the game" }}
      detail={detail}
      autoRetrySeconds={5}
    />
  );
}
