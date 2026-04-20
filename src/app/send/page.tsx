"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Principal } from "@dfinity/principal";
import AppHeader from "@/components/AppHeader";
import { useWalletState } from "@/components/dunk/WalletContext";
import { formatLWP } from "@/lib/icp";
import { Button } from "@/components/ui/Button";
import { AmountField } from "@/components/ui/AmountField";
import { PrincipalScanner } from "@/components/send/PrincipalScanner";
import { useCopyable } from "@/lib/clipboard";
import {
  listRecentRecipients,
  rememberRecipient,
  forgetRecipient,
  type RecentRecipient,
} from "@/lib/recentRecipients";

// Must mirror canisters/points_ledger/src/lib.rs TRANSFER_FEE.
const TRANSFER_FEE_BASE = 10_000n; // 0.0001 LWP at 8 decimals
const MAX_MEMO_BYTES = 32;

type Stage = "compose" | "review" | "sent";

import { shortenPrincipal } from "@/lib/principal";

const short = (s: string, head = 10, tail = 10) =>
  shortenPrincipal(s, { head, tail });

export default function SendPage() {
  const { identity, principal, balance, status, login, transfer } = useWalletState();

  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [stage, setStage] = useState<Stage>("compose");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [recents, setRecents] = useState<RecentRecipient[]>([]);

  // Hydrate recents after mount so SSR markup matches.
  useEffect(() => {
    setRecents(listRecentRecipients());
  }, []);
  const [txId, setTxId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const feeLwp = Number(TRANSFER_FEE_BASE) / 1e8;

  // ----- validation -----
  const validation = useMemo(() => {
    const errors: Record<string, string> = {};

    if (!to.trim()) {
      errors.to = "Required";
    } else {
      try {
        const p = Principal.fromText(to.trim());
        if (principal && p.toString() === principal) {
          errors.to = "Cannot send to your own principal";
        }
      } catch {
        errors.to = "Not a valid principal";
      }
    }

    const n = Number(amount);
    if (!amount) {
      errors.amount = "Required";
    } else if (!Number.isFinite(n) || n <= 0) {
      errors.amount = "Must be positive";
    } else if (balance !== null) {
      const baseUnits = BigInt(Math.round(n * 1e8));
      if (baseUnits + TRANSFER_FEE_BASE > balance) {
        errors.amount = "Exceeds balance (fee included)";
      }
    }

    if (memo) {
      const bytes = new TextEncoder().encode(memo).byteLength;
      if (bytes > MAX_MEMO_BYTES) {
        errors.memo = `${bytes}/${MAX_MEMO_BYTES} bytes`;
      }
    }

    return errors;
  }, [to, amount, memo, balance, principal]);

  const formValid = Object.keys(validation).length === 0;

  // Live UTF-8 byte count for the memo counter. Memoized so typing
  // in unrelated fields doesn't re-encode. Matches the validation
  // calc above (TextEncoder, byteLength) so the counter agrees with
  // the error state on the byte boundary.
  const memoBytes = useMemo(
    () => (memo ? new TextEncoder().encode(memo).byteLength : 0),
    [memo],
  );
  // Warn tier kicks in at 75% of the cap so the user sees the counter
  // shift amber before they hit a hard error.
  const memoTone: "ok" | "warn" | "over" =
    memoBytes > MAX_MEMO_BYTES
      ? "over"
      : memoBytes >= Math.ceil(MAX_MEMO_BYTES * 0.75)
        ? "warn"
        : "ok";
  const memoCounterCls =
    memoTone === "over"
      ? "text-red-300"
      : memoTone === "warn"
        ? "text-amber-300"
        : "text-gray-500";

  // ----- handlers -----
  const setMax = () => {
    if (balance === null) return;
    const sendable = balance > TRANSFER_FEE_BASE ? balance - TRANSFER_FEE_BASE : 0n;
    setAmount((Number(sendable) / 1e8).toString());
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
      const r = await transfer({
        to: to.trim(),
        amountLwp: Number(amount),
        memo: memo || undefined,
      });
      setTxId(r.txId.toString());
      rememberRecipient(to.trim());
      setRecents(listRecentRecipients());
      setStage("sent");
    } catch (e) {
      setSubmitError((e as Error).message);
      // Stay on the review screen so the user can adjust and retry.
    }
  };

  const reset = () => {
    setTo("");
    setAmount("");
    setMemo("");
    setTxId(null);
    setSubmitError(null);
    setStage("compose");
  };

  // Reset if the user signs out mid-flow.
  useEffect(() => {
    if (!identity && stage !== "compose") {
      reset();
    }
  }, [identity, stage]);

  // ----- render -----
  return (
    <>
      <AppHeader />
      <div className="mx-auto max-w-3xl px-4 md:px-8 py-8 md:py-12">
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs uppercase tracking-widest text-violet-300">Send</span>
            <span
              className="inline-flex items-center rounded-full border border-violet-300/30 bg-violet-300/[0.06] px-2 py-0.5 text-[9px] font-mono uppercase tracking-widest text-violet-200"
              title="Local ICRC-1 ledger — no real money moves"
            >
              demo
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight">Send LWP</h1>
          <p className="text-sm text-gray-400 mt-1 max-w-xl">
            ICRC-1 transfer, signed by your Internet Identity. The points ledger
            deducts amount + {feeLwp.toFixed(4)} LWP fee; the fee is burned.
          </p>
        </div>

        {!identity ? (
          <SignInGate onLogin={login} loading={status === "loading"} />
        ) : stage === "compose" ? (
          <form
            onSubmit={onReview}
            className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 md:p-7 space-y-5"
          >
            {/* Balance chip */}
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

            {/* Recipient */}
            <Field
              label="Recipient principal"
              error={validation.to}
              hint="Any Internet Identity principal. Ask the receiver to copy theirs from /account or scan their QR."
            >
              <div className="flex items-stretch gap-2">
                <input
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="rrkah-fqaaa-aaaaa-aaaaq-cai"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="flex-1 min-w-0 rounded-md bg-black/40 border border-white/10 px-3 py-2.5 text-sm font-mono text-white focus:border-violet-300/60 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setScannerOpen(true)}
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/[0.03] px-3 py-2.5 text-[11px] uppercase tracking-widest text-gray-200 hover:text-white hover:border-white/30 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/60"
                  aria-label="Scan recipient principal QR code"
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
                    <path d="M3 3h5v2H5v3H3V3Zm9 0h5v5h-2V5h-3V3ZM3 12h2v3h3v2H3v-5Zm14 0v5h-5v-2h3v-3h2ZM6 6h3v3H6V6Zm5 0h3v3h-3V6ZM6 11h3v3H6v-3Zm7 0h1v1h-1v-1Zm2 0h1v1h-1v-1Zm-2 2h1v2h-1v-2Zm2 2h1v1h-1v-1Z" />
                  </svg>
                  Scan
                </button>
              </div>
            </Field>

            {/* Recent recipients. Collapses to nothing on first-time
                use so the form stays clean; appears as tappable chips
                once history exists. Click pastes, "×" forgets. */}
            {recents.length > 0 && (
              <div className="-mt-3" aria-label="Recent recipients">
                <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1.5">
                  Recent
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {recents.map((r) => (
                    <div
                      key={r.principal}
                      className="group inline-flex items-center rounded-full border border-white/10 bg-white/[0.03] hover:border-violet-300/40 hover:bg-violet-300/[0.05] transition"
                    >
                      <button
                        type="button"
                        onClick={() => setTo(r.principal)}
                        className="px-3 py-1 text-[11px] font-mono text-gray-200 hover:text-white transition focus:outline-none focus-visible:text-white"
                        title={`Use ${r.principal}`}
                      >
                        {short(r.principal, 6, 4)}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          forgetRecipient(r.principal);
                          setRecents(listRecentRecipients());
                        }}
                        className="px-2 py-1 text-gray-500 hover:text-red-300 transition focus:outline-none focus-visible:text-red-300"
                        aria-label={`Forget recipient ${r.principal}`}
                      >
                        <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3">
                          <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Amount: balance passed fee-reduced so "Max" chip auto-
                subtracts the 0.0001 LWP transfer fee the ledger will
                charge. Exceeds-balance guard uses the same reduced
                budget, matching validation.amount's fee-inclusive check. */}
            <AmountField
              id="send-amount"
              label="Amount"
              value={amount}
              onChange={setAmount}
              tone="violet"
              error={validation.amount}
              hint={`Fee: ${feeLwp.toFixed(4)} LWP (burned).`}
              balanceLwp={
                balance !== null
                  ? Number(balance > TRANSFER_FEE_BASE ? balance - TRANSFER_FEE_BASE : 0n) /
                    1e8
                  : null
              }
            />

            {/* Memo */}
            <Field
              label="Memo (optional)"
              error={validation.memo}
              hint={`Max ${MAX_MEMO_BYTES} bytes. Stored on the ICRC-3 block — publicly readable.`}
              meta={
                <span className={memoCounterCls} aria-live="polite">
                  {memoBytes}/{MAX_MEMO_BYTES} B
                </span>
              }
            >
              <input
                type="text"
                maxLength={128}
                placeholder="what's this for?"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                aria-describedby="memo-counter"
                className={`w-full rounded-md bg-black/40 border px-3 py-2.5 text-sm text-white focus:outline-none ${
                  memoTone === "over"
                    ? "border-red-400/50 focus:border-red-300/70"
                    : memoTone === "warn"
                      ? "border-amber-400/40 focus:border-amber-300/70"
                      : "border-white/10 focus:border-violet-300/60"
                }`}
              />
            </Field>

            <div className="flex items-center justify-between pt-2">
              <Link
                href="/wallet"
                className="text-xs uppercase tracking-widest text-gray-400 hover:text-white transition"
              >
                ← Back to wallet
              </Link>
              <Button type="submit" disabled={!formValid} tone="violet">
                Review →
              </Button>
            </div>
          </form>
        ) : stage === "review" ? (
          <ReviewCard
            from={principal}
            to={to.trim()}
            amountLwp={Number(amount)}
            memo={memo}
            feeLwp={feeLwp}
            busy={status === "sending"}
            error={submitError}
            onBack={() => setStage("compose")}
            onConfirm={onConfirm}
          />
        ) : (
          <ResultCard txId={txId!} to={to.trim()} amountLwp={Number(amount)} onAgain={reset} />
        )}
      </div>

      <PrincipalScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onResult={(value) => {
          setTo(value);
          setScannerOpen(false);
        }}
      />
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
  meta,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  /** Right-aligned slot next to the label — e.g. live character
   *  counter. Hidden while `error` is set so we don't stack two
   *  small lines of text on top of the input. */
  meta?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between mb-1.5">
        <div className="text-[10px] uppercase tracking-widest text-gray-400">{label}</div>
        {error ? (
          <div className="text-[10px] text-red-300">{error}</div>
        ) : meta ? (
          <div className="text-[10px] text-gray-500 font-mono tabular-nums">{meta}</div>
        ) : null}
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
      <div className="text-[11px] uppercase tracking-widest text-violet-300 mb-3">
        Sign in required
      </div>
      <h2 className="text-2xl md:text-3xl font-black text-white mb-2">
        Connect to send LWP.
      </h2>
      <p className="text-sm text-gray-300 max-w-md mx-auto mb-5 leading-snug">
        Transfers are signed by your Internet Identity. Nothing moves without your
        key — we can&apos;t sign for you.
      </p>
      <Button onClick={onLogin} loading={loading} tone="cyan" size="lg">
        {loading ? "Connecting…" : "Connect Internet Identity"}
      </Button>
    </div>
  );
}

function ReviewCard({
  from,
  to,
  amountLwp,
  memo,
  feeLwp,
  busy,
  error,
  onBack,
  onConfirm,
}: {
  from: string;
  to: string;
  amountLwp: number;
  memo: string;
  feeLwp: number;
  busy: boolean;
  error: string | null;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const totalLwp = amountLwp + feeLwp;
  return (
    <div className="lw-reveal rounded-2xl border border-violet-300/30 bg-violet-300/[0.04] p-5 md:p-7 space-y-5">
      <div>
        <div className="text-[10px] uppercase tracking-widest text-violet-300 mb-1">
          Review
        </div>
        <h2 className="text-2xl font-black text-white">Send {amountLwp} LWP</h2>
      </div>

      <dl className="divide-y divide-white/5 rounded-xl border border-white/10 bg-black/30">
        <ReviewRow label="From" value={short(from)} mono />
        <ReviewRow label="To" value={short(to)} mono />
        <ReviewRow label="Amount" value={`${amountLwp} LWP`} />
        <ReviewRow label="Fee" value={`${feeLwp.toFixed(4)} LWP (burned)`} />
        <ReviewRow
          label="Total debited"
          value={`${totalLwp.toFixed(4)} LWP`}
          emphasis
        />
        {memo && <ReviewRow label="Memo" value={memo} />}
      </dl>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <Button onClick={onBack} disabled={busy} variant="ghost" size="sm">
          ← Edit
        </Button>
        <Button onClick={onConfirm} loading={busy} tone="violet">
          {busy ? "Signing…" : "Confirm & send"}
        </Button>
      </div>

      <div className="text-[11px] text-gray-500 leading-snug">
        Your II will sign this transfer. Nothing touches our servers — the call goes
        straight to the ICRC-1 ledger.
      </div>
    </div>
  );
}

function ReviewRow({
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

function ResultCard({
  txId,
  to,
  amountLwp,
  onAgain,
}: {
  txId: string;
  to: string;
  amountLwp: number;
  onAgain: () => void;
}) {
  const copy = useCopyable();
  // "Sent N LWP · tx #X · livewager.io" — fixed order so screenshots
  // stay legible. Native share sheet when available (mobile + some
  // desktop browsers); clipboard fallback everywhere else. Never
  // references the recipient — that's their business, not the
  // screenshotter's.
  const shareLine = `Sent ${amountLwp} LWP · tx #${txId} · livewager.io`;
  const onShare = async () => {
    const nav = typeof navigator !== "undefined" ? navigator : null;
    // Web Share API requires a user gesture and a secure context;
    // safe to feature-test at call time.
    if (nav && typeof nav.share === "function") {
      try {
        await nav.share({ title: "Livewager", text: shareLine });
        return;
      } catch {
        // User cancelled or share rejected — silently fall through to
        // the clipboard path so the gesture still yields something
        // useful.
      }
    }
    await copy(shareLine, { label: "Send receipt" });
  };
  return (
    <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/[0.05] p-5 md:p-7 text-center">
      <div
        className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-emerald-400/50 bg-emerald-400/10 text-emerald-300"
        aria-hidden
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-7 w-7">
          <path d="M16.707 5.293a1 1 0 0 1 0 1.414l-7.5 7.5a1 1 0 0 1-1.414 0l-3.5-3.5a1 1 0 1 1 1.414-1.414L8.5 12.086l6.793-6.793a1 1 0 0 1 1.414 0Z" />
        </svg>
      </div>
      <div className="text-[11px] uppercase tracking-widest text-emerald-300 mb-2">
        Sent
      </div>
      <h2 className="text-2xl md:text-3xl font-black text-white mb-1">
        {amountLwp} LWP on its way.
      </h2>
      <p className="text-sm text-gray-300 leading-snug max-w-sm mx-auto mb-5">
        Ledger tx <span className="font-mono text-white">#{txId}</span> · recipient{" "}
        <span className="font-mono text-white">{short(to, 8, 8)}</span>
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button
          onClick={onShare}
          variant="outline"
          size="sm"
          aria-label="Share or copy send receipt"
        >
          Share
        </Button>
        <Link
          href="/account"
          className="px-4 py-2 rounded-lg border border-white/15 text-gray-200 hover:text-white hover:border-white/30 transition text-sm"
        >
          View in activity
        </Link>
        <Button onClick={onAgain} tone="violet" size="sm">
          Send another
        </Button>
      </div>
    </div>
  );
}
