"use client";

import { useEffect } from "react";
import { ErrorScaffold } from "@/components/ErrorScaffold";
import { ROUTES } from "@/lib/routes";

export default function AccountError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[account] route error", error);
  }, [error]);

  return (
    <ErrorScaffold
      tone="muted"
      eyebrow="Account · error"
      title="Account view crashed."
      body={
        <>
          The activity feed or profile card threw while rendering. Your
          Internet Identity session is unaffected — principal and balance are
          on the ledger, not this page. Reload the view and you should see
          yourself again.
        </>
      }
      primary={{ label: "Reload account", onClick: reset }}
      secondary={{ label: "Wallet", href: ROUTES.wallet }}
      detail={error.digest ? `digest ${error.digest}\n${error.message}` : error.message}
    />
  );
}
