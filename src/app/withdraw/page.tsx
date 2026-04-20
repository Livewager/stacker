"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";
import { useWalletState } from "@/components/dunk/WalletContext";
import { formatLWP } from "@/lib/icp";

// Mirror the deposit side's fixed rate: 10M LWP per 1 LTC.
const LWP_PER_LTC = 10_000_000;

type Stage = "compose" | "review" | "queued";

function short(s: string, h = 8, t = 8) {
  if (s.length <= h + t + 1) return s;
  return `${s.slice(0, h)}…${s.slice(-t)}`;
}

export default function WithdrawPage() {
  const { identity, principal, balance, status, login, withdrawLTC } = useWalletState();
  const [ltcAddress, setLtcAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [stage, setStage] = useState<Stage>("compose");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    burnTxId: string;
    payoutId: string;
    etaMinutes: number;
    ltcAmount: number;
  } | null>(null);

  // --- validation ---
  const validation = useMemo(() => {
    const errors: Record<string, string> = {};

    const a = ltcAddress.trim();
    if (!a) errors.ltcAddress = "Required";
    else if (a.length < 25 || a.length > 90) errors.ltcAddress = "Looks too short / long";
    else if (!/^[a-km-zA-HJ-NP-Z0-9]+$|^ltc1[0-9a-z]+$/.test(a))
      errors.ltcAddress = "Contains characters an LTC address shouldn't";

    const n = Number(amount);
    if (!amount) {
      errors.amount = "Required";
    } else if (!Number.isFinite(n) || n <= 0) {
      errors.amount = "Must be positive";
    } else if (balance !== null) {
      const baseUnits = BigInt(Math.round(n * 1e8));
      if (baseUnits > balance) {
        errors.amount = "Exceeds balance";
      }
    }

    return errors;
  }, [ltcAddress, amount, balance]);
  const formValid = Object.keys(validation).length === 0;

  // LTC estimate: amount (LWP) / LWP_PER_LTC.
  const ltcEstimate = useMemo(() => {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return n / LWP_PER_LTC;
  }, [amount]);

  // --- handlers ---
  const setMax = () => {
    if (balance === null) return;
    // No fee to burn (canister burn is fee-free), so we can withdraw
    // the entire balance if they want.
    setAmount((Number(balance) / 1e8).toString());
  };

  const onReview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formValid) return;
    setSubmitError(null);
    setStage("review");
  };

  const onConfirm = async () => {
    setSubmitError(null);
    try {
      const r = await withdrawLTC({
        ltcAddress: ltcAddress.trim(),
        amountLwp: Number(amount),
      });
      setResult({
        burnTxId: r.burnTxId.toString(),
        payoutId: r.payoutId,
        etaMinutes: r.etaMinutes,
        ltcAmount: r.ltcAmount,
      });
      setStage("queued");
    } catch (e) {
      setSubmitError((e as Error).message);
    }
  };

  const reset = () => {
    setLtcAddress("");
    setAmount("");
    setResult(null);
    setSubmitError(null);
    setStage("compose");
  };

  useEffect(() => {
    if (!identity && stage !== "compose") reset();
  }, [identity, stage]);

  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 md:px-8 py-8 md:py-12">
        <div className="mb-6">
          <div className="text-xs uppercase tracking-widest text-rose-300 mb-2">
            Withdraw
          </div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight">
            Withdraw to Litecoin
          </h1>
          <p className="text-sm text-gray-400 mt-1 max-w-xl">
            Burns your LWP on-ledger and queues an LTC payout. The burn is real and
            recorded on ICRC-3; the payout is <strong className="text-rose-300">mocked in demo</strong>{" "}
            — no actual Litecoin leaves the machine.
          </p>
        </div>

        {!identity ? (
          <SignInGate onLogin={login} loading={status === "loading"} />
        ) : stage === "compose" ? (
          <form
            onSubmit={onReview}
            className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 md:p-7 space-y-5"
          >
            {/* From / balance strip */}
            <div className="flex items-center justify-between pb-3 border-b border-white/5">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-gray-400">
                  From
                </div>
                <div className="text-sm font-mono text-white">{short(principal)}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-widest text-gray-400">
                  Balance
                </div>
                <div className="text-sm font-mono tabular-nums text-cyan-300">
                  {balance !== null ? formatLWP(balance, 4) : "—"} LWP
                </div>
              </div>
            </div>

            {/* LTC address */}
            <Field
              label="Destination LTC address"
              error={validation.ltcAddress}
              hint="Bech32 ('ltc1…') or legacy. The real oracle validates strictly; demo is generous."
            >
              <input
                type="text"
                autoComplete="off"
                spellCheck={false}
                placeholder="ltc1q…"
                value={ltcAddress}
                onChange={(e) => setLtcAddress(e.target.value)}
                className="w-full rounded-md bg-black/40 border border-white/10 px-3 py-2.5 text-sm font-mono text-white focus:border-rose-300/60 focus:outline-none"
              />
            </Field>

            {/* Amount */}
            <Field
              label="Amount"
              error={validation.amount}
              hint={`Rate: ${LWP_PER_LTC.toLocaleString()} LWP → 1 LTC. No burn fee in the demo canister.`}
            >
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.0001"
                  placeholder="0.0000"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="flex-1 rounded-md bg-black/40 border border-white/10 px-3 py-2.5 text-sm font-mono text-right text-white focus:border-rose-300/60 focus:outline-none"
                />
                <span className="text-[11px] font-mono text-gray-400 shrink-0">LWP</span>
                <button
                  type="button"
                  onClick={setMax}
                  className="rounded-md border border-white/15 px-3 py-2 text-[11px] uppercase tracking-widest text-gray-200 hover:text-white hover:border-white/30 transition"
                >
                  Max
                </button>
              </div>
              <div className="mt-2 rounded-lg border border-rose-300/30 bg-rose-300/[0.05] px-3 py-2 text-[11px] text-rose-200 font-mono flex items-baseline justify-between">
                <span>You receive</span>
                <span className="tabular-nums text-rose-200 text-sm">
                  ≈ {ltcEstimate.toFixed(8)} LTC
                </span>
              </div>
            </Field>

            <div className="flex items-center justify-between pt-2">
              <Link
                href="/wallet"
                className="text-xs uppercase tracking-widest text-gray-400 hover:text-white transition"
              >
                ← Back to wallet
              </Link>
              <button
                type="submit"
                disabled={!formValid}
                className="px-5 py-2.5 rounded-xl font-bold text-black transition hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: "linear-gradient(90deg,#fda4af,#f43f5e)" }}
              >
                Review →
              </button>
            </div>
          </form>
        ) : stage === "review" ? (
          <ReviewCard
            from={principal}
            ltcAddress={ltcAddress.trim()}
            amountLwp={Number(amount)}
            ltcAmount={ltcEstimate}
            busy={status === "withdrawing"}
            error={submitError}
            onBack={() => setStage("compose")}
            onConfirm={onConfirm}
          />
        ) : (
          <QueuedCard
            result={result!}
            ltcAddress={ltcAddress.trim()}
            onAgain={reset}
          />
        )}

        {/* Trust strip */}
        <div className="mt-6 grid gap-3 md:grid-cols-3 text-xs text-gray-400">
          <InfoTile
            title="Burn is real"
            body="Your LWP is destroyed on-chain. Total supply drops by the amount burned. The block is public on ICRC-3."
          />
          <InfoTile
            title="Payout is mocked"
            body="No LTC leaves the machine. The production oracle signs and broadcasts from a multi-sig cold wallet."
          />
          <InfoTile
            title="Audit trail"
            body="Every withdrawal leaves an ICRC-3 burn block with the destination in the memo — reconcilable from /account."
          />
        </div>
      </main>
    </>
  );
}

