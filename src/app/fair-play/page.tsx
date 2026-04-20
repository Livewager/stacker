import type { Metadata } from "next";
import AppHeader from "@/components/AppHeader";

export const metadata: Metadata = {
  title: "Fair play · Livewager",
  description:
    "Tiered defense, risk score, not one-rule bans. Server-authoritative canister, signed input transcripts, anomaly scoring with rare supporting signals.",
};

// POLISH-341 bundle baseline (measured 2026-04-20 against
// commit d53bbe0):
//   /fair-play · 2.85 kB per-page · 227 kB first-load JS
//
// Smallest per-page chunk in the app. The 102 kB shared baseline
// includes React + framer-motion + @dfinity/agent + WalletContext,
// unavoidable via AppHeader. Per-page is pure static JSX → the
// 2.85 kB is the accent-class switch maps (Tier/Card/Tag/Ladder).
// For comparison: /deposit 7.33 / 243, /settings 9.78 / 234,
// /send 11.6 / 236. Audit-close.

export default function FairPlayPage() {
  return (
    <>
      <AppHeader />
      <div className="mx-auto max-w-5xl px-4 md:px-8 py-10 md:py-16">
        {/* ---------- Hero ---------- */}
        <div className="mb-16 md:mb-20">
          <div className="inline-flex items-center gap-2 mb-5 rounded-full border border-cyan-300/30 bg-cyan-300/[0.05] px-3 py-1">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-cyan-300" />
            <span className="text-[10px] uppercase tracking-widest font-mono text-cyan-200">
              Fair play
            </span>
          </div>
          <h1 className="text-4xl md:text-6xl font-black tracking-tight leading-[1.05] mb-6 max-w-3xl">
            Tiered defense ·{" "}
            <span
              className="bg-clip-text text-transparent"
              style={{
                backgroundImage:
                  "linear-gradient(135deg, #22d3ee, #a78bfa, #f97316)",
              }}
            >
              risk score, not one-rule bans
            </span>
            .
          </h1>
          <p className="text-xl md:text-2xl text-white font-semibold mb-3">
            Skill, not scripts.
          </p>
          <p className="text-base md:text-lg text-gray-300 leading-relaxed max-w-2xl">
            Every round runs against a server-authoritative canister with a
            signed input transcript. Day-to-day anomaly scoring catches bots
            and farms. Motion and camera checks only kick in when a flagged
            round needs a second opinion. Three tiers, increasing intrusion —
            and the top tier is rare.
          </p>
        </div>

        {/* ---------- T1 — Authoritative truth ---------- */}
        <Tier
          n="T1"
          title="Authoritative truth"
          subtitle="The server is the game. Client is a view. Without this, nothing else matters."
          accent="cyan"
        >
          <Card
            step="01"
            title="Server-authoritative rounds"
            flavor="canister replays the game"
            accent="cyan"
          >
            <DiagramRow>
              <Tag>CLIENT</Tag>
              <Arrow />
              <Tag tone="cyan">CANISTER</Tag>
            </DiagramRow>
            <DiagramCaption>
              signed transcript → replay → match
            </DiagramCaption>
            <p>
              The points_ledger canister holds the seed, re-simulates the
              round from your signed tap transcript, and only mints a score
              that matches byte-for-byte. No replay, no prize.
            </p>
          </Card>

          <Card
            step="02"
            title="Signed input events"
            flavor="II signature per tap"
            accent="cyan"
          >
            <div
              aria-hidden
              className="rounded-lg border border-white/5 bg-black/40 px-3 py-2 font-mono text-[11px] text-gray-400 leading-relaxed space-y-0.5"
            >
              <div>tap #01 · row 0 · t=312ms</div>
              <div>tap #02 · row 1 · t=801ms</div>
              <div>tap #03 · row 2 · t=1147ms</div>
              <div>tap #04 · row 3 · t=1502ms</div>
              <div className="pt-1 flex items-center gap-1.5">
                <span className="h-1 w-1 rounded-full bg-cyan-300" />
                <span className="text-cyan-300 tracking-widest">II SIG</span>
              </div>
            </div>
            <p>
              Every tap is signed by your Internet Identity with position,
              timestamp, and round id. The full transcript hashes into the
              score claim — a bot can't forge taps without your key.
            </p>
          </Card>

          <Card
            step="03"
            title="Trust ladder"
            flavor="progressive payouts"
            accent="cyan"
          >
            <div className="space-y-1.5">
              <LadderRow tone="gray" label="NEW" detail="free only" />
              <LadderRow tone="cyan" label="LOW" detail="small stakes" />
              <LadderRow tone="violet" label="MED" detail="ranked" />
              <LadderRow tone="emerald" label="HIGH" detail="withdrawable" />
            </div>
            <p>
              New accounts play free-only. Consistent human-like play bumps
              you up: small stakes, normal stakes, withdrawable winnings.
              Risk is amortized — no single round decides eligibility.
            </p>
          </Card>
        </Tier>

        {/* ---------- T2 — Behavioral anomaly scoring ---------- */}
        <Tier
          n="T2"
          title="Behavioral anomaly scoring"
          subtitle="Day-to-day layer. Feeds a risk score — not a ban hammer."
          accent="violet"
        >
          <Card
            step="04"
            title="Tap pattern + touch dynamics"
            flavor="distribution, not rules"
            accent="violet"
          >
            <DiagramRow>
              <Tag tone="violet">HUMAN</Tag>
              <span aria-hidden className="text-gray-500 text-[10px]">
                drifts
              </span>
              <Tag>BOT</Tag>
              <span aria-hidden className="text-gray-500 text-[10px]">
                locked
              </span>
            </DiagramRow>
            <p>
              Inter-tap delta variance, autocorrelation, touch radius and
              pressure when available. Humans drift; scripts don't. Flagged
              distributions raise risk score, they don't auto-ban — false
              positives are a feature only at the review layer.
            </p>
          </Card>

          <Card
            step="05"
            title="Device + account reputation"
            flavor="clustering, privacy-preserving"
            accent="violet"
          >
            <DiagramRow>
              <Tag tone="violet">1 : 1</Tag>
              <span aria-hidden className="text-gray-500 text-[10px]">
                vs
              </span>
              <Tag>1 : N</Tag>
            </DiagramRow>
            <DiagramCaption>device : principal ratio</DiagramCaption>
            <p>
              Fingerprint hashes into a bucket id, not a profile. Many-
              principals-one-device bursts and impossibly fast account
              creation raise the cluster's risk. High-reputation device +
              account pair glides through ranked play; low-reputation gets
              the second-opinion checks.
            </p>
          </Card>
        </Tier>

        {/* ---------- T3 — Supporting signals · rare ---------- */}
        <Tier
          n="T3"
          title="Supporting signals · rare"
          subtitle="Only when a round is already flagged, or at large-payout withdrawal."
          accent="orange"
        >
          <Card
            step="06"
            title="Motion (flagged rounds only)"
            flavor="accelerometer · sampled"
            accent="orange"
          >
            <DiagramRow>
              <Tag>BOT</Tag>
              <span aria-hidden className="text-gray-500 text-[10px]">
                vs
              </span>
              <Tag tone="orange">HUMAN · tremor</Tag>
            </DiagramRow>
            <p>
              Sub-degree hand tremor is hard to fake at scale. We only sample
              it when Tier 2 raises your risk score mid-round — or when you
              voluntarily enable high-trust mode. A clean motion signature
              reduces risk, absence doesn't prove anything.
            </p>
          </Card>

          <Card
            step="07"
            title="Camera liveness (withdrawals)"
            flavor="one-time · on-device"
            accent="orange"
          >
            <DiagramRow>
              <Tag tone="emerald">ON-DEVICE · NO UPLOAD</Tag>
            </DiagramRow>
            <p>
              Not required to play. Triggered only at withdrawals above a
              risk-adjusted threshold. On-device face landmarks (WASM, no
              upload) confirm a human is behind the payout — then the camera
              releases. Never during rounds.
            </p>
          </Card>
        </Tier>

        {/* ---------- Closing principles ---------- */}
        <section className="mt-16 md:mt-20 grid gap-4 md:grid-cols-2">
          <Principle accent="cyan" heading="Risk score, not one-rule bans.">
            A single weird signal doesn't eject you. Multiple persistent
            anomalies plus payout behavior do. Flagged accounts get held for
            manual review, not instant account death.
          </Principle>
          <Principle accent="emerald" heading="No video. No constant camera.">
            No hidden outcome manipulation. The game logic is deterministic
            and server-authoritative. What you see on screen is what the
            ledger records.
          </Principle>
        </section>
      </div>
    </>
  );
}

