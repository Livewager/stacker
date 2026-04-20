"use client";

/**
 * Shared wallet state for the Dunk app.
 *
 * Owns: Internet Identity session, principal string, LWP balance (bigint),
 * total-supply (bigint), and status flags. Exposes login / logout / buy /
 * depositLTC / refresh actions.
 *
 * Any component that needs to render balance or trigger a wallet action
 * reads from `useWalletState()`. The top-nav pill and the DropWallet
 * panel both consume this — buying from one updates the other.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Identity } from "@dfinity/agent";
import {
  currentIdentity,
  formatLWP,
  loginWithII,
  logout as iiLogout,
  pointsLedger,
} from "@/lib/icp";
import { writeRaw, PREF_KEYS } from "@/lib/prefs";
import { useToast } from "./Toast";

export type WalletStatus =
  | "idle"
  | "loading"
  | "buying"
  | "depositing"
  | "sending"
  | "withdrawing"
  | "error";

export interface TransferInput {
  /** Recipient principal text (validated inside). */
  to: string;
  /** Amount in whole LWP (UI unit). Converted to base units. */
  amountLwp: number;
  /** Optional memo — max 32 bytes. */
  memo?: string;
}

export interface TransferResult {
  txId: bigint;
}

export interface WalletState {
  identity: Identity | null;
  principal: string; // empty string when signed out
  balance: bigint | null; // base units
  supply: bigint | null; // base units
  status: WalletStatus;
  error: string | null;
  lastTx: string | null;

  login: () => Promise<void>;
  logout: () => Promise<void>;
  /** Demo path — mints LWP directly via local replica. */
  buy: (amountLwp: number) => Promise<void>;
  /** Demo LTC → LWP path (mock oracle). */
  depositLTC: (amountLtc: number) => Promise<void>;
  /** Real ICRC-1 transfer signed by the II identity. */
  transfer: (input: TransferInput) => Promise<TransferResult>;
  /** Real burn + mocked LTC payout intent (see route.ts). */
  withdrawLTC: (input: WithdrawInput) => Promise<WithdrawResult>;
  refresh: () => Promise<void>;
}

export interface WithdrawInput {
  /** Destination LTC address (any non-empty string — we don't validate
   *  against Litecoin network rules in the demo). */
  ltcAddress: string;
  /** Amount in whole LWP to burn before we "pay out" LTC. */
  amountLwp: number;
}
export interface WithdrawResult {
  /** Ledger tx id of the burn block. */
  burnTxId: bigint;
  /** Stub payout reference returned by /api/dunk/ltc-withdraw. */
  payoutId: string;
  /** Estimated minutes until the real oracle would settle (fake). */
  etaMinutes: number;
  /** LTC amount the mock oracle queued. */
  ltcAmount: number;
}

/**
 * Shape a raw /api/dunk/ltc-deposit error string into user-facing
 * title + description. The API returns a small catalogue of error
 * forms (validation, cap, canister reject, replica down); pattern-
 * match them so the toast reads like an instruction instead of a
 * backend dump. Any unmatched shape falls through to a generic
 * "Deposit failed" with the raw message as description.
 *
 * POLISH-240. Loose substring matches because the API text could
 * evolve and a too-narrow prefix check would silently fall through
 * to the generic branch on a minor word tweak.
 */
