"use client";

/**
 * /account — Merged account + wallet page.
 *
 * The previous /wallet and /account split was confusing — both showed
 * the balance, both showed activity, neither was the canonical "what
 * is my LWP situation" surface. This page consolidates:
 *
 *   - Balance hero (big LWP number + sparkline)
 *   - Quick actions: Deposit, Send, ICRC-1 ops
 *   - Tokens list (LWP live, LTC/BTC arriving)
 *   - Principal card (avatar, copy, QR)
 *   - Session info + recent recipients
 *   - Live activity feed (ICRC-3 block log)
 *   - Power-user Candid UI link (local replica only)
 *   - Sign-out
 *
 * /wallet is now a client-side redirect here so old links don't 404.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";
import {
  formatLWP,
  resolveCanisterId,
  resolveHost,
} from "@/lib/icp";
import { useWalletState } from "@/components/shared/WalletContext";
import ActivityFeed from "@/components/shared/ActivityFeed";
import { LedgerErrorCard } from "@/components/shared/LedgerErrorCard";
import { useCopyable } from "@/lib/clipboard";
import { PrincipalQR } from "@/components/account/PrincipalQR";
import { BalanceSparkline } from "@/components/account/BalanceSparkline";
import { Pill } from "@/components/ui/Pill";
import { Button } from "@/components/ui/Button";
import { shortenPrincipal } from "@/lib/principal";
import { useLocalPref, PREF_KEYS } from "@/lib/prefs";
import {
  listRecentRecipients,
  type RecentRecipient,
} from "@/lib/recentRecipients";
import { ROUTES } from "@/lib/routes";

export default function AccountPage() {
  const {
    identity,
    principal,
    balance,
    supply,
    login,
    logout,
    status,
    error,
    refresh,
  } = useWalletState();
  const signedIn = !!identity;
  const shortPrincipal = useMemo(
    () => (principal ? shortenPrincipal(principal, { head: 10, tail: 10 }) : ""),
    [principal],
  );

  // Deterministic hue per principal so the hero card has individuality.
  const heroHue = useMemo(() => {
    if (!principal) return 190;
    let h = 0;
    for (let i = 0; i < principal.length && i < 8; i++) {
      h = (h * 31 + principal.charCodeAt(i)) >>> 0;
    }
    return h % 360;
  }, [principal]);

  return (
    <>
      <AppHeader />
      <div className="mx-auto max-w-6xl px-4 md:px-8 py-8 md:py-12">
        <header className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs uppercase tracking-widest text-cyan-300">
              Account
            </span>
            <Pill
              status="demo"
              size="xs"
              mono
              title="Local ICRC-1 ledger — no real money moves"
            >
              demo
            </Pill>
            {/* Pending tx pill: any in-flight balance mutation. */}
            {(status === "buying" ||
              status === "depositing" ||
              status === "sending" ||
              status === "withdrawing") && (
              <Pill
                status="pending"
                size="xs"
                mono
                role="status"
                className="gap-1.5"
                aria-label={`Transaction in flight: ${status}.`}
              >
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 rounded-full bg-amber-300 animate-pulse"
                />
                <span aria-hidden>{status}</span>
              </Pill>
            )}
          </div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight">
            Your{" "}
            <span
              className="bg-clip-text text-transparent"
              style={{
                backgroundImage:
                  "linear-gradient(90deg,#22d3ee,#fdba74 50%,#facc15)",
              }}
            >
              account
            </span>
            .
          </h1>
          <p className="text-sm text-gray-400 mt-1 max-w-xl">
            One key, one identity, on-chain. Balance, principal, and
            activity all served from the local ICRC-1 / ICRC-3 points
            ledger — nothing is stored on our servers.
          </p>
        </header>

        {error && signedIn && (
          <div className="mb-6">
            <LedgerErrorCard error={error} onRetry={refresh} scope="Account" />
          </div>
        )}

        {!signedIn ? (
          <SignedOutPrompt onLogin={login} loading={status === "loading"} />
        ) : (
          <div className="grid gap-6 md:grid-cols-[1.2fr_1fr]">
            {/* Left column: balance, quick actions, tokens, principal,
                session, candid link */}
            <div className="space-y-6">
              <BalanceHero
                balance={balance}
                principal={principal}
                hue={heroHue}
              />
              <QuickActions />
              <TokensList balance={balance} />
              <PrincipalCard
                principal={principal}
                shortPrincipal={shortPrincipal}
                onLogout={logout}
              />
              <SessionStats supply={supply} />
              <CandidUiLink />
            </div>
            {/* Right column: recent recipients + ICRC-3 activity feed */}
            <div className="space-y-5">
              <RecentTipChips />
              <ActivityFeed principal={principal} limit={20} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ----------------------------------------------------------------
// Signed-out empty state
// ----------------------------------------------------------------

function SignedOutPrompt({
  onLogin,
  loading,
}: {
  onLogin: () => void;
  loading: boolean;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 md:p-10 text-center">
      <div className="text-[11px] uppercase tracking-widest text-cyan-300 mb-3">
        Account locked
      </div>
      <h2 className="text-2xl md:text-3xl font-black text-white mb-2">
        Sign in to see your balance.
      </h2>
      <p className="text-sm text-gray-300 max-w-md mx-auto mb-5 leading-snug">
        Your keys live in your browser. No password, no email, no seed
        phrase. Manage them on{" "}
        <Link
          href={ROUTES.icrc}
          className="text-cyan-300 underline underline-offset-2 hover:text-cyan-200"
        >
          /icrc
        </Link>
        .
      </p>
      <ul className="mb-6 mx-auto max-w-md grid grid-cols-3 gap-2 text-[11px] text-gray-300">
        <li className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-2.5 leading-snug">
          <div className="text-cyan-300 text-[10px] uppercase tracking-widest mb-0.5">
            Balance
          </div>
          LWP + sparkline
        </li>
        <li className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-2.5 leading-snug">
          <div className="text-cyan-300 text-[10px] uppercase tracking-widest mb-0.5">
            Principal
          </div>
          Copy / QR share
        </li>
        <li className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-2.5 leading-snug">
          <div className="text-cyan-300 text-[10px] uppercase tracking-widest mb-0.5">
            Activity
          </div>
          ICRC-3 history
        </li>
      </ul>
      <div className="flex items-center justify-center gap-2 flex-wrap">
        <Button onClick={onLogin} loading={loading} tone="cyan" size="lg">
          {loading ? "Connecting…" : "Sign in"}
        </Button>
        <Link href={ROUTES.stacker}>
          <Button variant="outline" size="lg">
            Try Stacker first
          </Button>
        </Link>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------
// Balance hero — big number + sparkline + copy-on-click
// ----------------------------------------------------------------

function BalanceHero({
  balance,
  principal,
  hue,
}: {
  balance: bigint | null;
  principal: string;
  hue: number;
}) {
  const copy = useCopyable();
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    if (balance === null) return;
    const ok = await copy(`${formatLWP(balance, 4)} LWP`, {
      label: "Balance",
      silent: true,
    });
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    }
  };
  return (
    <section
      className="relative overflow-hidden rounded-3xl border border-white/10 p-6 md:p-8"
      style={{
        background: `radial-gradient(1200px 400px at 0% 0%, hsl(${hue} 70% 50% / 0.2), transparent 60%), radial-gradient(800px 400px at 100% 100%, hsl(${
          (hue + 40) % 360
        } 80% 45% / 0.18), transparent 60%), rgba(255,255,255,0.02)`,
      }}
    >
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-cyan-300 mb-2">
            Balance
          </div>
          <button
            type="button"
            onClick={handleCopy}
            disabled={balance === null}
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
            <div
              className="mt-2 text-sm font-mono text-gray-400 flex items-center gap-2"
              aria-hidden
            >
              <span>LWP</span>
              {balance !== null && (
                <span className="text-[9px] uppercase tracking-widest text-gray-500 opacity-0 group-hover/bal:opacity-100 group-focus-visible/bal:opacity-100 transition">
                  · {copied ? "copied" : "tap to copy"}
                </span>
              )}
            </div>
          </button>
          <span className="sr-only" aria-live="polite">
            {balance !== null
              ? `Balance ${formatLWP(balance, 4)} LWP`
              : "Balance unavailable"}
          </span>
        </div>
        <div className="hidden md:block text-right shrink-0">
          <div className="text-[10px] uppercase tracking-widest text-gray-400 mb-1">
            Network
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-300 font-mono justify-end">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            Internet Computer · local
          </div>
          <div className="mt-3">
            <BalanceSparkline principal={principal} />
          </div>
        </div>
      </div>
      <div className="md:hidden mt-2">
        <BalanceSparkline principal={principal} />
      </div>
    </section>
  );
}

// ----------------------------------------------------------------
// Quick actions row — Deposit / Send / Faucet
// ----------------------------------------------------------------

function QuickActions() {
  return (
    <section
      aria-label="Quick actions"
      className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 md:p-6"
    >
      <div className="text-[10px] uppercase tracking-widest text-cyan-300 mb-3">
        Quick actions
      </div>
      <div className="grid grid-cols-3 gap-2 md:gap-3">
        <ActionTile
          label="Deposit"
          href={ROUTES.deposit}
          tone="orange"
          icon={
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
              <path d="M10 3a1 1 0 0 1 1 1v8.586l2.293-2.293a1 1 0 1 1 1.414 1.414l-4 4a1 1 0 0 1-1.414 0l-4-4a1 1 0 1 1 1.414-1.414L9 12.586V4a1 1 0 0 1 1-1Zm-6 13a1 1 0 0 1 1-1h10a1 1 0 1 1 0 2H5a1 1 0 0 1-1-1Z" />
            </svg>
          }
        />
        <ActionTile
          label="Send"
          href={ROUTES.send}
          tone="violet"
          icon={
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
              <path d="M3 10a1 1 0 0 1 1-1h9.586L10.293 5.707a1 1 0 1 1 1.414-1.414l5 5a1 1 0 0 1 0 1.414l-5 5a1 1 0 1 1-1.414-1.414L13.586 11H4a1 1 0 0 1-1-1Z" />
            </svg>
          }
        />
        <ActionTile
          label="Faucet"
          href={ROUTES.icrc}
          tone="cyan"
          icon={
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
              <path d="M10 2a1 1 0 0 1 1 1v3.999c1.79.46 3 1.92 3 3.5 0 1.69-1.34 3-3 3v3.5a1 1 0 1 1-2 0V14.5c-1.66 0-3-1.31-3-3 0-1.58 1.21-3.04 3-3.5V3a1 1 0 0 1 1-1Z" />
            </svg>
          }
        />
      </div>
    </section>
  );
}

function ActionTile({
  label,
  href,
  icon,
  tone,
}: {
  label: string;
  href: string;
  icon: React.ReactNode;
  tone: "cyan" | "orange" | "violet" | "rose";
}) {
  const fg =
    tone === "cyan"
      ? "text-cyan-300"
      : tone === "orange"
        ? "text-orange-300"
        : tone === "violet"
          ? "text-violet-300"
          : "text-rose-300";
  const hoverBorder =
    tone === "cyan"
      ? "hover:border-cyan-300/50"
      : tone === "orange"
        ? "hover:border-orange-300/50"
        : tone === "violet"
          ? "hover:border-violet-300/50"
          : "hover:border-rose-300/50";
  return (
    <Link
      href={href}
      className={`flex flex-col items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 transition ${hoverBorder} focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60`}
    >
      <span className={fg}>{icon}</span>
      <span className="text-xs font-semibold text-white">{label}</span>
    </Link>
  );
}

// ----------------------------------------------------------------
// Tokens list
// ----------------------------------------------------------------

function TokensList({ balance }: { balance: bigint | null }) {
  return (
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
        />
        <TokenRow
          symbol="BTC"
          name="Bitcoin"
          amount="—"
          status="arriving"
          color="#f97316"
        />
      </ul>
    </section>
  );
}

function TokenRow({
  symbol,
  name,
  amount,
  status,
  color,
}: {
  symbol: string;
  name: string;
  amount: string;
  status: "live" | "arriving";
  color: string;
}) {
  return (
    <li>
      <div className="w-full flex items-center gap-3 px-5 py-4 text-left">
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
            <Pill status={status === "live" ? "live" : "soon"} size="xs">
              {status === "live" ? "live" : "soon"}
            </Pill>
          </div>
          <div className="text-xs text-gray-500">{name}</div>
        </div>
        <div className="text-right">
          <div className="text-sm font-mono tabular-nums text-white">
            {amount}
          </div>
        </div>
      </div>
    </li>
  );
}

// ----------------------------------------------------------------
// Principal card
// ----------------------------------------------------------------

function PrincipalCard({
  principal,
  shortPrincipal,
  onLogout,
}: {
  principal: string;
  shortPrincipal: string;
  onLogout: () => void | Promise<void>;
}) {
  const copy = useCopyable();
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    const ok = await copy(principal, { label: "Principal", silent: true });
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };
  // Deterministic avatar hue from the principal text.
  const avatarHue = useMemo(() => {
    if (!principal) return 190;
    let h = 0;
    for (let i = 0; i < principal.length && i < 8; i++) {
      h = (h * 31 + principal.charCodeAt(i)) >>> 0;
    }
    return h % 360;
  }, [principal]);

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 md:p-6">
      <div className="flex items-start gap-4">
        <div
          aria-hidden
          className="h-16 w-16 shrink-0 rounded-2xl border border-white/10 shadow-inner"
          style={{
            background: `conic-gradient(from 210deg at 50% 50%, hsl(${avatarHue} 80% 55% / 0.9), hsl(${
              (avatarHue + 55) % 360
            } 80% 45% / 0.85), hsl(${avatarHue} 70% 35% / 0.95))`,
          }}
        />
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-widest text-cyan-300 mb-1">
            Principal
          </div>
          <div
            className="font-mono text-sm text-white break-all leading-snug"
            title={principal}
          >
            {shortPrincipal}
          </div>
          <SessionChip />

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={handleCopy}
              className="text-[11px] uppercase tracking-widest px-3 py-1.5 rounded-md border border-white/15 text-gray-200 hover:border-white/30 hover:text-white transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60"
            >
              {copied ? "Copied" : "Copy"}
            </button>
            <PrincipalQR principal={principal} />
            <Link
              href={ROUTES.accounts}
              className="text-[11px] uppercase tracking-widest px-3 py-1.5 rounded-md border border-white/15 text-gray-200 hover:border-white/30 hover:text-white transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60"
            >
              Manage keys →
            </Link>
            <Button
              onClick={onLogout}
              variant="danger"
              size="sm"
              className="text-[11px] uppercase tracking-widest"
            >
              Sign out
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

// ----------------------------------------------------------------
// Session stats
// ----------------------------------------------------------------

function SessionStats({ supply }: { supply: bigint | null }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 md:p-6">
      <div className="text-[10px] uppercase tracking-widest text-gray-400 mb-3">
        Session stats
      </div>
      <dl className="grid grid-cols-2 gap-4 text-sm">
        <StatItem
          label="Ledger supply"
          value={supply !== null ? formatLWP(supply, 2) + " LWP" : "—"}
        />
        <StatItem
          label="Identity"
          value="local key"
          hint="Plaintext Ed25519 keypair stored in this browser. Manage on /icrc."
        />
        <StatItem
          label="Session"
          value="local"
          hint="Sessions persist in localStorage until you log out or clear site data."
        />
        <StatItem
          label="Idle timeout"
          value="none"
          hint="Local dev: no automatic logout. Production deploys would add Internet Identity for proper TTL."
        />
      </dl>
    </section>
  );
}

function StatItem({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div title={hint}>
      <dt className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">
        {label}
      </dt>
      <dd className="text-sm font-mono text-white">
        {value}
        {hint && <span className="sr-only"> — {hint}</span>}
      </dd>
    </div>
  );
}

// ----------------------------------------------------------------
// Session chip — "authed Xm ago · Yh left"
// ----------------------------------------------------------------

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
function SessionChip() {
  const [lastAuthAt] = useLocalPref<number | null>(
    PREF_KEYS.lastAuthAt,
    null,
  );
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (!lastAuthAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, [lastAuthAt]);
  if (!lastAuthAt) return null;

  const sinceMs = Math.max(0, now - lastAuthAt);
  const remainMs = Math.max(0, SESSION_TTL_MS - sinceMs);
  const expired = remainMs === 0;
  const since = fmtDurationShort(sinceMs);
  const remain = fmtDurationShort(remainMs);
  const tone = expired
    ? "border-red-400/40 bg-red-500/10 text-red-200"
    : remainMs < 30 * 60 * 1000
      ? "border-amber-300/40 bg-amber-500/10 text-amber-200"
      : "border-white/10 bg-white/[0.03] text-gray-400";
  const srLabel = expired
    ? "Your session has expired. Sign in again to continue."
    : `Signed in ${since} ago. Session expires in ${remain}.`;
  return (
    <div
      role="status"
      aria-label={srLabel}
      className={`mt-2 inline-flex items-center gap-1.5 rounded-full border px-2 py-[2px] text-[10px] font-mono tabular-nums ${tone}`}
      title={`Session started ${new Date(lastAuthAt).toLocaleString()}`}
    >
      <span
        aria-hidden
        className={`inline-block h-1.5 w-1.5 rounded-full ${
          expired ? "bg-red-400" : "bg-emerald-400"
        }`}
      />
      <span aria-hidden>
        {expired ? (
          <>Session expired — sign in again</>
        ) : (
          <>
            authed {since} ago · {remain} left
          </>
        )}
      </span>
    </div>
  );
}

function fmtDurationShort(ms: number): string {
  const totalMin = Math.floor(ms / 60_000);
  if (totalMin < 1) return "just now";
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// ----------------------------------------------------------------
// Recent recipients
// ----------------------------------------------------------------

function RecentTipChips() {
  const [list, setList] = useState<RecentRecipient[]>([]);
  useEffect(() => {
    setList(listRecentRecipients().slice(0, 3));
  }, []);
  if (list.length === 0) return null;
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] uppercase tracking-widest text-violet-300">
          Recent recipients
        </div>
        <Link
          href={ROUTES.send}
          className="text-[10px] uppercase tracking-widest text-gray-400 hover:text-white transition focus:outline-none focus-visible:text-white focus-visible:ring-2 focus-visible:ring-cyan-300/40 rounded-sm"
        >
          New send →
        </Link>
      </div>
      <div className="flex flex-wrap gap-2">
        {list.map((r) => {
          const label =
            r.label ?? shortenPrincipal(r.principal, { head: 5, tail: 3 });
          return (
            <Link
              key={r.principal}
              href={`/send?to=${encodeURIComponent(r.principal)}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-violet-300/30 bg-violet-300/[0.06] px-2.5 py-1 text-[11px] text-violet-100 hover:text-white hover:border-violet-300/60 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/60 max-w-[11rem]"
              title={`Send to ${r.principal}`}
            >
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-3 w-3 shrink-0"
                aria-hidden
              >
                <path d="M3.4 9.1l13-5.6a.8.8 0 0 1 1.1 1l-5.6 13a.8.8 0 0 1-1.4 0l-2-4.6-4.6-2a.8.8 0 0 1 0-1.4Z" />
              </svg>
              <span className="font-mono truncate">{label}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

// ----------------------------------------------------------------
// Candid UI link (local replica only)
// ----------------------------------------------------------------

function CandidUiLink() {
  const [href, setHref] = useState<string | null>(null);
  const [canisterIdText, setCanisterIdText] = useState<string>("");
  useEffect(() => {
    try {
      const host = resolveHost();
      if (!host.includes("127.0.0.1") && !host.includes("localhost")) return;
      const ledger = resolveCanisterId().toString();
      setCanisterIdText(ledger);
      const uiCanister =
        (typeof process !== "undefined" &&
          process.env.NEXT_PUBLIC_CANDID_UI) ||
        "";
      const url = uiCanister
        ? `${host}/?canisterId=${uiCanister}&id=${ledger}`
        : `${host}/?id=${ledger}`;
      setHref(url);
    } catch {
      /* malformed env */
    }
  }, []);
  if (!href) return null;
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 md:p-6">
      <div className="text-[10px] uppercase tracking-widest text-gray-400 mb-3">
        Power user
      </div>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Open ledger in Candid UI — opens in a new tab"
        className="inline-flex items-center gap-1.5 text-sm text-cyan-300 hover:text-cyan-200 transition underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60 rounded-sm"
      >
        Open in Candid UI
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-3.5 w-3.5"
          aria-hidden
        >
          <path d="M11 3a1 1 0 1 0 0 2h2.586l-6.293 6.293a1 1 0 1 0 1.414 1.414L15 6.414V9a1 1 0 1 0 2 0V4a1 1 0 0 0-1-1h-5Z" />
          <path d="M5 5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-3a1 1 0 1 0-2 0v3H5V7h3a1 1 0 0 0 0-2H5Z" />
        </svg>
      </a>
      <div className="mt-2 text-[11px] font-mono text-gray-500 break-all">
        {canisterIdText}
      </div>
    </section>
  );
}