// ---------------- subcomponents ----------------

function Tier({
  n,
  title,
  subtitle,
  accent,
  children,
}: {
  n: string;
  title: string;
  subtitle: string;
  accent: "cyan" | "violet" | "orange";
  children: React.ReactNode;
}) {
  // Accent tokens per tier. Used on the tier badge + eyebrow
  // gradient rule + card accent stripe.
  const dotCls =
    accent === "cyan"
      ? "bg-cyan-300"
      : accent === "violet"
        ? "bg-violet-300"
        : "bg-orange-300";
  const textCls =
    accent === "cyan"
      ? "text-cyan-200"
      : accent === "violet"
        ? "text-violet-200"
        : "text-orange-200";
  const borderCls =
    accent === "cyan"
      ? "border-cyan-300/30"
      : accent === "violet"
        ? "border-violet-300/30"
        : "border-orange-300/30";
  const ruleCls =
    accent === "cyan"
      ? "from-cyan-300/40"
      : accent === "violet"
        ? "from-violet-300/40"
        : "from-orange-300/40";

  return (
    <section className="mb-14 md:mb-20">
      {/* POLISH-339 — no entrance motion on this section; see
          CONTRIBUTING "Entrance motion by surface type" doc-pages
          corollary. Cards stay static. */}
      <div className="mb-6 md:mb-8">
        <div className="flex items-center gap-3 mb-3">
          <span
            className={`inline-flex items-center gap-2 rounded-full border ${borderCls} px-3 py-1`}
          >
            <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${dotCls}`} />
            <span
              className={`text-[10px] uppercase tracking-widest font-mono font-bold ${textCls}`}
            >
              {n}
            </span>
          </span>
          <h2 className="text-lg md:text-xl font-bold text-white tracking-tight">
            {title}
          </h2>
          <div
            aria-hidden
            className={`flex-1 h-px bg-gradient-to-r ${ruleCls} via-white/5 to-transparent`}
          />
        </div>
        <p className="text-sm md:text-base text-gray-400 max-w-2xl leading-snug">
          {subtitle}
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">{children}</div>
    </section>
  );
}

function Card({
  step,
  title,
  flavor,
  accent,
  children,
}: {
  step: string;
  title: string;
  flavor: string;
  accent: "cyan" | "violet" | "orange";
  children: React.ReactNode;
}) {
  // Per-card accent: 1px top border in the tier's color so the
  // card visually "belongs" to the tier above it at a glance.
  const accentBar =
    accent === "cyan"
      ? "before:bg-cyan-300/40"
      : accent === "violet"
        ? "before:bg-violet-300/40"
        : "before:bg-orange-300/40";
  const stepColor =
    accent === "cyan"
      ? "text-cyan-300/70"
      : accent === "violet"
        ? "text-violet-300/70"
        : "text-orange-300/70";
  return (
    <div
      className={`relative rounded-2xl border border-white/10 bg-white/[0.02] p-5 flex flex-col gap-3 overflow-hidden before:content-[''] before:absolute before:inset-x-0 before:top-0 before:h-px ${accentBar}`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span
          className={`text-[11px] font-mono font-bold tracking-widest ${stepColor}`}
        >
          {step}
        </span>
        <span className="text-[10px] uppercase tracking-widest text-gray-500 text-right truncate">
          {flavor}
        </span>
      </div>
      <h3 className="text-base md:text-lg font-bold text-white tracking-tight">
        {title}
      </h3>
      <div className="flex-1 flex flex-col gap-3 text-xs md:text-[13px] text-gray-300 leading-relaxed">
        {children}
      </div>
    </div>
  );
}

function DiagramRow({ children }: { children: React.ReactNode }) {
  // aria-hidden: prose below restates the schematic in full. See
  // POLISH-336 for the pattern.
  return (
    <div
      aria-hidden
      className="flex items-center justify-center gap-2 flex-wrap rounded-lg border border-white/5 bg-black/30 px-3 py-3"
    >
      {children}
    </div>
  );
}

function DiagramCaption({ children }: { children: React.ReactNode }) {
  return (
    <div
      aria-hidden
      className="-mt-1 text-center text-[10px] uppercase tracking-widest font-mono text-gray-500"
    >
      {children}
    </div>
  );
}

function Arrow() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="h-3 w-3 text-gray-500"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
    >
      <path
        d="M5 12h14M13 5l7 7-7 7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Tag({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: "cyan" | "violet" | "orange" | "emerald";
}) {
  const cls =
    tone === "cyan"
      ? "border-cyan-300/40 text-cyan-200 bg-cyan-300/[0.08]"
      : tone === "violet"
        ? "border-violet-300/40 text-violet-200 bg-violet-300/[0.08]"
        : tone === "orange"
          ? "border-orange-300/40 text-orange-200 bg-orange-300/[0.08]"
          : tone === "emerald"
            ? "border-emerald-300/40 text-emerald-200 bg-emerald-300/[0.08]"
            : "border-white/15 text-gray-300 bg-white/[0.03]";
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-mono font-bold tracking-widest ${cls}`}
    >
      {children}
    </span>
  );
}

