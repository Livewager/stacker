"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import AppHeader from "@/components/AppHeader";
import { useWalletState } from "@/components/dunk/WalletContext";
import { formatLWP } from "@/lib/icp";
import { Button } from "@/components/ui/Button";
import { AmountField } from "@/components/ui/AmountField";
import { useToast } from "@/components/dunk/Toast";
import { validateLtcAddress } from "@/lib/ltc";
import { DEMO_USD_PER_LWP } from "@/lib/demoRates";

// Mirror the deposit side's fixed rate: 10M LWP per 1 LTC.
const LWP_PER_LTC = 10_000_000;

type Stage = "compose" | "review" | "queued";

import { shortenPrincipal } from "@/lib/principal";

const short = (s: string, head = 8, tail = 8) =>
  shortenPrincipal(s, { head, tail });

export default function WithdrawPage() {
  const { identity, principal, balance, status, login, withdrawLTC } = useWalletState();
  const toast = useToast();

  // Paste-from-clipboard handler for the destination LTC field. Some
  // browsers (Firefox, older Safari) require user-gesture + secure
  // context for clipboard.readText; failure falls through to a
  // contextual toast.
  const pasteLtcAddress = async () => {
    try {
      if (!navigator.clipboard?.readText) {
        throw new Error("clipboard read unavailable");
      }
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) {
        toast.push({ kind: "warning", title: "Clipboard is empty" });
        return;
      }
      setLtcAddress(text);
      // Paste is a deliberate interaction — mark touched so any
      // wrong-network ("That's a Bitcoin address") warning lands
      // immediately instead of waiting for an unrelated blur.
      setAddrTouched(true);
      toast.push({ kind: "success", title: "Pasted from clipboard" });
    } catch {
      toast.push({
        kind: "error",
        title: "Paste blocked",
        description: "Long-press the field and paste manually.",
      });
    }
  };
  const [ltcAddress, setLtcAddress] = useState("");
  // Ref on the address input so the clear × button can refocus after
  // wiping. Mirrors /send's recipient clear pattern (POLISH-235).
  const addrInputRef = useRef<HTMLInputElement | null>(null);
  const [amount, setAmount] = useState("");
  const [stage, setStage] = useState<Stage>("compose");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    burnTxId: string;
    payoutId: string;
    etaMinutes: number;
    ltcAmount: number;
  } | null>(null);

  // Structural LTC address check — shared with /deposit and anywhere
  // else we surface a destination field. Only flags format errors;
  // the real oracle still runs a cryptographic checksum before
  // broadcast, which we can't do without adding base58 + bech32 libs
  // to the client bundle.
  const addrCheck = useMemo(() => validateLtcAddress(ltcAddress), [ltcAddress]);
  // Track whether the user has interacted with the address field so
  // a pristine empty input doesn't immediately surface "Required".
  // Flips true on first character OR first blur — whichever comes
  // first. Resets when the form resets.
  const [addrTouched, setAddrTouched] = useState(false);

  // --- validation ---
  const validation = useMemo(() => {
    const errors: Record<string, string> = {};
    // Only surface address errors after the field has been touched.
    // Bech32 / L-prefix / bc1 warnings still land on keystroke as
    // soon as the first character is typed — just not on the empty
    // pristine field.
    if (!addrCheck.ok && addrTouched) {
      errors.ltcAddress = addrCheck.reason || "Invalid";
    }

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
  }, [addrCheck, amount, balance]);
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
    setAddrTouched(false);
  };

  useEffect(() => {
    if (!identity && stage !== "compose") reset();
  }, [identity, stage]);

  return (
    <>
      <AppHeader />
      <div className="mx-auto max-w-3xl px-4 md:px-8 py-8 md:py-12">
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
              hint={
                addrCheck.ok && addrCheck.kind
                  ? addrCheck.kind === "bech32"
                    ? "Bech32 address detected (ltc1…) — recommended."
                    : addrCheck.kind === "p2sh"
                      ? "Legacy P2SH address detected (M… / 3…)."
                      : "Legacy address detected (L…)."
                  : "Bech32 ('ltc1…') or legacy (L…/M…). Real oracle validates strictly; demo is generous."
              }
            >
              <div className="flex items-stretch gap-2">
                <div className="relative flex-1 min-w-0">
                  <input
                    ref={addrInputRef}
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="ltc1q…"
                    value={ltcAddress}
                    onChange={(e) => {
                      setLtcAddress(e.target.value);
                      // First keystroke marks the field as touched so
                      // the live error hint lights up. Paste also
                      // triggers this (pasteLtcAddress uses
                      // setLtcAddress too — covered below via the
                      // non-empty branch).
                      if (!addrTouched && e.target.value.length > 0) {
                        setAddrTouched(true);
                      }
                    }}
                    onBlur={() => setAddrTouched(true)}
                    // pr-9 reserves space for the absolute × button
                    // so a long address doesn't slide under it.
                    className={`w-full rounded-md bg-black/40 border pl-3 pr-9 py-2.5 text-sm font-mono text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/50 ${
                      ltcAddress.length === 0
                        ? "border-white/10 focus:border-rose-300/60"
                        : addrCheck.ok
                          ? "border-emerald-300/40 focus:border-emerald-300/70"
                          : "border-red-400/40 focus:border-red-300/70"
                    }`}
                  />
                  {/* Clear × button. Only renders when the field has
                      content — touch-safe ~28px hit target, sits
                      inside the right padding reserved above. Mirrors
                      /send's recipient clear (POLISH-235). */}
                  {ltcAddress.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setLtcAddress("");
                        addrInputRef.current?.focus();
                      }}
                      aria-label="Clear LTC address"
                      title="Clear LTC address"
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-white/[0.06] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/60"
                    >
                      <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden>
                        <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                      </svg>
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={pasteLtcAddress}
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/[0.03] px-3 py-2.5 text-[11px] uppercase tracking-widest text-gray-200 hover:text-white hover:border-white/30 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/60"
                  aria-label="Paste LTC address from clipboard"
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
                    <path d="M7 2a2 2 0 0 0-2 2v1H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-1V4a2 2 0 0 0-2-2H7Zm0 2h6v2H7V4Zm-3 4h12v8H4V8Z" />
                  </svg>
                  Paste
                </button>
              </div>
            </Field>

            {/* Amount. Demo burn has no ledger fee, so balanceLwp is
                just the raw balance; AmountField's chip math and the
                exceeds-balance guard align with validation.amount's
                own balance check. The "you receive" strip sits below
                the field unchanged. */}
            <AmountField
              id="withdraw-amount"
              label="Amount"
              value={amount}
              onChange={setAmount}
              tone="rose"
              error={validation.amount}
              hint={`Rate: ${LWP_PER_LTC.toLocaleString()} LWP → 1 LTC. No burn fee in the demo canister.`}
              balanceLwp={balance !== null ? Number(balance) / 1e8 : null}
            />
            <div className="mt-2 rounded-lg border border-rose-300/30 bg-rose-300/[0.05] px-3 py-2 text-[11px] text-rose-200 font-mono flex items-baseline justify-between">
              <span>You receive</span>
              <span className="tabular-nums text-rose-200 text-sm">
                ≈ {ltcEstimate.toFixed(8)} LTC
              </span>
            </div>

            <div className="flex items-center justify-between pt-2">
              <Link
                href="/wallet"
                className="text-xs uppercase tracking-widest text-gray-400 hover:text-white transition"
              >
                ← Back to wallet
              </Link>
              <Button type="submit" disabled={!formValid} tone="rose">
                Review →
              </Button>
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
      </div>
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
      <Button onClick={onLogin} loading={loading} tone="cyan" size="lg">
        {loading ? "Connecting…" : "Connect Internet Identity"}
      </Button>
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
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const prevBusyRef = useRef(busy);
  // Match /send's review polish: snap focus to the primary action on
  // mount so Enter confirms and SR users get the card announced.
  // preventScroll avoids jumping the page mid lw-reveal entrance.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      confirmRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(id);
  }, []);
  // Retry-path focus audit: when the burn call resolves (busy true →
  // false) WITH an error, re-snap focus to Confirm so the user can
  // press Enter to retry without grabbing the mouse. Without this,
  // some browsers drop focus during the loading transition and the
  // keyboard user has to Tab back to the button. role="alert" on
  // the error block covers SR announcement independently.
  useEffect(() => {
    const wasBusy = prevBusyRef.current;
    prevBusyRef.current = busy;
    if (wasBusy && !busy && error) {
      const id = requestAnimationFrame(() => {
        confirmRef.current?.focus({ preventScroll: true });
      });
      return () => cancelAnimationFrame(id);
    }
  }, [busy, error]);
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
        {/* USD cross-check — same demo peg as /wallet + /send. Mirrors
            the value the user just authorized in a second unit so
            fat-finger amounts (an extra zero in LWP) stand out before
            confirm. Strictly informational: the oracle doesn't quote
            USD; the real payout is LTC. */}
        <Row
          label="Value (demo USD)"
          value={`≈ $${(amountLwp * DEMO_USD_PER_LWP).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`}
        />
        <Row label="Rate" value={`${LWP_PER_LTC.toLocaleString()} LWP / 1 LTC`} />
      </dl>

      {error && (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300"
        >
          {error}
        </div>
      )}

      {/* Stacked on mobile with Confirm on top (primary-action-first
          per the iOS/Android "positive action at top" convention),
          flex row on sm+. POLISH-284 audit: "Burning & queuing…"
          + "← Edit" + 12px gap was cramping the 248px content box
          on 320px viewports (worst case ~262px). Stack avoids the
          overflow and reads more deliberately — Confirm is the
          destructive/real action, so it belongs at eye level
          first; Edit is the escape hatch beneath. fullWidth on
          both so thumb-target is maximized. Desktop layout is
          unchanged (sm:flex-row + sm:justify-between). */}
      <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
        <Button
          onClick={onBack}
          disabled={busy}
          variant="ghost"
          size="sm"
          className="sm:w-auto w-full"
        >
          ← Edit
        </Button>
        <Button
          ref={confirmRef}
          onClick={onConfirm}
          loading={busy}
          tone="rose"
          className="sm:w-auto w-full"
        >
          {busy ? "Burning & queuing…" : "Burn & withdraw"}
        </Button>
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
        <Button onClick={onAgain} tone="rose" size="sm">
          Withdraw more
        </Button>
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
