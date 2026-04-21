"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { LtcDepositPanel } from "@/components/deposit/LtcDepositPanel";
import { useToast } from "@/components/shared/Toast";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { useLocalPref, PREF_KEYS } from "@/lib/prefs";

type Tab = "ltc" | "card" | "bank";

const TABS: { id: Tab; label: string; tone: string; status: "live" | "soon" }[] = [
  { id: "ltc", label: "Litecoin", tone: "#f97316", status: "live" },
  { id: "card", label: "Card", tone: "#a78bfa", status: "soon" },
  { id: "bank", label: "Bank transfer", tone: "#60a5fa", status: "soon" },
];

function narrowTab(v: string | null): Tab | null {
  return v === "ltc" || v === "card" || v === "bank" ? v : null;
}

function DepositInner() {
  const params = useSearchParams();
  const queryTab = narrowTab(params.get("via"));
  // Pref holds the last-used tab across visits. Query param always
  // wins when present — a shared link like /deposit?via=card should
  // override any stored preference. Absent ?via=, fall back to the
  // stored pref, then ltc. Writes flow through setTab below so taps
  // update the pref naturally.
  const [storedTab, setStoredTab] = useLocalPref<Tab>(
    PREF_KEYS.depositTab,
    "ltc",
  );
  const storedSafe = narrowTab(storedTab) ?? "ltc";
  const initial: Tab = queryTab ?? storedSafe;
  const [tab, setTabState] = useState<Tab>(initial);
  const setTab = (next: Tab) => {
    setTabState(next);
    setStoredTab(next);
  };

  return (
    <>
      <AppHeader />
      <div className="mx-auto max-w-5xl px-4 md:px-8 py-8 md:py-12">
        <div className="mb-6">
          <div className="text-xs uppercase tracking-widest text-orange-300 mb-2">
            Deposit
          </div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight">
            Fund your{" "}
            <span
              className="bg-clip-text text-transparent"
              style={{
                backgroundImage:
                  "linear-gradient(90deg,#22d3ee,#fdba74 50%,#facc15)",
              }}
            >
              wallet
            </span>
            .
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
                className={`shrink-0 inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60 ${
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
                {soon && <Pill status="soon" className="ml-1">soon</Pill>}
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
              btnTone="violet"
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
              btnTone="cyan"
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
      </div>
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
  btnTone,
}: {
  label: string;
  tone: string;
  lead: string;
  bullets: string[];
  btnTone: "violet" | "cyan" | "orange" | "rose";
}) {
  const toast = useToast();
  const [email, setEmail] = useState("");
  // "idle" → "sending" → "done" | "error". Once done we lock the form
  // so repeat clicks on the tab don't re-submit; a fresh tab mount
  // resets state, but that also resets the locally-typed email which
  // is fine for this flow.
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">(
    "idle",
  );
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === "sending" || status === "done") return;
    const trimmed = email.trim();
    // Mirror the server-side EMAIL_RX — cheap client check so the
    // button's disabled state lines up with server validity.
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) {
      toast.push({ kind: "error", title: "Enter a valid email" });
      return;
    }
    setStatus("sending");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      setStatus("done");
      toast.push({
        kind: "success",
        title: `You're on the list for ${label}`,
        description: "We'll ping you the day this rail flips live.",
      });
    } catch (err) {
      setStatus("error");
      toast.push({
        kind: "error",
        title: "Couldn't save your email",
        description: (err as Error).message,
      });
    }
  };

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_1.2fr] items-center">
      <div>
        <div className="mb-3">
          <Pill status="soon">Arriving soon</Pill>
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
        {/* Notify-me micro-form. Posts to /api/waitlist so interest
            lands in whatever Slack/Zapier webhook is wired via
            STACKER_WAITLIST_WEBHOOK. On "done" the input + button
            lock so the user sees the decision stuck, and the copy
            swaps to a confirmation. */}
        {/* Stacked column on mobile, side-by-side from sm: up.
            POLISH-302 audit: inline row fits on 320px but feels
            squeezed when the button hits its longest state
            ("On the list" ≈ 100px, email gets ~170px after gap,
            about 28 chars of placeholder visible — technically
            usable but tight). Column layout on mobile gives the
            email its full natural width and the button a
            comfortable thumb-target. sm:flex-row restores the
            inline pairing for desktop where the row fits with
            room to breathe.
            h-11 on the input still pins height consistency with
            the Button's md size (POLISH-283 — items-stretch
            would otherwise drift internal metrics). fullWidth on
            the Button for the stacked state; sm:w-auto restores
            content-sized for desktop. */}
        <form
          onSubmit={submit}
          className="mt-5 flex flex-col sm:flex-row sm:items-stretch gap-2 max-w-sm"
        >
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="you@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={status === "sending" || status === "done"}
            className="flex-1 min-w-0 rounded-md border border-white/15 bg-black/40 h-11 px-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-white/30 focus-visible:ring-2 focus-visible:ring-cyan-300/50 disabled:opacity-60"
            aria-label={`Email address for ${label} notification`}
          />
          <Button
            type="submit"
            tone={btnTone}
            disabled={status === "sending" || status === "done"}
            className="w-full sm:w-auto"
          >
            {status === "done"
              ? "On the list"
              : status === "sending"
                ? "Saving…"
                : "Notify me"}
          </Button>
        </form>
        <div className="mt-2 text-[11px] text-gray-500 leading-snug max-w-sm">
          One email when this rail lands. No other use, no newsletter.
        </div>
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
      <div className="mx-auto max-w-5xl px-4 md:px-8 py-12">
        <div className="h-6 w-32 rounded bg-white/5 animate-pulse mb-3" />
        <div className="h-10 w-2/3 rounded bg-white/5 animate-pulse mb-8" />
        <div className="h-12 w-full rounded bg-white/5 animate-pulse mb-5" />
        <div className="h-[420px] w-full rounded-2xl bg-white/5 animate-pulse" />
      </div>
    </>
  );
}

