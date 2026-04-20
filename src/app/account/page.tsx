"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";
import { formatLWP } from "@/lib/icp";
import { useWalletState } from "@/components/dunk/WalletContext";
import ActivityFeed from "@/components/dunk/ActivityFeed";
import { LedgerErrorCard } from "@/components/dunk/LedgerErrorCard";
import { useCopyable } from "@/lib/clipboard";

function short(s: string, head = 10, tail = 10): string {
  if (s.length <= head + tail + 1) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

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

  const shortPrincipal = useMemo(() => (principal ? short(principal) : ""), [principal]);

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
      <main className="mx-auto max-w-5xl px-4 md:px-8 py-8 md:py-12">
        <div className="mb-8">
          <div className="text-xs uppercase tracking-widest text-cyan-300 mb-2">Account</div>
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
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={copyPrincipal}
                        className="text-[11px] uppercase tracking-widest px-3 py-1.5 rounded-md border border-white/15 text-gray-200 hover:border-white/30 hover:text-white transition"
                      >
                        {copied ? "Copied" : "Copy"}
                      </button>
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
                <div className="text-[10px] uppercase tracking-widest text-cyan-300 mb-2">
                  Balance
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
      </main>
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
