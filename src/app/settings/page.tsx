"use client";

import Link from "next/link";
import { useState } from "react";
import AppHeader from "@/components/AppHeader";
import { Toggle } from "@/components/ui/Toggle";
import { Button } from "@/components/ui/Button";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { clearAllLocalData, usePrefs } from "@/lib/prefs";
import { useToast } from "@/components/dunk/Toast";
import { useWalletState } from "@/components/dunk/WalletContext";
import { ROUTES } from "@/lib/routes";
import { useCopyable } from "@/lib/clipboard";

function shortPrincipal(p: string, h = 10, t = 8): string {
  if (p.length <= h + t + 1) return p;
  return `${p.slice(0, h)}…${p.slice(-t)}`;
}

const CAP_PRESETS: Array<{ label: string; value: number | null }> = [
  { label: "$10", value: 10 },
  { label: "$30", value: 30 },
  { label: "$60", value: 60 },
  { label: "$120", value: 120 },
  { label: "Off", value: null },
];

function detectSystemReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function SettingsPage() {
  const {
    sound,
    setSound,
    haptics,
    setHaptics,
    reducedMotion,
    setReducedMotion,
    sessionCapUsd,
    setSessionCapUsd,
  } = usePrefs();
  const toast = useToast();
  const { identity, logout, principal } = useWalletState();

  const [confirmingReset, setConfirmingReset] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [expandPrincipal, setExpandPrincipal] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [customCap, setCustomCap] = useState<string>(
    sessionCapUsd && !CAP_PRESETS.some((p) => p.value === sessionCapUsd)
      ? String(sessionCapUsd)
      : "",
  );

  const hapticsSupported =
    typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
  const systemReducedMotion = detectSystemReducedMotion();

  const onClear = () => {
    if (!confirmingReset) {
      setConfirmingReset(true);
      setTimeout(() => setConfirmingReset(false), 4000);
      return;
    }
    clearAllLocalData();
    toast.push({
      kind: "success",
      title: "Device data cleared",
      description: "Local prefs, high scores, and session history reset.",
    });
    setConfirmingReset(false);
  };

  const setCap = (usd: number | null) => {
    setSessionCapUsd(usd);
    if (usd === null) {
      toast.push({ kind: "info", title: "Session cap removed" });
    } else {
      toast.push({ kind: "info", title: `Session cap set to $${usd}` });
    }
  };

  const commitCustom = () => {
    const n = Number(customCap);
    if (!Number.isFinite(n) || n <= 0) {
      toast.push({ kind: "error", title: "Invalid custom cap" });
      return;
    }
    setCap(Math.round(n));
  };

  const copy = useCopyable();
  const copyPrincipal = () => copy(principal, { label: "Principal" });

  const confirmSignOut = async () => {
    setSigningOut(true);
    try {
      await logout();
      setSignOutOpen(false);
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 md:px-8 py-8 md:py-12">
        <div className="mb-8">
          <div className="text-xs uppercase tracking-widest text-cyan-300 mb-2">
            Settings
          </div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight">Preferences</h1>
          <p className="text-sm text-gray-400 mt-1 max-w-xl">
            Local-only. Nothing here is sent to a server — these flags live in your
            browser. Your principal + balance on the ICRC-1 ledger are unaffected.
          </p>
        </div>

        <div className="space-y-6">
          {/* ---- Display ---- */}
          <Section
            title="Display & motion"
            subtitle="How the app moves — or doesn't."
          >
            <Toggle
              label="Reduce motion"
              description={
                systemReducedMotion && !reducedMotion
                  ? "Your OS asks for reduced motion. We're honoring it by default; flip this on to force-reduce inside the app too."
                  : "Smaller tweens, no parallax, no background shimmer. Games stay playable — only decorative motion is cut."
              }
              checked={reducedMotion}
              onChange={setReducedMotion}
            />
          </Section>

          {/* ---- Audio + haptics ---- */}
          <Section
            title="Audio & feedback"
            subtitle="Sound and vibration for events in-game and in-wallet."
          >
            <Toggle
              label="Sound effects"
              description="Pour splash, lock thunk, zone ding, tx success chimes."
              checked={sound}
              onChange={setSound}
            />
            <div className="border-t border-white/5" />
            <Toggle
              label="Haptics"
              description={
                hapticsSupported
                  ? "Subtle vibrations for perfect stacks, zone entry, and wallet errors."
                  : "Your device doesn't expose the Vibration API. Setting has no effect here."
              }
              checked={haptics}
              onChange={setHaptics}
              disabled={!hapticsSupported}
            />
          </Section>

          {/* ---- Session cap ---- */}
          <Section
            title="Session spending cap"
            subtitle="Hard stop per session so a hot streak can't run you over. Advisory for demo mode."
          >
            <div className="flex flex-wrap gap-2">
              {CAP_PRESETS.map((p) => {
                const active = sessionCapUsd === p.value;
                return (
                  <button
                    key={p.label}
                    onClick={() => setCap(p.value)}
                    aria-pressed={active}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60 ${
                      active
                        ? "bg-cyan-300/15 border-cyan-300/60 text-cyan-100"
                        : "border-white/10 bg-white/[0.02] text-gray-300 hover:text-white hover:border-white/25"
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <label className="text-[10px] uppercase tracking-widest text-gray-400">
                Custom
              </label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">$</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={customCap}
                  onChange={(e) => setCustomCap(e.target.value)}
                  onBlur={commitCustom}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commitCustom();
                    }
                  }}
                  placeholder="e.g. 45"
                  className="w-24 rounded-md bg-black/40 border border-white/10 px-2 py-1 text-sm font-mono text-white focus:outline-none focus:border-cyan-300/60"
                />
                <button
                  type="button"
                  onClick={commitCustom}
                  className="rounded-md border border-white/15 px-2 py-1 text-[10px] uppercase tracking-widest text-gray-200 hover:text-white hover:border-white/30 transition"
                >
                  Set
                </button>
              </div>
            </div>
            <div className="mt-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-[11px] text-gray-400 leading-snug">
              {sessionCapUsd === null ? (
                <>No cap set. The pour game will let you play as many rounds as your balance allows.</>
              ) : (
                <>
                  Current cap:{" "}
                  <span className="text-white font-mono">${sessionCapUsd}</span>. After the
                  cap is hit, the game will lock out further paid rounds until the
                  session resets.
                </>
              )}
            </div>
          </Section>

          {/* ---- Account ---- */}
          <Section
            title="Account"
            subtitle="Your Internet Identity session. The principal itself is unaffected by anything on this page."
          >
            {identity ? (
              <div className="space-y-4">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-gray-400 mb-2">
                    Signed in as
                  </div>
                  <button
                    type="button"
                    onClick={() => setExpandPrincipal((v) => !v)}
                    className="w-full text-left rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-sm text-white hover:border-white/25 transition break-all"
                    aria-label={expandPrincipal ? "Collapse principal" : "Expand principal"}
                    title="Click to toggle full principal"
                  >
                    {expandPrincipal ? principal : shortPrincipal(principal)}
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button onClick={copyPrincipal} variant="outline" size="sm">
                    Copy principal
                  </Button>
                  <Link href={ROUTES.account} className="inline-flex">
                    <Button variant="outline" size="sm">
                      Open account
                    </Button>
                  </Link>
                  <Button
                    onClick={() => setSignOutOpen(true)}
                    variant="danger"
                    size="sm"
                    className="ml-auto"
                  >
                    Sign out
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm text-gray-300">Not signed in right now.</div>
                <Link href={ROUTES.account} className="inline-flex shrink-0">
                  <Button variant="outline" size="sm">
                    Go to account
                  </Button>
                </Link>
              </div>
            )}
          </Section>

          {/* ---- Data reset (danger zone) ---- */}
          <Section
            title="Device data"
            subtitle="Clears local prefs, high scores, cached session cap, Internet Identity session hints. Does not touch the ledger."
            tone="danger"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-gray-300 max-w-md">
                {confirmingReset
                  ? "Tap Clear once more to confirm. This can't be undone locally."
                  : "Everything under the livewager- prefix in localStorage will be wiped."}
              </div>
              <button
                onClick={onClear}
                aria-label="Clear all local device data"
                className={`shrink-0 rounded-md px-3 py-2 text-[11px] uppercase tracking-widest border transition ${
                  confirmingReset
                    ? "bg-red-500/15 border-red-400/60 text-red-200 hover:bg-red-500/25"
                    : "border-white/15 text-gray-200 hover:border-red-400/50 hover:text-red-200"
                }`}
              >
                {confirmingReset ? "Tap to confirm" : "Clear device data"}
              </button>
            </div>
          </Section>
        </div>
      </main>

      <BottomSheet
        open={signOutOpen}
        onClose={() => setSignOutOpen(false)}
        title="Sign out?"
        description="This only clears the local session — your Internet Identity anchor, principal, and LWP balance on the ledger are unaffected. You can sign back in any time."
      >
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button
            onClick={() => setSignOutOpen(false)}
            variant="outline"
            disabled={signingOut}
          >
            Stay signed in
          </Button>
          <Button
            data-autofocus
            onClick={confirmSignOut}
            loading={signingOut}
            variant="danger"
          >
            Sign out
          </Button>
        </div>
      </BottomSheet>
    </>
  );
}

function Section({
  title,
  subtitle,
  tone = "default",
  children,
}: {
  title: string;
  subtitle?: string;
  tone?: "default" | "danger";
  children: React.ReactNode;
}) {
  const tonedHeader =
    tone === "danger" ? "text-red-300" : "text-cyan-300";
  return (
    <section
      className={`rounded-2xl border bg-white/[0.02] p-5 md:p-6 ${
        tone === "danger" ? "border-red-500/20" : "border-white/10"
      }`}
    >
      <div className="mb-3">
        <div className={`text-[10px] uppercase tracking-widest mb-1 ${tonedHeader}`}>
          {tone === "danger" ? "Danger zone" : "Preference"}
        </div>
        <h2 className="text-lg md:text-xl font-bold text-white">{title}</h2>
        {subtitle && (
          <p className="text-xs md:text-sm text-gray-400 leading-snug mt-1">
            {subtitle}
          </p>
        )}
      </div>
      <div>{children}</div>
    </section>
  );
}
