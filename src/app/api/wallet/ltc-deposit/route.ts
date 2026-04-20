/**
 * POST /api/wallet/ltc-deposit
 *
 * Demo-mode LTC → LWP. Matches the ICP-09 design doc's fixed-rate
 * 10M LWP per 1 LTC. Does NOT move any real Litecoin — the server just
 * mints the equivalent LWP via `dfx canister call mint`.
 *
 * Real production path (scoped to ICP-11+):
 *   user sends LTC with principal in OP_RETURN → oracle canister
 *   observes the tx → waits 2 confirmations → calls mint.
 *
 * Request:  { principal: string, ltcAmount: number }
 * Response: { ok: true, txId, mintedBaseUnits } | { ok: false, error }
 */

import { NextResponse } from "next/server";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const pexec = promisify(exec);

/** Fixed demo rate — stay in sync with DropWallet.LWP_PER_LTC. */
const LWP_PER_LTC = 10_000_000n;
const LWP_DECIMALS = 8n;
const LWP_BASE_PER_LWP = 10n ** LWP_DECIMALS;

/** Cap per request so a demo typo can't mint the moon. */
const MAX_LTC_PER_REQUEST = 10; // 10 LTC per demo deposit

function isValidPrincipal(s: string): boolean {
  return /^[a-z0-9-]{10,64}$/.test(s) && s.split("-").length >= 2;
}

export async function POST(req: Request) {
  const ledger = process.env.NEXT_PUBLIC_POINTS_LEDGER_CANISTER_ID;
  if (!ledger) {
    return NextResponse.json(
      { ok: false, error: "Points ledger canister not configured." },
      { status: 500 },
    );
  }

  let body: { principal?: string; ltcAmount?: number | string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Body must be JSON." }, { status: 400 });
  }

  const principal = (body.principal ?? "").trim();
  if (!isValidPrincipal(principal)) {
    return NextResponse.json({ ok: false, error: "Invalid principal." }, { status: 400 });
  }

  const ltc = Number(body.ltcAmount);
  if (!Number.isFinite(ltc) || ltc <= 0) {
    return NextResponse.json({ ok: false, error: "ltcAmount must be > 0." }, { status: 400 });
  }
  if (ltc > MAX_LTC_PER_REQUEST) {
    return NextResponse.json(
      { ok: false, error: `demo cap is ${MAX_LTC_PER_REQUEST} LTC per request.` },
      { status: 400 },
    );
  }

  // Convert LTC → LWP base units at the fixed rate.
  // ltc × LWP_PER_LTC = whole LWP, then × 10^8 for base units.
  // Use satoshi-precision math (1 LTC = 100_000_000 litoshi) so we can
  // multiply integer → integer without a floating round trip.
  const litoshi = BigInt(Math.round(ltc * 1e8));
  // whole LWP = litoshi × LWP_PER_LTC / 1e8, then × 10^8 for base units
  //           = litoshi × LWP_PER_LTC.
  const baseUnits = litoshi * LWP_PER_LTC;

  // Memo records the originating LTC amount so the ICRC-3 block is
  // auditable (real oracle would memo the LTC txid).
  const memoText = `demo-ltc-${ltc}`;
  // Candid blob literal for memo — ASCII bytes.
  const memoBytes = Array.from(memoText, (c) => c.charCodeAt(0)).join("; ");

  const candidArg =
    `(record { to = record { owner = principal "${principal}"; subaccount = null }; ` +
    `amount = ${baseUnits.toString()} : nat; ` +
    `memo = opt blob "${memoText.replace(/"/g, '\\"')}"; ` +
    `created_at_time = null })`;
  // If the memo string contains non-printable bytes we'd need to use
  // the blob-of-nats form. For ASCII it's fine as-is. Suppress unused:
  void memoBytes;

  const cmd = `dfx canister call ${ledger} mint '${candidArg}'`;

  try {
    const { stdout, stderr } = await pexec(cmd, {
      cwd: process.cwd(),
      timeout: 30_000,
      env: process.env as NodeJS.ProcessEnv,
    });
    const out = (stdout || "") + (stderr ? `\n${stderr}` : "");
    const okMatch = out.match(/Ok\s*=\s*([\d_]+)\s*:\s*nat/);
    if (okMatch) {
      const txId = okMatch[1].replace(/_/g, "");
      return NextResponse.json({
        ok: true,
        txId,
        mintedBaseUnits: baseUnits.toString(),
        mintedLwp: Number(baseUnits / LWP_BASE_PER_LWP),
        ltcAmount: ltc,
        raw: out.trim(),
      });
    }
    const errMatch = out.match(/Err\s*=\s*variant\s*\{\s*(\w+)/);
    return NextResponse.json(
      { ok: false, error: `mint rejected: ${errMatch ? errMatch[1] : "unknown"}`, raw: out.trim() },
      { status: 400 },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        ok: false,
        error:
          "mint call failed. Is the local replica running? Try: dfx start --background && dfx deploy points_ledger",
        detail: msg,
      },
      { status: 500 },
    );
  }
}
