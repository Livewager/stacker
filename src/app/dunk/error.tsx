"use client";

import { useEffect } from "react";
import { ErrorScaffold } from "@/components/ErrorScaffold";
import { ROUTES } from "@/lib/routes";

/**
 * /dunk route error boundary. Mirrors /stacker/error.tsx so both
 * games route failures through the same "try the sibling game"
 * pattern rather than falling through to the generic /wallet
 * secondary. POLISH-316 — ticket framed this as a /play hub
 * concern, but the actual failure surface is the game route that
 * broke; /play is a static list of cards and its chunk is tiny.
 * When /dunk's DropWallet or SteadyPour chunk fails to hydrate,
 * the user's next-best move is "try the other game" not "go to
 * wallet," same logic that POLISH-304 codified in the
 * nearest-sibling copy contract.
 *
 * tone="muted" matches /stacker (game routes are read-only
 * surfaces in this sense — nothing on the ledger hinges on a
 * Tilt Pour crash), and the body reassurance mirrors /stacker's
 * "no round state survives a reload" framing.
 */
export default function DunkError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[dunk] route error", error);
  }, [error]);

  return (
    <ErrorScaffold
      tone="muted"
      eyebrow="Tilt Pour · error"
      title="The pour spilled."
      body={
        <>
          Something broke while loading the pour canvas. Sensor bootstrap,
          motion-permission prompts, or a chunk hydration mismatch are the
          usual suspects. Reload the round — no pour state survives a
          reload, so this is safe. Stacker is ready if you want to jump
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
