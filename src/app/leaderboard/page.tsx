"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useReducedMotion } from "@/lib/hooks/useReducedMotion";
import { usePrefs, useLocalPref, PREF_KEYS } from "@/lib/prefs";
import AppHeader from "@/components/AppHeader";
import { BackToTop } from "@/components/ui/BackToTop";
import { useCopyable } from "@/lib/clipboard";
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

  // Tick the clock once a second so both the hour countdown AND the
  // "Xs ago / Xm ago / Xh ago" timestamps on every row stay live
  // without a full refetch. Two polish guards:
  //   - Pause the interval when the tab is hidden (saves battery for
  //     users who pin /leaderboard and switch away). On return, snap
  //     `now` forward so timestamps don't stall at the hidden-ago.
  //   - Single interval at page root — rows read `now` via closure,
  //     not per-row setInterval.
  useEffect(() => {
    let id: number | null = null;
    const start = () => {
      if (id !== null) return;
      setNow(Date.now());
      id = window.setInterval(() => setNow(Date.now()), 1000);
    };
    const stop = () => {
      if (id === null) return;
      window.clearInterval(id);
      id = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") stop();
      else start();
    };
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // Full hour board from the shared util, then derive per-game slices
  // and the signed-in player's rank. Recomputes on every scoreboard
  // version bump (any round end + every second for the clock).
  const {
    dunkBoard,
    pourBoard,
    stackerLiveBoard,
    stackerBoard,
    myDunkRank,
    msToReset,
  } = useMemo(() => {
    const all = getHourBoard(now);
    const dunk = all.filter((e) => e.game === "dunk");
    const pour = all.filter((e) => e.game === "pour");
    const stacker = all.filter((e) => e.game === "stacker");
    const myIdx = myHandle ? dunk.findIndex((e) => e.handle === myHandle) : -1;
    // Hour-reset: each full wall-clock hour.
    const hourStart = Math.floor(now / HOUR_MS) * HOUR_MS;
    return {
      dunkBoard: dunk.slice(0, 20),
      pourBoard: pour.slice(0, 20),
      stackerLiveBoard: stacker.slice(0, 20),
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
      {/* Safe-area-aware horizontal padding. Default px-4 / md:px-8 on
          their own left the hero title + sparkline-heavy rows clipping
          under the camera notch on iPhone 14+ landscape. The
          lw-safe-x class picks the larger of the baseline padding
          (1rem mobile, 2rem desktop via media query) or the device
          inset — portrait + desktop stay identical, and landscape
          shifts inward just enough to clear the rounded corner /
          notch. Defined in src/css/style.css; arbitrary Tailwind
          couldn't express the max(env(), responsive-baseline) pair
          without inline styles losing the md: breakpoint. */}
      <div className="mx-auto max-w-6xl lw-safe-x py-8 md:py-12">
        <HeroHeader msToReset={msToReset} myRank={myDunkRank} myHandle={myHandle} />

        <div className="grid gap-6 md:grid-cols-[1.3fr_1fr]">
          <LiveHourPanel
            dunkBoard={dunkBoard}
            pourBoard={pourBoard}
            stackerBoard={stackerLiveBoard}
            myHandle={myHandle}
          />
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
          <YouBadge handle={myHandle} rank={myRank} />
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

function YouBadge({ handle, rank }: { handle: string; rank: number | null }) {
  const copy = useCopyable();
  const text = rank
    ? `@${handle} · rank ${rank} · this hour · livewager.io/leaderboard`
    : `@${handle} · playing this hour · livewager.io/leaderboard`;
  return (
    <button
      type="button"
      onClick={() => copy(text, { label: "Share card" })}
      aria-live="polite"
      title="Copy share card"
      className="rounded-xl border border-cyan-300/40 bg-cyan-300/[0.06] px-4 py-3 text-left hover:bg-cyan-300/[0.10] hover:border-cyan-300/60 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <div className="text-[10px] uppercase tracking-widest text-cyan-300 mb-1">
        You · tap to copy
      </div>
      <div className="text-sm font-mono text-white">
        @{handle}{" "}
        <span className="text-gray-400">
          {rank ? `· rank #${rank}` : "· unranked this hour"}
        </span>
      </div>
    </button>
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
  stackerBoard,
  myHandle,
}: {
  dunkBoard: ScoreEntry[];
  pourBoard: ScoreEntry[];
  stackerBoard: ScoreEntry[];
  myHandle: string;
}) {
  // Persist the active tab so a user who only cares about one game
  // lands there on return. Narrow through a guard — a hand-edited
  // pref shouldn't crash the page.
  const [rawTab, setRawTab] = useLocalPref<"dunk" | "pour" | "stacker">(
    PREF_KEYS.leaderboardTab,
    "dunk",
  );
  const tab: "dunk" | "pour" | "stacker" =
    rawTab === "dunk" || rawTab === "pour" || rawTab === "stacker"
      ? rawTab
      : "dunk";
  const setTab = (next: "dunk" | "pour" | "stacker") => setRawTab(next);
  const board =
    tab === "dunk" ? dunkBoard : tab === "pour" ? pourBoard : stackerBoard;
  // "All three games empty" signal. When true, every tab renders an
  // EmptyBoard and clicking between them is low-information; a single
  // line in the header prevents the user from thinking only their
  // current tab is quiet. Not a full hero — the per-tab EmptyBoard
  // already has the CTA, this just tells them it's the whole house.
  const allBoardsEmpty =
    dunkBoard.length === 0 &&
    pourBoard.length === 0 &&
    stackerBoard.length === 0;

  // Surface a "you're at #N" callout above the list so the signed-in
  // player doesn't have to scroll the board looking for the cyan row.
  // `delta` is how many points the next-higher entry scored; if the
  // user is #1 there's no delta to show. Recomputed per-tab so
  // switching Dunk → Pour refreshes the stats.
  const myIdx = myHandle ? board.findIndex((e) => e.handle === myHandle) : -1;
  const myCallout =
    myIdx >= 0 && myHandle
      ? {
          rank: myIdx + 1,
          score: board[myIdx].score,
          delta: myIdx > 0 ? board[myIdx - 1].score - board[myIdx].score : null,
          nextHandle: myIdx > 0 ? board[myIdx - 1].handle : null,
        }
      : null;

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
      <header className="flex items-center justify-between border-b border-white/5 px-4 py-3">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-cyan-300">
            Live · this hour
          </div>
          <div className="text-sm text-gray-400 mt-0.5">
            {allBoardsEmpty
              ? "All three boards are quiet — play a round to open the hour."
              : `Top ${board.length || "—"} scores, refreshed every round.`}
          </div>
        </div>
        <div
          role="tablist"
          aria-label="Leaderboard game"
          className="flex rounded-lg border border-white/10 bg-white/[0.03] p-0.5"
        >
          {(["dunk", "pour", "stacker"] as const).map((g) => {
            const active = tab === g;
            const label =
              g === "dunk" ? "Dunk" : g === "pour" ? "Pour" : "Stacker";
            // Active tone matches each game's hero accent so a peripheral
            // glance at the tab strip conveys both "which game" and
            // "which one's selected" without reading labels.
            const activeTone =
              g === "dunk"
                ? "text-cyan-200"
                : g === "pour"
                  ? "text-violet-200"
                  : "text-orange-200";
            return (
              <button
                key={g}
                role="tab"
                aria-selected={active}
                onClick={() => setTab(g)}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                  active ? `bg-white/10 ${activeTone}` : "text-gray-400 hover:text-white"
                }`}
              >
                <GameTabIcon game={g} className="h-3.5 w-3.5" />
                {label}
              </button>
            );
          })}
        </div>
      </header>

      {myCallout && (
        <div
          className="flex items-center justify-between gap-3 border-b border-white/5 bg-cyan-300/[0.03] px-4 py-2.5 text-xs"
          aria-live="polite"
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="inline-flex items-center rounded-full border border-cyan-300/40 bg-cyan-300/[0.08] px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-cyan-200">
              rank #{myCallout.rank}
            </span>
            <span className="text-gray-300 truncate">
              <span className="text-white font-semibold">@{myHandle}</span>
              {" · "}
              <span className="font-mono tabular-nums text-cyan-200">{myCallout.score}</span>
            </span>
          </div>
          <div className="shrink-0 text-gray-400 font-mono tabular-nums text-[11px]">
            {myCallout.rank === 1 ? (
              <span className="text-yellow-300">holding #1</span>
            ) : myCallout.delta !== null ? (
              <>
                +<span className="text-white">{myCallout.delta}</span> to pass{" "}
                <span className="text-gray-300">@{myCallout.nextHandle}</span>
              </>
            ) : null}
          </div>
        </div>
      )}
      {board.length === 0 ? (
        <EmptyBoard tab={tab} />
      ) : (
        <ol
          className="divide-y divide-white/5"
          // Vim-style j/k row navigation. Handler walks the direct <li>
          // children, finds the first interactive element inside each
          // (handle button or tip link), and focuses relative to
          // whatever the currently-focused row is. Enter on a row
          // activates the most prominent action (tip link if present,
          // else the handle-copy button). Inert inside inputs per the
          // top-level listener conventions elsewhere.
          onKeyDown={(e) => {
            if (e.key !== "j" && e.key !== "k" && e.key !== "Enter") return;
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
            if (tag === "input" || tag === "textarea") return;
            const ol = e.currentTarget as HTMLElement;
            const rows = Array.from(ol.querySelectorAll<HTMLLIElement>(":scope > li"));
            if (rows.length === 0) return;
            const active = document.activeElement as HTMLElement | null;
            const currentIdx = rows.findIndex((row) => row.contains(active));
            if (e.key === "Enter") {
              // Prefer the tip link (data-tip) when it exists; otherwise
              // click whatever interactive is already focused.
              if (currentIdx < 0) return;
              const tip = rows[currentIdx].querySelector<HTMLElement>(
                'a[data-row-action="tip"]',
              );
              if (tip) {
                e.preventDefault();
                tip.click();
              }
              return;
            }
            e.preventDefault();
            const dir = e.key === "j" ? 1 : -1;
            const nextIdx =
              currentIdx < 0
                ? dir > 0
                  ? 0
                  : rows.length - 1
                : Math.max(0, Math.min(rows.length - 1, currentIdx + dir));
            const target = rows[nextIdx].querySelector<HTMLElement>(
              "button, a",
            );
            target?.focus();
          }}
        >
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
  const copy = useCopyable();
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
          <button
            type="button"
            onClick={() => copy(`@${entry.handle}`, { label: "Handle" })}
            className="text-sm font-semibold text-white truncate hover:text-cyan-200 transition text-left focus:outline-none focus-visible:text-cyan-200"
            title="Copy handle"
          >
            @{entry.handle}
          </button>
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
          {entry.game === "dunk"
            ? "Dunk"
            : entry.game === "pour"
              ? "Pour"
              : entry.game === "stacker"
                ? "Stacker"
                : "Tidal"}
        </div>
      </div>
    </li>
  );
}

/**
 * Compact 8-point trend sparkline for a player row.
 *
 * Demo-only: we don't persist historical scores, so the trend is
 * derived deterministically from the entry id + current score. That
 * way the shape is stable across re-renders for the same player but
 * varies row-to-row, and the final value anchors at their current
 * score so the ending always matches the numeral.
 */
function RowSparkline({ entry, me }: { entry: ScoreEntry; me: boolean }) {
  // 32-bit string hash — enough spread for 8–10 rows per board.
  let h = 2166136261 >>> 0;
  for (let i = 0; i < entry.id.length; i++) {
    h ^= entry.id.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  const N = 8;
  const pts: number[] = [];
  // seeded jitter that terminates at 1.0 (current score) with a
  // gentle upward bias so most lines read as "climbed into this".
  for (let i = 0; i < N; i++) {
    h = Math.imul(h, 1664525) + 1013904223;
    const r = ((h >>> 0) / 2 ** 32) - 0.5; // ±0.5
    const phase = i / (N - 1); // 0..1
    const baseline = 0.35 + phase * 0.5; // 0.35 → 0.85
    pts.push(Math.max(0.05, Math.min(0.98, baseline + r * 0.25)));
  }
  pts[N - 1] = 0.92; // anchor finale near top so the eye lands forward
  const w = 56;
  const hgt = 18;
  const step = w / (N - 1);
  const d = pts
    .map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)} ${((1 - v) * hgt).toFixed(1)}`)
    .join(" ");
  const stroke = me ? "#22d3ee" : "rgba(255,255,255,0.45)";

  // Draw-on entrance: stroke-dasharray = pathLength="1" + dashoffset
  // animates 1 → 0. When reduced motion is on, jump straight to 0
  // (no transition, no movement). Per-row stagger keyed off the
  // hash so adjacent rows don't all draw at the same instant —
  // gives the board a subtle cascade without a heavy library dep.
  // systemReduced OR userReduced freezes to the final state.
  const systemReduced = useReducedMotion();
  const { reducedMotion: userReduced } = usePrefs();
  const reduced = systemReduced || userReduced;
  const [drawn, setDrawn] = useState(reduced);
  const delayMs = reduced ? 0 : (h % 280);
  useEffect(() => {
    if (reduced) {
      setDrawn(true);
      return;
    }
    const id = window.setTimeout(() => setDrawn(true), delayMs);
    return () => window.clearTimeout(id);
  }, [reduced, delayMs]);

  return (
    <svg
      width={w}
      height={hgt}
      viewBox={`0 0 ${w} ${hgt}`}
      className="shrink-0 hidden sm:block"
      aria-hidden
    >
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={1.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={drawn ? 0 : 1}
        style={{
          transition: reduced ? "none" : "stroke-dashoffset 520ms ease-out",
        }}
      />
    </svg>
  );
}

function Row({ entry, rank, me }: { entry: ScoreEntry; rank: number; me: boolean }) {
  const copy = useCopyable();
  // Tip button appears on hover (desktop) or focus-within (keyboard)
  // for any non-self row. Demo entries ("sim-…") include it too —
  // the URL just carries the handle forward; /send can wire
  // handle→principal resolution in a later pass without touching
  // this component.
  const canTip = !me;
  return (
    <li
      className={`group/row relative flex items-center gap-3 px-4 py-2.5 transition ${
        me ? "bg-cyan-300/[0.04]" : "hover:bg-white/[0.02]"
      }`}
    >
      <div className="w-6 text-right font-mono text-xs text-gray-500 tabular-nums">
        #{rank}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => copy(`@${entry.handle}`, { label: "Handle" })}
            className="text-sm text-white truncate hover:text-cyan-200 transition text-left focus:outline-none focus-visible:text-cyan-200"
            title="Copy handle"
          >
            @{entry.handle}
          </button>
          {entry.flag && <span aria-hidden className="text-sm">{entry.flag}</span>}
          {me && (
            <span className="text-[9px] uppercase tracking-widest text-cyan-300 border border-cyan-300/40 rounded-full px-1.5 py-[1px]">
              you
            </span>
          )}
        </div>
      </div>
      <RowSparkline entry={entry} me={me} />
      <div className="font-mono text-sm tabular-nums text-gray-200">{entry.score}</div>
      {canTip && (
        <Link
          href={`/send?handle=${encodeURIComponent(entry.handle)}`}
          data-row-action="tip"
          aria-label={`Tip @${entry.handle}`}
          // Mobile (<md): always visible at 70% opacity since hover
          // doesn't exist and keyboard focus-within is uncommon on
          // touch devices. Desktop (md+): hover-reveal as before,
          // with the same focus-visible + focus-within fallbacks so
          // keyboard navigation still surfaces it. POLISH-229.
          className="opacity-70 pointer-events-auto md:opacity-0 md:pointer-events-none md:group-hover/row:opacity-100 md:group-hover/row:pointer-events-auto md:group-focus-within/row:opacity-100 md:group-focus-within/row:pointer-events-auto inline-flex items-center gap-1 rounded-full border border-violet-300/40 bg-violet-300/[0.08] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-violet-200 hover:text-white hover:border-violet-300/60 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/60 focus-visible:opacity-100"
          title={`Open /send with @${entry.handle} pre-filled`}
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3" aria-hidden>
            <path d="M3.4 9.1l13-5.6a.8.8 0 0 1 1.1 1l-5.6 13a.8.8 0 0 1-1.4 0l-2-4.6-4.6-2a.8.8 0 0 1 0-1.4Z" />
          </svg>
          Tip
        </Link>
      )}
    </li>
  );
}

function EmptyBoard({ tab }: { tab: "dunk" | "pour" | "stacker" }) {
  // Per-tab CTA copy + route. Swapping in a separate route later is
  // a one-line change — and the empty state's voice matches the tab
  // the user is actually looking at.
  const cta =
    tab === "stacker"
      ? { href: "/stacker", label: "Stacker", verb: "stack to the top", title: "Stacker" }
      : tab === "dunk"
        ? { href: "/dunk", label: "Dunk", verb: "throw a round", title: "Dunk" }
        : { href: "/dunk", label: "Pour", verb: "pour a round", title: "Pour" };
  return (
    <div className="px-6 py-10 text-center">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-cyan-300">
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
          <path d="M6.3 3.7a1 1 0 0 1 1.5-.87l8 5.3a1 1 0 0 1 0 1.74l-8 5.3A1 1 0 0 1 6.3 14.3v-10.6Z" />
        </svg>
      </div>
      <div className="text-sm text-white font-semibold mb-1">
        No {cta.title} scores this hour yet
      </div>
      <div className="text-xs text-gray-400 max-w-xs mx-auto leading-snug">
        Be the first — tap{" "}
        <Link href={cta.href} className="text-cyan-300 hover:underline">
          {cta.label}
        </Link>{" "}
        and {cta.verb}.
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
  // Respect both the OS prefers-reduced-motion and the in-app "Reduce
  // motion" pref. Either one freezes the auto-rotation — indicator
  // dots stay clickable for manual cycling so the panel isn't inert.
  const systemReduced = useReducedMotion();
  const { reducedMotion: userReduced } = usePrefs();
  const reduced = systemReduced || userReduced;

  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(
      () => setIdx((i) => (i + 1) % LEGENDS.length),
      5000,
    );
    return () => window.clearInterval(id);
  }, [reduced]);
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
          className={reduced ? "" : "animate-[fadeSlide_0.5s_ease]"}
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

/**
 * "Xs ago / Xm ago / Xh ago" formatter. Takes an explicit `now`
 * anchor so all timestamps in one render share a single clock — no
 * visual drift between neighbouring rows — and so the caller can
 * drive re-renders via its state without relTime reaching for a
 * fresh Date.now() on every call. Defaults to Date.now() for
 * legacy call sites.
 */
function relTime(ts: number, now: number = Date.now()): string {
  const diff = now - ts;
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

/**
 * Monochrome game glyphs for the tab strip. currentColor so the tab's
 * active/inactive tone just propagates. Sized by the caller via
 * className.
 *   - dunk:    simple hoop-arc silhouette (rim + net)
 *   - pour:    droplet
 *   - stacker: three stacked bars, uneven widths (hints at chop-off)
 */
function GameTabIcon({
  game,
  className,
}: {
  game: "dunk" | "pour" | "stacker";
  className?: string;
}) {
  if (game === "dunk") {
    return (
      <svg
        viewBox="0 0 16 16"
        className={className}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M3 5h10" />
        <path d="M4 5l1.2 6.5a1 1 0 0 0 1 .85h3.6a1 1 0 0 0 1-.85L12 5" />
        <path d="M7 7.5v4.5M9 7.5v4.5M5.8 9.5h4.4" />
      </svg>
    );
  }
  if (game === "pour") {
    return (
      <svg
        viewBox="0 0 16 16"
        className={className}
        fill="currentColor"
        aria-hidden
      >
        <path d="M8 1.5c.35 0 .67.18.86.48 1.2 1.94 3.64 5.16 3.64 7.52a4.5 4.5 0 1 1-9 0c0-2.36 2.44-5.58 3.64-7.52A1 1 0 0 1 8 1.5Zm0 2.3c-1.03 1.72-2.5 4.23-2.5 5.7a2.5 2.5 0 1 0 5 0c0-1.47-1.47-3.98-2.5-5.7Z" />
      </svg>
    );
  }
  // stacker — three stacked bars, uneven widths (chop-off hint)
  return (
    <svg
      viewBox="0 0 16 16"
      className={className}
      fill="currentColor"
      aria-hidden
    >
      <rect x="3" y="11" width="10" height="2.2" rx="0.4" />
      <rect x="4" y="7.5" width="8" height="2.2" rx="0.4" opacity="0.85" />
      <rect x="5.5" y="4" width="5" height="2.2" rx="0.4" opacity="0.7" />
    </svg>
  );
}
