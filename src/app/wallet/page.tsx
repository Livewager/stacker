"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";
import ActivityFeed from "@/components/dunk/ActivityFeed";
import { useWalletState } from "@/components/dunk/WalletContext";
import { formatLWP } from "@/lib/icp";
import { useToast } from "@/components/dunk/Toast";
import { useCopyable } from "@/lib/clipboard";
import { useLocalPref, PREF_KEYS } from "@/lib/prefs";
import { LedgerErrorCard } from "@/components/dunk/LedgerErrorCard";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { AmountField } from "@/components/ui/AmountField";
import { shortenPrincipal } from "@/lib/principal";
import { WalletAdvanced } from "@/components/wallet/WalletAdvanced";

const short = (s: string) => shortenPrincipal(s, { head: 8, tail: 8 });

// Demo fiat rate for the Buy panel. LWP is non-fungible for real
// money; this $1 ≈ 1 LWP stand-in is a readability aid only. Keep
// the hint copy explicit that it's a demo rate so nobody mistakes
// it for a live oracle.
const DEMO_USD_PER_LWP = 1;

// Must stay in sync with MAX_AMOUNT_BASE_UNITS in
// src/app/api/dunk/buy/route.ts (10_000_000_000n base units with 8
// decimals = 100 LWP). Surfacing this client-side lets the input
// reject obvious typos immediately rather than round-tripping the
// API for a "cap exceeded" error.
const BUY_MAX_LWP = 100;

type QuickTab = "buy" | "deposit" | "send" | "withdraw";
const QUICK_TABS: readonly QuickTab[] = ["buy", "deposit", "send", "withdraw"];

function isQuickTab(v: unknown): v is QuickTab {
  return typeof v === "string" && (QUICK_TABS as readonly string[]).includes(v);
}

