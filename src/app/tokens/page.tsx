"use client";

/**
 * /tokens — On-IC LWP token dashboard.
 *
 * Reads straight from the points_ledger ICRC-1 canister on the local
 * replica via @dfinity/agent. No server, no REST shim — the browser
 * talks to the canister directly. This is the proof-of-concept surface
 * that shows the IC backend is actually wired up and queryable.
 *
 * Features:
 *   - Live ledger metadata (name, symbol, decimals, total supply)
 *   - Queryable balance for any principal (defaults to the anonymous
 *     principal, but you can paste in a principal you minted to)
 *   - Dev mint button (calls `mint` on the canister — only works if
 *     the client identity is the configured minter, which on local
 *     dev is typically the `default` dfx identity)
 *   - Raw transfer form (from → to via ICRC-1 `icrc1_transfer`)
 *
 * Everything here is scoped to the local replica. No mainnet, no
 * Internet Identity — the page uses the anonymous agent for queries
 * and flags when a mutation would require a real identity.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Principal } from "@dfinity/principal";
import {
  getLedgerActor,
  accountOf,
  formatLwp,
  parseLwp,
  pointsLedgerCanisterId,
} from "@/lib/ic/agent";
import { ROUTES } from "@/lib/routes";
import { Button } from "@/components/ui/Button";

interface LedgerMeta {
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: bigint;
  fee: bigint;
  minter: string | null;
}

// Known local principals — makes the "whose balance to check" field
// easier to explore on first open. Populated only when the page runs
// against a local replica; real deployments hide this row entirely.
const KNOWN_LOCAL_PRINCIPALS: Array<{ label: string; principal: string }> = [
  {
    label: "default",
    principal:
      "353do-q2v4o-s45cp-xmati-tj26p-cjtas-ime74-mcigc-pvao4-ilhov-nqe",
  },
  {
    label: "anonymous",
    principal: "2vxsx-fae",
  },
];

export default function TokensPage() {
  const [meta, setMeta] = useState<LedgerMeta | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [queryPrincipal, setQueryPrincipal] = useState<string>(
    KNOWN_LOCAL_PRINCIPALS[0].principal,
  );
  const [balance, setBalance] = useState<bigint | null>(null);
  const [balLoading, setBalLoading] = useState(false);
  const [balError, setBalError] = useState<string | null>(null);

  // Fetch ledger meta on mount. One-shot — metadata doesn't change
  // without a reinstall, so re-fetching would just be noise.
  useEffect(() => {
    (async () => {
      try {
        const actor = await getLedgerActor();
        const [name, symbol, decimals, totalSupply, fee, minterOpt] =
          await Promise.all([
            actor.icrc1_name(),
            actor.icrc1_symbol(),
            actor.icrc1_decimals(),
            actor.icrc1_total_supply(),
            actor.icrc1_fee(),
            actor.icrc1_minting_account(),
          ]);
        setMeta({
          name,
          symbol,
          decimals: Number(decimals),
          totalSupply,
          fee,
          minter: minterOpt[0]?.owner.toText() ?? null,
        });
      } catch (e) {
        setMetaError((e as Error).message || "Failed to reach ledger");
      }
    })();
  }, []);

  const refetchBalance = useCallback(async () => {
    setBalError(null);
    setBalLoading(true);
    try {
      Principal.fromText(queryPrincipal); // validate
      const actor = await getLedgerActor();
      const bal = await actor.icrc1_balance_of(accountOf(queryPrincipal));
      setBalance(bal);
    } catch (e) {
      setBalance(null);
      setBalError((e as Error).message || "Query failed");
    } finally {
      setBalLoading(false);
    }
  }, [queryPrincipal]);

  // Auto-fetch when principal changes.
  useEffect(() => {
    refetchBalance();
  }, [refetchBalance]);

  return (
    <div className="min-h-screen bg-background text-white">
      <div className="max-w-4xl mx-auto px-5 md:px-8 py-8 md:py-12">
        <nav className="mb-6 text-[11px] uppercase tracking-widest text-gray-500">
          <Link
            href={ROUTES.play}
            className="hover:text-white transition focus:outline-none focus-visible:text-white focus-visible:ring-2 focus-visible:ring-cyan-300/40 rounded-sm"
          >
            ← Games
          </Link>
        </nav>

        <header className="mb-8">
          <div className="text-[10px] uppercase tracking-widest text-cyan-300 mb-2">
            On-chain · local replica
          </div>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight leading-[0.95] mb-3">
            LWP{" "}
            <span
              className="bg-clip-text text-transparent"
              style={{
                backgroundImage:
                  "linear-gradient(90deg,#22d3ee,#fdba74 50%,#facc15)",
              }}
            >
              tokens
            </span>
            .
          </h1>
          <p className="text-gray-400 max-w-2xl leading-snug">
            Live read of the <code className="text-cyan-300">points_ledger</code>{" "}
            ICRC-1 canister running on your local dfx replica. The browser
            talks to the canister directly over{" "}
            <code className="text-cyan-300">@dfinity/agent</code> — no API
            server in between.
          </p>
        </header>

        {/* Ledger meta card */}
        <section
          aria-label="Ledger metadata"
          className="mb-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5 md:p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="text-[10px] uppercase tracking-widest text-gray-400">
              Ledger metadata
            </div>
            <code className="text-[10px] font-mono text-gray-500 truncate max-w-[200px]">
              {pointsLedgerCanisterId()}
            </code>
          </div>
          {metaError ? (
            <div className="rounded-md border border-red-400/40 bg-red-500/10 p-3 text-sm text-red-200">
              {metaError}
              <div className="mt-1 text-[11px] text-red-200/70">
                Is <code>dfx start</code> running and the canister deployed?
              </div>
            </div>
          ) : !meta ? (
            <div className="text-sm text-gray-500">Loading…</div>
          ) : (
            <dl className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <MetaItem label="Name" value={meta.name} />
              <MetaItem label="Symbol" value={meta.symbol} mono />
              <MetaItem label="Decimals" value={meta.decimals.toString()} mono />
              <MetaItem
                label="Total supply"
                value={`${formatLwp(meta.totalSupply, 4)} ${meta.symbol}`}
                mono
              />
              <MetaItem
                label="Transfer fee"
                value={`${formatLwp(meta.fee, 8)} ${meta.symbol}`}
                mono
              />
              <MetaItem
                label="Minter"
                value={meta.minter ?? "—"}
                mono
                truncate
              />
            </dl>
          )}
        </section>

        {/* Balance query */}
        <section
          aria-label="Balance query"
          className="mb-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5 md:p-6"
        >
          <div className="text-[10px] uppercase tracking-widest text-gray-400 mb-3">
            Balance lookup
          </div>

          <label className="block text-[11px] uppercase tracking-widest text-gray-500 mb-2">
            Principal
          </label>
          <div className="flex flex-wrap gap-2 mb-3">
            {KNOWN_LOCAL_PRINCIPALS.map((k) => (
              <button
                key={k.principal}
                type="button"
                onClick={() => setQueryPrincipal(k.principal)}
                className={`text-[11px] uppercase tracking-widest px-2.5 py-1 rounded-full border transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60 ${
                  queryPrincipal === k.principal
                    ? "border-cyan-300/50 bg-cyan-300/[0.10] text-cyan-100"
                    : "border-white/15 bg-white/[0.02] text-gray-300 hover:border-white/30 hover:text-white"
                }`}
              >
                {k.label}
              </button>
            ))}
          </div>
          <input
            value={queryPrincipal}
            onChange={(e) => setQueryPrincipal(e.target.value.trim())}
            spellCheck={false}
            className="w-full font-mono text-sm bg-black/40 border border-white/10 rounded-md px-3 py-2 text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60 focus-visible:border-cyan-300/40"
            placeholder="Principal (e.g. 2vxsx-fae)"
          />

          <div className="mt-4 flex items-center gap-4">
            <div className="flex-1">
              <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">
                Balance
              </div>
              {balError ? (
                <div className="text-sm text-red-300">{balError}</div>
              ) : balLoading ? (
                <div className="text-2xl font-mono text-gray-500">…</div>
              ) : balance !== null && meta ? (
                <div className="text-3xl md:text-4xl font-black tabular-nums">
                  {formatLwp(balance, 4)}{" "}
                  <span className="text-sm text-gray-400 font-mono font-normal">
                    {meta.symbol}
                  </span>
                </div>
              ) : (
                <div className="text-2xl font-mono text-gray-500">—</div>
              )}
            </div>
            <Button
              tone="cyan"
              size="sm"
              onClick={refetchBalance}
              loading={balLoading}
            >
              Refresh
            </Button>
          </div>
        </section>

        {/* Mint + transfer */}
        <TokenMutations onMutated={refetchBalance} defaultTo={queryPrincipal} />

        <footer className="mt-10 text-[11px] text-gray-500 leading-snug max-w-2xl">
          Mint requires the caller identity to match the ledger&apos;s
          configured minter. On the local replica this is typically the{" "}
          <code className="text-cyan-300">default</code> dfx identity — the
          browser here uses an anonymous agent, so mint calls from this
          page will fail with <code className="text-red-300">NotMinter</code>.
          Use <code className="text-cyan-300">dfx canister call points_ledger
          mint</code> from your terminal for now, or wire up Internet
          Identity in a later pass.
        </footer>
      </div>
    </div>
  );
}

