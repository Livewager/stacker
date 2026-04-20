"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Principal } from "@dfinity/principal";
import AppHeader from "@/components/AppHeader";
import { useWalletState } from "@/components/dunk/WalletContext";
import { formatLWP } from "@/lib/icp";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { AmountField } from "@/components/ui/AmountField";
// Defer the scanner chunk until the user actually opens the sheet.
// PrincipalScanner pulls in the BottomSheet + camera boot path, and
// the BarcodeDetector-using code runs inside its effect only on
// `open`. Splitting it out drops /send's initial JS for the common
// case where a user pastes or types the principal.
//
// `ssr: false` is valid here because this file is a Client Component
// (`"use client"` at the top). Next 15's warning only fires when a
// Server Component calls next/dynamic with `ssr: false` — see
// https://nextjs.org/docs/messages/next-dynamic-no-ssr — and
// `next build` confirms no warning for this call site. The audit
// lives here so a future refactor that pulls this block into a
// server boundary can catch the regression at the diff.
const PrincipalScanner = dynamic(
  () =>
    import("@/components/send/PrincipalScanner").then((m) => ({
      default: m.PrincipalScanner,
    })),
  { ssr: false },
);
import { useCopyable } from "@/lib/clipboard";
import { useToast } from "@/components/dunk/Toast";
import {
  listRecentRecipients,
  rememberRecipient,
  forgetRecipient,
  type RecentRecipient,
} from "@/lib/recentRecipients";
import { DEMO_USD_PER_LWP } from "@/lib/demoRates";

// Must mirror canisters/points_ledger/src/lib.rs TRANSFER_FEE.
const TRANSFER_FEE_BASE = 10_000n; // 0.0001 LWP at 8 decimals
const MAX_MEMO_BYTES = 32;

type Stage = "compose" | "review" | "sent";

import { shortenPrincipal } from "@/lib/principal";

const short = (s: string, head = 10, tail = 10) =>
  shortenPrincipal(s, { head, tail });

