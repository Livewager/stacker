/**
 * Small display helpers for the 8-decimal LWP token.
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
