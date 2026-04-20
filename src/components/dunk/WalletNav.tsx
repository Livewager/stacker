"use client";

/**
 * Compact wallet widget for the top nav. Two modes:
 *   - Signed out: "Connect" button.
 *   - Signed in:  balance pill ("◎ 1.2345 LWP") + "Deposit" anchor
 *                 that smooth-scrolls to the Buy/Deposit card.
 */

import { formatLWP } from "@/lib/icp";
import { useWalletState } from "./WalletContext";

export function WalletNav() {
  const { identity, balance, status, login } = useWalletState();

  if (!identity) {
    return (
      <button
        onClick={login}
        disabled={status === "loading"}
        className="text-xs md:text-sm px-4 py-2 rounded-lg text-black font-bold transition hover:brightness-110 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
        style={{ background: "linear-gradient(90deg,#22d3ee,#0891b2)" }}
      >
        {status === "loading" ? "Connecting…" : "Connect"}
      </button>
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
        className="text-xs md:text-sm px-3 md:px-4 py-1.5 md:py-2 rounded-lg text-black font-bold transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
        style={{ background: "linear-gradient(90deg,#fdba74,#f97316)" }}
      >
        Deposit
      </a>
    </div>
  );
}