export default function SendPage() {
  const { identity, principal, balance, status, login, transfer } = useWalletState();
  const toast = useToast();

  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [stage, setStage] = useState<Stage>("compose");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [recents, setRecents] = useState<RecentRecipient[]>([]);

  // Refs used by the tab-sequence polish: first field gets focus on
  // compose mount, recent-chip use jumps to amount so keyboard users
  // don't have to tab back through the Scan + chip stops.
  const toInputRef = useRef<HTMLInputElement | null>(null);
  const amountInputRef = useRef<HTMLInputElement | null>(null);

  // Hydrate recents after mount so SSR markup matches.
  useEffect(() => {
    setRecents(listRecentRecipients());
  }, []);

  // Tab-sequence polish: when landing on compose with an empty
  // recipient, snap focus there so keyboard users don't have to
  // Tab past the bottom-nav + header to start filling the form.
  // After a successful send + "Send another", stage resets to
  // compose with fresh fields — same re-focus is appropriate.
  useEffect(() => {
    if (stage !== "compose") return;
    if (to) return;
    // Wait one frame so the animation doesn't fight the focus scroll.
    const id = requestAnimationFrame(() => {
      toInputRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(id);
  }, [stage, to]);
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
    // Pre-flight balance check. Compose-stage already gates this, but
    // the user can linger on the review screen while a buy/burn in
    // another tab settles — balance state here can be stale by the
    // time they hit Confirm. Pre-check with the current WalletContext
    // balance so we surface the concrete shortfall ("You need X more
    // LWP") rather than letting the canister return a generic
    // InsufficientFunds reject that shows up as a bare error string.
    const amountLwp = Number(amount);
    if (balance !== null && Number.isFinite(amountLwp) && amountLwp > 0) {
      const wantBase =
        BigInt(Math.round(amountLwp * 1e8)) + TRANSFER_FEE_BASE;
      if (wantBase > balance) {
        const shortBase = wantBase - balance;
        const shortLwp = Number(shortBase) / 1e8;
        setSubmitError(
          `Not enough LWP to send. You need ${shortLwp.toFixed(4)} more (includes the ${feeLwp.toFixed(4)} LWP fee).`,
        );
        return;
      }
    }
    try {
      const r = await transfer({
        to: to.trim(),
        amountLwp,
        memo: memo || undefined,
      });
      setTxId(r.txId.toString());
      rememberRecipient(to.trim());
      setRecents(listRecentRecipients());
      setStage("sent");
    } catch (e) {
      const raw = (e as Error).message;
      // Canister-side InsufficientFunds can still land here if balance
      // moved between pre-flight and the actual call. Re-shape the
      // message into the same user-friendly form so the two paths
      // read identically. ICRC typed reject shapes vary across agent
      // versions — substring-match is intentionally loose.
      if (/insufficient\s*funds|insufficientfunds/i.test(raw)) {
        setSubmitError(
          "Not enough LWP to send. Your balance changed since the review — return to compose to see the new max.",
        );
      } else {
        setSubmitError(raw);
      }
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
            <Pill
              status="info"
              size="xs"
              mono
              title="Local ICRC-1 ledger — no real money moves"
            >
              demo
            </Pill>
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
                <div className="relative flex-1 min-w-0">
                  <input
                    ref={toInputRef}
                    type="text"
                    inputMode="text"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="rrkah-fqaaa-aaaaa-aaaaq-cai"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    // pr-9 reserves space for the absolute × button so
                    // a long principal doesn't slide under it. Added
                    // focus-visible ring for keyboard parity with the
                    // Scan + amount inputs (POLISH-203 pattern).
                    className="w-full rounded-md bg-black/40 border border-white/10 pl-3 pr-9 py-2.5 text-sm font-mono text-white focus:border-violet-300/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/50"
                  />
                  {/* Clear-recipient × button. Only renders when the
                      field has content — touch-safe 28px hit target
                      (p-1.5 around a 14px svg = 24px + padding), sits
                      inside the right padding reserved above. */}
                  {to.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setTo("");
                        toInputRef.current?.focus();
                      }}
                      aria-label="Clear recipient"
                      title="Clear recipient"
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-white/[0.06] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/60"
                    >
                      <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden>
                        <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                      </svg>
                    </button>
                  )}
                </div>
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
                        onClick={() => {
                          setTo(r.principal);
                          // Recipient now filled — keyboard/tap users
                          // almost always want the amount field next.
                          // requestAnimationFrame so React's render
                          // completes before we grab the ref (which
                          // may not exist on the very first paint).
                          requestAnimationFrame(() => {
                            amountInputRef.current?.focus({ preventScroll: true });
                          });
                        }}
                        className="px-3 py-1 text-[11px] font-mono text-gray-200 hover:text-white transition focus:outline-none focus-visible:text-white"
                        title={`Use ${r.principal}`}
                      >
                        {short(r.principal, 6, 4)}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          // Capture the full row before we wipe it so
                          // the Undo path can re-insert it with its
                          // original label (if any). rememberRecipient
                          // bumps ts on re-add, which is fine — the
                          // user's recent intent is the new timestamp.
                          const snapshot = r;
                          forgetRecipient(r.principal);
                          setRecents(listRecentRecipients());
                          toast.push({
                            kind: "info",
                            title: "Recipient forgotten",
                            description: `@${short(r.principal, 6, 4)} removed from recents`,
                            action: {
                              label: "Undo",
                              onClick: () => {
                                rememberRecipient(
                                  snapshot.principal,
                                  snapshot.label,
                                );
                                setRecents(listRecentRecipients());
                              },
                            },
                          });
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
              inputRef={amountInputRef}
              tone="violet"
              error={validation.amount}
              hint={`Fee: ${feeLwp.toFixed(4)} LWP (burned).`}
              // Pass the same demo USD rate as /wallet + /withdraw so
              // the "≈ $X.XX" estimate anchors a quick-fill chip tap
              // to a familiar unit. Chips (25/50/75/Max) are already
              // emitted by AmountField whenever balanceLwp is a
              // positive number — they auto-subtract the transfer
              // fee via the balanceLwp that's already fee-reduced.
              rate={1}
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

      {/* Scanner chunk is fetched lazily on first open — before that,
          this branch renders nothing and the dynamic() import hasn't
          fired. Returning-visitors who never tap Scan never download
          the camera / BottomSheet code. */}
      {scannerOpen && (
        <PrincipalScanner
          open={scannerOpen}
          onClose={() => setScannerOpen(false)}
          onResult={(value) => {
            setTo(value);
            setScannerOpen(false);
          }}
        />
      )}
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
      {/* Label row stays single-line even on <340px viewports or
          large user font scales: the label truncates (it's short,
          so ellipsis is cosmetic) and the counter / error slot
          never shrinks. Prevents a two-line label from pushing
          the counter off the right edge on memo fields. */}
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <div className="text-[10px] uppercase tracking-widest text-gray-400 min-w-0 truncate">
          {label}
        </div>
        {error ? (
          <div className="text-[10px] text-red-300 shrink-0">{error}</div>
        ) : meta ? (
          <div className="text-[10px] text-gray-500 font-mono tabular-nums shrink-0">
            {meta}
          </div>
        ) : null}
      </div>
      {children}
      {hint && !error && (
        <div className="mt-1 text-[11px] text-gray-500 leading-snug">{hint}</div>
      )}
    </label>
  );
}

