"use client";

import { useState } from "react";
import { QRPlaceholder } from "./QRPlaceholder";
import { ConfirmationRail, type ConfirmationStep } from "./ConfirmationRail";
import { useWalletState } from "@/components/dunk/WalletContext";

// Keep in sync with src/app/api/dunk/ltc-deposit/route.ts.
const LWP_PER_LTC = 10_000_000;
// Static watch address for the demo. Real flow derives this from the
// oracle canister at init time.
const DEMO_WATCH_ADDRESS = "ltc1qdemo0dunk0app0watch0address0xxxxxxxxxx0k9";

export function LtcDepositPanel() {
  const { identity, principal, depositLTC, login, status } = useWalletState();
  const [amount, setAmount] = useState("0.001");
  const [step, setStep] = useState<ConfirmationStep>("idle");
  const [copied, setCopied] = useState<"addr" | "mem" | null>(null);

  const lwpPreview =
    Number.isFinite(Number(amount)) && Number(amount) > 0
      ? Number(amount) * LWP_PER_LTC
      : 0;

  const copy = async (what: "addr" | "mem", value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(what);
      setTimeout(() => setCopied(null), 1200);
    } catch {
      /* clipboard blocked */
    }
  };

  const runDeposit = async () => {
    if (!identity) return;
    setStep("signed");
    // Simulate the oracle's stages. The real /api call runs concurrently;
    // the staged timeouts give the cadence an oracle-like feel so the
    // visualizer isn't just two instant states.
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => setStep("seen"), 350));
    timers.push(setTimeout(() => setStep("confirm"), 900));
    try {
      await depositLTC(Number(amount));
      setStep("minted");
      setTimeout(() => setStep("idle"), 3200);
    } catch {
      // depositLTC already surfaced the error via toast.
      setStep("idle");
    } finally {
      timers.forEach(clearTimeout);
    }
  };

  const signedIn = !!identity;
  const busy = status === "depositing";

  return (
    <div className="grid gap-6 md:grid-cols-[260px_1fr]">
      {/* Left: QR preview */}
      <div className="flex flex-col items-center gap-3">
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
          <QRPlaceholder
            seed={signedIn ? principal : "anon-demo-address"}
            size={224}
            className="rounded-xl"
          />
        </div>
        <div className="text-[10px] uppercase tracking-widest text-gray-500">
          Demo address · do not send real LTC
        </div>
      </div>

      {/* Right: fields + action */}
      <div className="space-y-4">
        <div>
          <label className="text-[10px] uppercase tracking-widest text-gray-400 mb-1 block">
            Watch address
          </label>
          <div className="flex items-stretch gap-2">
            <code className="flex-1 min-w-0 truncate rounded-md border border-white/10 bg-black/40 px-3 py-2 text-xs font-mono text-gray-200">
              {DEMO_WATCH_ADDRESS}
            </code>
            <button
              onClick={() => copy("addr", DEMO_WATCH_ADDRESS)}
              className="rounded-md border border-white/15 px-3 text-[11px] uppercase tracking-widest text-gray-200 hover:text-white hover:border-white/30 transition"
            >
              {copied === "addr" ? "Copied" : "Copy"}
            </button>
          </div>
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-widest text-gray-400 mb-1 block">
            OP_RETURN memo · your principal
          </label>
          <div className="flex items-stretch gap-2">
            <code className="flex-1 min-w-0 truncate rounded-md border border-white/10 bg-black/40 px-3 py-2 text-xs font-mono text-gray-200">
              {signedIn ? principal : "Sign in to reveal"}
            </code>
            <button
              onClick={() => signedIn && copy("mem", principal)}
              disabled={!signedIn}
              className="rounded-md border border-white/15 px-3 text-[11px] uppercase tracking-widest text-gray-200 hover:text-white hover:border-white/30 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {copied === "mem" ? "Copied" : "Copy"}
            </button>
          </div>
          <div className="mt-1 text-[11px] text-gray-500 leading-snug">
            In production, your LTC wallet encodes this as OP_RETURN. The oracle reads
            it to credit LWP to the right principal — no KYC layer needed.
          </div>
        </div>

        <div className="grid grid-cols-[1fr_auto] items-end gap-3 rounded-xl border border-orange-300/30 bg-orange-300/[0.05] p-3">
          <div>
            <label className="text-[10px] uppercase tracking-widest text-orange-300 mb-1 block">
              Amount
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0.00000001"
                step="0.001"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={busy}
                className="w-32 rounded-md border border-white/10 bg-black/50 px-3 py-2 text-sm font-mono text-right text-white focus:border-orange-300/60 focus:outline-none"
              />
              <span className="text-[11px] font-mono text-gray-400">LTC</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">
              You receive
            </div>
            <div className="font-mono text-lg tabular-nums text-white">
              {lwpPreview.toLocaleString()}{" "}
              <span className="text-xs text-gray-500">LWP</span>
            </div>
            <div className="text-[10px] text-gray-500">
              rate {LWP_PER_LTC.toLocaleString()} LWP / LTC
            </div>
          </div>
        </div>

        {!signedIn ? (
          <button
            onClick={login}
            className="w-full py-3 rounded-xl font-bold text-black transition hover:brightness-110"
            style={{ background: "linear-gradient(90deg,#22d3ee,#0891b2)" }}
          >
            Connect Internet Identity to continue
          </button>
        ) : (
          <button
            onClick={runDeposit}
            disabled={busy}
            className="w-full py-3 rounded-xl font-bold text-black transition hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: "linear-gradient(90deg,#fdba74,#f97316)" }}
          >
            {busy ? "Confirming…" : `Deposit ${amount || "?"} LTC`}
          </button>
        )}

        <ConfirmationRail step={step} />

        <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3 text-[11px] text-gray-400 leading-snug">
          <div className="text-orange-300 font-semibold mb-1">Demo oracle</div>
          Nothing real is sent on-chain. The server mints the equivalent LWP directly
          so you can feel the flow. The production oracle observes real LTC, waits 2
          confirmations, then calls mint.
        </div>
      </div>
    </div>
  );
}
