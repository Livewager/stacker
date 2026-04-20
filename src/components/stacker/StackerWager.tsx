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
        onKeyDown={(e) => {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
          e.preventDefault();
          const next: StackerMode = mode === "unranked" ? "ranked" : "unranked";
          setMode(next);
          const container = e.currentTarget as HTMLElement;
          const idx = next === "unranked" ? 0 : 1;
          const btn = container.children[idx] as HTMLButtonElement | undefined;
          btn?.focus?.();
        }}
      >
        {(["unranked", "ranked"] as const).map((m) => {
          const active = mode === m;
          return (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active ? 0 : -1}
              onClick={() => setMode(m)}
              disabled={disabled}
              // Hierarchy tightening: Ranked active = gradient +
              // emerald shadow so it reads as the premium choice at a
              // glance. Practice active = tonal neutral, deliberately
              // quieter. Inactive states preview the target tint on
              // hover so the switch feels anticipatory, not abrupt.
              className={[
                "rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-widest transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60",
                active
                  ? m === "ranked"
                    ? "text-white border border-emerald-300/60 shadow-[0_0_0_1px_rgba(16,185,129,0.25),0_8px_24px_-12px_rgba(16,185,129,0.6)] bg-[linear-gradient(135deg,rgba(16,185,129,0.35),rgba(5,150,105,0.22))]"
                    : "bg-white/10 text-white border border-white/25"
                  : m === "ranked"
                    ? "text-gray-300 border border-transparent hover:text-emerald-100 hover:border-emerald-400/30 hover:bg-emerald-400/[0.05]"
                    : "text-gray-400 hover:text-white border border-transparent",
                disabled ? "opacity-60 cursor-not-allowed" : "",
              ].join(" ")}
            >
              {m === "unranked" ? "Practice" : "Ranked"}
              {m === "ranked" && (
                <span
                  className={`ml-1.5 text-[9px] font-mono ${
                    active ? "text-emerald-100" : "text-emerald-300/70"
                  }`}
                >
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
        // On narrow mobile viewports (≤ 320 CSS px, iPhone SE 1st-gen
        // class) the 4-column grid squeezed "100 LWP" + the orange
        // ! insufficiency badge into clipping territory. POLISH-260
        // mirrors the POLISH-223 pattern: horizontal scroll with
        // snap-x on mobile so each chip gets its natural width, and
        // sm:grid-cols-4 restores the even-columns layout from the
        // 640px breakpoint up. shrink-0 on each chip below prevents
        // the row from compressing any single chip to fit.
        // no-scrollbar keeps the gutter visually calm — the snap
        // behavior is the real affordance, not a visible track.
        <div
          role="radiogroup"
          aria-label="Stacker entry fee"
          className="flex gap-2 overflow-x-auto snap-x snap-mandatory no-scrollbar -mx-1 px-1 mb-4 sm:grid sm:grid-cols-4 sm:overflow-visible sm:mx-0 sm:px-0"
          onKeyDown={(e) => {
            if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
            e.preventDefault();
            const i = CHIPS.indexOf(stake);
            if (i < 0) return;
            const delta = e.key === "ArrowLeft" ? -1 : 1;
            const next = CHIPS[(i + delta + CHIPS.length) % CHIPS.length];
            setStake(next);
            const container = e.currentTarget as HTMLElement;
            const idx = CHIPS.indexOf(next);
            const btn = container.children[idx] as HTMLButtonElement | undefined;
            btn?.focus?.();
          }}
        >
          {CHIPS.map((c) => {
            const active = stake === c;
            // Per-chip affordability: a chip is muted when the user
            // is signed in with a known balance below that stake. The
            // chip stays clickable so the user can still see the
            // warning copy below if they pick it — we're nudging,
            // not blocking.
            const chipShort =
              c > 0 &&
              identity !== null &&
              balanceLwp !== null &&
              balanceLwp < c;
            return (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={active}
                aria-disabled={chipShort ? "true" : undefined}
                // Roving tabindex so Tab-into-radiogroup lands on the
                // current selection; arrows move within the group.
                tabIndex={active ? 0 : -1}
                onClick={() => setStake(c)}
                disabled={disabled}
                title={
                  chipShort
                    ? `Need ${c} LWP — current balance ${balanceLwp?.toFixed(
                        2,
                      )} LWP`
                    : undefined
                }
                className={[
                  // shrink-0 + snap-start participate in the mobile
                  // overflow-x-auto row (POLISH-260). min-w keeps the
                  // "100 LWP" chip from collapsing narrower than its
                  // text. sm: returns it to the shared grid geometry.
                  "shrink-0 snap-start min-w-[5.5rem] sm:min-w-0",
                  "rounded-xl border px-2 py-3 text-sm font-bold transition relative",
                  active
                    ? chipShort
                      ? "border-orange-300/60 bg-orange-300/10 text-orange-100"
                      : "border-cyan-300/60 bg-cyan-300/15 text-white"
                    : chipShort
                      ? "border-white/10 bg-white/[0.02] text-gray-500 hover:text-gray-300 hover:border-orange-300/25"
                      : "border-white/10 bg-white/[0.03] text-gray-300 hover:text-white hover:border-white/20",
                  disabled ? "opacity-60 cursor-not-allowed" : "",
                ].join(" ")}
              >
                <span className={chipShort ? "line-through decoration-orange-300/60" : undefined}>
                  {c === 0 ? "Free" : `${c} LWP`}
                </span>
                {chipShort && (
                  <span className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-orange-400/90 text-black text-[9px] font-mono grid place-items-center border border-orange-200/60">
                    !
                  </span>
                )}
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
