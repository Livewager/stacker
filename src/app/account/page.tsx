"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";
import { formatLWP } from "@/lib/icp";
import { useWalletState } from "@/components/dunk/WalletContext";
import ActivityFeed from "@/components/dunk/ActivityFeed";
import { LedgerErrorCard } from "@/components/dunk/LedgerErrorCard";
import { useCopyable } from "@/lib/clipboard";
import { PrincipalQR } from "@/components/account/PrincipalQR";
import { BalanceSparkline } from "@/components/account/BalanceSparkline";
import { shortenPrincipal } from "@/lib/principal";
import { useLocalPref, PREF_KEYS } from "@/lib/prefs";

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
  const [copied, setCopied] = useState(false);

  const shortPrincipal = useMemo(
    () => (principal ? shortenPrincipal(principal, { head: 10, tail: 10 }) : ""),
    [principal],
  );

  const copy = useCopyable();
  const copyPrincipal = async () => {
    const ok = await copy(principal, { label: "Principal", silent: true });
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  // Deterministic avatar: hash the first 4 bytes of the principal to
  // a hue. Keeps the profile card visually distinct per user.
  const avatarHue = useMemo(() => {
    if (!principal) return 190;
    let h = 0;
    for (let i = 0; i < principal.length && i < 8; i++) {
      h = (h * 31 + principal.charCodeAt(i)) >>> 0;
    }
    return h % 360;
  }, [principal]);

  const signedIn = !!identity;

  return (
    <>
      <AppHeader />
      <div className="mx-auto max-w-5xl px-4 md:px-8 py-8 md:py-12">
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs uppercase tracking-widest text-cyan-300">Account</span>
            <span
              className="inline-flex items-center rounded-full border border-cyan-300/30 bg-cyan-300/[0.06] px-2 py-0.5 text-[9px] font-mono uppercase tracking-widest text-cyan-200"
              title="Local ICRC-1 ledger — no real money moves"
            >
              demo
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight">Your profile</h1>
          <p className="text-sm text-gray-400 mt-1 max-w-xl">
            Internet Identity-backed. You hold the keys. This page reads from the public
            ICRC-3 block log — nothing here is stored on our servers.
          </p>
        </div>

        {error && signedIn && (
          <div className="mb-6">
            <LedgerErrorCard error={error} onRetry={refresh} scope="Account" />
          </div>
        )}

        {!signedIn ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 md:p-10 text-center">
            <div className="text-[11px] uppercase tracking-widest text-cyan-300 mb-3">
              Not signed in
            </div>
            <h2 className="text-2xl md:text-3xl font-black text-white mb-2">
              Connect to see your account.
            </h2>
            <p className="text-sm text-gray-300 max-w-md mx-auto mb-5 leading-snug">
              Sign in with Internet Identity. No password, no seed phrase — a passkey-backed
              anchor you control.
            </p>
            <button
              onClick={login}
              disabled={status === "loading"}
              className="px-6 py-3 rounded-xl font-bold text-black transition hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ background: "linear-gradient(90deg,#22d3ee,#0891b2)" }}
            >
              {status === "loading" ? "Connecting…" : "Connect Internet Identity"}
            </button>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-[1fr_1.25fr]">
            {/* Left: profile card + session + stats */}
            <div className="space-y-5">
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
                        onClick={copyPrincipal}
                        className="text-[11px] uppercase tracking-widest px-3 py-1.5 rounded-md border border-white/15 text-gray-200 hover:border-white/30 hover:text-white transition"
                      >
                        {copied ? "Copied" : "Copy"}
                      </button>
                      <PrincipalQR principal={principal} />
                      <button
                        onClick={logout}
                        className="text-[11px] uppercase tracking-widest px-3 py-1.5 rounded-md border border-white/15 text-gray-300 hover:border-red-300/60 hover:text-red-200 transition"
                      >
                        Sign out
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.04] p-5 md:p-6">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="text-[10px] uppercase tracking-widest text-cyan-300">
                    Balance
                  </div>
                  <BalanceSparkline principal={principal} />
                </div>
                <div className="text-4xl md:text-5xl font-black tabular-nums leading-none">
                  {balance !== null ? formatLWP(balance, 4) : "—"}
                </div>
                <div className="text-xs text-gray-400 mt-2 font-mono">LWP</div>
                <div className="mt-4 flex gap-2">
                  <Link
                    href="/deposit"
                    className="text-xs md:text-sm px-4 py-2 rounded-lg font-bold text-black transition hover:brightness-110"
                    style={{ background: "linear-gradient(90deg,#fdba74,#f97316)" }}
                  >
                    Deposit
                  </Link>
                  <Link
                    href="/wallet"
                    className="text-xs md:text-sm px-4 py-2 rounded-lg border border-white/15 text-gray-200 hover:border-white/30 hover:text-white transition"
                  >
                    Open wallet
                  </Link>
                </div>
              </section>

              <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 md:p-6">
                <div className="text-[10px] uppercase tracking-widest text-gray-400 mb-3">
                  Session stats
                </div>
                <dl className="grid grid-cols-2 gap-4 text-sm">
                  <StatItem label="Ledger supply" value={supply !== null ? formatLWP(supply, 2) + " LWP" : "—"} />
                  <StatItem label="II anchor" value="connected" />
                  <StatItem label="Session" value="8h TTL" />
                  <StatItem label="Idle timeout" value="30 min" />
                </dl>
              </section>
            </div>

            {/* Right: activity feed */}
            <ActivityFeed principal={principal} limit={20} />
          </div>
        )}
      </div>
    </>
  );
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">{label}</dt>
      <dd className="text-sm font-mono text-white">{value}</dd>
    </div>
  );
}

/**
 * Small chip under the principal showing "authed Xm ago · expires
 * in Yh Zm". The TTL is pulled from the II login config (8 hours)
 * — if a future change moves that knob, update SESSION_TTL_MS here
 * so the chip stays accurate.
 *
 * Re-renders once per minute via a local interval; stops ticking
 * when the session is expired or absent. Never triggers a toast or
 * takes action — purely informational so the user can reason about
 * whether they'll get logged out mid-round.
 */
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
function SessionChip() {
  const [lastAuthAt] = useLocalPref<number | null>(PREF_KEYS.lastAuthAt, null);
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
  // Amber when <30min left. Red once expired; the II client will
  // re-prompt on the next call so we flag it visually here first.
  const tone = expired
    ? "border-red-400/40 bg-red-500/10 text-red-200"
    : remainMs < 30 * 60 * 1000
      ? "border-amber-300/40 bg-amber-500/10 text-amber-200"
      : "border-white/10 bg-white/[0.03] text-gray-400";
  return (
    <div
      className={`mt-2 inline-flex items-center gap-1.5 rounded-full border px-2 py-[2px] text-[10px] font-mono tabular-nums ${tone}`}
      title={`Session started ${new Date(lastAuthAt).toLocaleString()}`}
    >
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${expired ? "bg-red-400" : "bg-emerald-400"}`} />
      {expired ? (
        <>Session expired — sign in again</>
      ) : (
        <>authed {since} ago · {remain} left</>
      )}
    </div>
  );
}

/** Compact "2h 14m" / "47m" / "just now" formatter for SessionChip. */
function fmtDurationShort(ms: number): string {
  const totalMin = Math.floor(ms / 60_000);
  if (totalMin < 1) return "just now";
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
