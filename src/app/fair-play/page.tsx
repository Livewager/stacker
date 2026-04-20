import type { Metadata } from "next";
import AppHeader from "@/components/AppHeader";

export const metadata: Metadata = {
  title: "Fair play · Livewager",
  description:
    "Tiered defense, risk score, not one-rule bans. Server-authoritative canister, signed input transcripts, anomaly scoring with rare supporting signals.",
};

export default function FairPlayPage() {
  return (
    <>
      <AppHeader />
      <div className="mx-auto max-w-4xl px-4 md:px-8 py-8 md:py-12">
        <div className="mb-10">
          <div className="text-xs uppercase tracking-widest text-cyan-300 mb-2">
            Fair play
          </div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-3">
            Tiered defense · risk score, not one-rule bans.
          </h1>
          <p className="text-lg md:text-xl text-gray-300 leading-snug max-w-2xl">
            <span className="text-white font-semibold">Skill, not scripts.</span>{" "}
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
          >
            <DiagramRow>
              <Tag>CLIENT</Tag>
              <span className="text-gray-500 text-xs">
                signed transcript → replay → match
              </span>
              <Tag tone="cyan">CANISTER</Tag>
            </DiagramRow>
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
          >
            {/* POLISH-336 — decorative mock transcript. The prose
                below fully describes what signed input events are;
                this block is visual sample output only. aria-hidden
                so AT doesn't read "tap number 1 row 0 t 312 ms…"
                as narration before the actual explanation. */}
            <div
              aria-hidden
              className="font-mono text-[11px] text-gray-400 leading-relaxed space-y-0.5"
            >
              <div>tap #01 row 0 t=312ms</div>
              <div>tap #02 row 1 t=801ms</div>
              <div>tap #03 row 2 t=1147ms</div>
              <div>tap #04 row 3 t=1502ms</div>
              <div className="pt-1 text-cyan-300">II SIG</div>
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
          >
            <div className="space-y-1.5 text-[12px]">
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
          >
            <DiagramRow>
              <Tag tone="violet">HUMAN</Tag>
              <span className="text-gray-500 text-xs">←</span>
              <Tag>BOT</Tag>
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
          >
            <DiagramRow>
              <Tag tone="violet">1 : 1</Tag>
              <span className="text-gray-500 text-xs">vs</span>
              <Tag>1 : N</Tag>
              <span className="text-gray-500 text-xs ml-auto">
                device : principal ratio
              </span>
            </DiagramRow>
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
          >
            <DiagramRow>
              <Tag>BOT</Tag>
              <span className="text-gray-500 text-xs">vs</span>
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
        <div className="mt-12 space-y-4 text-sm text-gray-300 leading-relaxed border-t border-white/10 pt-8">
          <p>
            <span className="text-white font-semibold">
              We use a risk score, not one-rule bans.
            </span>{" "}
            A single weird signal doesn't eject you. Multiple persistent
            anomalies plus payout behavior do. Flagged accounts get held for
            manual review, not instant account death.
          </p>
          <p>
            <span className="text-white font-semibold">
              No video, no constant camera, no hidden outcome manipulation.
            </span>{" "}
            The game logic is deterministic and server-authoritative. What
            you see on screen is what the ledger records.
          </p>
        </div>
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
  const accentCls =
    accent === "cyan"
      ? "text-cyan-300 border-cyan-300/40"
      : accent === "violet"
        ? "text-violet-300 border-violet-300/40"
        : "text-orange-300 border-orange-300/40";
  return (
    <section className="mb-12">
      <div className="mb-5">
        <div
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] uppercase tracking-widest font-mono ${accentCls}`}
        >
          <span className="font-bold">{n}</span>
          <span className="text-gray-400 normal-case tracking-normal font-sans">
            · {title}
          </span>
        </div>
        <p className="mt-3 text-sm text-gray-400 max-w-2xl">{subtitle}</p>
      </div>
      {/* POLISH-338 audit: md:grid-cols-3 collapses to 1 column at
          <768px. Mobile math at 320px:
            320 vp − 32 px outer (px-4 ×2) − 40 px card (p-5 ×2)
            = 248 px content box.
          Longest tokens checked:
            - h3 title "Server-authoritative rounds" ≈ 220 px → fits
            - DiagramRow tag "ON-DEVICE · NO UPLOAD" ≈ 90 px → fits
            - Tier eyebrow "T1 · Authoritative truth" ≈ 85 px → fits
            - Transcript row "tap #01 row 0 t=312ms" ≈ 140 px → fits
          DiagramRow has `flex-wrap` already, so wide tag combos
          break to a new line cleanly. Hero h1 wraps at word
          boundaries (no CJK / no long unbroken tokens). Prose
          paragraphs use `leading-snug` with natural wrapping.
          No overflow at 320px; no horizontal scroll bar. */}
      <div className="grid gap-4 md:grid-cols-3">{children}</div>
    </section>
  );
}

function Card({
  step,
  title,
  flavor,
  children,
}: {
  step: string;
  title: string;
  flavor: string;
  children: React.ReactNode;
}) {
  // POLISH-337 audit: inline p-5 is deliberate, not drift from the
  // POLISH-265 Card primitive (which offers
  // sm=p-3, md=p-5 md:p-6, lg=p-6 md:p-10). The primitive's md
  // density bumps to 24px on ≥768px, which at /fair-play's
  // md:grid-cols-3 tight layout would eat 8px × 3 cards = 24px of
  // content width per row. Keeping p-5 flat matches the existing
  // exception shape (CONTRIBUTING allows p-5 md:p-7 / p-5 md:p-8
  // for cards that want tighter density than the primitive). No
  // migration.
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[10px] font-mono text-gray-500 tracking-widest">
          {step}
        </span>
        <span className="text-[10px] uppercase tracking-widest text-gray-500">
          {flavor}
        </span>
      </div>
      <h3 className="text-base font-semibold text-white">{title}</h3>
      <div className="flex-1 flex flex-col gap-3 text-xs text-gray-300 leading-snug">
        {children}
      </div>
    </div>
  );
}

function DiagramRow({ children }: { children: React.ReactNode }) {
  // POLISH-336 — aria-hidden on the whole row. The prose paragraph
  // below each DiagramRow fully explains what the visual schematic
  // is saying (e.g. "The points_ledger canister holds the seed…"
  // after the CLIENT → CANISTER row). Without aria-hidden, screen
  // readers announce "CLIENT signed transcript arrow replay arrow
  // match CANISTER" before the prose, which reads as a stuttering
  // decorative prelude. Same pattern /dunk's stat-chip strip
  // (POLISH-223) and Stacker HUD use: visual-only schematics
  // hidden from AT, prose is the single accessible source of
  // truth.
  //
  // NOTE: LadderRow (used in the Trust-ladder card) is
  // deliberately NOT hidden — it's an itemized list, not a
  // schematic. Tiers + their detail text (NEW · free only, LOW ·
  // small stakes, etc.) are information the AT user needs.
  return (
    <div
      aria-hidden
      className="flex items-center gap-2 flex-wrap rounded-lg border border-white/5 bg-black/30 px-3 py-2"
    >
      {children}
    </div>
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
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-mono tracking-widest ${cls}`}
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
  return (
    <div className="flex items-center gap-2">
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      <span className="font-mono text-[10px] tracking-widest text-white">
        {label}
      </span>
      <span className="text-gray-400">· {detail}</span>
    </div>
  );
}