function LadderRow({
  tone,
  label,
  detail,
}: {
  tone: "gray" | "cyan" | "violet" | "emerald";
  label: string;
  detail: string;
}) {
  const dot =
    tone === "gray"
      ? "bg-gray-500"
      : tone === "cyan"
        ? "bg-cyan-300"
        : tone === "violet"
          ? "bg-violet-300"
          : "bg-emerald-300";
  const labelColor =
    tone === "gray"
      ? "text-gray-400"
      : tone === "cyan"
        ? "text-cyan-200"
        : tone === "violet"
          ? "text-violet-200"
          : "text-emerald-200";
  return (
    <div className="flex items-center gap-2.5 rounded-md bg-black/20 px-2.5 py-1.5 text-[11px]">
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      <span className={`font-mono font-bold tracking-widest ${labelColor}`}>
        {label}
      </span>
      <span className="text-gray-500">·</span>
      <span className="text-gray-300">{detail}</span>
    </div>
  );
}

function Principle({
  accent,
  heading,
  children,
}: {
  accent: "cyan" | "emerald";
  heading: string;
  children: React.ReactNode;
}) {
  const accentText =
    accent === "cyan" ? "text-cyan-300" : "text-emerald-300";
  const accentBorder =
    accent === "cyan"
      ? "border-l-cyan-300/40"
      : "border-l-emerald-300/40";
  return (
    <div
      className={`rounded-2xl border border-white/10 border-l-2 ${accentBorder} bg-white/[0.02] p-5 md:p-6`}
    >
      <h3
        className={`text-sm md:text-base font-bold mb-2 ${accentText} tracking-tight`}
      >
        {heading}
      </h3>
      <p className="text-sm text-gray-300 leading-relaxed">{children}</p>
    </div>
  );
}
