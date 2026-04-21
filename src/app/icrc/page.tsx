"use client";

/**
 * /icrc — Testing surface for the on-IC LWP ledger.
 *
 * Auth model:
 *   - No active session → signed-out screen with explicit "Log in"
 *     / "Log in with a fresh key" / "Import key" buttons. Calls to
 *     the canister are anonymous. Rate-limited faucet rejects
 *     anonymous callers, so the signed-out view can still show
 *     ledger metadata + balance lookups but not claim or transfer.
 *   - Active session → the dashboard. All cards use the session
 *     key to sign calls. Header carries a "Log out" button.
 *
 * Login/logout are both explicit user actions. No auto-login on
 * page mount — the user sees the signed-out splash first and
 * chooses to generate or resume a key.
 *
 * The key itself lives in localStorage under lw-dev-identity-v1
 * (active) + lw-dev-identity-archive-v1 (last-used, preserved
 * across logout so "Log back in" doesn't force a new principal).
 * Plaintext by design — matches the local-dev scope of this page.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Ed25519KeyIdentity } from "@dfinity/identity";
import { Principal } from "@dfinity/principal";
import {
  getLedgerActor,
  loadSessionIdentity,
  hasArchivedIdentity,
  loginDevIdentity,
  logoutDevIdentity,
  forgetDevIdentity,
  exportSessionIdentityJson,
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
  // Identity state. Null = signed out (agent calls go anonymous).
  const [identity, setIdentity] = useState<Ed25519KeyIdentity | null>(null);
  const [mounted, setMounted] = useState(false);
  const [hasArchive, setHasArchive] = useState(false);
  const [actor, setActor] = useState<_SERVICE | null>(null);

  // Hydrate identity from localStorage on mount. We do NOT
  // auto-generate a fresh key — that's the whole point of the
  // explicit login flow. If the user has never logged in, they
  // see the signed-out splash.
  useEffect(() => {
    setMounted(true);
    setIdentity(loadSessionIdentity());
    setHasArchive(hasArchivedIdentity());
  }, []);

  // Bind the actor whenever identity changes (signed-in or -out).
  useEffect(() => {
    (async () => {
      const a = await getLedgerActor(identity ?? undefined);
      setActor(a);
    })();
  }, [identity]);

  const handleLogin = useCallback(
    (mode: "resume" | "new" | "import", importJson?: string) => {
      try {
        const id = loginDevIdentity(mode, importJson);
        setIdentity(id);
        setHasArchive(true);
      } catch (e) {
        alert((e as Error).message);
      }
    },
    [],
  );

  const handleLogout = useCallback(() => {
    logoutDevIdentity();
    setIdentity(null);
  }, []);

  const handleForget = useCallback(() => {
    if (
      !window.confirm(
        "This permanently deletes the saved key. If nobody else has backed it up, any LWP tokens that principal owns are gone forever. Continue?",
      )
    )
      return;
    forgetDevIdentity();
    setIdentity(null);
    setHasArchive(false);
  }, []);

  const principal = identity?.getPrincipal().toText() ?? null;

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
            End-to-end test page for the{" "}
            <code className="text-cyan-300">points_ledger</code> canister.
            All calls go to the local dfx replica via{" "}
            <code className="text-cyan-300">@dfinity/agent</code>.
          </p>
        </header>

        {!mounted ? (
          <div className="text-sm text-gray-500">Loading…</div>
        ) : identity ? (
          <SignedInView
            identity={identity}
            principal={principal!}
            actor={actor}
            onLogout={handleLogout}
            onForget={handleForget}
          />
        ) : (
          <SignedOutView
            hasArchive={hasArchive}
            onLogin={handleLogin}
            actor={actor}
          />
        )}

        <footer className="mt-10 text-[11px] text-gray-500 leading-snug max-w-2xl">
          Canister ID:{" "}
          <code className="font-mono text-gray-400">
            {pointsLedgerCanisterId()}
          </code>
          . Keys stored in <code>localStorage</code> (<code>lw-dev-identity-v1</code>{" "}
          active, <code>lw-dev-identity-archive-v1</code> last-used). Plaintext
          by design for local dev; a production deploy would swap the login
          card for Internet Identity without changing the rest of the UI.
        </footer>
      </div>
    </div>
  );
}

// ================================================================
// Signed-out splash
// ================================================================

function SignedOutView({
  hasArchive,
  onLogin,
  actor,
}: {
  hasArchive: boolean;
  onLogin: (mode: "resume" | "new" | "import", importJson?: string) => void;
  actor: _SERVICE | null;
}) {
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [importErr, setImportErr] = useState<string | null>(null);

  const doImport = () => {
    try {
      onLogin("import", importText.trim());
      setShowImport(false);
      setImportText("");
      setImportErr(null);
    } catch (e) {
      setImportErr((e as Error).message);
    }
  };

  return (
    <>
      <section
        aria-label="Sign in"
        className="mb-6 rounded-2xl border border-cyan-300/30 bg-gradient-to-br from-cyan-300/[0.06] to-cyan-300/[0.02] p-6 md:p-8"
      >
        <div className="text-[10px] uppercase tracking-widest text-cyan-300 mb-2">
          Signed out
        </div>
        <h2 className="text-2xl md:text-3xl font-black tracking-tight mb-3">
          Log in to test the canister.
        </h2>
        <p className="text-sm text-gray-300 leading-snug mb-5 max-w-xl">
          Your identity is a local Ed25519 keypair stored in your browser.
          No email, no password, no server — just a key your browser holds.
          Click below to generate one (or resume the last one you used).
        </p>

        <div className="flex flex-wrap gap-3 mb-4">
          {hasArchive ? (
            <>
              <Button tone="cyan" size="lg" onClick={() => onLogin("resume")}>
                Log in (resume last key)
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={() => {
                  if (
                    !window.confirm(
                      "This creates a brand-new principal. Any LWP balance tied to the previous key stays with that key — you can import the JSON back later if you kept a backup. Continue?",
                    )
                  )
                    return;
                  onLogin("new");
                }}
              >
                Log in with fresh key
              </Button>
            </>
          ) : (
            <Button tone="cyan" size="lg" onClick={() => onLogin("new")}>
              Create key & log in
            </Button>
          )}
          <Button
            variant="ghost"
            size="lg"
            onClick={() => setShowImport((v) => !v)}
          >
            {showImport ? "Cancel import" : "Import key"}
          </Button>
        </div>

        {showImport && (
          <div className="rounded-lg border border-white/10 bg-black/30 p-4">
            <label className="block text-[11px] uppercase tracking-widest text-gray-400 mb-2">
              Paste Ed25519 JSON
            </label>
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              rows={4}
              placeholder='["<public hex>", "<secret hex>"]'
              spellCheck={false}
              className="w-full font-mono text-xs bg-black/40 border border-white/10 rounded-md px-3 py-2 text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60 mb-3"
            />
            {importErr && (
              <div className="text-xs text-red-300 font-mono mb-3">
                {importErr}
              </div>
            )}
            <Button tone="cyan" size="sm" onClick={doImport} disabled={!importText.trim()}>
              Import & log in
            </Button>
          </div>
        )}

        <div className="mt-5 text-[11px] text-gray-500 leading-snug">
          The keypair lives in your browser&apos;s localStorage. Clearing
          site data erases it — there&apos;s no recovery unless you exported
          the JSON first. This is a local-dev testing identity, not a
          production auth scheme.
        </div>
      </section>

      <LedgerMetaCard />

      <div className="grid gap-4 md:grid-cols-2">
        <BalanceQueryCard />
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 text-sm text-gray-500 leading-snug">
          <div className="text-[10px] uppercase tracking-widest text-gray-400 mb-2">
            Signed-out limits
          </div>
          <p>
            Anonymous callers can query metadata and balances, but mutations
            (faucet, transfer, approve, burn) require a signed-in principal.
            Log in above to unlock them.
          </p>
          <p className="mt-2">
            Recent block log:{" "}
            <InlineBlockCount actor={actor} />
          </p>
        </div>
      </div>
    </>
  );
}

function InlineBlockCount({ actor }: { actor: _SERVICE | null }) {
  const [n, setN] = useState<bigint | null>(null);
  useEffect(() => {
    if (!actor) return;
    actor
      .icrc3_log_length()
      .then(setN)
      .catch(() => setN(null));
  }, [actor]);
  return (
    <span className="font-mono text-cyan-300">
      {n === null ? "—" : `${n.toString()} blocks`}
    </span>
  );
}

// ================================================================
// Signed-in dashboard
// ================================================================

function SignedInView({
  identity,
  principal,
  actor,
  onLogout,
  onForget,
}: {
  identity: Ed25519KeyIdentity;
  principal: string;
  actor: _SERVICE | null;
  onLogout: () => void;
  onForget: () => void;
}) {
  return (
    <>
      <SessionHeader
        principal={principal}
        onLogout={onLogout}
        onForget={onForget}
      />
      <BalanceBanner actor={actor} principal={principal} />
      <FaucetCard actor={actor} principal={principal} />
      <LedgerMetaCard />
      <div className="grid gap-4 md:grid-cols-2 mb-6">
        <BalanceQueryCard defaultPrincipal={principal} />
        <TransferCard actor={actor} principal={principal} />
      </div>
      <div className="grid gap-4 md:grid-cols-2 mb-6">
        <BurnCard actor={actor} />
        <ApproveCard actor={actor} />
      </div>
      <BlockLogCard actor={actor} />
    </>
  );
}

function SessionHeader({
  principal,
  onLogout,
  onForget,
}: {
  principal: string;
  onLogout: () => void;
  onForget: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [exportJson, setExportJson] = useState<string | null>(null);

  const copy = async () => {
    await navigator.clipboard.writeText(principal);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const handleExport = () => {
    const j = exportSessionIdentityJson();
    setExportJson(j);
    setShowExport(true);
  };

  return (
    <section
      aria-label="Session"
      className="mb-6 rounded-2xl border border-emerald-300/30 bg-emerald-300/[0.04] p-5 md:p-6"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] uppercase tracking-widest text-emerald-300">
              Signed in
            </span>
          </div>
          <div className="font-mono text-sm md:text-base text-white break-all">
            {principal}
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={onLogout}>
          Log out
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="ghost" onClick={copy}>
          {copied ? "Copied" : "Copy principal"}
        </Button>
        <Button size="sm" variant="ghost" onClick={handleExport}>
          Export key
        </Button>
        <Button size="sm" variant="danger" onClick={onForget}>
          Forget key
        </Button>
      </div>
      {showExport && exportJson && (
        <div className="mt-3 rounded-lg border border-amber-400/30 bg-amber-400/[0.05] p-3">
          <div className="text-[10px] uppercase tracking-widest text-amber-300 mb-2">
            Backup — copy and store somewhere safe
          </div>
          <textarea
            readOnly
            value={exportJson}
            rows={4}
            className="w-full font-mono text-[11px] bg-black/40 border border-white/10 rounded-md px-3 py-2 text-white"
            onFocus={(e) => e.currentTarget.select()}
          />
          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              tone="cyan"
              onClick={async () => {
                await navigator.clipboard.writeText(exportJson);
              }}
            >
              Copy JSON
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowExport(false)}>
              Hide
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

// ================================================================
// Session balance banner — headline LWP for the logged-in user
// ================================================================

function BalanceBanner({
  actor,
  principal,
}: {
  actor: _SERVICE | null;
  principal: string;
}) {
  const [balance, setBalance] = useState<bigint | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const refreshRef = useRef<(() => Promise<void>) | null>(null);

  const refresh = useCallback(async () => {
    if (!actor) return;
    setRefreshing(true);
    try {
      const b = await actor.icrc1_balance_of(accountOf(principal));
      setBalance(b);
    } finally {
      setRefreshing(false);
    }
  }, [actor, principal]);

  useEffect(() => {
    refreshRef.current = refresh;
    refresh();
  }, [refresh]);

  return (
    <section
      aria-label="Your balance"
      className="mb-6 rounded-2xl border border-cyan-300/30 bg-gradient-to-br from-cyan-300/[0.07] to-cyan-300/[0.02] p-5 md:p-7"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-cyan-300 mb-2">
            Your balance
          </div>
          <div className="text-5xl md:text-6xl font-black tabular-nums leading-none">
            {balance !== null ? formatLwp(balance, 4) : "—"}
          </div>
          <div className="mt-2 text-xs font-mono text-gray-400">LWP</div>
        </div>
        <Button size="sm" variant="outline" onClick={refresh} loading={refreshing}>
          Refresh
        </Button>
      </div>
    </section>
  );
}

// ================================================================
// Faucet card
// ================================================================

function FaucetCard({
  actor,
  principal,
}: {
  actor: _SERVICE | null;
  principal: string;
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

  // Tick so countdowns stay fresh.
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
      window.dispatchEvent(new CustomEvent("lw-ledger-mutated"));
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
          The canister checks four rate-limit windows (minute / hour / day /
          week), confirms your balance is under 100 LWP, and tops off the
          global daily cap. All enforced server-side.
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

// ================================================================
// Ledger meta card
// ================================================================

function LedgerMetaCard() {
  const [meta, setMeta] = useState<{
    name: string;
    symbol: string;
    decimals: number;
    totalSupply: bigint;
    fee: bigint;
    minter: string | null;
    logLength: bigint;
  } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const actor = await getLedgerActor();
      const [name, symbol, decimals, totalSupply, fee, minterOpt, logLength] =
        await Promise.all([
          actor.icrc1_name(),
          actor.icrc1_symbol(),
          actor.icrc1_decimals(),
          actor.icrc1_total_supply(),
          actor.icrc1_fee(),
          actor.icrc1_minting_account(),
          actor.icrc3_log_length(),
        ]);
      setMeta({
        name,
        symbol,
        decimals: Number(decimals),
        totalSupply,
        fee,
        minter: minterOpt[0]?.owner.toText() ?? null,
        logLength,
      });
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
    const handler = () => load();
    window.addEventListener("lw-ledger-mutated", handler);
    return () => window.removeEventListener("lw-ledger-mutated", handler);
  }, [load]);

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
          <MetaItem label="Blocks" value={meta.logLength.toString()} mono />
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

// ================================================================
// Balance lookup card (arbitrary principal)
// ================================================================

function BalanceQueryCard({
  defaultPrincipal,
}: {
  defaultPrincipal?: string;
} = {}) {
  const [input, setInput] = useState<string>(defaultPrincipal ?? "");
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
      aria-label="Balance lookup"
      className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.02] p-5"
    >
      <div className="text-[10px] uppercase tracking-widest text-cyan-300 mb-3">
        Balance lookup (any principal)
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

// ================================================================
// Transfer card (authenticated)
// ================================================================

function TransferCard({
  actor,
  principal,
}: {
  actor: _SERVICE | null;
  principal: string;
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
        window.dispatchEvent(new CustomEvent("lw-ledger-mutated"));
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

// ================================================================
// Burn card
// ================================================================

function BurnCard({ actor }: { actor: _SERVICE | null }) {
  const [amount, setAmount] = useState("1");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [kind, setKind] = useState<"ok" | "err" | null>(null);

  const burn = async () => {
    if (!actor) return;
    setBusy(true);
    setStatus(null);
    setKind(null);
    try {
      const amt = parseLwp(amount);
      const res = await actor.burn({
        from_subaccount: [],
        amount: amt,
        memo: [],
        created_at_time: [],
      });
      if ("Ok" in res) {
        setKind("ok");
        setStatus(`Burned · tx ${res.Ok.toString()}`);
        window.dispatchEvent(new CustomEvent("lw-ledger-mutated"));
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
      aria-label="Burn"
      className="rounded-2xl border border-rose-300/20 bg-rose-300/[0.02] p-5"
    >
      <div className="text-[10px] uppercase tracking-widest text-rose-300 mb-3">
        Burn (destroy tokens)
      </div>
      <label className="block text-[11px] uppercase tracking-widest text-gray-500 mb-1">
        Amount (LWP)
      </label>
      <input
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        inputMode="decimal"
        className="w-full font-mono bg-black/40 border border-white/10 rounded-md px-3 py-2 text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/60 mb-3"
      />
      <Button
        size="md"
        tone="rose"
        onClick={burn}
        loading={busy}
        disabled={!actor}
        fullWidth
      >
        Burn
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

// ================================================================
// ICRC-2 approve card
// ================================================================

function ApproveCard({ actor }: { actor: _SERVICE | null }) {
  const [spender, setSpender] = useState("");
  const [amount, setAmount] = useState("1");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [kind, setKind] = useState<"ok" | "err" | null>(null);

  const approve = async () => {
    if (!actor) return;
    setBusy(true);
    setStatus(null);
    setKind(null);
    try {
      Principal.fromText(spender);
      const amt = parseLwp(amount);
      const res = await actor.icrc2_approve({
        fee: [],
        memo: [],
        from_subaccount: [],
        created_at_time: [],
        amount: amt,
        expected_allowance: [],
        expires_at: [],
        spender: accountOf(spender),
      });
      if ("Ok" in res) {
        setKind("ok");
        setStatus(`Approved · tx ${res.Ok.toString()}`);
        window.dispatchEvent(new CustomEvent("lw-ledger-mutated"));
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
      aria-label="Approve"
      className="rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.02] p-5"
    >
      <div className="text-[10px] uppercase tracking-widest text-emerald-300 mb-3">
        ICRC-2 approve
      </div>
      <label className="block text-[11px] uppercase tracking-widest text-gray-500 mb-1">
        Spender principal
      </label>
      <input
        value={spender}
        onChange={(e) => setSpender(e.target.value.trim())}
        spellCheck={false}
        className="w-full font-mono text-xs bg-black/40 border border-white/10 rounded-md px-3 py-2 text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60 mb-3"
        placeholder="Principal"
      />
      <label className="block text-[11px] uppercase tracking-widest text-gray-500 mb-1">
        Amount (LWP)
      </label>
      <input
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        inputMode="decimal"
        className="w-full font-mono bg-black/40 border border-white/10 rounded-md px-3 py-2 text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60 mb-3"
      />
      <Button
        size="md"
        tone="emerald"
        onClick={approve}
        loading={busy}
        disabled={!actor}
        fullWidth
      >
        Approve
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

// ================================================================
// Block log viewer — last 20 blocks
// ================================================================

function BlockLogCard({ actor }: { actor: _SERVICE | null }) {
  const [blocks, setBlocks] = useState<
    Array<{
      id: bigint;
      btype: string;
      amount?: string;
      from: string | null;
      to: string | null;
    }>
  >([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!actor) return;
    setLoading(true);
    setErr(null);
    try {
      const len = await actor.icrc3_log_length();
      const total = Number(len);
      const take = Math.min(20, total);
      const start = BigInt(Math.max(0, total - take));
      const res = await actor.icrc3_get_blocks([{ start, length: BigInt(take) }]);
      const parsed = res.blocks
        .map((b) => {
          const m = findMap(b.block);
          const btype = (m && findText(m, "btype")) ?? "?";
          const tx = m && findMap2(m, "tx");
          const amount = tx
            ? findNat(tx, "amt")?.toString()
            : undefined;
          const from = tx ? findAccountText(tx, "from") : null;
          const to = tx ? findAccountText(tx, "to") : null;
          return { id: b.id, btype, amount, from, to };
        })
        .reverse(); // newest first
      setBlocks(parsed);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [actor]);

  useEffect(() => {
    load();
    const handler = () => load();
    window.addEventListener("lw-ledger-mutated", handler);
    return () => window.removeEventListener("lw-ledger-mutated", handler);
  }, [load]);

  return (
    <section
      aria-label="Block log"
      className="mb-6 rounded-2xl border border-white/10 bg-white/[0.02] p-5"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] uppercase tracking-widest text-gray-400">
          Block log · last 20
        </div>
        <Button size="sm" variant="ghost" onClick={load} loading={loading}>
          Refresh
        </Button>
      </div>
      {err ? (
        <div className="text-sm text-red-300 font-mono">{err}</div>
      ) : blocks.length === 0 ? (
        <div className="text-sm text-gray-500">No blocks yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="text-gray-500 text-[10px] uppercase tracking-widest">
                <th className="text-left py-1 pr-3">#</th>
                <th className="text-left py-1 pr-3">Type</th>
                <th className="text-left py-1 pr-3">Amount</th>
                <th className="text-left py-1 pr-3">From → To</th>
              </tr>
            </thead>
            <tbody>
              {blocks.map((b) => (
                <tr key={b.id.toString()} className="border-t border-white/5">
                  <td className="py-1.5 pr-3 text-gray-400">{b.id.toString()}</td>
                  <td className="py-1.5 pr-3">
                    <BlockTypeChip btype={b.btype} />
                  </td>
                  <td className="py-1.5 pr-3 text-white">
                    {b.amount
                      ? `${formatLwp(BigInt(b.amount), 4)} LWP`
                      : "—"}
                  </td>
                  <td className="py-1.5 pr-3 text-gray-400 truncate max-w-[260px]">
                    {b.from ? short(b.from) : "∅"} → {b.to ? short(b.to) : "∅"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function BlockTypeChip({ btype }: { btype: string }) {
  const color =
    btype === "1mint"
      ? "border-emerald-300/40 bg-emerald-300/[0.08] text-emerald-200"
      : btype === "1burn"
        ? "border-rose-300/40 bg-rose-300/[0.08] text-rose-200"
        : btype === "1xfer"
          ? "border-violet-300/40 bg-violet-300/[0.08] text-violet-200"
          : btype === "2approve"
            ? "border-yellow-300/40 bg-yellow-300/[0.08] text-yellow-200"
            : "border-white/20 bg-white/[0.05] text-gray-300";
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] border ${color}`}>
      {btype}
    </span>
  );
}

function short(p: string): string {
  if (p.length <= 14) return p;
  return `${p.slice(0, 8)}…${p.slice(-5)}`;
}

// ICRC3Value shape helpers — the blocks are nested Map/Nat/Text/Blob.
type IcrcVal =
  | { Map: Array<[string, IcrcVal]> }
  | { Nat: bigint }
  | { Text: string }
  | { Int: bigint }
  | { Blob: Uint8Array | number[] }
  | { Array: IcrcVal[] };

function findMap(v: IcrcVal): Array<[string, IcrcVal]> | null {
  return "Map" in v ? v.Map : null;
}
function findMap2(
  m: Array<[string, IcrcVal]>,
  key: string,
): Array<[string, IcrcVal]> | null {
  const entry = m.find(([k]) => k === key);
  if (!entry) return null;
  const v = entry[1];
  return "Map" in v ? v.Map : null;
}
function findText(m: Array<[string, IcrcVal]>, key: string): string | null {
  const entry = m.find(([k]) => k === key);
  if (!entry) return null;
  const v = entry[1];
  return "Text" in v ? v.Text : null;
}
function findNat(m: Array<[string, IcrcVal]>, key: string): bigint | null {
  const entry = m.find(([k]) => k === key);
  if (!entry) return null;
  const v = entry[1];
  return "Nat" in v ? v.Nat : null;
}
function findAccountText(
  m: Array<[string, IcrcVal]>,
  key: string,
): string | null {
  // Account blocks are encoded as Array(Blob principal, maybe subaccount blob).
  const entry = m.find(([k]) => k === key);
  if (!entry) return null;
  const v = entry[1];
  if (!("Array" in v) || v.Array.length === 0) return null;
  const first = v.Array[0];
  if (!("Blob" in first)) return null;
  try {
    const bytes = new Uint8Array(first.Blob);
    return Principal.fromUint8Array(bytes).toText();
  } catch {
    return null;
  }
}
