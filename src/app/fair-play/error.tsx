"use client";

import { useEffect } from "react";
import { ErrorScaffold } from "@/components/ErrorScaffold";
import { ROUTES } from "@/lib/routes";

/**
 * /fair-play route error boundary. POLISH-340. Pure static
 * content, so crashes are rare — but if one fires, the generic
 * catch-all's secondary (/wallet) is the wrong sibling for
 * someone who just tapped into a trust-model reference page.
 * /play is the natural next stop: the reader cares about the
 * games, not their wallet.
 *
 * tone="muted" matches /account + /stacker. The page can't move
 * money, so there's no "nothing on the ledger moved"
 * reassurance to carry — the copy leans on "nothing state was
 * committed, just reload."
 */
export default function FairPlayError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[fair-play] route error", error);
  }, [error]);

  return (
    <ErrorScaffold
      tone="muted"
      eyebrow="Fair play · error"
      title="The explainer glitched."
      body={
        <>
          Something threw while rendering the tier breakdown. No state
          was committed anywhere — the page is static reference content
          and there&apos;s nothing to recover. Reload, or head to the
          games.
        </>
      }
      primary={{ label: "Reload", onClick: reset }}
      secondary={{ label: "All games", href: ROUTES.play }}
      detail={error.digest ? `digest ${error.digest}\n${error.message}` : error.message}
      autoRetrySeconds={5}
    />
  );
}