// ----------------------------------------------------------------
// Subcomponents
// ----------------------------------------------------------------

function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between mb-1.5">
        <div className="text-[10px] uppercase tracking-widest text-gray-400">
          {label}
        </div>
        {error && <div className="text-[10px] text-red-300">{error}</div>}
      </div>
      {children}
      {hint && !error && (
        <div className="mt-1 text-[11px] text-gray-500 leading-snug">{hint}</div>
      )}
    </label>
  );
}

function SignInGate({ onLogin, loading }: { onLogin: () => void; loading: boolean }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 md:p-10 text-center">
      <div className="text-[11px] uppercase tracking-widest text-rose-300 mb-3">
        Sign in required
      </div>
      <h2 className="text-2xl md:text-3xl font-black text-white mb-2">
        Connect to withdraw.
      </h2>
      <p className="text-sm text-gray-300 max-w-md mx-auto mb-5 leading-snug">
        Withdrawals are signed by your Internet Identity. The burn is real — your key,
        your signature.
      </p>
      <button
        onClick={onLogin}
        disabled={loading}
        className="px-6 py-3 rounded-xl font-bold text-black transition hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed"
        style={{ background: "linear-gradient(90deg,#22d3ee,#0891b2)" }}
      >
        {loading ? "Connecting…" : "Connect Internet Identity"}
      </button>
    </div>
  );
}