function mapLtcDepositError(raw: string): { title: string; description: string } {
  const e = raw.toLowerCase();
  if (e.includes("replica") || e.includes("dfx") || e.includes("mint call failed")) {
    return {
      title: "Replica not reachable",
      description:
        "The local IC replica isn't responding. Start it with `dfx start --background`, redeploy the ledger, and try again.",
    };
  }
  if (e.includes("invalid principal")) {
    return {
      title: "Invalid principal",
      description: "The signed-in II principal didn't parse. Try signing out and back in.",
    };
  }
  if (e.includes("demo cap") || e.includes("per request")) {
    return {
      title: "Demo cap reached",
      description:
        "The demo caps each request at 10 LTC so a typo can't mint unbounded LWP. Lower the amount and try again.",
    };
  }
  if (e.includes("ltcamount must be") || e.includes("must be > 0")) {
    return {
      title: "Invalid amount",
      description: "Amount must be a positive LTC value. Zero and negatives are rejected.",
    };
  }
  if (e.includes("mint rejected")) {
    // Extract the ICRC-2 Err variant if present — BadFee,
    // InsufficientAllowance, etc. Surfacing the canonical name helps
    // power users debug without reading raw Candid.
    const variant = raw.match(/mint rejected:\s*(\w+)/i)?.[1];
    return {
      title: "Ledger rejected the mint",
      description: variant
        ? `The points ledger returned "${variant}". This is usually a canister-side policy error; your LTC hasn't moved.`
        : "The points ledger rejected the mint call. Your LTC hasn't moved.",
    };
  }
  return { title: "Deposit failed", description: raw };
}

const Ctx = createContext<WalletState | null>(null);