export default function WalletPage() {
  const { identity, principal, balance, status, login, buy, error, refresh } =
    useWalletState();
  const toast = useToast();
  // Persist last-picked action so users who always deposit land on the
  // deposit tab on return. Narrowed to the valid QuickTab union so a
  // hand-edited prefs value can't crash the page.
  const [rawTab, setRawTab] = useLocalPref<QuickTab>(PREF_KEYS.walletQuickTab, "buy");
  const tab: QuickTab = isQuickTab(rawTab) ? rawTab : "buy";
  const setTab = (next: QuickTab) => setRawTab(next);
  const [buyAmount, setBuyAmount] = useState("1");
  const [buyPulse, setBuyPulse] = useState(0);
  // Client-side mirror of MAX_AMOUNT_BASE_UNITS in the /buy API.
  // Short-circuits the round-trip when a user fat-fingers 1000 —
  // the inline "Exceeds demo cap" error appears on keystroke, and
  // the Button is disabled so they can't submit it anyway.
  const buyAmountNum = Number(buyAmount);
  const buyOverCap =
    Number.isFinite(buyAmountNum) && buyAmountNum > BUY_MAX_LWP;
  const buyError = buyOverCap
    ? `Exceeds demo cap (${BUY_MAX_LWP} LWP)`
    : undefined;

  const signedIn = !!identity;

  const onBuy = async () => {
    try {
      await buy(Number(buyAmount));
      setBuyPulse((n) => n + 1);
    } catch {
      /* toast already fired from WalletContext */
    }
  };

  const notYet = (label: string) => () =>
    toast.push({
      kind: "info",
      title: `${label} — coming soon`,
      description: "Demo build; the live flow lands next sprint.",
    });

  const copy = useCopyable();
  const copyPrincipal = () => copy(principal, { label: "Principal" });

  // Deterministic hue per principal so the hero card has individuality.
  const heroHue = useMemo(() => {
    if (!principal) return 190;
    let h = 0;
    for (let i = 0; i < Math.min(principal.length, 8); i++) {
      h = (h * 31 + principal.charCodeAt(i)) >>> 0;
    }
    return h % 360;
  }, [principal]);

  return (
    <>
      <AppHeader />
      <div className="mx-auto max-w-6xl px-4 md:px-8 py-8 md:py-12">
        <div className="mb-8 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs uppercase tracking-widest text-cyan-300">Wallet</span>
              <Pill
                status="demo"
                className="font-mono text-[9px]"
                title="Local ICRC-1 ledger — no real money moves"
              >
                demo
              </Pill>
              {/* Pending tx pill: any balance-changing status (buy,
                  deposit, send, withdraw) surfaces as a small amber
                  chip next to the eyebrow. Tells the user their
                  balance is about to change before the toast + number
                  update land. aria-live=polite so screen readers
                  announce transitions. */}
              {(status === "buying" ||
                status === "depositing" ||
                status === "sending" ||
                status === "withdrawing") && (
                <span
                  role="status"
                  aria-label={`Transaction in flight: ${status}. Balance will update when it lands.`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/[0.08] px-2 py-0.5 text-[9px] font-mono uppercase tracking-widest text-amber-200"
                  title="A transaction is in flight — balance will update when it lands"
                >
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-amber-300 animate-pulse" />
                  <span aria-hidden>
                  {status === "buying"
                    ? "buying"
                    : status === "depositing"
                      ? "depositing"
                      : status === "sending"
                        ? "sending"
                        : "withdrawing"}
                  </span>
                </span>
              )}
            </div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight">
              Your balances.
            </h1>
            <p className="text-sm text-gray-400 mt-1 max-w-xl">
              One key, one identity, on-chain. Livewager never custodies your tokens —
              this is your wallet, running against the ICRC-1/2/3 points ledger.
            </p>
          </div>
          {signedIn && (
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span className="font-mono">{short(principal)}</span>
              <button
                onClick={copyPrincipal}
                className="px-2 py-1 rounded-md border border-white/10 hover:border-white/25 hover:text-white transition"
              >
                Copy
              </button>
            </div>
          )}
        </div>

        {error && signedIn && (
          <div className="mb-6">
            <LedgerErrorCard error={error} onRetry={refresh} scope="Wallet" />
          </div>
        )}

        {!signedIn ? (
          <SignedOutPrompt onLogin={login} loading={status === "loading"} />
        ) : (
          <div className="grid gap-6 md:grid-cols-[1.2fr_1fr]">
            {/* Left column: hero balance + quick actions + tokens */}
            <div className="space-y-6">
              {/* Balance hero */}
              <section
                className="relative overflow-hidden rounded-3xl border border-white/10 p-6 md:p-8"
                style={{
                  background: `radial-gradient(1200px 400px at 0% 0%, hsl(${heroHue} 70% 50% / 0.2), transparent 60%), radial-gradient(800px 400px at 100% 100%, hsl(${
                    (heroHue + 40) % 360
                  } 80% 45% / 0.18), transparent 60%), rgba(255,255,255,0.02)`,
                }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-cyan-300 mb-2">
                      Available
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (balance === null) return;
                        copy(`${formatLWP(balance, 4)} LWP`, { label: "Balance" });
                      }}
                      disabled={balance === null}
                      title={balance !== null ? "Copy balance" : undefined}
                      aria-label={
                        balance !== null
                          ? `Copy balance ${formatLWP(balance, 4)} LWP`
                          : "Balance unavailable"
                      }
                      className="group/bal text-left rounded-md -mx-1 px-1 py-0.5 transition hover:bg-white/[0.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60 disabled:cursor-default"
                    >
                      <div
                        className="text-5xl md:text-6xl font-black tabular-nums leading-none"
                        aria-hidden
                      >
                        {balance !== null ? formatLWP(balance, 4) : "—"}
                      </div>
                      <div className="mt-2 text-sm font-mono text-gray-400 flex items-center gap-2" aria-hidden>
                        <span>LWP</span>
                        {balance !== null && (
                          <span className="text-[9px] uppercase tracking-widest text-gray-500 opacity-0 group-hover/bal:opacity-100 group-focus-visible/bal:opacity-100 transition">
                            · tap to copy
                          </span>
                        )}
                      </div>
                    </button>
                    {/* Screen-reader-friendly announcement. aria-live
                        fires when balance changes (buy, deposit).
                        Visual block is aria-hidden so SR only reads
                        the phrased sentence, not "— LWP" twice. */}
                    <span className="sr-only" aria-live="polite">
                      {balance !== null
                        ? `Balance ${formatLWP(balance, 4)} LWP`
                        : "Balance unavailable"}
                    </span>
                  </div>
                  <div className="hidden md:block text-right">
                    <div className="text-[10px] uppercase tracking-widest text-gray-400 mb-1">
                      Network
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-300 font-mono">
                      <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                      Internet Computer · local
                    </div>
                  </div>
                </div>

                {/* Action rail. role="tablist" + arrow-key shuffling
                    so keyboard users can cycle Buy → Deposit → Send
                    → Withdraw without tabbing through every element
                    in between. W3C pattern: focus follows selection,
                    wraps at edges. */}
                <div
                  role="tablist"
                  aria-label="Wallet quick actions"
                  className="mt-6 grid grid-cols-4 gap-2 md:gap-3"
                  onKeyDown={(e) => {
                    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                    e.preventDefault();
                    const i = QUICK_TABS.indexOf(tab);
                    if (i < 0) return;
                    const delta = e.key === "ArrowLeft" ? -1 : 1;
                    const next =
                      QUICK_TABS[(i + delta + QUICK_TABS.length) % QUICK_TABS.length];
                    setTab(next);
                    // Shift focus to the newly-active tile so screen
                    // readers announce it and the visual focus ring
                    // keeps up.
                    const container = e.currentTarget as HTMLElement;
                    const idx = QUICK_TABS.indexOf(next);
                    const btn = container.children[idx] as HTMLButtonElement | undefined;
                    btn?.focus?.();
                  }}
                >
                  <ActionTile
                    label="Buy"
                    active={tab === "buy"}
                    onClick={() => setTab("buy")}
                    tone="cyan"
                    icon={
                      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
                        <path d="M10 3a1 1 0 0 1 1 1v5h5a1 1 0 1 1 0 2h-5v5a1 1 0 1 1-2 0v-5H4a1 1 0 1 1 0-2h5V4a1 1 0 0 1 1-1Z" />
                      </svg>
                    }
                  />
                  <ActionTile
                    label="Deposit"
                    active={tab === "deposit"}
                    onClick={() => setTab("deposit")}
                    tone="orange"
                    icon={
                      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
                        <path d="M10 3a1 1 0 0 1 1 1v8.586l2.293-2.293a1 1 0 1 1 1.414 1.414l-4 4a1 1 0 0 1-1.414 0l-4-4a1 1 0 1 1 1.414-1.414L9 12.586V4a1 1 0 0 1 1-1Zm-6 13a1 1 0 0 1 1-1h10a1 1 0 1 1 0 2H5a1 1 0 0 1-1-1Z" />
                      </svg>
                    }
                  />
                  <ActionTile
                    label="Send"
                    active={tab === "send"}
                    onClick={() => setTab("send")}
                    tone="violet"
                    icon={
                      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
                        <path d="M3 10a1 1 0 0 1 1-1h9.586L10.293 5.707a1 1 0 1 1 1.414-1.414l5 5a1 1 0 0 1 0 1.414l-5 5a1 1 0 1 1-1.414-1.414L13.586 11H4a1 1 0 0 1-1-1Z" />
                      </svg>
                    }
                  />
                  <ActionTile
                    label="Withdraw"
                    active={tab === "withdraw"}
                    onClick={() => setTab("withdraw")}
                    tone="rose"
                    icon={
                      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
                        <path d="M10 17a1 1 0 0 1-1-1V7.414L6.707 9.707A1 1 0 1 1 5.293 8.293l4-4a1 1 0 0 1 1.414 0l4 4a1 1 0 1 1-1.414 1.414L11 7.414V16a1 1 0 0 1-1 1Zm-6-3a1 1 0 0 1 1-1h10a1 1 0 1 1 0 2H5a1 1 0 0 1-1-1Z" />
                      </svg>
                    }
                  />
                </div>
              </section>

              {/* Action tab panel */}
              <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 md:p-6">
                {tab === "buy" && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <div className="text-[10px] uppercase tracking-widest text-cyan-300 mb-1">
                          Buy LWP
                        </div>
                        <div className="text-lg font-semibold">Mint test credits</div>
                      </div>
                      <Pill status="demo">demo</Pill>
                    </div>
                    <AmountField
                      id="wallet-buy-amount"
                      label="Buy amount"
                      value={buyAmount}
                      onChange={setBuyAmount}
                      tone="cyan"
                      error={buyError}
                      hint={`Local demo mint · per-request cap ${BUY_MAX_LWP} LWP · demo rate, not market`}
                      rate={DEMO_USD_PER_LWP}
                      disabled={status === "buying"}
                      className="mb-3"
                      hideChips
                    />
                    <Button
                      onClick={onBuy}
                      loading={status === "buying"}
                      successPulse={buyPulse}
                      tone="cyan"
                      size="lg"
                      fullWidth
                      disabled={buyOverCap || !buyAmount || buyAmountNum <= 0}
                    >
                      {status === "buying" ? "Minting…" : `Buy ${buyAmount || "?"} LWP`}
                    </Button>
                    <p className="text-[11px] text-gray-500 mt-3 leading-snug">
                      Local demo: our minter mints directly to your II principal. Real
                      funding paths (LTC, card) live under the Deposit tab.
                    </p>
                  </div>
                )}

                {tab === "deposit" && (
                  <DepositPanel />
                )}

                {tab === "send" && (
                  <ActionStubPanel
                    title="Send LWP"
                    body="ICRC-1 transfer with signed II call. Full form lives at /send."
                    href="/send"
                    cta="Open send"
                    tone="violet"
                  />
                )}

                {tab === "withdraw" && (
                  <ActionStubPanel
                    title="Withdraw to LTC"
                    body="Burn LWP, receive LTC at the fixed demo rate. Mocked pipeline — no real LTC leaves the machine."
                    href="/withdraw"
                    cta="Open withdraw"
                    tone="rose"
                  />
                )}
              </section>

              {/* Tokens */}
              <section className="rounded-2xl border border-white/10 bg-white/[0.02]">
                <div className="flex items-center justify-between px-5 py-3 border-b border-white/5">
                  <div className="text-[10px] uppercase tracking-widest text-cyan-300">
                    Tokens
                  </div>
                  <div className="text-[10px] uppercase tracking-widest text-gray-500">
                    {balance !== null ? "1 live · 2 arriving" : "reading…"}
                  </div>
                </div>
                <ul className="divide-y divide-white/5">
                  <TokenRow
                    symbol="LWP"
                    name="Livewager Points"
                    amount={balance !== null ? formatLWP(balance, 4) : "—"}
                    status="live"
                    color="#22d3ee"
                  />
                  <TokenRow
                    symbol="LTC"
                    name="Litecoin"
                    amount="—"
                    status="arriving"
                    color="#a78bfa"
                    onClick={notYet("LTC tokens")}
                  />
                  <TokenRow
                    symbol="BTC"
                    name="Bitcoin"
                    amount="—"
                    status="arriving"
                    color="#f97316"
                    onClick={notYet("BTC tokens")}
                  />
                </ul>
              </section>

              {/* Power-user disclosure: raw balance units, ICRC-1
                  decimals/symbol, canister id, IC host. Collapsed
                  by default; all rows are copyable. */}
              <WalletAdvanced />
            </div>

            {/* Right column: activity */}
            <div>
              <ActivityFeed principal={principal} limit={18} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ----------------------------------------------------------------
// Subcomponents
// ----------------------------------------------------------------

function SignedOutPrompt({ onLogin, loading }: { onLogin: () => void; loading: boolean }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 md:p-10 text-center">
      <div className="text-[11px] uppercase tracking-widest text-cyan-300 mb-3">
        Wallet locked
      </div>
      <h2 className="text-2xl md:text-3xl font-black text-white mb-2">
        Sign in to see your balance.
      </h2>
      <p className="text-sm text-gray-300 max-w-md mx-auto mb-5 leading-snug">
        Internet Identity — no password, no seed phrase. A passkey anchor you control.
      </p>
      <Button onClick={onLogin} loading={loading} tone="cyan" size="lg">
        {loading ? "Connecting…" : "Connect Internet Identity"}
      </Button>
    </div>
  );
}

function ActionTile({
  label,
  active,
  onClick,
  icon,
  tone,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  tone: "cyan" | "orange" | "violet" | "rose";
}) {
  const base =
    tone === "cyan"
      ? "hover:border-cyan-300/50"
      : tone === "orange"
        ? "hover:border-orange-300/50"
        : tone === "violet"
          ? "hover:border-violet-300/50"
          : "hover:border-rose-300/50";
  const activeCls =
    tone === "cyan"
      ? "border-cyan-300/70 bg-cyan-300/[0.08]"
      : tone === "orange"
        ? "border-orange-300/70 bg-orange-300/[0.08]"
        : tone === "violet"
          ? "border-violet-300/70 bg-violet-300/[0.08]"
          : "border-rose-300/70 bg-rose-300/[0.08]";
  const fg =
    tone === "cyan"
      ? "text-cyan-300"
      : tone === "orange"
        ? "text-orange-300"
        : tone === "violet"
          ? "text-violet-300"
          : "text-rose-300";
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      // Roving tabindex: only the active tile is reachable via Tab.
      // Arrow keys move between tiles via the container-level handler.
      tabIndex={active ? 0 : -1}
      onClick={onClick}
      className={`flex flex-col items-center gap-2 rounded-xl border px-3 py-3 transition ${
        active ? activeCls : `border-white/10 bg-white/[0.03] ${base}`
      }`}
    >
      <span className={`${fg}`}>{icon}</span>
      <span className="text-xs font-semibold text-white">{label}</span>
    </button>
  );
}

function DepositPanel() {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-orange-300 mb-1">
            Deposit
          </div>
          <div className="text-lg font-semibold">Fund your wallet</div>
        </div>
        <span className="text-[10px] uppercase tracking-widest px-2 py-1 rounded-full border border-orange-300/30 text-orange-300">
          demo rail
        </span>
      </div>
      <p className="text-sm text-gray-300 leading-snug mb-4">
        Three funding methods — Litecoin is live in demo mode, card and bank are on the
        way.
      </p>
      <div className="grid grid-cols-3 gap-2">
        <Link
          href="/deposit?via=ltc"
          className="rounded-xl border border-orange-300/30 bg-orange-300/[0.04] px-3 py-4 text-center transition hover:border-orange-300/60"
        >
          <div className="text-xs text-orange-300 font-semibold mb-1">LTC</div>
          <div className="text-[10px] text-gray-400">Live demo</div>
        </Link>
        <Link
          href="/deposit?via=card"
          className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-4 text-center transition hover:border-white/20"
        >
          <div className="text-xs text-gray-200 font-semibold mb-1">Card</div>
          <div className="text-[10px] text-gray-500">Arriving</div>
        </Link>
        <Link
          href="/deposit?via=bank"
          className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-4 text-center transition hover:border-white/20"
        >
          <div className="text-xs text-gray-200 font-semibold mb-1">Bank</div>
          <div className="text-[10px] text-gray-500">Arriving</div>
        </Link>
      </div>
      <Link href="/deposit" className="mt-4 block">
        <Button tone="orange" size="lg" fullWidth>
          Open deposit page
        </Button>
      </Link>
    </div>
  );
}