function ReviewCard({
  from,
  ltcAddress,
  amountLwp,
  ltcAmount,
  busy,
  error,
  onBack,
  onConfirm,
}: {
  from: string;
  ltcAddress: string;
  amountLwp: number;
  ltcAmount: number;
  busy: boolean;
  error: string | null;
  onBack: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="lw-reveal rounded-2xl border border-rose-300/30 bg-rose-300/[0.04] p-5 md:p-7 space-y-5">
      <div>
        <div className="text-[10px] uppercase tracking-widest text-rose-300 mb-1">
          Review
        </div>
        <h2 className="text-2xl font-black text-white">
          Burn {amountLwp} LWP → ≈ {ltcAmount.toFixed(8)} LTC
        </h2>
      </div>

      <dl className="divide-y divide-white/5 rounded-xl border border-white/10 bg-black/30">
        <Row label="From" value={short(from)} mono />
        <Row label="To (LTC)" value={short(ltcAddress, 14, 10)} mono />
        <Row label="Burn" value={`${amountLwp} LWP`} />
        <Row label="Estimated payout" value={`≈ ${ltcAmount.toFixed(8)} LTC`} emphasis />
        <Row label="Rate" value={`${LWP_PER_LTC.toLocaleString()} LWP / 1 LTC`} />
      </dl>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <button
          onClick={onBack}
          disabled={busy}
          className="text-xs uppercase tracking-widest text-gray-300 hover:text-white transition disabled:opacity-50"
        >
          ← Edit
        </button>
        <button
          onClick={onConfirm}
          disabled={busy}
          className="px-5 py-2.5 rounded-xl font-bold text-black transition hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: "linear-gradient(90deg,#fda4af,#f43f5e)" }}
        >
          {busy ? "Burning & queuing…" : "Burn & withdraw"}
        </button>
      </div>

      <div className="text-[11px] text-rose-200/80 leading-snug">
        The burn is <strong>permanent</strong>. In demo mode the LTC payout is mocked —
        your balance drops but no Litecoin actually sends.
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  emphasis,
}: {
  label: string;
  value: string;
  mono?: boolean;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <dt className="text-[10px] uppercase tracking-widest text-gray-500">{label}</dt>
      <dd
        className={`text-right ${mono ? "font-mono" : ""} ${
          emphasis ? "text-white text-base font-semibold" : "text-gray-200 text-sm"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function QueuedCard({
  result,
  ltcAddress,
  onAgain,
}: {
  result: {
    burnTxId: string;
    payoutId: string;
    etaMinutes: number;
    ltcAmount: number;
  };
  ltcAddress: string;
  onAgain: () => void;
}) {
  const [eta, setEta] = useState(result.etaMinutes * 60);
  useEffect(() => {
    const id = window.setInterval(() => setEta((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(id);
  }, []);
  const mm = Math.floor(eta / 60);
  const ss = eta % 60;

  return (
    <div className="rounded-2xl border border-amber-300/30 bg-amber-300/[0.05] p-5 md:p-7 text-center">
      <div
        className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-amber-300/50 bg-amber-300/10 text-amber-300"
        aria-hidden
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-7 w-7">
          <path d="M10 1a1 1 0 0 1 1 1v7.586l3.293-3.293a1 1 0 0 1 1.414 1.414l-5 5a1 1 0 0 1-1.414 0l-5-5a1 1 0 0 1 1.414-1.414L9 9.586V2a1 1 0 0 1 1-1Z" />
        </svg>
      </div>
      <div className="text-[11px] uppercase tracking-widest text-amber-300 mb-2">
        Queued
      </div>
      <h2 className="text-2xl md:text-3xl font-black text-white mb-1">
        ≈ {result.ltcAmount.toFixed(8)} LTC on the way.
      </h2>
      <p className="text-sm text-gray-300 leading-snug max-w-md mx-auto mb-5">
        Burn tx <span className="font-mono text-white">#{result.burnTxId}</span> · payout{" "}
        <span className="font-mono text-white">{result.payoutId}</span> →{" "}
        <span className="font-mono text-white">{short(ltcAddress, 10, 10)}</span>
      </p>

      <div
        className="mx-auto mb-5 flex items-center justify-between max-w-xs rounded-xl border border-amber-300/20 bg-black/30 px-4 py-3"
        aria-live="polite"
      >
        <div className="text-[10px] uppercase tracking-widest text-amber-300/80">
          ETA
        </div>
        <div className="font-mono text-xl tabular-nums text-amber-200">
          {String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}
        </div>
      </div>

      <div className="flex items-center justify-center gap-3">
        <Link
          href="/account"
          className="px-4 py-2 rounded-lg border border-white/15 text-gray-200 hover:text-white hover:border-white/30 transition text-sm"
        >
          View burn in activity
        </Link>
        <button
          onClick={onAgain}
          className="px-4 py-2 rounded-lg font-bold text-black transition hover:brightness-110 text-sm"
          style={{ background: "linear-gradient(90deg,#fda4af,#f43f5e)" }}
        >
          Withdraw more
        </button>
      </div>
      <div className="mt-4 text-[11px] text-amber-200/70 leading-snug">
        Demo payout — no real LTC transmitted. See docs/icp/ltc-oracle.md for the
        production flow.
      </div>
    </div>
  );
}

function InfoTile({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <div className="text-[10px] uppercase tracking-widest text-rose-300 mb-1">
        {title}
      </div>
      <div className="text-xs text-gray-300 leading-snug">{body}</div>
    </div>
  );
}
