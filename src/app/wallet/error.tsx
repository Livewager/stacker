"use client";

import { useEffect } from "react";
import { ErrorScaffold } from "@/components/ErrorScaffold";
import { ROUTES } from "@/lib/routes";

export default function WalletError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[wallet] route error", error);
  }, [error]);

  return (
    <ErrorScaffold
      tone="danger"
      eyebrow="Wallet · error"
      title="Your wallet hit a snag."
      body={
        <>
          The ledger rejected a call or the page threw mid-render. Your balance
          on-chain is untouched — nothing on this page ever mutates state
          without an explicit action. Try reloading the wallet; if it persists,
          flip over to Settings and clear device data.
        </>
      }
      primary={{ label: "Reload wallet", onClick: reset }}
      secondary={{ label: "Go home", href: ROUTES.dunk }}
      detail={error.digest ? `digest ${error.digest}\n${error.message}` : error.message}
    />
  );
}
