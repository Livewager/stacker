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
        <button
          onClick={handleConnect}
          disabled={status === "loading"}
          className="text-xs md:text-sm px-4 py-2 rounded-lg text-black font-bold transition hover:brightness-110 disabled:opacity-60"
          style={{ background: "linear-gradient(90deg,#22d3ee,#0891b2)" }}
        >
          {status === "loading" ? "Connecting…" : "Connect"}
        </button>

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

          <button
            data-autofocus
            onClick={confirmConnect}
            disabled={status === "loading"}
            className="mt-6 w-full rounded-xl py-4 text-base font-bold text-black transition hover:brightness-110 disabled:opacity-60"
            style={{ background: "linear-gradient(90deg,#22d3ee,#0891b2)" }}
          >
            {status === "loading" ? "Opening II…" : "Sign in with Internet Identity"}
          </button>
          <button
            onClick={() => setSheetOpen(false)}
            className="mt-2 w-full rounded-xl py-3 text-sm text-gray-400 hover:text-white transition"
          >
            Not now
          </button>
        </BottomSheet>
      </>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {/* Balance pill */}
      <div
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-cyan-300/40 bg-cyan-300/[0.08] text-xs md:text-sm font-mono tabular-nums"
        aria-live="polite"
      >
        <span className="text-cyan-300">◎</span>
        <span className="text-white">
          {balance !== null ? formatLWP(balance, 4) : "—"}
        </span>
        <span className="text-gray-400 text-[10px] md:text-[11px] uppercase tracking-widest">
          LWP
        </span>
      </div>
      {/* Deposit CTA — scrolls to the wallet card. */}
      <a
        href="#drop-wallet"
        className="text-xs md:text-sm px-3 md:px-4 py-1.5 md:py-2 rounded-lg text-black font-bold transition hover:brightness-110"
        style={{ background: "linear-gradient(90deg,#fdba74,#f97316)" }}
      >
        Deposit
      </a>
    </div>
  );
}
