import crypto from "node:crypto";

export const ROUND_MS = 20_000;
export const MAX_POUR_SCORE = 12_000; // ~10k perfect + headroom

export const getSecret = () => process.env.DUNK_ROUND_SECRET || "dev-do-not-use-in-prod";

export const signRound = (roundId: number, expiresAt: number) => {
  return crypto
    .createHmac("sha256", getSecret())
    .update(`${roundId}.${expiresAt}`)
    .digest("hex");
};

export const verifyRound = (roundId: number, expiresAt: number, signature: string): boolean => {
  const expected = signRound(roundId, expiresAt);
  // constant-time compare
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(signature, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};
