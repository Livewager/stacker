"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import Image from "next/image";
import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { StackerWager, PAYOUT_MULTIPLIER } from "@/components/stacker/StackerWager";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { ROUTES } from "@/lib/routes";

const StackerGame = dynamic(() => import("@/components/stacker/StackerGame"), {
  ssr: false,
  loading: () => (
    <div className="mx-auto w-full max-w-[560px] aspect-[3/5] rounded-2xl border border-white/10 bg-white/[0.03] animate-pulse" />
  ),
});

type Phase = "idle" | "playing" | "won" | "over";

export default function StackerPage() {
  const [stake, setStake] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [roundKey, setRoundKey] = useState(0);
  const wagerDisabled = phase === "playing";

  return (
    <div className="min-h-screen bg-background text-white relative overflow-x-hidden">
      <AmbientBackdrop />

      <nav
        aria-label="Site"
        className="relative z-20 max-w-7xl mx-auto px-5 md:px-8 py-5 flex items-center justify-between gap-3"
      >
        <Link href={ROUTES.dunk} className="flex items-center" aria-label="Livewager Dunk home">
          <Image
            src="/assets/logo43.png"
            alt="Livewager · Dunk"
            width={440}
            height={144}
            priority
            sizes="(max-width: 768px) 320px, 440px"
            style={{ height: 80, width: "auto", objectFit: "contain" }}
          />
        </Link>
        <div className="flex items-center gap-2">
          <Link href={ROUTES.play}>
            <Button variant="outline" size="sm">
              ← All games
            </Button>
          </Link>
          <a href="#play">
            <Button tone="cyan" size="sm">
              Play now
            </Button>
          </a>
        </div>
      </nav>

      {/* -------------- HERO -------------- */}
      <Hero />

      {/* -------------- WHY IT'S HARD -------------- */}
      <DifficultyLadder />

      {/* -------------- HOW IT WORKS -------------- */}
      <HowItWorks />

      {/* -------------- WAGER PRIMER -------------- */}
      <WagerPrimer />

      {/* -------------- FAIR PLAY -------------- */}
      <FairPlay />

      {/* -------------- PLAY -------------- */}
      <section
        id="play"
        className="relative z-10 max-w-7xl mx-auto px-5 md:px-8 pt-8 pb-16 scroll-mt-20"
      >
        <div className="mb-6">
          <div className="text-[10px] uppercase tracking-widest text-cyan-300 mb-2">
            Your round
          </div>
          <h2 className="text-3xl md:text-4xl font-black tracking-tight">
            Lock in. Stack clean.
          </h2>
          <p className="text-sm text-gray-400 mt-1 max-w-lg">
            Pick a chip, then tap to start. Space or Enter works too.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-[minmax(0,560px)_1fr] items-start">
          <StackerGame
            key={roundKey}
            stake={stake}
            winMultiplier={PAYOUT_MULTIPLIER.win}
            onPhaseChange={(p) => setPhase(p)}
          />

          <div className="space-y-4">
            <StackerWager
              disabled={wagerDisabled}
              onStart={(s) => {
                setStake(s);
                setRoundKey((k) => k + 1);
                setPhase("idle");
              }}
            />

            <div className="grid gap-3 text-sm text-gray-300">
              <Tip title="Controls">Space / Enter / Click / Tap locks the slider.</Tip>
              <Tip title="Scoring">10 pts per row. Perfect stack adds 15 × streak.</Tip>
              <Tip title="Prize (demo)">
                Stake × {PAYOUT_MULTIPLIER.win} on a clean top floor. LWP does not
                move on-chain in this demo round.
              </Tip>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

// =============================================================
// Background
// =============================================================

function AmbientBackdrop() {
  return (
    <div
      aria-hidden
      className="absolute inset-0 z-0 pointer-events-none"
      style={{
        background:
          "radial-gradient(1200px 700px at 10% -10%, rgba(34,211,238,0.18), transparent 60%), radial-gradient(900px 600px at 110% 10%, rgba(249,115,22,0.14), transparent 55%), radial-gradient(1000px 700px at 50% 110%, rgba(139,92,246,0.12), transparent 60%)",
      }}
    />
  );
}

// =============================================================
// Hero
// =============================================================

function Hero() {
  return (
    <section className="relative z-10 max-w-7xl mx-auto px-5 md:px-8 pt-4 pb-12 md:pt-10 md:pb-20">
      <div className="grid gap-8 md:grid-cols-[1.15fr_1fr] items-center">
        <div>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="flex items-center gap-2 mb-4"
          >
            <Pill status="demo">Arcade · demo</Pill>
            <span className="text-[10px] uppercase tracking-widest text-gray-500">
              Stacker · Livewager
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.05 }}
            className="text-5xl md:text-7xl font-black tracking-tight leading-[0.95] mb-4"
          >
            Stack to the{" "}
            <span
              className="bg-clip-text text-transparent"
              style={{
                backgroundImage:
                  "linear-gradient(90deg,#22d3ee,#fdba74 50%,#facc15)",
              }}
            >
              top.
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.12 }}
            className="text-gray-300 text-base md:text-lg max-w-lg leading-snug mb-6"
          >
            Fifteen rows. A sliding block. One tap to lock it. Miss the window
            and the stack narrows — hit zero and it collapses. The top floor
            pays{" "}
            <span className="text-yellow-300 font-semibold">
              {PAYOUT_MULTIPLIER.win}×
            </span>{" "}
            your stake.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.18 }}
            className="flex flex-wrap items-center gap-3"
          >
            <a href="#play">
              <Button tone="cyan" size="lg">
                Play now
              </Button>
            </a>
            <a href="#how">
              <Button variant="outline" size="lg">
                How it works
              </Button>
            </a>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.35 }}
            className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px] text-gray-500"
          >
            <StatChip label="Grid" value="7 × 15" />
            <StatChip label="Round" value="~30s" />
            <StatChip label="Perfect bonus" value="15 × streak" />
            <StatChip label="Prize mode" value={`${PAYOUT_MULTIPLIER.win}× stake`} />
          </motion.div>
        </div>

        <HeroTower />
      </div>
    </section>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="uppercase tracking-widest text-gray-500">{label}</span>
      <span className="font-mono text-white">{value}</span>
    </span>
  );
}

