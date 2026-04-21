"use client";

/**
 * Pre-round wager UI for Stacker.
 *
 * Single consolidated control: pick a mode (Practice / Real), see
 * your live balance, hit Start. No more tabbed-radiogroup hiding
 * stake chips behind a Ranked tab; we tightened to two modes:
 *
 *   - Practice — free, no ICRC charge, no prize. Just learn the
 *     mechanics. Use this when you're warming up or short on LWP.
 *   - Real — burns the on-chain entry fee on every round-start.
 *     Score is captured the same as Practice but the round costs
 *     real ledger LWP. Disabled when balance < entry fee.
 *
 * The entry-fee burn happens in the parent's `chargeEntryFee` hook
 * (see /stacker page); this component just reports `mode` to the
 * parent so it knows whether to charge or skip.
 */

import Link from "next/link";
import { useLocalPref, PREF_KEYS } from "@/lib/prefs";
import { useWalletState } from "@/components/shared/WalletContext";
import { formatLWP } from "@/lib/icp";
import { ROUTES } from "@/lib/routes";

/** Payout multiplier by outcome. "win" = reach top row, "over" = collapse.
 *  Kept exported because /stacker page references PAYOUT_MULTIPLIER.win
 *  for the prize-math copy and its DifficultyLadder constants. */
export const PAYOUT_MULTIPLIER = {
  win: 3, // stake × 3
  over: 0, // stake lost
} as const;

export type StackerMode = "practice" | "real";

/** Cost per real-mode round, in whole LWP. Display only — the actual
 *  burn amount lives in /stacker page's ENTRY_FEE_BASE_UNITS so the
 *  ledger contract and UI copy are tuned together. */
export const ENTRY_FEE_LWP = 1;

type Props = {
  /** Called when the user confirms a mode and wants to start. The
   *  parent decides whether to burn (real) or skip (practice). */
  onStart: (mode: StackerMode) => void;
  /** Disabled while a round is active or while a charge is in flight. */
  disabled?: boolean;
};

