/**
 * POST /api/wallet/ltc-withdraw
 *
 * DEMO payout queue. This endpoint does NOT move any real Litecoin.
 * The client has already burned LWP on the ledger before calling us;
 * we just register a stub "payout intent" and return a synthetic
 * payoutId + ETA so the UI has something to show.
 *
 * Real production path: a withdrawal oracle canister
 *   - accepts an icrc2_transfer_from from the user into an escrow account,
 *   - batches payouts from a multi-sig-controlled LTC hot wallet,
 *   - burns the escrowed LWP only after the LTC tx confirms on-chain.
 * That's ICP-10+ work and is explicitly gated on operator approval.
 *
 * Request:  { principal, ltcAddress, amountLwpBaseUnits, burnTxId }
 * Response: { ok, payoutId, etaMinutes, ltcAmount } | { ok:false, error }
 */

import { NextResponse } from "next/server";

// Must match src/components/deposit/LtcDepositPanel.tsx (and the design
// doc ICP-09). 10M LWP per 1 LTC.
const LWP_PER_LTC = 10_000_000;
const LWP_BASE_PER_LWP = 100_000_000n; // 10^8
/** Hard per-request cap in LWP to prevent demo typos draining state. */
const MAX_LWP = 1_000_000n * LWP_BASE_PER_LWP;

function isValidPrincipal(s: string): boolean {
  return /^[a-z0-9-]{10,64}$/.test(s) && s.split("-").length >= 2;
}

function isPlausibleLtcAddress(s: string): boolean {
  // Generous check. The real oracle does strict Base58/Bech32 + network
  // validation; we just reject obviously-wrong shapes.
  return /^[a-km-zA-HJ-NP-Z0-9]{25,60}$|^ltc1[0-9a-z]{20,85}$/.test(s);
}

export async function POST(req: Request) {
  let body: {
    principal?: string;
    ltcAddress?: string;
    amountLwpBaseUnits?: string;
    burnTxId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Body must be JSON." }, { status: 400 });
  }

  const principal = (body.principal ?? "").trim();
  if (!isValidPrincipal(principal)) {
    return NextResponse.json({ ok: false, error: "Invalid principal." }, { status: 400 });
  }

  const addr = (body.ltcAddress ?? "").trim();
  if (!isPlausibleLtcAddress(addr)) {
    return NextResponse.json(
      { ok: false, error: "LTC address doesn't look valid." },
      { status: 400 },
    );
  }

  let baseUnits: bigint;
  try {
    baseUnits = BigInt(body.amountLwpBaseUnits ?? "0");
  } catch {
    return NextResponse.json({ ok: false, error: "amount must be integer base units." }, { status: 400 });
  }
  if (baseUnits <= 0n) {
    return NextResponse.json({ ok: false, error: "amount must be > 0." }, { status: 400 });
  }
  if (baseUnits > MAX_LWP) {
    return NextResponse.json(
      { ok: false, error: `demo cap is ${MAX_LWP / LWP_BASE_PER_LWP} LWP per withdrawal.` },
      { status: 400 },
    );
  }

  // Invert the deposit rate: LWP base → LTC.
  // 1 LTC = LWP_PER_LTC LWP = LWP_PER_LTC * 10^8 base units.
  // litoshi = baseUnits / LWP_PER_LTC (rounded).
  const litoshiRate = BigInt(LWP_PER_LTC);
  const litoshi = baseUnits / litoshiRate;
  const ltcAmount = Number(litoshi) / 1e8;

  // Synthetic payout reference — the real oracle would return a
  // broadcast txid once mempool-confirmed.
  const payoutId = `pyt_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6)
    .toString(36)
    .padStart(4, "0")}`;

  // ETA is fake; keep it plausibly short for demos.
  const etaMinutes = 2;

  return NextResponse.json({
    ok: true,
    payoutId,
    etaMinutes,
    ltcAmount,
    burnTxId: body.burnTxId ?? null,
    notice: "DEMO: no real LTC was sent. See docs/icp/ltc-oracle.md for the production flow.",
  });
}
