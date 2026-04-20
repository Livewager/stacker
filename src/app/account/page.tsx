"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";
import { formatLWP, resolveCanisterId, resolveHost } from "@/lib/icp";
import { useWalletState } from "@/components/dunk/WalletContext";
import ActivityFeed from "@/components/dunk/ActivityFeed";
import { LedgerErrorCard } from "@/components/dunk/LedgerErrorCard";
import { useCopyable } from "@/lib/clipboard";
import { PrincipalQR } from "@/components/account/PrincipalQR";
import { BalanceSparkline } from "@/components/account/BalanceSparkline";
import { Pill } from "@/components/ui/Pill";
import { shortenPrincipal } from "@/lib/principal";
import { useLocalPref, PREF_KEYS } from "@/lib/prefs";
import { listRecentRecipients, type RecentRecipient } from "@/lib/recentRecipients";
import { Button } from "@/components/ui/Button";
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
            <Pill
              status="demo"
              size="xs"
              mono
              title="Local ICRC-1 ledger — no real money moves"
            >
              demo
            </Pill>
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
            {/* What-you-get preview. The empty state was just a CTA on
                a wall; this hints at the payoff so first-time visitors
                understand what signing in unlocks before they commit to
                the II flow. Mirrors the /wallet SignedOutPrompt
                quality bar. */}
            <ul className="mb-6 mx-auto max-w-sm grid grid-cols-3 gap-2 text-[11px] text-gray-300">
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
              <Button
                onClick={login}
                loading={status === "loading"}
                tone="cyan"
                size="lg"
              >
                {status === "loading" ? "Connecting…" : "Connect Internet Identity"}
              </Button>
              <Link href={ROUTES.play}>
                <Button variant="outline" size="lg">
                  Browse games instead
                </Button>
              </Link>
            </div>
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
                      <Button
                        onClick={logout}
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
                  <StatItem
                    label="II anchor"
                    value="connected"
                    hint="Your Internet Identity anchor — the passkey-backed account you signed in with. Unique per user, visible to this device only."
                  />
                  <StatItem label="Session" value="8h TTL" hint="Maximum length of a signed-in session before the II client re-prompts." />
                  <StatItem label="Idle timeout" value="30 min" hint="After 30 minutes of no canister calls, the delegation is refreshed automatically on the next action." />
                </dl>
              </section>

              <CandidUiLink />
            </div>

            {/* Right: quick tip chips + activity feed */}
            <div className="space-y-4">
              <RecentTipChips />
              <ActivityFeed principal={principal} limit={20} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function StatItem({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  /** Optional plain-English explanation for jargon labels (e.g. "II anchor").
   *  Pointer users see it on hover via `title`; screen-reader + keyboard
   *  users reach it via an sr-only span inside the <dd> so it's part of
   *  the same announcement, no extra focus stop required. */
  hint?: string;
}) {
  return (
    <div title={hint}>
      <dt className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">{label}</dt>
      <dd className="text-sm font-mono text-white">
        {value}
        {hint && <span className="sr-only"> — {hint}</span>}
      </dd>
    </div>
  );
}

/**
 * Three most-recent send recipients rendered as deep-link chips into
 * /send?to=<principal>. Reads from the local ring buffer on mount
 * (no prefs hook — the ring uses its own namespace) so we don't
 * pay a subscription cost just to read once. Hidden entirely when
 * the ring is empty so first-time users don't see a dead "recents"
 * section.
 */
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
          href="/send"
          className="text-[10px] uppercase tracking-widest text-gray-400 hover:text-white transition"
        >
          New send →
        </Link>
      </div>
      {/* Chip row. Short principal (5+3) is pre-set so the auto-
          shortened case lands around 9 chars. User-provided r.label
          is free-form, though — cap each chip at max-w-[11rem] and
          truncate so a long nickname doesn't blow the row and force
          the third chip to wrap onto a second line on narrower
          cards. Row still flex-wraps if the container genuinely
          can't hold them. */}
      <div className="flex flex-wrap gap-2">
        {list.map((r) => {
          const label = r.label ?? shortenPrincipal(r.principal, { head: 5, tail: 3 });
          return (
            <Link
              key={r.principal}
              href={`/send?to=${encodeURIComponent(r.principal)}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-violet-300/30 bg-violet-300/[0.06] px-2.5 py-1 text-[11px] text-violet-100 hover:text-white hover:border-violet-300/60 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/60 max-w-[11rem]"
              title={`Tip ${r.principal}`}
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
  // Plain-English aria-label for SR users. The visible text is
  // abbreviated ("authed 2h ago · 5h left") — screen readers get the
  // expanded sentence instead so "authed" doesn't get read as a word.
  const srLabel = expired
    ? "Your Internet Identity session has expired. Sign in again to continue."
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
        className={`inline-block h-1.5 w-1.5 rounded-full ${expired ? "bg-red-400" : "bg-emerald-400"}`}
      />
      <span aria-hidden>
        {expired ? (
          <>Session expired — sign in again</>
        ) : (
          <>authed {since} ago · {remain} left</>
        )}
      </span>
    </div>
  );
}

/**
 * Power-user link to the local replica's Candid UI for the
 * points_ledger canister. Only rendered when we're actually talking
 * to a local host — Candid UI isn't available at mainnet and the
 * link would just 404. The link uses the "?canisterId=<UI>&id=<target>"
 * pattern dfx generates; we let the user provide NEXT_PUBLIC_CANDID_UI
 * for the UI canister id (varies per replica). Without it we fall
 * back to a "?id=" form that many dfx setups handle directly.
 */
function CandidUiLink() {
  const [href, setHref] = useState<string | null>(null);
  const [canisterIdText, setCanisterIdText] = useState<string>("");
  useEffect(() => {
    try {
      const host = resolveHost();
      // Only surface on local — mainnet has no Candid UI at this host.
      if (!host.includes("127.0.0.1") && !host.includes("localhost")) {
        return;
      }
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
      /* resolver can throw on malformed env; stay hidden */
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
        // target=_blank isn't announced by SR as "opens in a new
        // tab" on its own. Explicit aria-label phrases the full
        // intent so VoiceOver / NVDA warn the user before they
        // activate. Visual text stays short; the arrow icon is
        // decorative (aria-hidden).
        aria-label="Open ledger in Candid UI — opens in a new tab"
        className="inline-flex items-center gap-1.5 text-sm text-cyan-300 hover:text-cyan-200 transition underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60 rounded-sm"
      >
        Open in Candid UI
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden>
          <path d="M11 3a1 1 0 1 0 0 2h2.586l-6.293 6.293a1 1 0 1 0 1.414 1.414L15 6.414V9a1 1 0 1 0 2 0V4a1 1 0 0 0-1-1h-5Z" />
          <path d="M5 5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-3a1 1 0 1 0-2 0v3H5V7h3a1 1 0 0 0 0-2H5Z" />
        </svg>
      </a>
      <div className="mt-2 text-[11px] font-mono text-gray-500 break-all">
        {canisterIdText}
      </div>
      <div className="mt-2 text-[11px] text-gray-500 leading-snug">
        Local replica only. Set NEXT_PUBLIC_CANDID_UI to the dfx Candid
        UI canister id for the full browse UI.
      </div>
    </section>
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