export function StackerWager({ onStart, disabled }: Props) {
  // Migration: an earlier deploy stored "ranked" / "unranked" under
  // this same pref key. We accept either shape on read and normalize
  // to the new union; on the next write the localStorage value
  // updates and the legacy values are gone.
  const [rawMode, setRawMode] = useLocalPref<StackerMode | "ranked" | "unranked">(
    PREF_KEYS.stackerMode,
    "practice",
  );
  const mode: StackerMode =
    rawMode === "ranked" ? "real" : rawMode === "unranked" ? "practice" : rawMode;
  const setMode = (m: StackerMode) => setRawMode(m);
  const { identity, balance } = useWalletState();
  const balanceLwp =
    balance !== null ? Number(balance) / 1_00000000 : null; // 8 decimals

  const insufficient =
    identity !== null &&
    mode === "real" &&
    balanceLwp !== null &&
    balanceLwp < ENTRY_FEE_LWP;

  const startDisabled = !!disabled || insufficient;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:p-5">
      {/* Header: balance pill (clickable → /wallet) + tagline. */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-cyan-300 mb-1">
            Stacker · how you&apos;re playing
          </div>
          <p className="text-sm text-gray-300 leading-snug">
            {mode === "practice" ? (
              <>
                Practice mode — free rounds, no ledger charge. Switch to
                Real when you&apos;re ready to burn{" "}
                <span className="text-yellow-300 font-semibold">
                  {ENTRY_FEE_LWP} LWP
                </span>{" "}
                per round.
              </>
            ) : (
              <>
                Real mode —{" "}
                <span className="text-yellow-300 font-semibold">
                  {ENTRY_FEE_LWP} LWP
                </span>{" "}
                burns on the ICRC-1 ledger every time you start a round.
                Score still recorded.
              </>
            )}
          </p>
        </div>
        {/* Balance pill — always visible when signed in. Clicking
            jumps to /wallet (the canonical balance + activity surface)
            so users can refill or audit before starting. */}
        {identity && balance !== null && (
          <Link
            href={ROUTES.wallet}
            aria-label={`Balance ${formatLWP(balance, 4)} LWP — open wallet`}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-cyan-300/40 bg-cyan-300/[0.08] px-2.5 py-1 text-[11px] font-mono tabular-nums hover:border-cyan-300/60 hover:bg-cyan-300/[0.14] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60"
          >
            <span aria-hidden className="text-cyan-300">
              ◎
            </span>
            <span className="text-white">{formatLWP(balance, 2)}</span>
            <span className="text-gray-400 text-[10px] uppercase tracking-widest">
              LWP
            </span>
          </Link>
        )}
      </div>

      {/* Mode toggle — single segmented control. Two buttons share
          one rounded container; the active one gets a tone-matched
          inner card. No hidden state, no separate stake row, no
          radiogroup ceremony. Arrow keys still move between them
          for keyboard users via the radio role on each button. */}
      <div
        role="radiogroup"
        aria-label="Round mode"
        className="grid grid-cols-2 gap-1.5 rounded-xl border border-white/10 bg-black/30 p-1 mb-4"
        onKeyDown={(e) => {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
          e.preventDefault();
          const next: StackerMode =
            mode === "practice" ? "real" : "practice";
          setMode(next);
          const idx = next === "practice" ? 0 : 1;
          const btn = (e.currentTarget as HTMLElement).children[
            idx
          ] as HTMLButtonElement | undefined;
          btn?.focus?.();
        }}
      >
        <ModeButton
          tone="cyan"
          active={mode === "practice"}
          disabled={disabled}
          onClick={() => setMode("practice")}
          title="Practice"
          subtitle="Free · no charge"
        />
        <ModeButton
          tone="amber"
          active={mode === "real"}
          disabled={disabled}
          onClick={() => setMode("real")}
          title="Real"
          subtitle={`${ENTRY_FEE_LWP} LWP · burns per round`}
        />
      </div>

      {/* Status row + Start button. */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-xs text-gray-400 min-w-0 flex-1">
          {!identity ? (
            <span>
              Sign in via{" "}
              <Link
                href={ROUTES.icrc}
                className="text-cyan-300 hover:text-cyan-200 underline underline-offset-2"
              >
                /icrc
              </Link>{" "}
              to play Real mode.
            </span>
          ) : insufficient ? (
            <span className="text-orange-300">
              Need {ENTRY_FEE_LWP} LWP. Grab some from the{" "}
              <Link
                href={ROUTES.icrc}
                className="underline underline-offset-2 hover:text-orange-200"
              >
                faucet
              </Link>
              .
            </span>
          ) : mode === "real" ? (
            <span>
              On-chain burn ·{" "}
              <Link
                href={ROUTES.wallet}
                className="text-cyan-300 hover:text-cyan-200 underline underline-offset-2"
              >
                view wallet
              </Link>
            </span>
          ) : (
            <span>No charge · taps still scored.</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => onStart(mode)}
          disabled={startDisabled}
          className="rounded-lg px-4 py-2 text-sm font-bold text-black transition cursor-pointer hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          style={{
            background:
              mode === "real"
                ? "linear-gradient(90deg,#fbbf24,#f97316)"
                : "linear-gradient(90deg,#22d3ee,#0891b2)",
          }}
        >
          {mode === "real"
            ? `Start · burn ${ENTRY_FEE_LWP} LWP`
            : "Start practice"}
        </button>
      </div>
    </div>
  );
}

function ModeButton({
  tone,
  active,
  disabled,
  onClick,
  title,
  subtitle,
}: {
  tone: "cyan" | "amber";
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
}) {
  // Tone-aware active treatment. Inactive states preview the target
  // tint on hover so the toggle feels anticipatory, not abrupt.
  const cls = active
    ? tone === "amber"
      ? "border-amber-300/60 bg-[linear-gradient(135deg,rgba(251,191,36,0.20),rgba(249,115,22,0.10))] text-white shadow-[0_0_0_1px_rgba(251,191,36,0.25),0_8px_24px_-12px_rgba(249,115,22,0.6)]"
      : "border-cyan-300/60 bg-[linear-gradient(135deg,rgba(34,211,238,0.18),rgba(8,145,178,0.10))] text-white shadow-[0_0_0_1px_rgba(34,211,238,0.25),0_8px_24px_-12px_rgba(8,145,178,0.55)]"
    : tone === "amber"
      ? "border-transparent text-gray-300 hover:text-amber-100 hover:border-amber-400/30 hover:bg-amber-400/[0.05]"
      : "border-transparent text-gray-300 hover:text-cyan-100 hover:border-cyan-400/30 hover:bg-cyan-400/[0.05]";
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      tabIndex={active ? 0 : -1}
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-start gap-0.5 rounded-lg px-3 py-2.5 border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60 ${cls} ${
        disabled ? "opacity-60 cursor-not-allowed" : ""
      }`}
    >
      <span className="text-sm font-bold uppercase tracking-widest">
        {title}
      </span>
      <span className="text-[10px] font-mono uppercase tracking-widest text-gray-400">
        {subtitle}
      </span>
    </button>
  );
}
