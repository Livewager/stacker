"use client";

/**
 * Pre-round wager UI for Stacker.
 *
 * Not wired to the ledger yet — this is a demo-labeled simulation of
 * the entry-fee / prize flow so the UX can settle before we decide
 * whether wagers burn-then-mint, escrow via an approve() allowance,
 * or route through a pot canister. All copy says "demo" so nobody
 * thinks their LWP moved.
 *
 * Stored in the existing prefs store under `stackerWager` so the user's
 * last chip choice persists across refreshes.
 */

import { useLocalPref, PREF_KEYS } from "@/lib/prefs";
import { useWalletState } from "@/components/dunk/WalletContext";
import { formatLWP } from "@/lib/icp";

/** Entry-fee chips, in whole LWP. Keep small so the demo is approachable. */
const CHIPS = [0, 5, 25, 100] as const;
type Chip = (typeof CHIPS)[number];

/** Payout multiplier by outcome. "win" = reach top row, "over" = collapse. */
export const PAYOUT_MULTIPLIER = {
  win: 3, // stake × 3
  over: 0, // stake lost
} as const;

export type StackerMode = "ranked" | "unranked";

type Props = {
  /** Called once the user confirms a chip and wants to start. */
  onStart: (stakeLwp: number, mode: StackerMode) => void;
  /** Disabled while a round is active. */
  disabled?: boolean;
};

export function StackerWager({ onStart, disabled }: Props) {
  const [stake, setStake] = useLocalPref<Chip>(PREF_KEYS.stackerWager, 0);
  const [mode, setMode] = useLocalPref<StackerMode>(
    PREF_KEYS.stackerMode,
    "unranked",
  );
  const { identity, balance } = useWalletState();
  const balanceLwp =
    balance !== null ? Number(balance) / 1_00000000 : null; // 8 decimals

  // Unranked always forces stake=0 — no prize, no risk, any input.
  const effectiveStake: Chip = mode === "unranked" ? 0 : stake;

  const insufficient =
    identity !== null &&
    mode === "ranked" &&
    stake > 0 &&
    balanceLwp !== null &&
    balanceLwp < stake;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:p-5">
      {/* Mode toggle — unranked = practice, any input OK, no prize.
          Ranked = prize-eligible, tap-entropy captured. Defaults
          unranked so newcomers don't get gated on their first round. */}
      <div
        role="radiogroup"
        aria-label="Stacker mode"
        className="grid grid-cols-2 gap-1.5 mb-4 rounded-xl border border-white/10 bg-black/30 p-1"
      >
        {(["unranked", "ranked"] as const).map((m) => {
          const active = mode === m;
          return (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setMode(m)}
              disabled={disabled}
              className={[
                "rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-widest transition",
                active
                  ? m === "ranked"
                    ? "bg-emerald-400/15 text-emerald-200 border border-emerald-400/40"
                    : "bg-white/10 text-white border border-white/20"
                  : "text-gray-400 hover:text-white border border-transparent",
                disabled ? "opacity-60 cursor-not-allowed" : "",
              ].join(" ")}
            >
              {m === "unranked" ? "Practice" : "Ranked"}
              {m === "ranked" && (
                <span className="ml-1.5 text-[9px] font-mono text-emerald-300/80">
                  · prize
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-cyan-300 mb-1">
            {mode === "ranked" ? "Wager · demo" : "Practice round"}
          </div>
          <div className="text-sm text-gray-300">
            {mode === "ranked" ? (
              <>
                Pick a stake. Reach the top to win{" "}
                <span className="text-yellow-300 font-semibold">
                  {PAYOUT_MULTIPLIER.win}×
                </span>
                . Collapse the stack and the stake is gone. No LWP actually
                moves in this demo round.
              </>
            ) : (
              <>
                No stake, no prize — warm-up with the mechanics. Your taps
                aren&apos;t captured for scoring. Switch to{" "}
                <button
                  type="button"
                  onClick={() => setMode("ranked")}
                  className="text-emerald-300 hover:text-emerald-200 underline-offset-2 hover:underline"
                >
                  Ranked
                </button>{" "}
                when you&apos;re ready.
              </>
            )}
          </div>
        </div>
        {identity && balance !== null && mode === "ranked" && (
          <div className="shrink-0 rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-[11px] font-mono tabular-nums">
            <span className="text-gray-400">Balance </span>
            <span className="text-cyan-300">{formatLWP(balance, 2)}</span>
          </div>
        )}
      </div>

      {mode === "ranked" && (
        <div
          role="radiogroup"
          aria-label="Stacker entry fee"
          className="grid grid-cols-4 gap-2 mb-4"
        >
          {CHIPS.map((c) => {
            const active = stake === c;
            return (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setStake(c)}
                disabled={disabled}
                className={[
                  "rounded-xl border px-2 py-3 text-sm font-bold transition",
                  active
                    ? "border-cyan-300/60 bg-cyan-300/15 text-white"
                    : "border-white/10 bg-white/[0.03] text-gray-300 hover:text-white hover:border-white/20",
                  disabled ? "opacity-60 cursor-not-allowed" : "",
                ].join(" ")}
              >
                {c === 0 ? "Free" : `${c} LWP`}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-gray-400">
          {mode === "unranked" ? (
            "Practice — any input, no prize. Warm up, then switch to Ranked."
          ) : stake === 0 ? (
            "Free ranked round — no stake, no prize, taps captured."
          ) : insufficient ? (
            <span className="text-orange-300">
              Balance below {stake} LWP. Deposit or pick a smaller chip.
            </span>
          ) : (
            <>
              Potential prize:{" "}
              <span className="text-yellow-300 font-semibold">
                {stake * PAYOUT_MULTIPLIER.win} LWP
              </span>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={() => onStart(effectiveStake, mode)}
          disabled={disabled || insufficient}
          className="rounded-lg px-4 py-2 text-sm font-bold text-black transition hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            background:
              mode === "ranked"
                ? "linear-gradient(90deg,#34d399,#059669)"
                : "linear-gradient(90deg,#22d3ee,#0891b2)",
          }}
        >
          {mode === "unranked"
            ? "Practice"
            : stake === 0
              ? "Start ranked"
              : `Start · ${stake} LWP`}
        </button>
      </div>
    </div>
  );
}
