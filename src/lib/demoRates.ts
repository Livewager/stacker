/**
 * Demo-mode rate constants.
 *
 * Everything here is a **readability aid**, not a live quote. The
 * points ledger LWP token is non-fungible with real money — these
 * stand-ins exist so the UI can render `≈ $X` alongside a LWP figure
 * without the user having to mentally convert, and so fat-finger
 * amounts in LWP surface in a second unit before Confirm.
 *
 * Every call site that renders one of these rates is responsible for
 * labeling it as demo (e.g. "Value (demo USD)", "≈ $X demo"). Keep
 * that contract in place — if it ever drops, POLISH-99 reopens.
 *
 * Consolidated in POLISH-218; previously duplicated as a module-scope
 * const across /wallet, /withdraw, and /send. One place to change
 * when the demo peg needs a tweak or a real oracle wires in.
 */

/**
 * USD per 1 LWP — fixed demo peg. A value of 1 means "1 LWP reads as
 * $1 for display purposes". Any real integration will swap this for
 * a live rate; keep the `number` shape stable so callers that
 * multiply into it stay compatible.
 */
export const DEMO_USD_PER_LWP = 1;

/**
 * LWP minted per 1 LTC on the demo deposit rail. Mirrors the mock
 * oracle in /api/wallet/ltc-deposit so the client-side "Value" hints
 * on /wallet + /withdraw never drift from what the API will quote.
 *
 * Not currently imported here by every call site (some routes still
 * hold this literal locally) — consolidation is opportunistic;
 * migrate the next site that wants it.
 */
export const LWP_PER_LTC = 10_000_000;

/**
 * Format a LWP figure as its demo-USD equivalent, e.g. `"≈ $1,200.00"`.
 * Standardizes the two-decimal, thousands-grouped shape used on
 * /send + /withdraw review rows so a future copy tweak lands in one
 * place. Prefixes with a soft `≈` to reinforce that it's a demo peg,
 * not a live conversion.
 */
export function formatDemoUsd(lwp: number): string {
  const usd = lwp * DEMO_USD_PER_LWP;
  return `≈ $${usd.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