// ---- Animated tower preview ----

type HeroCell = {
  row: number;
  startCol: number;
  width: number;
};

function HeroTower() {
  const reduced = useReducedMotion();
  // Hand-authored "demo run" — a stack that looks satisfying, not random
  // per render. Deterministic so SSR and CSR line up.
  const stack: HeroCell[] = useMemo(
    () => [
      { row: 0, startCol: 2, width: 3 },
      { row: 1, startCol: 2, width: 3 },
      { row: 2, startCol: 2, width: 3 },
      { row: 3, startCol: 2, width: 3 },
      { row: 4, startCol: 2, width: 3 },
      { row: 5, startCol: 2, width: 3 },
      { row: 6, startCol: 3, width: 2 },
      { row: 7, startCol: 3, width: 2 },
      { row: 8, startCol: 3, width: 2 },
      { row: 9, startCol: 3, width: 2 },
      { row: 10, startCol: 3, width: 2 },
      { row: 11, startCol: 3, width: 2 },
      { row: 12, startCol: 4, width: 1 },
      { row: 13, startCol: 4, width: 1 },
      { row: 14, startCol: 4, width: 1 },
    ],
    [],
  );

  const GRID_COLS = 7;
  const GRID_ROWS = 15;

  const CYAN: [number, number, number] = [34, 211, 238];
  const GOLD: [number, number, number] = [250, 204, 21];
  const colorFor = (row: number) => {
    const t = row / (GRID_ROWS - 1);
    const r = Math.round(CYAN[0] + (GOLD[0] - CYAN[0]) * t);
    const g = Math.round(CYAN[1] + (GOLD[1] - CYAN[1]) * t);
    const b = Math.round(CYAN[2] + (GOLD[2] - CYAN[2]) * t);
    return `rgb(${r}, ${g}, ${b})`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6, delay: 0.1 }}
      className="relative mx-auto w-full max-w-[360px]"
    >
      <div
        className="relative aspect-[3/5] rounded-2xl border border-white/10 overflow-hidden shadow-2xl"
        style={{
          background:
            "radial-gradient(600px 500px at 50% -10%, rgba(34,211,238,0.18), transparent 60%), linear-gradient(180deg,#071a2e,#020b18)",
        }}
      >
        {/* Grid dots */}
        <svg
          aria-hidden
          viewBox={`0 0 ${GRID_COLS * 20} ${GRID_ROWS * 20}`}
          preserveAspectRatio="xMidYMid meet"
          className="absolute inset-0 w-full h-full p-4"
        >
          {/* dots */}
          {Array.from({ length: GRID_ROWS }, (_, r) =>
            Array.from({ length: GRID_COLS }, (_, c) => (
              <circle
                key={`${r}-${c}`}
                cx={c * 20 + 10}
                cy={(GRID_ROWS - 1 - r) * 20 + 10}
                r={0.8}
                fill="rgba(255,255,255,0.08)"
              />
            )),
          )}

          {/* stacked blocks, animated in bottom-up */}
          {stack.map((cell, i) => {
            const color = colorFor(cell.row);
            const x = cell.startCol * 20 + 1.5;
            const y = (GRID_ROWS - 1 - cell.row) * 20 + 1.5;
            const w = cell.width * 20 - 3;
            const h = 20 - 3;
            return (
              <motion.rect
                key={i}
                x={x}
                y={y}
                width={w}
                height={h}
                rx={2.5}
                fill={color}
                fillOpacity={0.92}
                stroke={color}
                strokeOpacity={0.4}
                strokeWidth={0.4}
                initial={reduced ? {} : { opacity: 0, y: y - 6 }}
                animate={{ opacity: 1, y }}
                transition={
                  reduced
                    ? { duration: 0 }
                    : {
                        delay: 0.2 + i * 0.06,
                        duration: 0.28,
                        ease: [0.2, 0.8, 0.2, 1],
                      }
                }
                style={{
                  filter: cell.row >= 12 ? "drop-shadow(0 0 4px rgba(250,204,21,0.6))" : undefined,
                }}
              />
            );
          })}

          {/* Final "perfect" crown ring on the top block */}
          {!reduced && (
            <motion.circle
              cx={stack[stack.length - 1].startCol * 20 + stack[stack.length - 1].width * 10}
              cy={(GRID_ROWS - 1 - stack[stack.length - 1].row) * 20 + 10}
              r={0}
              fill="none"
              stroke="rgba(250,204,21,0.7)"
              strokeWidth={0.5}
              initial={{ r: 0, opacity: 0.8 }}
              animate={{ r: 18, opacity: 0 }}
              transition={{ delay: 1.3, duration: 1, repeat: Infinity, repeatDelay: 2 }}
            />
          )}
        </svg>

        {/* Corner badges */}
        <div className="absolute left-3 top-3 text-[10px] uppercase tracking-widest text-cyan-300 font-mono">
          Row <span className="text-white">15 / 15</span>
        </div>
        <div className="absolute right-3 top-3 text-[10px] uppercase tracking-widest text-yellow-300 font-mono">
          × 3 prize
        </div>
        <div className="absolute left-3 bottom-3 text-[10px] uppercase tracking-widest text-gray-500 font-mono">
          demo preview
        </div>
      </div>
    </motion.div>
  );
}

