"use client";

/**
 * Non-custodial wallet block for the #drop section at /dunk.
 *
 * State comes from <WalletProvider /> in dunk/layout.tsx so the
 * top-nav balance pill and this panel share one source of truth.
 *
 * Features:
 *   - Connect / sign out via Internet Identity
 *   - Live LWP balance + ICRC-1 supply
 *   - Buy LWP (demo mint — local replica only)
 *   - Deposit LTC → LWP (demo oracle — mints at 10M LWP / LTC fixed rate)
 */

import { useState } from "react";
import { formatLWP } from "@/lib/icp";
import { useWalletState } from "./WalletContext";
import { useCopyable } from "@/lib/clipboard";

import { shortenPrincipal as baseShorten } from "@/lib/principal";

const shortenPrincipal = (p: string) => baseShorten(p, { head: 8, tail: 8 });

// Must stay in sync with src/app/api/dunk/ltc-deposit/route.ts.
const LWP_PER_LTC = 10_000_000; // 10 M LWP per 1 LTC at the fixed demo rate

export default function DropWallet() {
  const {
    identity,
    principal,
    balance,
    supply,
    status,
    error,
    lastTx,
    login,
    logout,
    buy,
    depositLTC,
  } = useWalletState();

  const [amountLwp, setAmountLwp] = useState("1");
  const [amountLtc, setAmountLtc] = useState("0.001");
  const [copied, setCopied] = useState(false);

  const clipboard = useCopyable();
  const copyPrincipal = async () => {
    const ok = await clipboard(principal, {
      label: "Principal",
      silent: true, // inline "✓ Copied" pill carries the success UX
    });
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const onBuy = async () => {
    try {
      await buy(Number(amountLwp));
    } catch {
      /* error already surfaced via context */
    }
  };

  const onDeposit = async () => {
    try {
      await depositLTC(Number(amountLtc));
    } catch {
      /* error already surfaced via context */
    }
  };

  const lwpFromLtc =
    Number.isFinite(Number(amountLtc)) && Number(amountLtc) > 0
      ? Number(amountLtc) * LWP_PER_LTC
      : 0;

  return (
    <div
      id="drop-wallet"
      className="mt-4 md:mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5 md:p-8"
    >
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-cyan-300 mb-1.5">
            Non-Custodial Wallet
          </div>
          <h3 className="text-xl md:text-2xl font-black tracking-tight">
            Your Livewager Points (LWP)
          </h3>
          <p className="text-xs md:text-sm text-gray-400 mt-1 max-w-md">
            ICRC-1 + ICRC-2 ledger on the Internet Computer. You hold your own keys — Livewager
            never custodies a cent.
          </p>
        </div>
        {identity && (
          <button
            onClick={logout}
            className="shrink-0 text-[11px] font-mono uppercase tracking-widest px-3 py-1.5 rounded-md border border-white/15 text-gray-300 hover:border-white/30 hover:text-white transition"
          >
            Sign out
          </button>
        )}
      </div>

      {!identity ? (
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5 bg-black/30 rounded-xl p-5 border border-white/5">
          <div className="space-y-1">
            <div className="text-sm text-gray-300">
              Sign in with <span className="text-white font-semibold">Internet Identity</span> to
              see your balance and deposit.
            </div>
            <div className="text-[11px] text-gray-500">
              No seed phrase. No password. Passkey-backed auth native to the Internet Computer.
            </div>
          </div>
          <button
            onClick={login}
            disabled={status === "loading"}
            className="shrink-0 px-5 py-2.5 rounded-xl font-bold text-black transition disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ background: "linear-gradient(90deg,#22d3ee,#0891b2)" }}
          >
            {status === "loading" ? "Connecting…" : "Connect Internet Identity"}
          </button>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {/* Balance + principal */}
          <div className="space-y-3">
            <div className="rounded-xl p-5 border border-cyan-300/20 bg-cyan-300/[0.04]">
              <div className="text-[10px] uppercase tracking-widest text-cyan-300 mb-2">
                Balance
              </div>
              <div className="text-3xl md:text-4xl font-black tabular-nums leading-none">
                {balance !== null ? formatLWP(balance, 4) : "—"}
              </div>
              <div className="text-[11px] text-gray-500 mt-1.5 font-mono">LWP</div>
            </div>
            <div className="rounded-xl p-5 border border-white/10 bg-white/[0.02]">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] uppercase tracking-widest text-gray-400">
                  Your Principal
                </div>
                <button
                  onClick={copyPrincipal}
                  className="text-[10px] uppercase tracking-widest text-cyan-300 hover:text-cyan-200 transition"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <div className="text-xs md:text-sm font-mono text-gray-200 break-all leading-snug">
                {shortenPrincipal(principal)}
              </div>
            </div>
          </div>

          {/* Buy flows */}
          <div className="space-y-3">
            {/* Demo Buy (direct mint) */}
            <div className="rounded-xl p-5 border border-cyan-300/30 bg-gradient-to-br from-cyan-300/[0.06] to-white/[0.01]">
              <div className="text-[10px] uppercase tracking-widest text-cyan-300 mb-2">
                Buy LWP (demo)
              </div>
              <div className="flex items-center gap-2 mb-3">
                <label htmlFor="buy-amt" className="sr-only">
                  Amount of LWP to buy
                </label>
                <input
                  id="buy-amt"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={amountLwp}
                  onChange={(e) => setAmountLwp(e.target.value)}
                  disabled={status === "buying"}
                  className="w-24 px-2 py-2 rounded-md bg-black/40 border border-white/10 text-white text-sm font-mono text-right focus:outline-none focus:border-cyan-300/60"
                />
                <span className="text-[11px] text-gray-400 font-mono">LWP</span>
              </div>
              <button
                onClick={onBuy}
                disabled={status === "buying"}
                className="w-full py-2.5 rounded-lg font-bold text-[13px] text-black transition disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: "linear-gradient(90deg,#22d3ee,#0891b2)" }}
              >
                {status === "buying" ? "Minting…" : `Buy ${amountLwp || "?"} LWP`}
              </button>
              <div className="text-[10px] text-gray-500 mt-2 leading-snug">
                Local demo: minter mints directly to your II principal. Real LTC deposit below.
              </div>
            </div>

            {/* LTC deposit */}
            <div className="rounded-xl p-5 border border-orange-300/30 bg-gradient-to-br from-orange-400/[0.08] to-white/[0.01]">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] uppercase tracking-widest text-orange-300">
                  Deposit LTC → LWP
                </div>
                <div className="text-[9px] uppercase tracking-widest text-gray-500">
                  {LWP_PER_LTC.toLocaleString()} LWP / LTC
                </div>
              </div>
              <div className="flex items-center gap-2 mb-3">
                <label htmlFor="ltc-amt" className="sr-only">
                  Amount of LTC to deposit
                </label>
                <input
                  id="ltc-amt"
                  type="number"
                  min="0.00000001"
                  step="0.001"
                  value={amountLtc}
                  onChange={(e) => setAmountLtc(e.target.value)}
                  disabled={status === "depositing"}
                  className="w-28 px-2 py-2 rounded-md bg-black/40 border border-white/10 text-white text-sm font-mono text-right focus:outline-none focus:border-orange-300/60"
                />
                <span className="text-[11px] text-gray-400 font-mono">LTC</span>
                <span className="text-[10px] text-gray-500 ml-auto">
                  ≈ {lwpFromLtc.toLocaleString()} LWP
                </span>
              </div>
              <button
                onClick={onDeposit}
                disabled={status === "depositing"}
                className="w-full py-2.5 rounded-lg font-bold text-[13px] text-black transition disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: "linear-gradient(90deg,#fdba74,#f97316)" }}
              >
                {status === "depositing" ? "Confirming…" : `Deposit ${amountLtc || "?"} LTC`}
              </button>
              <div className="text-[10px] text-gray-500 mt-2 leading-snug">
                <strong className="text-orange-300">Demo oracle.</strong> Real flow: send LTC with
                your principal in OP_RETURN, the oracle mints after 2 confirmations. Nothing
                real is moved here — we mint the equivalent LWP directly.
              </div>
              {lastTx && (
                <div className="mt-2 text-[11px] text-orange-200 font-mono break-all">
                  ✓ minted · tx #{lastTx}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {supply !== null && (
        <div className="mt-5 text-[10px] text-gray-500 font-mono">
          ICRC-1 supply: {formatLWP(supply, 4)} LWP
        </div>
      )}

      {error && (
        <div className="mt-4 text-xs text-red-300 bg-red-500/10 border border-red-500/30 px-3 py-2 rounded-md">
          {error}
        </div>
      )}
    </div>
  );
}
