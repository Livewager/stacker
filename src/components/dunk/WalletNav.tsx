"use client";

/**
 * Compact wallet widget for the top nav. Two modes:
 *   - Signed out: "Connect" button (mobile: opens bottom-sheet; desktop:
 *                 kicks off Internet Identity directly).
 *   - Signed in:  balance pill ("◎ 1.2345 LWP") + "Deposit" anchor
 *                 that smooth-scrolls to the Buy/Deposit card.
 */

import { useState } from "react";
import { formatLWP } from "@/lib/icp";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { ANCHORS } from "@/lib/routes";
import { useWalletState } from "./WalletContext";

export function WalletNav() {
  const { identity, balance, status, login } = useWalletState();
  const [sheetOpen, setSheetOpen] = useState(false);

  const isMobile =
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 767px)").matches;

  const handleConnect = () => {
    if (isMobile) {
      setSheetOpen(true);
    } else {
      login();
    }
  };

  const confirmConnect = async () => {
    setSheetOpen(false);
    await login();
  };

  if (!identity) {
    return (
      <>
        <Button
          onClick={handleConnect}
          loading={status === "loading"}
          tone="cyan"
          size="sm"
        >
          {status === "loading" ? "Connecting…" : "Connect"}
        </Button>

        <BottomSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          title="Connect with Internet Identity"
          description="Non-custodial sign-in. No email, no password, no seed phrase. Your anchor stays on the Internet Computer."
        >
          <ul className="space-y-2 text-sm text-gray-300">
            <li className="flex gap-2">
              <span className="text-cyan-300">•</span>
              <span>No app owns your keys. Only you do.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-cyan-300">•</span>
              <span>LWP balance lives on an ICRC-1 ledger, not our server.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-cyan-300">•</span>
              <span>You can disconnect any time from Settings.</span>
            </li>
          </ul>

          <Button
            data-autofocus
            onClick={confirmConnect}
            loading={status === "loading"}
            tone="cyan"
            size="lg"
            fullWidth
            className="mt-6"
          >
            {status === "loading" ? "Opening II…" : "Sign in with Internet Identity"}
          </Button>
          <Button
            onClick={() => setSheetOpen(false)}
            variant="ghost"
            fullWidth
            className="mt-2"
          >
            Not now
          </Button>
        </BottomSheet>
      </>
    );
  }

  // Mid-flight transitions shift the pill tone to amber + swap the
  // glyph for a pulsing dot. Matches the pending chip on /wallet so
  // the "balance is about to change" cue lives in the header too —
  // important because users might be on any route when a tx lands.
  const pending =
    status === "buying" ||
    status === "depositing" ||
    status === "sending" ||
    status === "withdrawing";

  return (
    <div className="flex items-center gap-1.5 md:gap-2 min-w-0">
      {/* Balance pill. On small screens we drop the "LWP" label and
          show fewer decimals so the header never overflows.
          Visuals are aria-hidden; an sr-only sibling carries the
          phrased announcement so a screen reader never gets a stray
          "◎" or responsive-swap double-read. */}
      <div
        className={`flex items-center gap-1.5 px-2.5 md:px-3 py-1.5 rounded-full border text-xs md:text-sm font-mono tabular-nums min-w-0 transition-colors ${
          pending
            ? "border-amber-400/50 bg-amber-400/[0.08]"
            : "border-cyan-300/40 bg-cyan-300/[0.08]"
        }`}
        aria-hidden
      >
        {pending ? (
          // Decorative — the sr-only sibling below carries the
          // accessible announcement. No title attr: container is
          // aria-hidden so titles wouldn't reach SR anyway, and
          // keyboard users don't hover.
          <span
            className="inline-block h-1.5 w-1.5 rounded-full bg-amber-300 animate-pulse"
          />
        ) : (
          <span className="text-cyan-300">◎</span>
        )}
        <span className="text-white truncate max-w-[96px] md:max-w-none">
          <span className="md:hidden">
            {balance !== null ? formatLWP(balance, 2) : "—"}
          </span>
          <span className="hidden md:inline">
            {balance !== null ? formatLWP(balance, 4) : "—"}
          </span>
        </span>
        <span className="hidden md:inline text-gray-400 text-[11px] uppercase tracking-widest">
          LWP
        </span>
      </div>
      <span className="sr-only" aria-live="polite">
        {pending
          ? `${status} in progress, balance ${balance !== null ? formatLWP(balance, 4) + " LWP" : "unavailable"}`
          : balance !== null
            ? `Balance ${formatLWP(balance, 4)} LWP`
            : "Balance unavailable"}
      </span>
      {/* Deposit CTA — scrolls to the wallet card. */}
      <a
        href={ANCHORS.dropWallet}
        className="text-xs md:text-sm px-3 md:px-4 py-2 md:py-2 h-9 md:h-auto inline-flex items-center rounded-lg text-black font-bold transition hover:brightness-110 shrink-0"
        style={{ background: "linear-gradient(90deg,#fdba74,#f97316)" }}
      >
        Deposit
      </a>
    </div>
  );
}
