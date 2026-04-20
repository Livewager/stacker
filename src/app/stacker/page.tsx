"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";
import { StackerWager, PAYOUT_MULTIPLIER } from "@/components/stacker/StackerWager";

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
  // Increments on each confirm so the game remounts with the fresh
  // stake even when the user picks the same chip twice in a row.
  const [roundKey, setRoundKey] = useState(0);

  const wagerDisabled = phase === "playing";

  return (
    <main className="min-h-screen bg-background text-white">
      <nav className="relative z-20 max-w-7xl mx-auto px-5 md:px-8 py-5 flex items-center justify-between gap-3">
        <Link href="/dunk" className="flex items-center" aria-label="Livewager Dunk home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/assets/logo43.png"
            alt="Livewager · Dunk"
            width={440}
            height={144}
            style={{ height: 80, width: "auto", objectFit: "contain" }}
          />
        </Link>
        <Link
          href="/dunk"
          className="text-xs md:text-sm px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-gray-200 hover:text-white hover:border-white/20 transition"
        >
          ← Tilt Pour
        </Link>
      </nav>

      <section className="max-w-7xl mx-auto px-5 md:px-8 pb-16">
        <div className="max-w-2xl mb-6">
          <div className="text-xs uppercase tracking-widest mb-2 text-cyan-300">
            Stacker · arcade classic
          </div>
          <h1 className="text-3xl md:text-5xl font-black tracking-tight mb-2">
            Stack to the top.
          </h1>
          <p className="text-gray-400 text-sm md:text-base max-w-lg">
            A row of blocks slides across the top of your stack. Tap to lock it.
            Anything hanging off falls. Keep stacking until you reach the ceiling.
            Perfect stacks chain into a streak bonus.
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
    </main>
  );
}

function Tip({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="text-[10px] uppercase tracking-widest text-cyan-300 mb-1.5">{title}</div>
      <div className="text-sm text-gray-200 leading-snug">{children}</div>
    </div>
  );
}
