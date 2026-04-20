"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";
import { BackToTop } from "@/components/ui/BackToTop";
import {
  getHourBoard,
  getPlayerHandle,
  useScoreboardVersion,
  type ScoreEntry,
} from "@/components/dunk/scoreboard";

const HOUR_MS = 60 * 60 * 1000;

export default function LeaderboardPage() {
  const version = useScoreboardVersion();
  const [now, setNow] = useState<number>(() => Date.now());
  const myHandle = getPlayerHandle();

  // Tick the clock once a second so the hour countdown is live.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Full hour board from the shared util, then derive per-game slices
  // and the signed-in player's rank. Recomputes on every scoreboard
  // version bump (any round end + every second for the clock).
  const {
    dunkBoard,
    pourBoard,
    stackerBoard,
    myDunkRank,
    msToReset,
  } = useMemo(() => {
    const all = getHourBoard(now);
    const dunk = all.filter((e) => e.game === "dunk");
    const pour = all.filter((e) => e.game === "pour");
    // Stacker isn't wired to the shared scoreboard yet; we synthesize
    // from localStorage below.
    const myIdx = myHandle ? dunk.findIndex((e) => e.handle === myHandle) : -1;
    // Hour-reset: each full wall-clock hour.
    const hourStart = Math.floor(now / HOUR_MS) * HOUR_MS;
    return {
      dunkBoard: dunk.slice(0, 20),
      pourBoard: pour.slice(0, 20),
      stackerBoard: readStackerBoard(),
      myDunkRank: myIdx >= 0 ? myIdx + 1 : null,
      msToReset: hourStart + HOUR_MS - now,
    };
    // `version` is passed in so useMemo re-runs when rounds change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, now, myHandle]);

  // Only mount the back-to-top chip when either board has enough rows
  // to justify it — avoids a random floating button on a near-empty
  // leaderboard.
  const showBackToTop =
    dunkBoard.length > 10 || pourBoard.length > 10;

  return (
    <>
      <AppHeader />
      <div className="mx-auto max-w-6xl px-4 md:px-8 py-8 md:py-12">
        <HeroHeader msToReset={msToReset} myRank={myDunkRank} myHandle={myHandle} />

        <div className="grid gap-6 md:grid-cols-[1.3fr_1fr]">
          <LiveHourPanel dunkBoard={dunkBoard} pourBoard={pourBoard} myHandle={myHandle} />
          <div className="space-y-6">
            <HallOfFame />
            <BestsPanel stackerBest={stackerBoard.localBest} />
          </div>
        </div>
      </div>
      {showBackToTop && <BackToTop threshold={600} bottomOffset={84} />}
    </>
  );
}

// ----------------------------------------------------------------
// Header
// ----------------------------------------------------------------

function HeroHeader({
  msToReset,
  myRank,
  myHandle,
}: {
  msToReset: number;
  myRank: number | null;
  myHandle: string;
}) {
  return (
    <div className="mb-8 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
      <div>
        <div className="text-xs uppercase tracking-widest text-cyan-300 mb-2">
          Leaderboard
        </div>
        <h1 className="text-3xl md:text-4xl font-black tracking-tight">
          The steadiest hands of the hour.
        </h1>
        <p className="text-sm text-gray-400 mt-1 max-w-xl">
          Every top-of-the-hour a prize drops. Your best round in the last 60 minutes
          is what counts — no penalty for playing more.
        </p>
      </div>
      <div className="flex items-center gap-3">
        {myHandle ? (
          <div
            className="rounded-xl border border-cyan-300/40 bg-cyan-300/[0.06] px-4 py-3"
            aria-live="polite"
          >
            <div className="text-[10px] uppercase tracking-widest text-cyan-300 mb-1">
              You
            </div>
            <div className="text-sm font-mono text-white">
              @{myHandle}{" "}
              <span className="text-gray-400">
                {myRank ? `· rank #${myRank}` : "· unranked this hour"}
              </span>
            </div>
          </div>
        ) : (
          <Link
            href="/dunk"
            className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-gray-300 hover:text-white hover:border-white/20 transition"
          >
            Play a round to claim a handle →
          </Link>
        )}
        <HourClock msToReset={msToReset} />
      </div>
    </div>
  );
}

function HourClock({ msToReset }: { msToReset: number }) {
  const s = Math.max(0, Math.floor(msToReset / 1000));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-right">
      <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">
        Hour resets in
      </div>
      <div className="font-mono text-lg tabular-nums text-white">
        {mm}:{ss}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------
// Live hour board
// ----------------------------------------------------------------

function LiveHourPanel({
  dunkBoard,
  pourBoard,
  myHandle,
}: {
  dunkBoard: ScoreEntry[];
  pourBoard: ScoreEntry[];
  myHandle: string;
}) {
  const [tab, setTab] = useState<"dunk" | "pour">("dunk");
  const board = tab === "dunk" ? dunkBoard : pourBoard;

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
      <header className="flex items-center justify-between border-b border-white/5 px-4 py-3">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-cyan-300">
            Live · this hour
          </div>
          <div className="text-sm text-gray-400 mt-0.5">
            Top {board.length || "—"} scores, refreshed every round.
          </div>
        </div>
        <div
          role="tablist"
          aria-label="Leaderboard game"
          className="flex rounded-lg border border-white/10 bg-white/[0.03] p-0.5"
        >
          {(["dunk", "pour"] as const).map((g) => {
            const active = tab === g;
            return (
              <button
                key={g}
                role="tab"
                aria-selected={active}
                onClick={() => setTab(g)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                  active ? "bg-white/10 text-white" : "text-gray-400 hover:text-white"
                }`}
              >
                {g === "dunk" ? "Dunk" : "Pour"}
              </button>
            );
          })}
        </div>
      </header>

      {board.length === 0 ? (
        <EmptyBoard />
      ) : (
        <ol className="divide-y divide-white/5">
          {/* Podium treatment for the top 3 — different spacing + tint. */}
          {board.slice(0, 3).map((e, i) => (
            <PodiumRow key={e.id} entry={e} rank={i + 1} me={e.handle === myHandle} />
          ))}
          {board.slice(3).map((e, i) => (
            <Row key={e.id} entry={e} rank={i + 4} me={e.handle === myHandle} />
          ))}
        </ol>
      )}
    </section>
  );
}

const PODIUM_TONES = [
  // gold, silver, bronze — inline to keep tailwind JIT happy
  { bg: "rgba(250,204,21,0.08)", border: "rgba(250,204,21,0.35)", fg: "#fde68a" },
  { bg: "rgba(226,232,240,0.06)", border: "rgba(226,232,240,0.25)", fg: "#e5e7eb" },
  { bg: "rgba(251,146,60,0.07)", border: "rgba(251,146,60,0.3)", fg: "#fed7aa" },
];

function PodiumRow({ entry, rank, me }: { entry: ScoreEntry; rank: number; me: boolean }) {
  const tone = PODIUM_TONES[rank - 1];
  return (
    <li
      className="flex items-center gap-3 px-4 py-4 transition"
      style={{ background: tone.bg, borderLeft: `3px solid ${tone.border}` }}
    >
      <div
        className="h-9 w-9 shrink-0 rounded-full grid place-items-center font-black text-sm border"
        style={{ color: tone.fg, borderColor: tone.border }}
      >
        {rank}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white truncate">
            @{entry.handle}
          </span>
          {entry.flag && <span aria-hidden>{entry.flag}</span>}
          {me && (
            <span className="text-[9px] uppercase tracking-widest text-cyan-300 border border-cyan-300/40 rounded-full px-1.5 py-[1px]">
              you
            </span>
          )}
          {entry.id.startsWith("sim-") && (
            <span className="text-[9px] uppercase tracking-widest text-gray-500 border border-white/15 rounded-full px-1.5 py-[1px]">
              demo
            </span>
          )}
        </div>
        <div className="text-[11px] text-gray-500">{relTime(entry.ts)}</div>
      </div>
      <div className="text-right">
        <div className="font-mono text-2xl tabular-nums" style={{ color: tone.fg }}>
          {entry.score}
        </div>
        <div className="text-[10px] uppercase tracking-widest text-gray-500">
          {entry.game === "dunk" ? "Dunk" : entry.game === "pour" ? "Pour" : "Tidal"}
        </div>
      </div>
    </li>
  );
}

function Row({ entry, rank, me }: { entry: ScoreEntry; rank: number; me: boolean }) {
  return (
    <li
      className={`flex items-center gap-3 px-4 py-2.5 transition ${
        me ? "bg-cyan-300/[0.04]" : "hover:bg-white/[0.02]"
      }`}
    >
      <div className="w-6 text-right font-mono text-xs text-gray-500 tabular-nums">
        #{rank}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm text-white truncate">@{entry.handle}</span>
          {entry.flag && <span aria-hidden className="text-sm">{entry.flag}</span>}
          {me && (
            <span className="text-[9px] uppercase tracking-widest text-cyan-300 border border-cyan-300/40 rounded-full px-1.5 py-[1px]">
              you
            </span>
          )}
        </div>
      </div>
      <div className="font-mono text-sm tabular-nums text-gray-200">{entry.score}</div>
    </li>
  );
}

function EmptyBoard() {
  return (
    <div className="px-6 py-10 text-center">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-cyan-300">
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
          <path d="M6.3 3.7a1 1 0 0 1 1.5-.87l8 5.3a1 1 0 0 1 0 1.74l-8 5.3A1 1 0 0 1 6.3 14.3v-10.6Z" />
        </svg>
      </div>
      <div className="text-sm text-white font-semibold mb-1">No scores this hour yet</div>
      <div className="text-xs text-gray-400 max-w-xs mx-auto leading-snug">
        Be the first — tap{" "}
        <Link href="/dunk" className="text-cyan-300 hover:underline">
          Play
        </Link>{" "}
        and pour a round.
      </div>
    </div>
  );
}

// ----------------------------------------------------------------
// Hall of fame (demo)
// ----------------------------------------------------------------

interface Legend {
  handle: string;
  score: number;
  flag: string;
  note: string;
}
const LEGENDS: Legend[] = [
  { handle: "steady_hands", score: 9_820, flag: "🇯🇵", note: "14/20 perfect holds" },
  { handle: "basedhunter", score: 9_640, flag: "🇺🇸", note: "Late-night bullseye streak" },
  { handle: "ricochet", score: 9_410, flag: "🇫🇷", note: "Won with a 1-px margin" },
  { handle: "cosmic", score: 9_205, flag: "🇨🇦", note: "Won on their 3rd round ever" },
  { handle: "elev8", score: 8_990, flag: "🇦🇺", note: "Broke their own 4-hr streak" },
];

function HallOfFame() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const id = window.setInterval(
      () => setIdx((i) => (i + 1) % LEGENDS.length),
      5000,
    );
    return () => window.clearInterval(id);
  }, []);
  const cur = LEGENDS[idx];
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] uppercase tracking-widest text-yellow-300">
          Hall of fame
        </div>
        <span className="text-[9px] uppercase tracking-widest text-gray-500 border border-white/15 rounded-full px-1.5 py-[1px]">
          demo
        </span>
      </div>
      <div className="relative min-h-[92px]">
        <div
          key={idx}
          className="animate-[fadeSlide_0.5s_ease]"
          style={{
            /* inline keyframes via CSS: safer than adding to global css */
          }}
        >
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-sm font-semibold text-white">@{cur.handle}</span>
            <span aria-hidden className="text-sm">{cur.flag}</span>
          </div>
          <div className="font-mono text-2xl text-yellow-200 tabular-nums">{cur.score}</div>
          <div className="mt-1 text-[11px] text-gray-400 leading-snug">{cur.note}</div>
        </div>
      </div>
      <div className="mt-4 flex gap-1.5">
        {LEGENDS.map((_, i) => (
          <button
            key={i}
            onClick={() => setIdx(i)}
            aria-label={`Show legend ${i + 1}`}
            className={`h-1.5 flex-1 rounded-full transition ${
              i === idx ? "bg-yellow-300" : "bg-white/15 hover:bg-white/25"
            }`}
          />
        ))}
      </div>
      {/* Scoped keyframes. Scoped via data-attr so no global bleed. */}
      <style>{`
        @keyframes fadeSlide {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </section>
  );
}

// ----------------------------------------------------------------
// Bests (per-device)
// ----------------------------------------------------------------

function BestsPanel({ stackerBest }: { stackerBest: number }) {
  const pourBest = readAllTimePourBest();
  const bothZero = pourBest === 0 && stackerBest === 0;
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
      <div className="text-[10px] uppercase tracking-widest text-cyan-300 mb-3">
        Your bests (this device)
      </div>
      {bothZero ? (
        <div className="py-6 text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-cyan-300">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path d="M10 2a1 1 0 0 1 .894.553l1.934 3.87 4.272.62a1 1 0 0 1 .554 1.706l-3.091 3.013.73 4.254a1 1 0 0 1-1.451 1.054L10 15.077l-3.842 2.019a1 1 0 0 1-1.451-1.054l.73-4.254L2.346 8.75a1 1 0 0 1 .554-1.706l4.272-.62 1.934-3.87A1 1 0 0 1 10 2Z" />
            </svg>
          </div>
          <div className="text-sm text-white font-semibold mb-1">
            No personal bests yet
          </div>
          <div className="text-xs text-gray-400 max-w-xs mx-auto leading-snug mb-4">
            Play a round in either game and your score shows up here. Beats are
            stored locally until accounts pair with the ledger.
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Link
              href="/dunk"
              className="rounded-md border border-cyan-300/40 bg-cyan-300/[0.08] px-3 py-1.5 text-[11px] uppercase tracking-widest text-cyan-200 hover:bg-cyan-300/[0.15] transition"
            >
              Tilt Pour
            </Link>
            <Link
              href="/stacker"
              className="rounded-md border border-orange-400/40 bg-orange-400/[0.08] px-3 py-1.5 text-[11px] uppercase tracking-widest text-orange-200 hover:bg-orange-400/[0.15] transition"
            >
              Stacker
            </Link>
          </div>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-white/5">
            <BestRow game="Tilt Pour" best={pourBest} cta={{ href: "/dunk", label: "Play" }} />
            <BestRow game="Stacker" best={stackerBest} cta={{ href: "/stacker", label: "Play" }} />
          </ul>
          <div className="mt-3 text-[11px] text-gray-500 leading-snug">
            Device-local right now. Sign-in-synced bests land when accounts pair
            with the ledger.
          </div>
        </>
      )}
    </section>
  );
}

function BestRow({
  game,
  best,
  cta,
}: {
  game: string;
  best: number;
  cta: { href: string; label: string };
}) {
  const has = best > 0;
  return (
    <li className="flex items-center gap-3 py-3">
      <div className="flex-1 min-w-0">
        <div className="text-sm text-white">{game}</div>
        <div className="text-[11px] text-gray-500">
          {has ? "Personal best" : "No round played yet"}
        </div>
      </div>
      <div
        className={`font-mono text-xl tabular-nums shrink-0 ${
          has ? "text-white" : "text-gray-600"
        }`}
      >
        {has ? best : "—"}
      </div>
      <Link
        href={cta.href}
        className="text-[11px] uppercase tracking-widest px-3 py-1.5 rounded-md border border-white/15 text-gray-200 hover:text-white hover:border-white/30 transition shrink-0"
      >
        {has ? cta.label : "Start"}
      </Link>
    </li>
  );
}

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

function relTime(ts: number): string {
  const diff = Date.now() - ts;
  const s = Math.max(0, Math.floor(diff / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

const LS_STACKER_BEST = "livewager-stacker-best";

function readStackerBoard(): { localBest: number } {
  try {
    const v = window.localStorage.getItem(LS_STACKER_BEST);
    return { localBest: v ? Number(v) : 0 };
  } catch {
    return { localBest: 0 };
  }
}

function readAllTimePourBest(): number {
  // The existing dunk codebase stores the pour high score at HS_KEY;
  // read it directly so this page doesn't couple to internal exports.
  try {
    const v = window.localStorage.getItem("livewager-pour-high-score");
    return v ? Number(v) : 0;
  } catch {
    return 0;
  }
}
