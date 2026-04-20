"use client";

/**
 * Games hub. Two cards, two routes, one shared wallet.
 *
 * Kept deliberately simple: no auth required to browse, the cards link
 * directly to the game routes. Stats (best score, hourly rank) read
 * client-side from the same localStorage keys each game writes to, so
 * they just reflect whatever the user has already played.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";
import OnboardingNudge from "@/components/OnboardingNudge";

type Game = {
  href: string;
  tag: string;
  title: string;
  tagline: string;
  bullets: string[];
  accent: string; // css gradient for the card header bar
  bestKey: string | null; // localStorage key or null
  status: "live" | "beta";
};

const GAMES: Game[] = [
  {
    href: "/dunk",
    tag: "Tilt Pour",
    title: "Tilt. Pour. Don't spill.",
    tagline:
      "Phone-native skill game. Tilt your device to pour, steady your hand, and hit the line without overflowing.",
    bullets: [
      "20-second round",
      "Gyroscope + keyboard fallback",
      "Leaderboard integration",
    ],
    accent: "linear-gradient(90deg,#22d3ee,#0891b2)",
    bestKey: null,
    status: "live",
  },
  {
    href: "/stacker",
    tag: "Stacker",
    title: "Stack to the top.",
    tagline:
      "Arcade classic. Rows slide; tap to lock. Hit the ceiling clean for a 3× demo prize. Chop off too much and the stack dies.",
    bullets: [
      "7 × 15 grid",
      "Perfect-stack streak bonus",
      "Wager chips (free / 5 / 25 / 100)",
    ],
    accent: "linear-gradient(90deg,#fdba74,#f97316)",
    bestKey: "livewager-stacker-best",
    status: "live",
  },
];

function readNumberPref(key: string): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export default function PlayHubPage() {
  const [bests, setBests] = useState<Record<string, number | null>>({});

  useEffect(() => {
    const next: Record<string, number | null> = {};
    for (const g of GAMES) {
      if (g.bestKey) next[g.bestKey] = readNumberPref(g.bestKey);
    }
    setBests(next);
  }, []);

  return (
    <>
      <AppHeader />
      <OnboardingNudge />
      <div className="min-h-screen bg-background text-white">
        <section className="max-w-7xl mx-auto px-5 md:px-8 py-8">
          <div className="max-w-2xl mb-8">
            <div className="text-xs uppercase tracking-widest mb-2 text-cyan-300">
              Play
            </div>
            <h1 className="text-3xl md:text-5xl font-black tracking-tight mb-2">
              Pick a game.
            </h1>
            <p className="text-gray-400 text-sm md:text-base max-w-lg">
              Same wallet, different skill surface. Points, prizes, and leaderboard
              all live on the Internet Computer as ICRC-1 tokens. Every demo round
              is clearly labeled — nothing moves on-chain unless you ship it.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {GAMES.map((g) => {
              const best = g.bestKey ? bests[g.bestKey] : null;
              return (
                <Link
                  key={g.href}
                  href={g.href}
                  className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-white/25 hover:bg-white/[0.05]"
                >
                  <div
                    aria-hidden
                    className="absolute inset-x-0 top-0 h-1"
                    style={{ background: g.accent }}
                  />
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest">
                      <span className="text-cyan-300">{g.tag}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 font-semibold ${
                          g.status === "live"
                            ? "border border-emerald-400/40 text-emerald-300 bg-emerald-400/[0.08]"
                            : "border border-orange-400/40 text-orange-300 bg-orange-400/[0.08]"
                        }`}
                      >
                        {g.status}
                      </span>
                    </div>
                    {best !== null && best !== undefined && (
                      <div className="rounded-md bg-black/50 px-2 py-1 text-[10px] font-mono uppercase tracking-widest">
                        <span className="text-gray-400">Best </span>
                        <span className="text-yellow-300 tabular-nums">{best}</span>
                      </div>
                    )}
                  </div>

                  <h2 className="text-2xl md:text-3xl font-black tracking-tight mb-2">
                    {g.title}
                  </h2>
                  <p className="text-sm text-gray-300 leading-snug mb-4 max-w-sm">
                    {g.tagline}
                  </p>

                  <ul className="space-y-1.5 mb-5">
                    {g.bullets.map((b) => (
                      <li
                        key={b}
                        className="flex items-start gap-2 text-xs text-gray-300"
                      >
                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-cyan-300/70 shrink-0" />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="flex items-center justify-between">
                    <span className="text-[11px] uppercase tracking-widest text-gray-500">
                      Enter
                    </span>
                    <span
                      aria-hidden
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-white/70 transition group-hover:bg-cyan-300/15 group-hover:text-cyan-300"
                    >
                      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                        <path d="M7.3 4.3a1 1 0 0 1 1.4 0l5 5a1 1 0 0 1 0 1.4l-5 5a1 1 0 0 1-1.4-1.4L11.58 10 7.3 5.7a1 1 0 0 1 0-1.4Z" />
                      </svg>
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>

          <p className="mt-6 text-xs text-gray-500 max-w-lg">
            More games are in development. If you have a skill-game mechanic that
            fits a 10-30 second round, the shared wallet + ledger make it cheap to
            plug in.
          </p>
        </section>
      </div>
    </>
  );
}
