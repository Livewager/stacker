"use client";

/**
 * /icrc — Testing surface for the on-IC LWP ledger.
 *
 * A single page that exercises every public method of the points_ledger
 * canister:
 *   - Ledger metadata (name, symbol, decimals, total supply, minter)
 *   - Balance lookup (arbitrary principal)
 *   - Faucet — "Get freebies" button with live rate-limit display
 *   - ICRC-1 transfer (authenticated, pays fee)
 *   - ICRC-2 approve (authenticated)
 *
 * Authentication: a localStorage-backed Ed25519 dev identity. Each
 * browser gets its own principal automatically; the "Regenerate
 * identity" button resets the keypair (useful for testing the faucet
 * from a fresh-principal perspective). NOT a real auth story — this
 * page is intentionally a local-dev scratch pad, matching the scope
 * the user asked for.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Principal } from "@dfinity/principal";
import {
  getLedgerActor,
  getOrCreateDevIdentity,
  clearDevIdentity,
  accountOf,
  formatLwp,
  parseLwp,
  pointsLedgerCanisterId,
} from "@/lib/ic/agent";
import type {
  _SERVICE,
  FaucetConfigView,
  FaucetStatusView,
  FaucetError,
} from "@/declarations/points_ledger/points_ledger.did";
import { ROUTES } from "@/lib/routes";
import { Button } from "@/components/ui/Button";

export default function IcrcPage() {
  // Dev identity is lazily loaded on the client — SSR just shows "…".
  const [principal, setPrincipal] = useState<string | null>(null);
  const [actor, setActor] = useState<_SERVICE | null>(null);

  const bootActor = useCallback(async () => {
    const id = getOrCreateDevIdentity();
    setPrincipal(id.getPrincipal().toText());
    const a = await getLedgerActor(id);
    setActor(a);
  }, []);

  useEffect(() => {
    bootActor();
  }, [bootActor]);

  const regenerateIdentity = useCallback(async () => {
    clearDevIdentity();
    await bootActor();
  }, [bootActor]);

  return (
    <div className="min-h-screen bg-background text-white">
      <div className="max-w-5xl mx-auto px-5 md:px-8 py-8 md:py-12">
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
            ICRC · test surface · local replica
          </div>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight leading-[0.95] mb-3">
            /icrc{" "}
            <span
              className="bg-clip-text text-transparent"
              style={{
                backgroundImage:
                  "linear-gradient(90deg,#22d3ee,#fdba74 50%,#facc15)",
              }}
            >
              faucet & ops
            </span>
            .
          </h1>
          <p className="text-gray-400 max-w-2xl leading-snug">
            End-to-end test page for the <code className="text-cyan-300">points_ledger</code>{" "}
            canister. Get free tokens, check your balance, transfer,
            approve — everything talks to the local dfx replica directly
            via <code className="text-cyan-300">@dfinity/agent</code>.
          </p>
        </header>

        <IdentityCard
          principal={principal}
          onRegenerate={regenerateIdentity}
        />

        <FaucetCard actor={actor} principal={principal} />

        <LedgerMetaCard />

        <div className="grid gap-4 md:grid-cols-2">
          <BalanceQueryCard
            defaultPrincipal={principal}
          />
          <TransferCard actor={actor} principal={principal} />
        </div>

        <footer className="mt-10 text-[11px] text-gray-500 leading-snug max-w-2xl">
          Canister ID:{" "}
          <code className="font-mono text-gray-400">
            {pointsLedgerCanisterId()}
          </code>
          . Your dev identity lives in <code>localStorage</code> under{" "}
          <code>lw-dev-identity-v1</code> — clearing site data resets it.
        </footer>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------
// Identity card
// ----------------------------------------------------------------

function IdentityCard({
  principal,
  onRegenerate,
}: {
  principal: string | null;
  onRegenerate: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <section
      aria-label="Dev identity"
      className="mb-6 rounded-2xl border border-violet-300/20 bg-violet-300/[0.03] p-5 md:p-6"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] uppercase tracking-widest text-violet-300">
          Your dev identity
        </div>
        <div className="text-[10px] uppercase tracking-widest text-gray-500 font-mono">
          ed25519 · local
        </div>
      </div>
      <div className="font-mono text-sm md:text-base text-white break-all mb-3">
        {principal ?? "…"}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            if (!principal) return;
            await navigator.clipboard.writeText(principal);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
        >
          {copied ? "Copied" : "Copy principal"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onRegenerate}
        >
          Regenerate identity
        </Button>
      </div>
    </section>
  );
}

// ----------------------------------------------------------------
// Faucet card — the big "Get freebies" CTA + rate-limit status
// ----------------------------------------------------------------

function FaucetCard({
  actor,
  principal,
}: {
  actor: _SERVICE | null;
  principal: string | null;
}) {
  const [config, setConfig] = useState<FaucetConfigView | null>(null);
  const [status, setStatus] = useState<FaucetStatusView | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [lastResultKind, setLastResultKind] = useState<"ok" | "err" | null>(
    null,
  );

  const refresh = useCallback(async () => {
    if (!actor || !principal) return;
    try {
      const [cfg, st] = await Promise.all([
        actor.faucet_config(),
        actor.faucet_status(Principal.fromText(principal)),
      ]);
      setConfig(cfg);
      setStatus(st);
    } catch (e) {
      setLastResultKind("err");
      setLastResult((e as Error).message);
    }
  }, [actor, principal]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Live countdown: tick every second so the "Xs until next" pills
  // feel reactive without hammering the canister.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const claim = async () => {
    if (!actor) return;
    setClaiming(true);
    setLastResult(null);
    setLastResultKind(null);
    try {
      const res = await actor.faucet_claim();
      if ("Ok" in res) {
        setLastResultKind("ok");
        setLastResult(
          `Received ${formatLwp(res.Ok.amount, 4)} LWP (tx ${res.Ok.tx_id.toString()})`,
        );
      } else {
        setLastResultKind("err");
        setLastResult(describeFaucetError(res.Err));
      }
      refresh();
    } catch (e) {
      setLastResultKind("err");
      setLastResult((e as Error).message);
    } finally {
      setClaiming(false);
    }
  };

  const claimable = status?.eligible === true;
  const globalPct =
    config && config.global_daily_cap > 0n
      ? Number((config.global_tokens_today * 100n) / config.global_daily_cap)
      : 0;

  return (
    <section
      aria-label="Faucet"
      className="relative mb-6 rounded-2xl border border-yellow-300/25 bg-gradient-to-br from-yellow-300/[0.06] to-orange-300/[0.04] p-5 md:p-7 overflow-hidden"
    >
      {/* Decorative glow */}
      <div
        aria-hidden
        className="absolute -top-20 -right-20 h-60 w-60 rounded-full opacity-40 pointer-events-none"
        style={{
          background:
            "radial-gradient(closest-side, rgba(250,204,21,0.35), transparent)",
        }}
      />

      <div className="relative">
        <div className="text-[10px] uppercase tracking-widest text-yellow-300 mb-2">
          Faucet · rate-limited
        </div>
        <h2 className="text-2xl md:text-3xl font-black tracking-tight mb-2">
          Get freebies.{" "}
          <span className="text-yellow-300">10 LWP.</span>
        </h2>
        <p className="text-sm text-gray-300 mb-5 max-w-xl leading-snug">
          Click the button. The canister checks four rate-limit windows
          (minute / hour / day / week), confirms your balance is under
          100 LWP, and tops off the global daily cap. All enforced
          server-side; no way to drain it.
        </p>

        <div className="flex flex-wrap items-center gap-3 mb-5">
          <Button
            tone="orange"
            size="lg"
            onClick={claim}
            loading={claiming}
            disabled={!actor || !claimable}
          >
            {claiming ? "Claiming…" : "Get freebies"}
          </Button>
          <div className="text-[11px] text-gray-400">
            {status?.eligible === false ? (
              <span className="text-amber-300">{status.reason}</span>
            ) : status?.eligible === true ? (
              <span className="text-emerald-300">Ready to claim</span>
            ) : (
              <span>…</span>
            )}
          </div>
        </div>

        {lastResult && (
          <div
            className={`mb-5 rounded-lg border px-3 py-2 text-sm font-mono ${
              lastResultKind === "ok"
                ? "border-emerald-400/40 bg-emerald-400/[0.08] text-emerald-200"
                : "border-red-400/40 bg-red-500/10 text-red-200"
            }`}
          >
            {lastResult}
          </div>
        )}

        {/* Per-window rate-limit status */}
        {status && (
          <div className="mb-4">
            <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">
              Your limits
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {status.windows.map((w) => {
                const full = w.count >= w.max;
                const pct = Math.min(100, (Number(w.count) / Number(w.max)) * 100);
                return (
                  <div
                    key={w.label}
                    className={`rounded-lg border p-2.5 ${
                      full
                        ? "border-amber-400/40 bg-amber-400/[0.05]"
                        : "border-white/10 bg-white/[0.02]"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] uppercase tracking-widest text-gray-400">
                        per {w.label}
                      </span>
                      <span
                        className={`text-[11px] font-mono tabular-nums ${
                          full ? "text-amber-300" : "text-white"
                        }`}
                      >
                        {w.count}/{w.max}
                      </span>
                    </div>
                    <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                      <div
                        className={`h-full transition-[width] duration-300 ${
                          full ? "bg-amber-300/70" : "bg-cyan-300/60"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    {full && w.seconds_until_next > 0n ? (
                      <div className="mt-1 text-[10px] font-mono text-amber-300/80">
                        {formatSeconds(Number(w.seconds_until_next))}
                      </div>
                    ) : (
                      <div className="mt-1 text-[10px] font-mono text-gray-500">
                        &nbsp;
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Global cap progress */}
        {config && (
          <div>
            <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-2 flex items-center justify-between">
              <span>Global daily cap</span>
              <span className="font-mono text-gray-400">
                {formatLwp(config.global_tokens_today, 0)} /{" "}
                {formatLwp(config.global_daily_cap, 0)} LWP
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-yellow-300 to-orange-400 transition-[width] duration-500"
                style={{ width: `${globalPct}%` }}
              />
            </div>
            <div className="mt-1 text-[10px] font-mono text-gray-500">
              {config.global_claims_today.toString()} claims today · resets at
              UTC midnight
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function describeFaucetError(err: FaucetError): string {
  if ("AnonymousCaller" in err) return "Error: anonymous principal can't claim";
  if ("BalanceTooHigh" in err)
    return `Error: balance ${formatLwp(err.BalanceTooHigh.balance, 4)} LWP is over the ${formatLwp(err.BalanceTooHigh.threshold, 0)} LWP threshold`;
  if ("RateLimited" in err)
    return `Error: rate-limited (${err.RateLimited.max}/per ${err.RateLimited.window_label}; ${formatSeconds(Number(err.RateLimited.seconds_until_next))} until next)`;
  if ("GlobalCapReached" in err)
    return `Error: global daily cap hit (${formatLwp(err.GlobalCapReached.tokens_today, 0)} / ${formatLwp(err.GlobalCapReached.cap, 0)} LWP); resets in ${formatSeconds(Number(err.GlobalCapReached.seconds_until_reset))}`;
  return "Unknown faucet error";
}

function formatSeconds(secs: number): string {
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  if (secs < 86400)
    return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
  return `${Math.floor(secs / 86400)}d ${Math.floor((secs % 86400) / 3600)}h`;
}

// ----------------------------------------------------------------
// Ledger meta card
// ----------------------------------------------------------------

function LedgerMetaCard() {
  const [meta, setMeta] = useState<{
    name: string;
    symbol: string;
    decimals: number;
    totalSupply: bigint;
    fee: bigint;
    minter: string | null;
  } | null>(null);
  const [err, setErr] = useState<string | null>(null);

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
        setErr((e as Error).message);
      }
    })();
  }, []);

  return (
    <section
      aria-label="Ledger metadata"
      className="mb-6 rounded-2xl border border-white/10 bg-white/[0.02] p-5"
    >
      <div className="text-[10px] uppercase tracking-widest text-gray-400 mb-3">
        Ledger metadata
      </div>
      {err ? (
        <div className="text-sm text-red-300">{err}</div>
      ) : !meta ? (
        <div className="text-sm text-gray-500">Loading…</div>
      ) : (
        <dl className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <MetaItem label="Name" value={meta.name} />
          <MetaItem label="Symbol" value={meta.symbol} mono />
          <MetaItem label="Decimals" value={meta.decimals.toString()} mono />
          <MetaItem
            label="Total supply"
            value={`${formatLwp(meta.totalSupply, 2)} ${meta.symbol}`}
            mono
          />
          <MetaItem
            label="Fee"
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
      <dt className="text-[10px] uppercase tracking-widest text-gray-500 mb-0.5">
        {label}
      </dt>
      <dd
        className={`text-white ${mono ? "font-mono text-xs" : ""} ${
          truncate ? "truncate" : ""
        }`}
        title={truncate ? value : undefined}
      >
        {value}
      </dd>
    </div>
  );
}

// ----------------------------------------------------------------
// Balance lookup card
// ----------------------------------------------------------------

function BalanceQueryCard({
  defaultPrincipal,
}: {
  defaultPrincipal: string | null;
}) {
  const [input, setInput] = useState<string>("");
  const [bal, setBal] = useState<bigint | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (defaultPrincipal && !input) setInput(defaultPrincipal);
  }, [defaultPrincipal, input]);

  const query = useCallback(async () => {
    if (!input) return;
    setErr(null);
    try {
      Principal.fromText(input);
      const actor = await getLedgerActor();
      const b = await actor.icrc1_balance_of(accountOf(input));
      setBal(b);
    } catch (e) {
      setBal(null);
      setErr((e as Error).message);
    }
  }, [input]);

  useEffect(() => {
    if (input) query();
  }, [input, query]);

  return (
    <section
      aria-label="Balance query"
      className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.02] p-5"
    >
      <div className="text-[10px] uppercase tracking-widest text-cyan-300 mb-3">
        Balance lookup
      </div>
      <label className="block text-[11px] uppercase tracking-widest text-gray-500 mb-1">
        Principal
      </label>
      <input
        value={input}
        onChange={(e) => setInput(e.target.value.trim())}
        spellCheck={false}
        className="w-full font-mono text-xs bg-black/40 border border-white/10 rounded-md px-3 py-2 text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60 mb-3"
        placeholder="Principal"
      />
      <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">
        Balance
      </div>
      {err ? (
        <div className="text-sm text-red-300 font-mono">{err}</div>
      ) : bal !== null ? (
        <div className="text-2xl font-black tabular-nums">
          {formatLwp(bal, 4)}{" "}
          <span className="text-xs text-gray-400 font-mono font-normal">LWP</span>
        </div>
      ) : (
        <div className="text-sm text-gray-500">—</div>
      )}
      <Button size="sm" tone="cyan" className="mt-3" onClick={query}>
        Refresh
      </Button>
    </section>
  );
}

// ----------------------------------------------------------------
// Transfer card (authenticated, uses dev identity, pays fee)
// ----------------------------------------------------------------

function TransferCard({
  actor,
  principal,
}: {
  actor: _SERVICE | null;
  principal: string | null;
}) {
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("1");
  const [status, setStatus] = useState<string | null>(null);
  const [kind, setKind] = useState<"ok" | "err" | null>(null);
  const [busy, setBusy] = useState(false);

  const disabled = useMemo(
    () => !actor || !principal,
    [actor, principal],
  );

  const send = async () => {
    if (!actor) return;
    setBusy(true);
    setStatus(null);
    setKind(null);
    try {
      Principal.fromText(to);
      const amt = parseLwp(amount);
      const res = await actor.icrc1_transfer({
        from_subaccount: [],
        to: accountOf(to),
        amount: amt,
        fee: [],
        memo: [],
        created_at_time: [],
      });
      if ("Ok" in res) {
        setKind("ok");
        setStatus(`Sent · tx ${res.Ok.toString()}`);
      } else {
        setKind("err");
        setStatus(`Error: ${Object.keys(res.Err)[0]}`);
      }
    } catch (e) {
      setKind("err");
      setStatus((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      aria-label="Transfer"
      className="rounded-2xl border border-violet-300/20 bg-violet-300/[0.02] p-5"
    >
      <div className="text-[10px] uppercase tracking-widest text-violet-300 mb-3">
        ICRC-1 transfer
      </div>
      <label className="block text-[11px] uppercase tracking-widest text-gray-500 mb-1">
        To principal
      </label>
      <input
        value={to}
        onChange={(e) => setTo(e.target.value.trim())}
        spellCheck={false}
        className="w-full font-mono text-xs bg-black/40 border border-white/10 rounded-md px-3 py-2 text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/60 mb-3"
        placeholder="Principal"
      />
      <label className="block text-[11px] uppercase tracking-widest text-gray-500 mb-1">
        Amount (LWP)
      </label>
      <input
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        inputMode="decimal"
        className="w-full font-mono bg-black/40 border border-white/10 rounded-md px-3 py-2 text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/60 mb-3"
      />
      <Button
        size="md"
        tone="violet"
        onClick={send}
        loading={busy}
        disabled={disabled}
        fullWidth
      >
        Transfer
      </Button>
      {status && (
        <div
          className={`mt-3 text-[12px] font-mono ${
            kind === "ok" ? "text-emerald-300" : "text-red-300"
          }`}
        >
          {status}
        </div>
      )}
    </section>
  );
}
