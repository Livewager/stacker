"use client";

/**
 * Root splash. Two modes:
 *   - Already signed in → fast-redirect to /play so return visitors
 *     don't see the splash twice.
 *   - Signed out → an intro screen that sells the game + shows the
 *     identity roster (if any prior keys exist) with a login widget
 *     inline. "Log in" lands on /icrc with the dashboard; "Play" or
 *     "Continue to Stacker" bounces to /play.
 *
 * This is the only page that renders something between first paint
 * and "do we have a session." The next.config redirect from "/" →
 * "/play" is disabled under IC_BUILD; on Vercel it still fires (so
 * Vercel-prod visitors never see this splash — identical shipping
 * UX to before).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import {
  loadRoster,
  setActiveRosterEntry,
  createAndActivateRosterEntry,
  type IdentityRosterV2,
} from "@/lib/ic/agent";
import { ROUTES } from "@/lib/routes";
import { Button } from "@/components/ui/Button";

export default function RootPage() {
  const [roster, setRoster] = useState<IdentityRosterV2 | null>(null);
  const [mounted, setMounted] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    const r = loadRoster();
    setRoster(r);
    setMounted(true);
    // Already signed in? fast-forward to /play.
    if (r.activePrincipal) {
      setRedirecting(true);
      window.location.replace("/play");
    }
  }, []);

  const handleQuickLogin = (principal: string) => {
    setActiveRosterEntry(principal);
    window.location.replace("/play");
  };

  const handleCreateAndPlay = () => {
    createAndActivateRosterEntry();
    window.location.replace("/play");
  };

  if (!mounted || redirecting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-gray-500 text-sm">
        Loading…
      </div>
    );
  }

  const activeRoster = roster!;
  const sorted = [...activeRoster.entries].sort(
    (a, b) => b.lastUsedAt - a.lastUsedAt,
  );
  const returning = sorted.length > 0;

  return (
    <>
      <AppHeader />
      <div className="relative min-h-[calc(100vh-64px)] bg-background text-white overflow-x-hidden">
        {/* Ambient glow — matches the /stacker backdrop for a consistent
            arrival-to-the-site feel. */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(800px 500px at 20% -10%, rgba(34,211,238,0.14), transparent 60%), radial-gradient(700px 500px at 90% 110%, rgba(249,115,22,0.12), transparent 60%)",
          }}
        />

        <div className="relative max-w-5xl mx-auto px-5 md:px-8 py-12 md:py-20">
          <div className="grid md:grid-cols-[1.35fr_1fr] gap-10 md:gap-12 items-start">
          {/* Hero copy */}
          <div>
            <div className="text-[10px] uppercase tracking-widest text-cyan-300 mb-3">
              Arcade · on the Internet Computer
            </div>
            <h1 className="text-5xl md:text-7xl font-black tracking-tight leading-[0.95] mb-5">
              Stack the tower.{" "}
              <span
                className="bg-clip-text text-transparent"
                style={{
                  backgroundImage:
                    "linear-gradient(90deg,#22d3ee,#fdba74 50%,#facc15)",
                }}
              >
                Win LWP.
              </span>
            </h1>
            <p className="text-base md:text-lg text-gray-300 leading-snug max-w-xl mb-6">
              Fifteen rows. A sliding block. One tap to lock it. Miss the
              window and the stack narrows — hit zero and it collapses. The
              top floor pays 3× your stake.
            </p>

            <ul className="text-sm text-gray-400 space-y-2 mb-8 leading-snug">
              <li className="flex gap-2">
                <span className="text-cyan-300">◎</span>
                <span>
                  <span className="text-white font-semibold">
                    Non-custodial.
                  </span>{" "}
                  Your keys stay in your browser. No email, no password.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-cyan-300">◎</span>
                <span>
                  <span className="text-white font-semibold">
                    LWP tokens live on-chain.
                  </span>{" "}
                  ICRC-1 ledger running on the Internet Computer. Balances
                  verifiable from any wallet.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-cyan-300">◎</span>
                <span>
                  <span className="text-white font-semibold">
                    Free to try.
                  </span>{" "}
                  Claim 10 LWP from the faucet and start stacking.
                </span>
              </li>
            </ul>

            <div className="flex flex-wrap gap-3">
              {returning ? (
                <Button
                  tone="cyan"
                  size="lg"
                  onClick={() => handleQuickLogin(sorted[0].principal)}
                >
                  Continue as{" "}
                  {sorted[0].label || short(sorted[0].principal)}
                </Button>
              ) : (
                <Button tone="cyan" size="lg" onClick={handleCreateAndPlay}>
                  Create key & play
                </Button>
              )}
              <Link
                href={ROUTES.icrc}
                className="inline-flex rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <Button variant="outline" size="lg" tabIndex={-1}>
                  Manage keys
                </Button>
              </Link>
            </div>
          </div>

          {/* Login widget */}
          <aside
            aria-label="Quick sign in"
            className="rounded-2xl border border-cyan-300/30 bg-gradient-to-br from-cyan-300/[0.07] to-cyan-300/[0.02] p-5 md:p-6"
          >
            {returning ? (
              <>
                <div className="text-[10px] uppercase tracking-widest text-cyan-300 mb-2">
                  Welcome back
                </div>
                <p className="text-sm text-gray-300 leading-snug mb-4">
                  {sorted.length === 1
                    ? "One key on this device. Tap to log in."
                    : `${sorted.length} keys on this device. Pick one to log in.`}
                </p>
                <div className="space-y-2 mb-4 max-h-[260px] overflow-y-auto">
                  {sorted.slice(0, 5).map((e) => (
                    <button
                      key={e.principal}
                      type="button"
                      onClick={() => handleQuickLogin(e.principal)}
                      className="group w-full rounded-lg border border-white/10 bg-white/[0.03] hover:border-cyan-300/40 hover:bg-white/[0.06] px-3 py-2.5 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60"
                    >
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <span className="text-sm text-white font-semibold truncate">
                          {e.label || "Unnamed key"}
                        </span>
                        <span className="text-[10px] font-mono text-gray-500 group-hover:text-cyan-300 transition">
                          log in →
                        </span>
                      </div>
                      <div className="text-[11px] font-mono text-gray-400 truncate">
                        {short(e.principal)}
                      </div>
                    </button>
                  ))}
                  {sorted.length > 5 && (
                    <Link
                      href={ROUTES.icrc}
                      className="block text-center text-[11px] text-cyan-300 hover:text-cyan-200 underline underline-offset-2 py-1"
                    >
                      + {sorted.length - 5} more on /icrc
                    </Link>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCreateAndPlay}
                  fullWidth
                >
                  Or make a new key
                </Button>
              </>
            ) : (
              <>
                <div className="text-[10px] uppercase tracking-widest text-cyan-300 mb-2">
                  First time?
                </div>
                <p className="text-sm text-gray-300 leading-snug mb-4">
                  One click creates a local Ed25519 keypair in your
                  browser. No email. No password. The key is your
                  account.
                </p>
                <Button
                  tone="cyan"
                  size="md"
                  onClick={handleCreateAndPlay}
                  fullWidth
                >
                  Create key & play
                </Button>
                <Link
                  href={ROUTES.icrc}
                  className="mt-3 block text-center text-[11px] text-cyan-300 hover:text-cyan-200 underline underline-offset-2"
                >
                  Import a key instead
                </Link>
              </>
            )}
          </aside>
        </div>

          <footer className="mt-16 text-[11px] text-gray-500 leading-snug max-w-xl">
            Keys live in <code>localStorage</code> on this browser only.
            Clearing site data erases them. This is a local dfx dev
            environment — swap in Internet Identity for a real deploy.
          </footer>
        </div>
      </div>
    </>
  );
}

function short(p: string): string {
  if (p.length <= 14) return p;
  return `${p.slice(0, 8)}…${p.slice(-5)}`;
}