// =============================================================
// Difficulty ladder — visual speed ramp
// =============================================================

function DifficultyLadder() {
  const reduced = useReducedMotion();
  return (
    <section className="relative z-10 max-w-7xl mx-auto px-5 md:px-8 py-10">
      <div className="mb-6 max-w-xl">
        <div className="text-[10px] uppercase tracking-widest text-orange-300 mb-2">
          The climb
        </div>
        <h2 className="text-2xl md:text-3xl font-black tracking-tight mb-2">
          Easy at the bottom. Brutal at the top.
        </h2>
        <p className="text-sm text-gray-400 leading-snug">
          Speed ramps cubically across the tower. Past row 6 the slider can
          spawn on either side — past row 8 the speed jitters on two irrational
          sines so there&apos;s no rhythm to lock onto.
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 md:p-6">
        <div className="grid gap-4 md:grid-cols-[1.2fr_1fr] items-center">
          {/* Speed bars */}
          <div>
            <div className="text-[10px] uppercase tracking-widest text-gray-400 mb-3">
              Slider speed (cells/sec)
            </div>
            <div className="flex items-end gap-1 h-32">
              {Array.from({ length: 15 }, (_, row) => {
                const t = row / 14;
                const speed = 3.6 + t * t * t * 9.9;
                const heightPct = (speed / 14) * 100;
                const hot = row >= 8;
                const veryHot = row >= 12;
                return (
                  <motion.div
                    key={row}
                    className="flex-1 rounded-t-sm relative"
                    initial={reduced ? {} : { height: 0 }}
                    whileInView={{ height: `${heightPct}%` }}
                    viewport={{ once: true, margin: "-50px" }}
                    transition={
                      reduced
                        ? { duration: 0 }
                        : { delay: row * 0.025, duration: 0.35, ease: "easeOut" }
                    }
                    style={{
                      background: veryHot
                        ? "linear-gradient(180deg,#facc15,#f59e0b)"
                        : hot
                          ? "linear-gradient(180deg,#fb923c,#f97316)"
                          : "linear-gradient(180deg,#22d3ee,#0891b2)",
                      minHeight: "4px",
                      boxShadow: veryHot
                        ? "0 0 8px rgba(250,204,21,0.35)"
                        : undefined,
                    }}
                    aria-label={`Row ${row}: ${speed.toFixed(1)} cells/sec`}
                  />
                );
              })}
            </div>
            <div className="mt-2 flex justify-between text-[10px] font-mono text-gray-500">
              <span>row 0 · 3.6</span>
              <span className="text-orange-300">row 8 · 8.3</span>
              <span className="text-yellow-300">row 14 · 13.5+</span>
            </div>
          </div>

          {/* Mechanics list */}
          <ul className="space-y-3">
            <LadderRule
              tone="cyan"
              row="0–5"
              title="Warm-up"
              body="Predictable left-to-right slider. Missing here is on you."
            />
            <LadderRule
              tone="orange"
              row="6+"
              title="Random spawn side"
              body="Slider can appear on either edge moving either direction. Muscle memory stops working."
            />
            <LadderRule
              tone="yellow"
              row="8+"
              title="Speed jitter"
              body="Two irrational sines layer over the base speed. No BPM to lock. Good luck."
            />
          </ul>
        </div>
      </div>
    </section>
  );
}

