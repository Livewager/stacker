"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { LtcDepositPanel } from "@/components/deposit/LtcDepositPanel";
import { useToast } from "@/components/dunk/Toast";

type Tab = "ltc" | "card" | "bank";

const TABS: { id: Tab; label: string; tone: string; status: "live" | "soon" }[] = [
  { id: "ltc", label: "Litecoin", tone: "#f97316", status: "live" },
  { id: "card", label: "Card", tone: "#a78bfa", status: "soon" },
  { id: "bank", label: "Bank transfer", tone: "#60a5fa", status: "soon" },
];

function DepositInner() {
  const params = useSearchParams();
  const queryTab = params.get("via");
  const initial: Tab =
    queryTab === "card" || queryTab === "bank" ? (queryTab as Tab) : "ltc";
  const [tab, setTab] = useState<Tab>(initial);

  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 md:px-8 py-8 md:py-12">
        <div className="mb-6">
          <div className="text-xs uppercase tracking-widest text-orange-300 mb-2">
            Deposit
          </div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight">
            Fund your wallet.
          </h1>
          <p className="text-sm text-gray-400 mt-1 max-w-xl">
            Litecoin is live in demo mode. Card + bank rails are queued for the next
            integration pass. Every path credits LWP non-custodially to your
            Internet Identity principal.
          </p>
        </div>

        {/* Tab rail */}
        <div
          role="tablist"
          aria-label="Deposit method"
          className="mb-5 flex gap-2 overflow-x-auto -mx-1 px-1"
        >
          {TABS.map((t) => {
            const active = tab === t.id;
            const soon = t.status === "soon";
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={active}
                aria-controls={`tab-${t.id}`}
                onClick={() => setTab(t.id)}
                className={`shrink-0 inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition ${
                  active
                    ? "bg-white/10 text-white"
                    : "text-gray-300 hover:text-white bg-white/[0.02] hover:bg-white/[0.05]"
                }`}
                style={{ borderColor: active ? t.tone : "rgba(255,255,255,0.08)" }}
              >
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: t.tone }}
                  aria-hidden
                />
                {t.label}
                {soon && (
                  <span className="ml-1 text-[9px] uppercase tracking-widest text-gray-500 border border-white/15 rounded-full px-1.5 py-[1px]">
                    soon
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Panels */}
        <section
          id={`tab-${tab}`}
          role="tabpanel"
          aria-label={`${tab} deposit`}
          className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 md:p-7"
        >
          {tab === "ltc" && <LtcDepositPanel />}
          {tab === "card" && (
            <ArrivingMethod
              label="Credit card"
              tone="#a78bfa"
              lead="Accept Visa / Mastercard / Apple Pay to mint LWP instantly."
              bullets={[
                "KYC-lite via Stripe's hosted flow",
                "1.9% + $0.30 per fill",
                "Your principal is the only thing we store",
              ]}
            />
          )}
          {tab === "bank" && (
            <ArrivingMethod
              label="ACH / SEPA"
              tone="#60a5fa"
              lead="Same-day ACH in the US, SEPA instant in the EU."
              bullets={[
                "Zero fee on deposits ≥ $50",
                "Pulls straight into LWP — no stablecoin detour",
                "Scheduled fills supported",
              ]}
            />
          )}
        </section>

        {/* Trust strip */}
        <div className="mt-6 grid gap-3 md:grid-cols-3 text-xs text-gray-400">
          <InfoTile title="Non-custodial" body="Livewager never holds your keys or tokens. All credits mint directly to your principal." />
          <InfoTile title="ICRC-3 audit trail" body="Every mint emits a signed block. You can read the full log from /account." />
          <InfoTile title="Demo guardrails" body="Real LTC isn't moved here. The production oracle waits for 2 confirmations." />
        </div>
      </main>
    </>
  );
}

export default function DepositPage() {
  // useSearchParams needs a Suspense boundary in Next 15.
  return (
    <Suspense fallback={<DepositSkeleton />}>
      <DepositInner />
    </Suspense>
  );
}

// -------------- subcomponents --------------

function ArrivingMethod({
  label,
  tone,
  lead,
  bullets,
}: {
  label: string;
  tone: string;
  lead: string;
  bullets: string[];
}) {
  const toast = useToast();
  const join = () =>
    toast.push({
      kind: "info",
      title: `You're on the list for ${label}`,
      description: "We'll ping you the day this rail flips live.",
    });

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_1.2fr] items-center">
      <div>
        <div
          className="inline-flex items-center gap-2 text-[10px] uppercase tracking-widest px-2 py-1 rounded-full border mb-3"
          style={{ color: tone, borderColor: `${tone}55` }}
        >
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: tone }} />
          Arriving soon
        </div>
        <h3 className="text-2xl md:text-3xl font-black text-white mb-2">{label}</h3>
        <p className="text-sm text-gray-300 leading-snug mb-4">{lead}</p>
        <ul className="space-y-1.5 text-sm text-gray-200">
          {bullets.map((b) => (
            <li key={b} className="flex items-start gap-2">
              <span
                className="mt-[7px] inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: tone }}
              />
              <span>{b}</span>
            </li>
          ))}
        </ul>
        <button
          onClick={join}
          className="mt-5 px-5 py-2.5 rounded-xl font-bold text-black transition hover:brightness-110"
          style={{ background: `linear-gradient(90deg, ${tone}, ${darken(tone)})` }}
        >
          Notify me
        </button>
      </div>
      <div
        className="relative aspect-square rounded-2xl border border-white/10 overflow-hidden"
        style={{
          background: `radial-gradient(700px 400px at 0% 0%, ${tone}22, transparent 60%), rgba(255,255,255,0.02)`,
        }}
      >
        <svg
          className="absolute inset-0 w-full h-full opacity-80"
          viewBox="0 0 400 400"
          aria-hidden
        >
          <defs>
            <radialGradient id="g1" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={tone} stopOpacity="0.45" />
              <stop offset="100%" stopColor={tone} stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx="200" cy="200" r="170" fill="url(#g1)" />
          <g stroke={tone} strokeOpacity="0.5" strokeWidth="1" fill="none">
            {[60, 110, 160].map((r) => (
              <circle key={r} cx="200" cy="200" r={r} />
            ))}
          </g>
          <text
            x="50%"
            y="52%"
            textAnchor="middle"
            fontFamily="ui-monospace, SFMono-Regular, monospace"
            fontSize="18"
            fill={tone}
            letterSpacing="4"
          >
            COMING SOON
          </text>
        </svg>
      </div>
    </div>
  );
}

function InfoTile({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <div className="text-[10px] uppercase tracking-widest text-cyan-300 mb-1">
        {title}
      </div>
      <div className="text-xs text-gray-300 leading-snug">{body}</div>
    </div>
  );
}

function DepositSkeleton() {
  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 md:px-8 py-12">
        <div className="h-6 w-32 rounded bg-white/5 animate-pulse mb-3" />
        <div className="h-10 w-2/3 rounded bg-white/5 animate-pulse mb-8" />
        <div className="h-12 w-full rounded bg-white/5 animate-pulse mb-5" />
        <div className="h-[420px] w-full rounded-2xl bg-white/5 animate-pulse" />
      </main>
    </>
  );
}

// Keep a tiny in-file color tweaker so the CTAs can use an accent
// gradient without pulling in a color library.
function darken(hex: string): string {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, ((n >> 16) & 0xff) - 40);
  const g = Math.max(0, ((n >> 8) & 0xff) - 40);
  const b = Math.max(0, (n & 0xff) - 40);
  return `rgb(${r},${g},${b})`;
}
