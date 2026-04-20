"use client";

import { useState } from "react";
import { WatchAddressQR } from "./WatchAddressQR";
import { ConfirmationRail, type ConfirmationStep } from "./ConfirmationRail";
import { useWalletState } from "@/components/dunk/WalletContext";
import { useCopyable } from "@/lib/clipboard";

// Keep in sync with src/app/api/dunk/ltc-deposit/route.ts.
const LWP_PER_LTC = 10_000_000;
// Static watch address for the demo. Real flow derives this from the
// oracle canister at init time.
const DEMO_WATCH_ADDRESS = "ltc1qdemo0dunk0app0watch0address0xxxxxxxxxx0k9";

// LTC typically finalises at 6 confirmations. We fake-tick toward that
// target during the confirm step so the UI shows real progression
// instead of a vague spinner. Demo-only — the real oracle waits on
// actual block observations.
const DEMO_CONFIRM_TARGET = 6;
const DEMO_CONFIRM_TICK_MS = 450;

export function LtcDepositPanel() {
  const { identity, principal, depositLTC, login, status } = useWalletState();
  const [amount, setAmount] = useState("0.001");
  const [step, setStep] = useState<ConfirmationStep>("idle");
  const [confirmCount, setConfirmCount] = useState(0);
  const [copied, setCopied] = useState<"addr" | "mem" | null>(null);

  const lwpPreview =
    Number.isFinite(Number(amount)) && Number(amount) > 0
      ? Number(amount) * LWP_PER_LTC
      : 0;

  const clipboard = useCopyable();
  const copy = async (what: "addr" | "mem", value: string) => {
    const label = what === "addr" ? "Address" : "Memo";
    // `silent` keeps the local "copied ✓" checkmark as the success
    // signal; we don't want a toast stacking on top of the inline UX.
    const ok = await clipboard(value, { label, silent: true });
    if (ok) {
      setCopied(what);
      setTimeout(() => setCopied(null), 1200);
    }
  };

  const runDeposit = async () => {
    if (!identity) return;
    setStep("signed");
    setConfirmCount(0);
    // Simulate the oracle's stages. The real /api call runs concurrently;
    // the staged timeouts give the cadence an oracle-like feel so the
    // visualizer isn't just two instant states. A separate interval
    // ticks the confirmation counter once we enter the confirm stage
    // — clamped to TARGET so it never visually outruns the /api.
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => setStep("seen"), 350));
    timers.push(
      setTimeout(() => {
        setStep("confirm");
      }, 900),
    );
    const confirmInterval = window.setInterval(() => {
      setConfirmCount((c) => Math.min(DEMO_CONFIRM_TARGET, c + 1));
    }, DEMO_CONFIRM_TICK_MS);
    try {
      await depositLTC(Number(amount));
      setConfirmCount(DEMO_CONFIRM_TARGET); // snap to full on success
      setStep("minted");
      setTimeout(() => {
        setStep("idle");
        setConfirmCount(0);
      }, 3200);
    } catch {
      // depositLTC already surfaced the error via toast.
      setStep("idle");
      setConfirmCount(0);
    } finally {
      timers.forEach(clearTimeout);
      window.clearInterval(confirmInterval);
    }
  };

  const signedIn = !!identity;
  const busy = status === "depositing";

  return (
    <div className="grid gap-6 md:grid-cols-[260px_1fr]">
      {/* Left: QR of the watch address. Real scannable BIP-21 litecoin:
          URI so a phone wallet opens with the address prefilled — but
          the address itself is the demo watch string, so nothing real
          moves. Demo caption stays prominent. */}
      <div className="flex flex-col items-center gap-3">
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
          <WatchAddressQR address={DEMO_WATCH_ADDRESS} size={224} />
        </div>
        <div className="text-[10px] uppercase tracking-widest text-gray-500 text-center leading-snug">
          Demo address · do not send real LTC
          <div className="mt-0.5 normal-case tracking-normal text-[10px] text-gray-600">
            Scan with any LTC wallet to see the prefill flow
          </div>
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

        <ConfirmationRail
          step={step}
          confirmations={{ current: confirmCount, target: DEMO_CONFIRM_TARGET }}
        />

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
