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
import { useToast } from "./Toast";

export type WalletStatus = "idle" | "loading" | "buying" | "depositing" | "error";

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
  refresh: () => Promise<void>;
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
        const msg = (e as Error).message;
        setError(msg);
        toast.push({ kind: "error", title: "Deposit failed", description: msg });
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
      refresh,
    }),
    [identity, principal, balance, supply, status, error, lastTx, login, logout, buy, depositLTC, refresh],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