/**
 * Signed-out gate shown in place of the compose form. Mirror of
 * /wallet SignedOutPrompt and /withdraw SignInGate — same card
 * shape, same cyan-toned "Connect Internet Identity" button, only
 * the eyebrow tint + headline copy swap per page accent (violet
 * here, cyan on /wallet, rose on /withdraw). POLISH-247 audited
 * the three surfaces together — if one grows extra copy or a
 * different CTA button tone, the others should track so the
 * signed-out experience reads consistently across the wallet flows.
 */
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
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  // Snap focus to the primary action on mount so Enter confirms and
  // keyboard users don't land on body-nothing after the stage swap.
  // preventScroll keeps the lw-reveal entrance from jumping the page.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      confirmRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(id);
  }, []);
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
        {/* USD cross-check — mirrors /withdraw's review row (POLISH-114).
            Surfaces the value the user just authorized in a second unit
            so fat-finger amounts (an extra zero in LWP) stand out before
            Confirm. Strictly informational; peg is a demo literal. */}
        <ReviewRow
          label="Value (demo USD)"
          value={`≈ $${(totalLwp * DEMO_USD_PER_LWP).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`}
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
        <Button ref={confirmRef} onClick={onConfirm} loading={busy} tone="violet">
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
  // "Sent N LWP · tx #X" — fixed order so screenshots stay
  // legible. Never references the recipient — that's their
  // business, not the screenshotter's.
  //
  // Share payload carries a `url` (origin + /account) alongside
  // the text so platforms that support it (iOS / Android share
  // sheets, most SMS apps) render a live tappable link instead
  // of a dead "livewager.io" token in plain text. The recipient
  // can click through to the activity feed and see the tx land.
  // Fallback clipboard path copies the same two lines so the
  // shape is consistent across hosts.
  const shareText = `Sent ${amountLwp} LWP · tx #${txId}`;
  const shareUrl = (() => {
    if (typeof window === "undefined") return "https://livewager.io/account";
    try {
      return new URL("/account", window.location.origin).toString();
    } catch {
      return "https://livewager.io/account";
    }
  })();
  const onShare = async () => {
    const nav = typeof navigator !== "undefined" ? navigator : null;
    // Web Share API requires a user gesture and a secure context;
    // safe to feature-test at call time.
    if (nav && typeof nav.share === "function") {
      try {
        await nav.share({
          title: "Livewager",
          text: shareText,
          url: shareUrl,
        });
        return;
      } catch {
        // User cancelled or share rejected — silently fall through to
        // the clipboard path so the gesture still yields something
        // useful.
      }
    }
    await copy(`${shareText}\n${shareUrl}`, { label: "Send receipt" });
  };

  /**
   * Composite a small 600×320 receipt into an offscreen canvas and
   * trigger a download. Purely client-side; no server round-trip.
   * Demo-labeled (the toast, the header, the footer) so a screenshot
   * doesn't accidentally imply a fiat-moved receipt.
   */
  const onDownloadPng = () => {
    if (typeof document === "undefined") return;
    const W = 600;
    const H = 320;
    const dpr = window.devicePixelRatio || 1;
    const canvas = document.createElement("canvas");
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    // Background: same dark tone as /send's success card so the
    // screenshot matches the on-screen vibe.
    ctx.fillStyle = "#0b1a2e";
    ctx.fillRect(0, 0, W, H);
    // Emerald accent top strip so the receipt reads as "Sent".
    const grad = ctx.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, "#34d399");
    grad.addColorStop(1, "#059669");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, 4);
    // Card outline
    ctx.strokeStyle = "rgba(52,211,153,0.3)";
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 4.5, W - 1, H - 5);
    // Header
    ctx.fillStyle = "#6ee7b7";
    ctx.font = "600 11px ui-sans-serif, system-ui";
    ctx.textBaseline = "top";
    ctx.fillText("SENT · DEMO RECEIPT", 28, 30);
    // Amount
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 42px ui-sans-serif, system-ui";
    ctx.fillText(`${amountLwp} LWP`, 28, 52);
    // Dividers + rows
    const startY = 128;
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.beginPath();
    ctx.moveTo(28, startY - 12);
    ctx.lineTo(W - 28, startY - 12);
    ctx.stroke();
    const rows: Array<[string, string]> = [
      ["Tx id", `#${txId}`],
      ["To", short(to, 10, 10)],
      ["When", new Date().toISOString().replace("T", " ").slice(0, 19) + "Z"],
    ];
    rows.forEach(([label, value], i) => {
      const y = startY + i * 36;
      ctx.fillStyle = "#9ca3af";
      ctx.font = "600 10px ui-sans-serif, system-ui";
      ctx.fillText(label.toUpperCase(), 28, y);
      ctx.fillStyle = "#ffffff";
      ctx.font = "500 15px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.fillText(value, 28, y + 14);
    });
    // Footer — demo label, explicit
    ctx.fillStyle = "#6b7280";
    ctx.font = "500 11px ui-sans-serif, system-ui";
    ctx.fillText(
      "livewager.io/send · demo — no fiat moved",
      28,
      H - 30,
    );
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const filename = `livewager-receipt-${txId}.png`;
      // Try Web Share API with a File first. On iOS/Android the
      // native share sheet handles "Save to Photos" and "Save to
      // Files" cleanly — both surfaces that an `<a download>` on
      // iOS Safari can't reach (the anchor-download falls through
      // to an "Open" prompt in a new tab on iOS, which is awkward).
      // Feature detection must include canShare({ files }) because
      // navigator.share exists without file support on some
      // Android WebViews. POLISH-246.
      try {
        const file = new File([blob], filename, { type: "image/png" });
        if (
          typeof navigator !== "undefined" &&
          typeof navigator.share === "function" &&
          typeof navigator.canShare === "function" &&
          navigator.canShare({ files: [file] })
        ) {
          await navigator.share({
            files: [file],
            title: "Livewager · Send receipt",
            text: `Sent ${amountLwp} LWP · tx #${txId}`,
          });
          return;
        }
      } catch {
        // Share can throw AbortError if the user dismisses the
        // sheet — fall through to the anchor-download as a
        // deliberate retry path, same as before the share attempt.
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "image/png");
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
        <Button
          onClick={onDownloadPng}
          variant="outline"
          size="sm"
          aria-label="Download send receipt as PNG"
        >
          Save receipt
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
