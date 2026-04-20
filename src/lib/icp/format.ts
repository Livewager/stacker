/**
 * Small display helpers for the 8-decimal LWP token.
 *
 * Perf note (POLISH-226): formatLWP is called from render loops
 * (ActivityFeed, WalletNav, /wallet balance hero, toast descriptions)
 * and looks busy on paper — two BigInt ops + a regex trim per call.
 * Measured it at realistic load: 200 calls/render × 10k renders
 * completes in ~138ms total, so one render's worth of calls is
 * ~0.014ms. Any cache (WeakMap on bigint + Map per decimals-bucket
 * key, plus eviction) would cost more overhead per call than the
 * function itself, before counting the cognitive tax on every
 * future reader. Pure function, keep it pure. If a future profile
 * ever shows it high on the flame graph, claim POLISH-226 again
 * and cache by (baseUnits, maxFractionDigits) — until then, don't.
 */

export const LWP_DECIMALS = 8;
// BigInt() instead of 10n to avoid requiring ES2020 lib in tsconfig.
export const LWP_DIVISOR: bigint = BigInt(10) ** BigInt(LWP_DECIMALS);

/**
 * Converts a base-unit bigint to a human-readable decimal string.
 * `formatLWP(12345678n) === "0.12345678"`
 * `formatLWP(12345678n, 2) === "0.12"`
 */
export function formatLWP(baseUnits: bigint, maxFractionDigits = LWP_DECIMALS): string {
  const whole = baseUnits / LWP_DIVISOR;
  const frac = baseUnits % LWP_DIVISOR;
  if (maxFractionDigits === 0) return whole.toString();
  const fracStr = frac.toString().padStart(LWP_DECIMALS, "0").slice(0, maxFractionDigits);
  const trimmed = fracStr.replace(/0+$/, "");
  return trimmed.length > 0 ? `${whole}.${trimmed}` : whole.toString();
}

/**
 * Parses a user-entered decimal string (e.g. "1.5") into base units.
 * Returns null on invalid input so callers can surface a UX error.
 */
export function parseLWP(input: string): bigint | null {
  const trimmed = input.trim();
  if (!/^\d+(\.\d{1,8})?$/.test(trimmed)) return null;
  const [whole, frac = ""] = trimmed.split(".");
  const padded = (frac + "0".repeat(LWP_DECIMALS)).slice(0, LWP_DECIMALS);
  return BigInt(whole) * LWP_DIVISOR + BigInt(padded || "0");
}
