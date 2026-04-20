import { NextResponse } from "next/server";
import { ROUND_MS, signRound } from "../_hmac";

export const runtime = "nodejs";

/**
 * GET /api/dunk/round — returns the current round's shared seed + HMAC signature.
 *
 * - roundId = floor(epoch_ms / ROUND_MS). Identical for everyone in the same 20s window.
 * - seed    = roundId (feeds client mulberry32)
 * - signature = HMAC-SHA256(secret, `${roundId}.${expiresAt}`)
 * - expiresAt = end of the round window, so clients + server can reject stale replays
 */
export async function GET() {
  const now = Date.now();
  const roundId = Math.floor(now / ROUND_MS);
  const expiresAt = roundId * ROUND_MS + ROUND_MS;
  const signature = signRound(roundId, expiresAt);
  return NextResponse.json(
    { roundId, seed: roundId, expiresAt, signature, now },
    {
      headers: {
        "Cache-Control": `public, max-age=${Math.max(1, Math.floor((expiresAt - now) / 1000))}`,
      },
    },
  );
}