function ActionStubPanel({
  title,
  body,
  href,
  cta,
  tone,
}: {
  title: string;
  body: string;
  href: string;
  cta: string;
  tone: "violet" | "rose";
}) {
  const chipFg = tone === "violet" ? "text-violet-200" : "text-rose-200";
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className={`text-[10px] uppercase tracking-widest mb-1 ${chipFg}`}>
            {title}
          </div>
          <div className="text-lg font-semibold">{title}</div>
        </div>
        <Pill status="demo">demo</Pill>
      </div>
      <p className="text-sm text-gray-300 leading-snug mb-4">{body}</p>
      <Link href={href} className="block">
        <Button tone={tone} size="lg" fullWidth>
          {cta} →
        </Button>
      </Link>
    </div>
  );
}

function TokenRow({
  symbol,
  name,
  amount,
  status,
  color,
  onClick,
}: {
  symbol: string;
  name: string;
  amount: string;
  status: "live" | "arriving";
  color: string;
  onClick?: () => void;
}) {
  return (
    <li>
      <button
        onClick={onClick}
        disabled={!onClick}
        className="w-full flex items-center gap-3 px-5 py-4 text-left transition hover:bg-white/[0.02] disabled:hover:bg-transparent disabled:cursor-default"
      >
        <div
          className="h-10 w-10 shrink-0 rounded-xl flex items-center justify-center font-black text-sm"
          style={{ background: `${color}26`, color }}
          aria-hidden
        >
          {symbol.charAt(0)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="text-sm font-semibold text-white">{symbol}</div>
            <span
              className={`text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded-full border ${
                status === "live"
                  ? "border-emerald-400/40 text-emerald-300"
                  : "border-white/15 text-gray-400"
              }`}
            >
              {status === "live" ? "live" : "soon"}
            </span>
          </div>
          <div className="text-xs text-gray-500">{name}</div>
        </div>
        <div className="text-right">
          <div className="text-sm font-mono tabular-nums text-white">{amount}</div>
        </div>
      </button>
    </li>
  );
}
