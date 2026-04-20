/**
 * POST /api/dunk/buy
 *
 * Demo-mode "buy LWP" — no real money. The server is the minter identity
 * on a local dfx replica. Mints `amount` LWP base units to the caller's
 * principal by shelling out to `dfx canister call points_ledger mint`.
 *
 * Why shell out: keeps the server dependency-free (no @dfinity/agent on
 * the Node side, no PEM reader). This is purely for local demos; real
 * deposits use the LTC oracle path (ICP-09 design doc).
 *
 * Request:  { principal: string, amount?: string | number }
 * Response: { ok: true, txId: string } | { ok: false, error: string }
 */

import { NextResponse } from "next/server";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const pexec = promisify(exec);

// Demo buy default: 1 LWP with 8 decimals = 100_000_000 base units.
const DEFAULT_AMOUNT_BASE_UNITS = 100_000_000n;
// Hard cap per request so a demo bug can't spam supply.
const MAX_AMOUNT_BASE_UNITS = 10_000_000_000n; // 100 LWP

function isValidPrincipal(s: string): boolean {
  // ICP principals are lowercase base32-Crockford groups of 5 joined by dashes,
  // ending in a 3-char checksum group. Quick structural check; the canister
  // enforces real validation.
  return /^[a-z0-9-]{10,64}$/.test(s) && s.split("-").length >= 2;
}

export async function POST(req: Request) {
  const ledger = process.env.NEXT_PUBLIC_POINTS_LEDGER_CANISTER_ID;
  if (!ledger) {
    return NextResponse.json(
      { ok: false, error: "Points ledger canister not configured (NEXT_PUBLIC_POINTS_LEDGER_CANISTER_ID)." },
      { status: 500 },
    );
  }

  let body: { principal?: string; amount?: string | number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Body must be JSON." }, { status: 400 });
  }

  const principal = (body.principal ?? "").trim();
  if (!isValidPrincipal(principal)) {
    return NextResponse.json({ ok: false, error: "Invalid principal." }, { status: 400 });
  }

  let amount: bigint;
  try {
    amount =
      body.amount === undefined || body.amount === null
        ? DEFAULT_AMOUNT_BASE_UNITS
        : BigInt(body.amount);
  } catch {
    return NextResponse.json({ ok: false, error: "amount must be an integer." }, { status: 400 });
  }
  if (amount <= 0n) {
    return NextResponse.json({ ok: false, error: "amount must be > 0." }, { status: 400 });
  }
  if (amount > MAX_AMOUNT_BASE_UNITS) {
    return NextResponse.json(
      { ok: false, error: `amount exceeds demo cap (${MAX_AMOUNT_BASE_UNITS} base units).` },
      { status: 400 },
    );
  }

  // Candid argument for the `mint` method.
  //  (record { to = record { owner = principal "..."; subaccount = null };
  //            amount = <nat>; memo = null; created_at_time = null })
  const candidArg =
    `(record { to = record { owner = principal "${principal}"; subaccount = null }; ` +
    `amount = ${amount.toString()} : nat; memo = null; created_at_time = null })`;

  // dfx is our minter by default (it's whoever ran `dfx identity get-principal`
  // at deploy time). No --identity flag needed.
  const cmd = `dfx canister call ${ledger} mint '${candidArg}'`;

  try {
    const { stdout, stderr } = await pexec(cmd, {
      cwd: process.cwd(),
      timeout: 20_000,
      env: process.env as NodeJS.ProcessEnv,
    });
    const out = (stdout || "") + (stderr ? `\n${stderr}` : "");
    // Success shape: "(variant { Ok = <n> : nat })"
    const okMatch = out.match(/Ok\s*=\s*([\d_]+)\s*:\s*nat/);
    if (okMatch) {
      const txId = okMatch[1].replace(/_/g, "");
      return NextResponse.json({ ok: true, txId, raw: out.trim() });
    }
    const errMatch = out.match(/Err\s*=\s*variant\s*\{\s*(\w+)/);
    const errName = errMatch ? errMatch[1] : "unknown";
    return NextResponse.json(
      { ok: false, error: `mint rejected: ${errName}`, raw: out.trim() },
      { status: 400 },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        ok: false,
        error:
          "mint call failed. Is the local replica running? " +
          "Try: dfx start --background && dfx deploy points_ledger",
        detail: msg,
      },
      { status: 500 },
    );
  }
}