function MetaItem({
  label,
  value,
  mono,
  truncate,
}: {
  label: string;
  value: string;
  mono?: boolean;
  truncate?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">
        {label}
      </dt>
      <dd
        className={`text-white ${mono ? "font-mono" : ""} ${
          truncate ? "truncate" : ""
        }`}
        title={truncate ? value : undefined}
      >
        {value}
      </dd>
    </div>
  );
}

function TokenMutations({
  onMutated,
  defaultTo,
}: {
  onMutated: () => void;
  defaultTo: string;
}) {
  const [mintTo, setMintTo] = useState(defaultTo);
  const [mintAmount, setMintAmount] = useState("10");
  const [mintStatus, setMintStatus] = useState<string | null>(null);
  const [mintBusy, setMintBusy] = useState(false);

  const [xferTo, setXferTo] = useState("");
  const [xferAmount, setXferAmount] = useState("1");
  const [xferStatus, setXferStatus] = useState<string | null>(null);
  const [xferBusy, setXferBusy] = useState(false);

  useEffect(() => {
    setMintTo(defaultTo);
  }, [defaultTo]);

  const doMint = async () => {
    setMintStatus(null);
    setMintBusy(true);
    try {
      Principal.fromText(mintTo);
      const amount = parseLwp(mintAmount);
      const actor = await getLedgerActor();
      const res = await actor.mint({
        to: accountOf(mintTo),
        amount,
        memo: [],
        created_at_time: [],
      });
      if ("Ok" in res) {
        setMintStatus(`Minted · tx ${res.Ok.toString()}`);
        onMutated();
      } else {
        setMintStatus(`Error: ${Object.keys(res.Err)[0]}`);
      }
    } catch (e) {
      setMintStatus(`Error: ${(e as Error).message}`);
    } finally {
      setMintBusy(false);
    }
  };

  const doTransfer = async () => {
    setXferStatus(null);
    setXferBusy(true);
    try {
      Principal.fromText(xferTo);
      const amount = parseLwp(xferAmount);
      const actor = await getLedgerActor();
      const res = await actor.icrc1_transfer({
        from_subaccount: [],
        to: accountOf(xferTo),
        amount,
        fee: [],
        memo: [],
        created_at_time: [],
      });
      if ("Ok" in res) {
        setXferStatus(`Sent · tx ${res.Ok.toString()}`);
        onMutated();
      } else {
        setXferStatus(`Error: ${Object.keys(res.Err)[0]}`);
      }
    } catch (e) {
      setXferStatus(`Error: ${(e as Error).message}`);
    } finally {
      setXferBusy(false);
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section
        aria-label="Mint"
        className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 md:p-6"
      >
        <div className="text-[10px] uppercase tracking-widest text-yellow-300 mb-3">
          Mint (dev)
        </div>
        <label className="block text-[11px] uppercase tracking-widest text-gray-500 mb-1">
          To principal
        </label>
        <input
          value={mintTo}
          onChange={(e) => setMintTo(e.target.value.trim())}
          spellCheck={false}
          className="w-full font-mono text-xs bg-black/40 border border-white/10 rounded-md px-3 py-2 text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60 mb-3"
          placeholder="Principal"
        />
        <label className="block text-[11px] uppercase tracking-widest text-gray-500 mb-1">
          Amount (LWP)
        </label>
        <input
          value={mintAmount}
          onChange={(e) => setMintAmount(e.target.value)}
          inputMode="decimal"
          className="w-full font-mono bg-black/40 border border-white/10 rounded-md px-3 py-2 text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60 mb-3"
        />
        <Button
          tone="orange"
          size="md"
          onClick={doMint}
          loading={mintBusy}
          fullWidth
        >
          Mint
        </Button>
        {mintStatus && (
          <div
            className={`mt-3 text-[12px] font-mono ${
              mintStatus.startsWith("Error")
                ? "text-red-300"
                : "text-emerald-300"
            }`}
          >
            {mintStatus}
          </div>
        )}
      </section>

      <section
        aria-label="Transfer"
        className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 md:p-6"
      >
        <div className="text-[10px] uppercase tracking-widest text-violet-300 mb-3">
          ICRC-1 transfer
        </div>
        <label className="block text-[11px] uppercase tracking-widest text-gray-500 mb-1">
          To principal
        </label>
        <input
          value={xferTo}
          onChange={(e) => setXferTo(e.target.value.trim())}
          spellCheck={false}
          className="w-full font-mono text-xs bg-black/40 border border-white/10 rounded-md px-3 py-2 text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/60 mb-3"
          placeholder="Principal"
        />
        <label className="block text-[11px] uppercase tracking-widest text-gray-500 mb-1">
          Amount (LWP)
        </label>
        <input
          value={xferAmount}
          onChange={(e) => setXferAmount(e.target.value)}
          inputMode="decimal"
          className="w-full font-mono bg-black/40 border border-white/10 rounded-md px-3 py-2 text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/60 mb-3"
        />
        <Button
          tone="violet"
          size="md"
          onClick={doTransfer}
          loading={xferBusy}
          fullWidth
        >
          Transfer
        </Button>
        {xferStatus && (
          <div
            className={`mt-3 text-[12px] font-mono ${
              xferStatus.startsWith("Error")
                ? "text-red-300"
                : "text-emerald-300"
            }`}
          >
            {xferStatus}
          </div>
        )}
      </section>
    </div>
  );
}