function LadderRule({
  tone,
  row,
  title,
  body,
}: {
  tone: "cyan" | "orange" | "yellow";
  row: string;
  title: string;
  body: string;
}) {
  const fg =
    tone === "cyan"
      ? "text-cyan-300"
      : tone === "orange"
        ? "text-orange-300"
        : "text-yellow-300";
  const dot =
    tone === "cyan"
      ? "bg-cyan-300"
      : tone === "orange"
        ? "bg-orange-400"
        : "bg-yellow-300";
  return (
    <li className="flex items-start gap-3">
      <span className={`mt-1.5 inline-block h-2 w-2 rounded-full ${dot} shrink-0`} />
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <span className={`text-[10px] uppercase tracking-widest font-mono ${fg}`}>
            row {row}
          </span>
          <span className="text-sm font-semibold text-white">{title}</span>
        </div>
        <div className="text-xs text-gray-400 leading-snug mt-0.5">{body}</div>
      </div>
    </li>
  );
}

// =============================================================
// How it works
// =============================================================

function HowItWorks() {
  const cards = [
    {
      idx: "01",
      title: "Slider bounces across",
      body:
        "A row of blocks slides left and right above your stack. It never stops on its own.",
      visual: <SliderAnim />,
      tone: "cyan" as const,
    },
    {
      idx: "02",
      title: "Tap to lock",
      body:
        "Space, Enter, click, or tap. Whatever overlaps the block below stays — anything hanging off falls off.",
      visual: <LockAnim />,
      tone: "violet" as const,
    },
    {
      idx: "03",
      title: "Don't let it hit zero",
      body:
        "Each imperfect lock narrows the window. Zero width is game over. A perfect lock keeps the width and chains into a streak bonus.",
      visual: <ChopAnim />,
      tone: "orange" as const,
    },
  ];

  return (
    <section id="how" className="relative z-10 max-w-7xl mx-auto px-5 md:px-8 py-10 scroll-mt-20">
      <div className="mb-6 max-w-xl">
        <div className="text-[10px] uppercase tracking-widest text-cyan-300 mb-2">
          How it works
        </div>
        <h2 className="text-2xl md:text-3xl font-black tracking-tight mb-2">
          Three rules. Fifteen rows.
        </h2>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {cards.map((c) => (
          <motion.div
            key={c.idx}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.4 }}
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 overflow-hidden"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-mono tracking-widest text-gray-500">
                {c.idx}
              </span>
              <Pill status={c.tone === "cyan" ? "demo" : c.tone === "violet" ? "beta" : "soon"}>
                {c.tone === "cyan" ? "core" : c.tone === "violet" ? "tap" : "decay"}
              </Pill>
            </div>
            <div className="relative aspect-[5/3] mb-4 rounded-xl overflow-hidden border border-white/5 bg-black/40">
              {c.visual}
            </div>
            <h3 className="text-lg font-semibold text-white mb-1">{c.title}</h3>
            <p className="text-sm text-gray-400 leading-snug">{c.body}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

// ---- How-it-works mini animations ----

function SliderAnim() {
  const reduced = useReducedMotion();
  return (
    <svg viewBox="0 0 100 60" className="absolute inset-0 w-full h-full p-3">
      {[0, 1, 2].map((i) => (
        <rect
          key={i}
          x={20 + i * 20}
          y={45}
          width={18}
          height={10}
          rx={2}
          fill="rgba(34,211,238,0.3)"
        />
      ))}
      <motion.rect
        x={0}
        y={15}
        width={30}
        height={10}
        rx={2}
        fill="#22d3ee"
        initial={{ x: 5 }}
        animate={reduced ? {} : { x: [5, 65, 5] }}
        transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
      />
    </svg>
  );
}

function LockAnim() {
  const reduced = useReducedMotion();
  return (
    <svg viewBox="0 0 100 60" className="absolute inset-0 w-full h-full p-3">
      <rect x={25} y={42} width={50} height={10} rx={2} fill="rgba(139,92,246,0.3)" />
      <motion.rect
        x={28}
        y={22}
        width={50}
        height={10}
        rx={2}
        fill="#a78bfa"
        initial={{ x: 28, y: 22 }}
        animate={reduced ? {} : { x: [28, 28], y: [22, 22, 32] }}
        transition={{ duration: 2.4, repeat: Infinity, times: [0, 0.6, 1], ease: "easeIn" }}
      />
      {/* "tap" ripple */}
      {!reduced && (
        <motion.circle
          cx={50}
          cy={42}
          r={4}
          fill="none"
          stroke="rgba(167,139,250,0.7)"
          strokeWidth={1}
          initial={{ r: 0, opacity: 0 }}
          animate={{ r: [0, 18], opacity: [0.8, 0] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: 1.4 }}
        />
      )}
    </svg>
  );
}

function ChopAnim() {
  const reduced = useReducedMotion();
  return (
    <svg viewBox="0 0 100 60" className="absolute inset-0 w-full h-full p-3">
      <rect x={35} y={42} width={30} height={10} rx={2} fill="rgba(251,146,60,0.25)" />
      <motion.rect
        x={25}
        y={22}
        width={50}
        height={10}
        rx={2}
        fill="#f97316"
        initial={{ x: 25, opacity: 1 }}
        animate={reduced ? {} : { x: [25, 25, 35], width: [50, 50, 30], opacity: [1, 1, 1] }}
        transition={{ duration: 2.6, repeat: Infinity, times: [0, 0.55, 0.7] }}
      />
      {/* Falling chop */}
      {!reduced && (
        <motion.rect
          x={66}
          y={22}
          width={9}
          height={10}
          rx={2}
          fill="#f97316"
          initial={{ y: 22, opacity: 0 }}
          animate={{ y: [22, 22, 60], opacity: [0, 1, 0], rotate: [0, 0, 25] }}
          transition={{ duration: 2.6, repeat: Infinity, times: [0, 0.55, 0.95] }}
        />
      )}
    </svg>
  );
}

// =============================================================
// Wager primer
// =============================================================

function WagerPrimer() {
  const chips = [
    { label: "Free", sub: "no stake" },
    { label: "5 LWP", sub: "→ 15" },
    { label: "25 LWP", sub: "→ 75" },
    { label: "100 LWP", sub: "→ 300" },
  ];
  return (
    <section className="relative z-10 max-w-7xl mx-auto px-5 md:px-8 py-10">
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-white/[0.02] p-6 md:p-8">
        <div className="grid gap-6 md:grid-cols-[1fr_1.1fr] items-center">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-yellow-300 mb-2">
              Wager · demo mode
            </div>
            <h2 className="text-2xl md:text-3xl font-black tracking-tight mb-2">
              Skin in the game, without the risk.
            </h2>
            <p className="text-sm text-gray-300 leading-snug mb-4 max-w-md">
              Pick a chip before you start. Reach the top and you&apos;d win{" "}
              <span className="text-yellow-300 font-semibold">
                {PAYOUT_MULTIPLIER.win}×
              </span>{" "}
              your stake. Collapse and it&apos;s gone. The demo round doesn&apos;t
              actually move LWP on-chain — the mechanic is real, the ledger call
              is not (yet).
            </p>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
              <Pill status="demo">demo</Pill>
              <span>ICRC-1 wager canister shipping next.</span>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {chips.map((c, i) => (
              <motion.div
                key={c.label}
                initial={{ opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.3, delay: i * 0.06 }}
                className="rounded-xl border border-white/10 bg-black/40 p-3 text-center"
              >
                <div className="text-sm font-bold text-white">{c.label}</div>
                <div className="text-[10px] uppercase tracking-widest text-yellow-300/90 font-mono mt-1">
                  {c.sub}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// =============================================================
// Fair play — anti-cheat primer
// =============================================================

function FairPlay() {
  return (
    <section className="relative z-10 max-w-7xl mx-auto px-5 md:px-8 py-10">
      <div className="mb-6 max-w-xl">
        <div className="flex items-center gap-2 mb-2">
          <Pill status="live">human-only</Pill>
          <span className="text-[10px] uppercase tracking-widest text-gray-500">
            fair play
          </span>
        </div>
        <h2 className="text-2xl md:text-3xl font-black tracking-tight mb-2">
          Skill, not scripts.
        </h2>
        <p className="text-sm text-gray-400 leading-snug">
          Prize mode only pays when we&apos;re confident a human tapped. Three
          layered signals — device motion, tap entropy, and an optional camera
          liveness check — make bots and macros impractical without ever
          recording you.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <FairCard
          idx="01"
          title="Motion signature"
          tone="cyan"
          kicker="accelerometer"
          body="A real hand holding a phone produces sub-degree micro-tremor. A script replaying taps produces perfectly flat signal. We sample motion during your round and attach a signature to the score claim."
          visual={<MotionAnim />}
        />
        <FairCard
          idx="02"
          title="Tap entropy"
          tone="violet"
          kicker="timing + position"
          body="Every tap captures the slider position, frame time, and inter-tap delta. Humans drift. Bots don't. The distribution of deltas over a round is fingerprint-grade — scripted play stands out instantly."
          visual={<EntropyAnim />}
        />
        <FairCard
          idx="03"
          title="Liveness (optional)"
          tone="orange"
          kicker="camera · opt-in"
          body="Enable the camera to add a human-presence probe. We run eye and face landmarks on-device (WASM, no upload) and only record that a face was present — never video. Decline it and you can still play ranked with the other two signals."
          visual={<EyeAnim />}
        />
      </div>

      <div className="mt-5 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.04] p-4 flex flex-wrap items-start gap-3 text-[12px] text-emerald-100/90">
        <span
          aria-hidden
          className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
            <path d="M16.707 5.293a1 1 0 0 1 0 1.414l-7.5 7.5a1 1 0 0 1-1.414 0l-3.5-3.5a1 1 0 1 1 1.414-1.414L8.5 12.086l6.793-6.793a1 1 0 0 1 1.414 0Z" />
          </svg>
        </span>
        <div className="min-w-0">
          <strong className="text-emerald-200 font-semibold">
            No video leaves your device.
          </strong>{" "}
          Liveness uses MediaPipe face landmarks running entirely in your
          browser. We log only a time-stamped &quot;human present&quot; flag. Motion
          and tap entropy work without camera at all — liveness is bonus
          evidence, not a requirement.
        </div>
      </div>
    </section>
  );
}

function FairCard({
  idx,
  title,
  kicker,
  body,
  visual,
  tone,
}: {
  idx: string;
  title: string;
  kicker: string;
  body: string;
  visual: React.ReactNode;
  tone: "cyan" | "violet" | "orange";
}) {
  const toneText =
    tone === "cyan"
      ? "text-cyan-300"
      : tone === "violet"
        ? "text-violet-300"
        : "text-orange-300";
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.4 }}
      className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 overflow-hidden"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-mono tracking-widest text-gray-500">
          {idx}
        </span>
        <span className={`text-[10px] uppercase tracking-widest font-mono ${toneText}`}>
          {kicker}
        </span>
      </div>
      <div className="relative aspect-[5/3] mb-4 rounded-xl overflow-hidden border border-white/5 bg-black/40">
        {visual}
      </div>
      <h3 className="text-lg font-semibold text-white mb-1">{title}</h3>
      <p className="text-sm text-gray-400 leading-snug">{body}</p>
    </motion.div>
  );
}

// ---- Fair-play mini animations ----

function MotionAnim() {
  const reduced = useReducedMotion();
  // Two overlaid traces: human (jittery) vs bot (straight line).
  const humanPath = useMemo(() => {
    let x = 6;
    let y = 30;
    const pts: string[] = [`M ${x} ${y}`];
    for (let i = 0; i < 40; i++) {
      x += 2.2;
      y = 30 + Math.sin(i * 0.6) * 3 + (Math.sin(i * 1.7) * 2) + (i % 5 === 0 ? (Math.random() - 0.5) * 3 : 0);
      pts.push(`L ${x.toFixed(1)} ${y.toFixed(1)}`);
    }
    return pts.join(" ");
  }, []);
  return (
    <svg viewBox="0 0 100 60" className="absolute inset-0 w-full h-full p-3" aria-hidden>
      {/* Bot: flat line */}
      <line
        x1="6"
        y1="45"
        x2="94"
        y2="45"
        stroke="rgba(239,68,68,0.55)"
        strokeWidth="1"
        strokeDasharray="2 2"
      />
      <text x="94" y="53" fontSize="4.5" fontFamily="ui-monospace" fill="rgba(239,68,68,0.8)" textAnchor="end">BOT</text>

      {/* Human: jittery trace, drawn progressively */}
      <motion.path
        d={humanPath}
        fill="none"
        stroke="#22d3ee"
        strokeWidth="1.1"
        strokeLinecap="round"
        initial={{ pathLength: reduced ? 1 : 0 }}
        animate={{ pathLength: 1 }}
        transition={reduced ? { duration: 0 } : { duration: 3, repeat: Infinity, repeatType: "loop", ease: "linear" }}
      />
      <text x="6" y="17" fontSize="4.5" fontFamily="ui-monospace" fill="rgba(34,211,238,0.9)">HUMAN · tremor</text>
    </svg>
  );
}

function EntropyAnim() {
  const reduced = useReducedMotion();
  // Histogram bars — human distribution is wider & noisier, bot is a spike.
  const humanBars = useMemo(
    () => [2, 3, 5, 8, 11, 9, 7, 5, 3, 2],
    [],
  );
  return (
    <svg viewBox="0 0 100 60" className="absolute inset-0 w-full h-full p-3" aria-hidden>
      {/* Human histogram */}
      {humanBars.map((h, i) => (
        <motion.rect
          key={i}
          x={6 + i * 7}
          width={5.5}
          rx={0.6}
          fill="rgba(167,139,250,0.7)"
          initial={{ height: 0, y: 50 }}
          animate={reduced ? { height: h * 3, y: 50 - h * 3 } : { height: [0, h * 3, h * 3], y: [50, 50 - h * 3, 50 - h * 3] }}
          transition={reduced ? { duration: 0 } : { duration: 2.4, times: [0, 0.45, 1], delay: i * 0.05, repeat: Infinity, repeatDelay: 1.2 }}
        />
      ))}

      {/* Bot spike — a single tall red bar */}
      <motion.rect
        x={46}
        width={5.5}
        rx={0.6}
        fill="rgba(239,68,68,0.85)"
        initial={{ height: 0, y: 50 }}
        animate={reduced ? { height: 36, y: 14 } : { height: [0, 36, 36], y: [50, 14, 14] }}
        transition={reduced ? { duration: 0 } : { duration: 2.4, times: [0, 0.55, 1], delay: 0.55, repeat: Infinity, repeatDelay: 1.2 }}
      />

      <text x="6" y="8" fontSize="4.5" fontFamily="ui-monospace" fill="rgba(167,139,250,0.9)">HUMAN</text>
      <text x="94" y="8" fontSize="4.5" fontFamily="ui-monospace" fill="rgba(239,68,68,0.9)" textAnchor="end">BOT</text>
    </svg>
  );
}

function EyeAnim() {
  const reduced = useReducedMotion();
  return (
    <svg viewBox="0 0 100 60" className="absolute inset-0 w-full h-full p-3" aria-hidden>
      {/* Eye outline */}
      <path
        d="M 20 30 Q 50 8 80 30 Q 50 52 20 30 Z"
        fill="rgba(0,0,0,0.4)"
        stroke="rgba(251,146,60,0.7)"
        strokeWidth="1.2"
      />
      {/* Iris */}
      <motion.g
        initial={{ x: 0 }}
        animate={reduced ? {} : { x: [-6, 6, -4, 5, -6] }}
        transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut" }}
      >
        <circle cx={50} cy={30} r={9} fill="#f97316" opacity={0.8} />
        <circle cx={50} cy={30} r={4} fill="#020b18" />
        <circle cx={52} cy={28} r={1.2} fill="#fff" opacity={0.9} />
      </motion.g>

      {/* Blink */}
      {!reduced && (
        <motion.rect
          x={18}
          y={14}
          width={64}
          height={32}
          fill="#020b18"
          initial={{ scaleY: 0, transformOrigin: "center" }}
          animate={{ scaleY: [0, 0, 1, 0] }}
          transition={{ duration: 5, repeat: Infinity, times: [0, 0.82, 0.88, 0.94], ease: "easeInOut" }}
          style={{ transformOrigin: "50px 30px" }}
        />
      )}

      {/* Landmark crosshair ticks to suggest detection */}
      {[
        [30, 28],
        [70, 28],
        [50, 18],
        [50, 42],
      ].map(([cx, cy], i) => (
        <motion.g
          key={i}
          initial={{ opacity: 0 }}
          animate={reduced ? { opacity: 0.6 } : { opacity: [0, 0.8, 0.4, 0.8, 0] }}
          transition={{ duration: 4, repeat: Infinity, delay: i * 0.2 }}
        >
          <circle cx={cx} cy={cy} r={1.5} fill="#f97316" />
          <circle cx={cx} cy={cy} r={3} fill="none" stroke="#f97316" strokeOpacity={0.3} strokeWidth={0.5} />
        </motion.g>
      ))}

      <text x="6" y="8" fontSize="4.5" fontFamily="ui-monospace" fill="rgba(251,146,60,0.9)">ON-DEVICE · NO UPLOAD</text>
    </svg>
  );
}

// =============================================================
// Tip (play section)
// =============================================================

function Tip({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="text-[10px] uppercase tracking-widest text-cyan-300 mb-1.5">
        {title}
      </div>
      <div className="text-sm text-gray-200 leading-snug">{children}</div>
    </div>
  );
}
