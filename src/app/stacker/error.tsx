"use client";

import { useEffect } from "react";
import { ErrorScaffold } from "@/components/ErrorScaffold";
import { ROUTES } from "@/lib/routes";

export default function StackerError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[stacker] route error", error);
  }, [error]);

  return (
    <ErrorScaffold
      tone="muted"
      eyebrow="Stacker · error"
      title="The tower buckled."
      body={
        <>
          Something broke while rendering the game. Canvas allocations, RNG
          bootstrap, or a hydration mismatch are the usual suspects. Reset the
          board — no round state survives a reload, so this is safe.
        </>
      }
      primary={{ label: "Reset board", onClick: reset }}
      secondary={{ label: "All games", href: ROUTES.play }}
      detail={error.digest ? `digest ${error.digest}\n${error.message}` : error.message}
      autoRetrySeconds={5}
    />
  );
}