export function useWalletState(): WalletState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWalletState must be used inside <WalletProvider />");
  return ctx;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [principal, setPrincipal] = useState("");
  const [balance, setBalance] = useState<bigint | null>(null);
  const [supply, setSupply] = useState<bigint | null>(null);
  const [status, setStatus] = useState<WalletStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [lastTx, setLastTx] = useState<string | null>(null);

  // Latest-identity ref — handy when async actions finish after unmount.
  const idRef = useRef<Identity | null>(null);

  const refreshSupply = useCallback(async () => {
    try {
      const ledger = await pointsLedger();
      setSupply(await ledger.icrc1_total_supply());
    } catch {
      /* ledger not deployed locally — leave blank */
    }
  }, []);

  const refreshBalance = useCallback(async (id: Identity) => {
    const ledger = await pointsLedger({ identity: id });
    const bal = await ledger.icrc1_balance_of({
      owner: id.getPrincipal(),
      subaccount: [],
    });
    setBalance(bal);
  }, []);

  const refresh = useCallback(async () => {
    await refreshSupply();
    if (idRef.current) await refreshBalance(idRef.current);
  }, [refreshBalance, refreshSupply]);

  // Restore session on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const existing = await currentIdentity();
        if (cancelled) return;
        if (existing) {
          idRef.current = existing;
          setIdentity(existing);
          setPrincipal(existing.getPrincipal().toString());
          await refreshBalance(existing);
        }
        await refreshSupply();
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setStatus("idle");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshBalance, refreshSupply]);

  const login = useCallback(async () => {
    setError(null);
    setStatus("loading");
    try {
      const id = await loginWithII();
      idRef.current = id;
      setIdentity(id);
      setPrincipal(id.getPrincipal().toString());
      // Stamp the successful auth moment so /account can show a
      // human-readable "authed Xm ago" chip. Written through the prefs
      // pipeline so cross-tab sign-ins propagate to any open /account.
      writeRaw<number>(PREF_KEYS.lastAuthAt, Date.now());
      await refreshBalance(id);
      toast.push({ kind: "success", title: "Signed in", description: "Internet Identity connected." });
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      setStatus("error");
      toast.push({ kind: "error", title: "Sign-in failed", description: msg });
      return;
    }
    setStatus("idle");
  }, [refreshBalance, toast]);

  const logout = useCallback(async () => {
    setStatus("loading");
    await iiLogout();
    idRef.current = null;
    setIdentity(null);
    setPrincipal("");
    setBalance(null);
    writeRaw<number | null>(PREF_KEYS.lastAuthAt, null);
    setStatus("idle");
    toast.push({ kind: "info", title: "Signed out" });
  }, [toast]);

  const buy = useCallback(
    async (amountLwp: number) => {
      if (!idRef.current) throw new Error("Sign in first");
      if (!Number.isFinite(amountLwp) || amountLwp <= 0) {
        throw new Error("Enter a positive number");
      }
      setError(null);
      setLastTx(null);
      setStatus("buying");
      try {
        const baseUnits = BigInt(Math.round(amountLwp * 1e8));
        const res = await fetch("/api/dunk/buy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            principal: idRef.current.getPrincipal().toString(),
            amount: baseUnits.toString(),
          }),
        });
        const data = (await res.json()) as { ok: boolean; txId?: string; error?: string };
        if (!data.ok) throw new Error(data.error || "mint failed");
        setLastTx(data.txId ?? null);
        await refresh();
        toast.push({
          kind: "success",
          title: `+${formatLWP(baseUnits, 4)} LWP credited`,
          description: data.txId ? `Ledger tx #${data.txId}` : undefined,
        });
      } catch (e) {
        const msg = (e as Error).message;
        setError(msg);
        toast.push({ kind: "error", title: "Buy failed", description: msg });
        throw e;
      } finally {
        setStatus("idle");
      }
    },
    [refresh, toast],
  );

  const depositLTC = useCallback(
    async (amountLtc: number) => {
      if (!idRef.current) throw new Error("Sign in first");
      if (!Number.isFinite(amountLtc) || amountLtc <= 0) {
        throw new Error("Enter a positive LTC amount");
      }
      setError(null);
      setLastTx(null);
      setStatus("depositing");
      try {
        const res = await fetch("/api/dunk/ltc-deposit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            principal: idRef.current.getPrincipal().toString(),
            ltcAmount: amountLtc,
          }),
        });
        const data = (await res.json()) as {
          ok: boolean;
          txId?: string;
          mintedBaseUnits?: string;
          mintedLwp?: number;
          error?: string;
        };
        if (!data.ok) throw new Error(data.error || "LTC deposit failed");
        setLastTx(data.txId ?? null);
        await refresh();
        toast.push({
          kind: "success",
          title: `Deposit confirmed`,
          description: `${amountLtc} LTC → ${(data.mintedLwp ?? 0).toLocaleString()} LWP`,
        });
      } catch (e) {
        const raw = (e as Error).message;
        // Pattern-match the canonical API error shapes (POLISH-240) so
        // the toast reads in user language instead of backend phrasing.
        // The raw string still reaches setError so the LedgerErrorCard
        // can surface it in Technical detail for bug reports.
        const friendly = mapLtcDepositError(raw);
        setError(raw);
        toast.push({
          kind: "error",
          title: friendly.title,
          description: friendly.description,
        });
        throw e;
      } finally {
        setStatus("idle");
      }
    },
    [refresh, toast],
  );

  const transfer = useCallback<WalletState["transfer"]>(
    async ({ to, amountLwp, memo }) => {
      if (!idRef.current) throw new Error("Sign in first");
      // Validate principal client-side so we can surface a clear error
      // before bothering the canister.
      let toPrincipal;
      try {
        const { Principal } = await import("@dfinity/principal");
        toPrincipal = Principal.fromText(to.trim());
      } catch {
        throw new Error("Recipient principal is malformed");
      }
      if (!Number.isFinite(amountLwp) || amountLwp <= 0) {
        throw new Error("Amount must be positive");
      }
      // 32-byte memo cap (matches the canister). Encode eagerly so we
      // know the byte count, not just char count.
      let memoBytes: Uint8Array | null = null;
      if (memo && memo.length > 0) {
        memoBytes = new TextEncoder().encode(memo);
        if (memoBytes.byteLength > 32) {
          throw new Error("Memo must be 32 bytes or fewer");
        }
      }

      setError(null);
      setLastTx(null);
      setStatus("sending");
      try {
        const ledger = await pointsLedger({ identity: idRef.current });
        const baseUnits = BigInt(Math.round(amountLwp * 1e8));
        const res = await ledger.icrc1_transfer({
          from_subaccount: [],
          to: { owner: toPrincipal, subaccount: [] },
          amount: baseUnits,
          fee: [],
          memo: memoBytes ? [Array.from(memoBytes)] : [],
          created_at_time: [],
        });
        if ("Err" in res) {
          // Surface the error variant in the message for callers.
          const key = Object.keys(res.Err)[0] ?? "Unknown";
          throw new Error(`Ledger rejected: ${key}`);
        }
        const txId = res.Ok;
        setLastTx(txId.toString());
        await refresh();
        toast.push({
          kind: "success",
          title: `Sent ${formatLWP(baseUnits, 4)} LWP`,
          description: `Tx #${txId.toString()}`,
        });
        return { txId };
      } catch (e) {
        const msg = (e as Error).message;
        setError(msg);
        toast.push({ kind: "error", title: "Send failed", description: msg });
        throw e;
      } finally {
        setStatus("idle");
      }
    },
    [refresh, toast],
  );

  const withdrawLTC = useCallback<WalletState["withdrawLTC"]>(
    async ({ ltcAddress, amountLwp }) => {
      if (!idRef.current) throw new Error("Sign in first");
      if (!Number.isFinite(amountLwp) || amountLwp <= 0) {
        throw new Error("Amount must be positive");
      }
      const cleanedAddr = ltcAddress.trim();
      if (cleanedAddr.length < 25 || cleanedAddr.length > 90) {
        // Real validation happens at the oracle. Demo-side guard is
        // generous but rejects obviously-wrong input so the burn call
        // doesn't waste a cycle.
        throw new Error("LTC address looks wrong");
      }

      setError(null);
      setLastTx(null);
      setStatus("withdrawing");
      try {
        const ledger = await pointsLedger({ identity: idRef.current });
        const baseUnits = BigInt(Math.round(amountLwp * 1e8));
        // Memo records the payout intent so the ICRC-3 block is auditable.
        const memoText = `ltc-withdraw:${cleanedAddr}`;
        const memoBytes = new TextEncoder().encode(memoText).slice(0, 32);

        const burnRes = await ledger.burn({
          from_subaccount: [],
          amount: baseUnits,
          memo: [Array.from(memoBytes)],
          created_at_time: [],
        });
        if ("Err" in burnRes) {
          const key = Object.keys(burnRes.Err)[0] ?? "Unknown";
          throw new Error(`Burn rejected: ${key}`);
        }
        const burnTxId = burnRes.Ok;

        // Stub payout queue — the real oracle would broadcast LTC.
        const res = await fetch("/api/dunk/ltc-withdraw", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            principal: idRef.current.getPrincipal().toString(),
            ltcAddress: cleanedAddr,
            amountLwpBaseUnits: baseUnits.toString(),
            burnTxId: burnTxId.toString(),
          }),
        });
        const data = (await res.json()) as {
          ok: boolean;
          payoutId?: string;
          etaMinutes?: number;
          ltcAmount?: number;
          error?: string;
        };
        if (!data.ok) throw new Error(data.error || "payout queue failed");

        setLastTx(burnTxId.toString());
        await refresh();
        toast.push({
          kind: "success",
          title: `Withdraw queued — ${data.ltcAmount ?? 0} LTC`,
          description: `Burn tx #${burnTxId.toString()} · eta ~${data.etaMinutes ?? 2} min`,
        });
        return {
          burnTxId,
          payoutId: data.payoutId ?? "pending",
          etaMinutes: data.etaMinutes ?? 2,
          ltcAmount: data.ltcAmount ?? 0,
        };
      } catch (e) {
        const msg = (e as Error).message;
        setError(msg);
        toast.push({ kind: "error", title: "Withdraw failed", description: msg });
        throw e;
      } finally {
        setStatus("idle");
      }
    },
    [refresh, toast],
  );

  const value = useMemo<WalletState>(
    () => ({
      identity,
      principal,
      balance,
      supply,
      status,
      error,
      lastTx,
      login,
      logout,
      buy,
      depositLTC,
      transfer,
      withdrawLTC,
      refresh,
    }),
    [
      identity,
      principal,
      balance,
      supply,
      status,
      error,
      lastTx,
      login,
      logout,
      buy,
      depositLTC,
      transfer,
      withdrawLTC,
      refresh,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
