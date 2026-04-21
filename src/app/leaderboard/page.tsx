"use client";

/**
 * /leaderboard — live leaderboard from the game_scores canister.
 *
 * Reads two buckets per game:
 *   - All-time top 100
 *   - Today top 50 (resets at UTC midnight via lazy-clear in the canister)
 *
 * Writes happen elsewhere (StackerGame round-end → /stacker page →
 * game_scores.submit_score). This page is purely a read-and-render
 * surface so an 8s polling interval keeps it fresh without
 * hammering the replica.
 *
 * Multi-game ready: the canister exposes `games()` returning every
 * tag that has at least one submission. Today there's only "stacker"
 * but a future "dunk" or "stacker_v2" automatically appears as a
 * pickable tab — no frontend code change needed.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import { Pill } from "@/components/ui/Pill";
import { Button } from "@/components/ui/Button";
import { ROUTES } from "@/lib/routes";
import {
  getScoresActor,
  GAME_TAG_STACKER,
  type ScoreEntry,
  type GameOverview,
  type Period,
  type PrincipalStats,
} from "@/lib/ic/scores";
import { loadActiveIdentity } from "@/lib/ic/agent";
import { Principal } from "@dfinity/principal";

const POLL_MS = 8_000;

type PeriodKey = "alltime" | "today";

export default function LeaderboardPage() {
  const [game, setGame] = useState<string>(GAME_TAG_STACKER);
  const [period, setPeriod] = useState<PeriodKey>("alltime");
  const [games, setGames] = useState<GameOverview[]>([]);
  const [entries, setEntries] = useState<ScoreEntry[]>([]);
  const [stats, setStats] = useState<PrincipalStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [selfPrincipal, setSelfPrincipal] = useState<string | null>(null);

  // Active identity → highlight self in the table.
  useEffect(() => {
    const id = loadActiveIdentity();
    setSelfPrincipal(id?.getPrincipal().toText() ?? null);
    const onIdent = () => {
      const next = loadActiveIdentity();
      setSelfPrincipal(next?.getPrincipal().toText() ?? null);
    };
    window.addEventListener("lw-identity-changed", onIdent);
    return () => window.removeEventListener("lw-identity-changed", onIdent);
  }, []);

  const refresh = useCallback(async () => {
    setErr(null);
    try {
      const actor = await getScoresActor();
      const periodVariant: Period =
        period === "alltime" ? { AllTime: null } : { Today: null };
      const [t, g] = await Promise.all([
        actor.top(game, periodVariant, 50),
        actor.games(),
      ]);
      setEntries(t);
      setGames(g);
      // Self stats only when signed in.
      if (selfPrincipal) {
        try {
          const s = await actor.stats_for(
            game,
            Principal.fromText(selfPrincipal),
          );
          setStats(s[0] ?? null);
        } catch {
          setStats(null);
        }
      } else {
        setStats(null);
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [game, period, selfPrincipal]);

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, POLL_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  // Listen for the global lw-ledger-mutated event so a fresh round
  // (which fires that event after the burn) bumps the board without
  // waiting for the next poll tick.
  useEffect(() => {
    const handler = () => refresh();
    window.addEventListener("lw-ledger-mutated", handler);
    return () => window.removeEventListener("lw-ledger-mutated", handler);
  }, [refresh]);

  // Sort the games tab list with the active game first, then by
  // all-time count descending.
  const sortedGames = useMemo(() => {
    const arr = [...games];
    arr.sort((a, b) => {
      if (a.game === game) return -1;
      if (b.game === game) return 1;
      return b.all_time_count - a.all_time_count;
    });
    return arr;
  }, [games, game]);

  return (
    <>
      <AppHeader />
      <div className="min-h-screen bg-background text-white">
        <div className="mx-auto max-w-5xl px-4 md:px-8 py-8 md:py-12">
          <header className="mb-8">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs uppercase tracking-widest text-cyan-300">
                Leaderboard
              </span>
              <Pill status="live" size="xs" mono>
                live
              </Pill>
            </div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight">
              Top of the{" "}
              <span
                className="bg-clip-text text-transparent"
                style={{
                  backgroundImage:
                    "linear-gradient(90deg,#22d3ee,#fdba74 50%,#facc15)",
                }}
              >
                tower
              </span>
              .
            </h1>
            <p className="text-sm text-gray-400 mt-1 max-w-xl">
              Live read from the on-chain{" "}
              <code className="text-cyan-300">game_scores</code> canister.
              Real-mode rounds are recorded; practice rounds aren&apos;t.
              Polled every {POLL_MS / 1000}s, refreshed instantly when you
              finish a round in the same tab.
            </p>
          </header>

          {/* Game picker — only renders if more than one game has scores */}
          {sortedGames.length > 1 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {sortedGames.map((g) => (
                <button
                  key={g.game}
                  type="button"
                  onClick={() => setGame(g.game)}
                  className={`text-xs uppercase tracking-widest px-3 py-1.5 rounded-full border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60 ${
                    g.game === game
                      ? "border-cyan-300/60 bg-cyan-300/[0.10] text-cyan-100"
                      : "border-white/10 bg-white/[0.03] text-gray-300 hover:border-white/25 hover:text-white"
                  }`}
                >
                  {g.game}
                </button>
              ))}
            </div>
          )}

          {/* Period toggle */}
          <div className="mb-6 inline-flex rounded-xl border border-white/10 bg-black/30 p-1">
            <PeriodTab
              active={period === "alltime"}
              onClick={() => setPeriod("alltime")}
              label="All time"
            />
            <PeriodTab
              active={period === "today"}
              onClick={() => setPeriod("today")}
              label="Today (UTC)"
            />
          </div>

          <div className="grid gap-6 md:grid-cols-[1.4fr_1fr]">
            {/* Leaderboard table */}
            <section
              aria-label={`${game} ${period === "alltime" ? "all-time" : "today"} leaderboard`}
              className="rounded-2xl border border-white/10 bg-white/[0.02]"
            >
              <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
                <div className="text-[10px] uppercase tracking-widest text-cyan-300">
                  {game} · {period === "alltime" ? "all time" : "today"}
                </div>
                <div className="text-[10px] uppercase tracking-widest text-gray-500 font-mono">
                  {loading ? "loading…" : `${entries.length} entries`}
                </div>
              </div>
              {err ? (
                <div className="p-5 text-sm text-red-300">{err}</div>
              ) : entries.length === 0 ? (
                <EmptyState period={period} />
              ) : (
                <ol className="divide-y divide-white/5">
                  {entries.map((e, i) => {
                    const pt = e.principal.toText();
                    const isMe = pt === selfPrincipal;
                    return (
                      <ScoreRow
                        key={`${pt}-${e.ts_ns.toString()}`}
                        rank={i + 1}
                        entry={e}
                        isMe={isMe}
                      />
                    );
                  })}
                </ol>
              )}
            </section>

            {/* Side panel: your stats + game overview */}
            <aside className="space-y-4">
              <SelfStatsCard stats={stats} signedIn={!!selfPrincipal} />
              <OverviewCard games={games} activeGame={game} />
              <CtaCard />
            </aside>
          </div>
        </div>
      </div>
    </>
  );
}

// ----------------------------------------------------------------
// Subcomponents
// ----------------------------------------------------------------

function PeriodTab({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-widest transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60 ${
        active
          ? "bg-white/10 text-white border border-white/25"
          : "text-gray-400 hover:text-white border border-transparent"
      }`}
    >
      {label}
    </button>
  );
}

function ScoreRow({
  rank,
  entry,
  isMe,
}: {
  rank: number;
  entry: ScoreEntry;
  isMe: boolean;
}) {
  const principalText = entry.principal.toText();
  const short = `${principalText.slice(0, 6)}…${principalText.slice(-4)}`;
  return (
    <li
      className={`flex items-center gap-3 px-4 py-2.5 ${
        isMe ? "bg-cyan-300/[0.06]" : "hover:bg-white/[0.02]"
      } transition`}
    >
      <RankBadge rank={rank} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={`font-mono text-xs truncate ${
              isMe ? "text-cyan-200" : "text-gray-200"
            }`}
          >
            {short}
          </span>
          {isMe && (
            <span className="text-[9px] uppercase tracking-widest text-cyan-300 font-mono">
              you
            </span>
          )}
          {entry.streak > 0 && (
            <span className="text-[9px] uppercase tracking-widest text-yellow-300/80 font-mono">
              streak {entry.streak}
            </span>
          )}
        </div>
        <div className="text-[10px] text-gray-500 font-mono">
          {fmtRelative(entry.ts_ns)}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div
          className={`text-base font-mono tabular-nums font-bold ${
            isMe ? "text-cyan-100" : "text-white"
          }`}
        >
          {entry.score.toString()}
        </div>
        <div className="text-[10px] uppercase tracking-widest text-gray-500">
          pts
        </div>
      </div>
    </li>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const isPodium = rank <= 3;
  const cls = isPodium
    ? rank === 1
      ? "border-yellow-300/50 bg-yellow-300/[0.12] text-yellow-200"
      : rank === 2
        ? "border-gray-300/40 bg-gray-300/[0.10] text-gray-100"
        : "border-orange-400/40 bg-orange-400/[0.10] text-orange-200"
    : "border-white/10 bg-white/[0.03] text-gray-400";
  return (
    <span
      className={`shrink-0 w-8 h-8 rounded-md border flex items-center justify-center text-xs font-mono tabular-nums font-bold ${cls}`}
    >
      {rank}
    </span>
  );
}

function EmptyState({ period }: { period: PeriodKey }) {
  return (
    <div className="px-6 py-10 text-center">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-cyan-300">
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
          <path d="M6.3 3.7a1 1 0 0 1 1.5-.87l8 5.3a1 1 0 0 1 0 1.74l-8 5.3A1 1 0 0 1 6.3 14.3v-10.6Z" />
        </svg>
      </div>
      <div className="text-sm text-white font-semibold mb-1">
        {period === "today"
          ? "No scores today yet"
          : "No scores recorded yet"}
      </div>
      <div className="text-xs text-gray-400 max-w-xs mx-auto leading-snug">
        Be first — head to{" "}
        <Link
          href={ROUTES.stacker}
          className="text-cyan-300 underline underline-offset-2 hover:text-cyan-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60 rounded-sm"
        >
          /stacker
        </Link>{" "}
        and play a Real-mode round.
      </div>
    </div>
  );
}

function SelfStatsCard({
  stats,
  signedIn,
}: {
  stats: PrincipalStats | null;
  signedIn: boolean;
}) {
  return (
    <section className="rounded-2xl border border-cyan-300/30 bg-cyan-300/[0.04] p-5">
      <div className="text-[10px] uppercase tracking-widest text-cyan-300 mb-3">
        Your stats
      </div>
      {!signedIn ? (
        <div className="text-sm text-gray-300 leading-snug">
          Sign in via{" "}
          <Link
            href={ROUTES.icrc}
            className="text-cyan-300 underline underline-offset-2 hover:text-cyan-200"
          >
            /icrc
          </Link>{" "}
          to track your runs and see your rank highlighted.
        </div>
      ) : !stats ? (
        <div className="text-sm text-gray-400 leading-snug">
          No runs recorded for this game yet. Real-mode rounds count;
          practice doesn&apos;t.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Best score" value={stats.best_score.toString()} />
          <Stat label="Total runs" value={stats.total_runs.toString()} />
          <Stat label="Avg score" value={stats.avg_score.toString()} />
          <Stat label="Last run" value={fmtRelative(stats.last_ts_ns)} />
        </div>
      )}
    </section>
  );
}

function OverviewCard({
  games,
  activeGame,
}: {
  games: GameOverview[];
  activeGame: string;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
      <div className="text-[10px] uppercase tracking-widest text-gray-400 mb-3">
        Games on this canister
      </div>
      {games.length === 0 ? (
        <div className="text-sm text-gray-500">No games registered yet.</div>
      ) : (
        <ul className="space-y-2">
          {games.map((g) => (
            <li
              key={g.game}
              className={`rounded-lg border px-3 py-2 ${
                g.game === activeGame
                  ? "border-cyan-300/40 bg-cyan-300/[0.04]"
                  : "border-white/10 bg-white/[0.02]"
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-sm font-semibold text-white">
                  {g.game}
                </span>
                <span className="text-[10px] uppercase tracking-widest text-gray-500 font-mono">
                  {g.all_time_count} all · {g.today_count} today
                </span>
              </div>
              <div className="text-[11px] text-gray-400 font-mono tabular-nums">
                top: {g.top_alltime_score.toString()} pts
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CtaCard() {
  return (
    <section className="rounded-2xl border border-orange-300/30 bg-gradient-to-br from-orange-300/[0.06] to-yellow-300/[0.04] p-5">
      <div className="text-[10px] uppercase tracking-widest text-orange-300 mb-2">
        Get on the board
      </div>
      <p className="text-sm text-gray-300 leading-snug mb-3">
        Real-mode Stacker rounds post here automatically. Burn 1 LWP,
        play, your score lands on the leaderboard the moment the round
        ends.
      </p>
      <Link href={ROUTES.stacker}>
        <Button tone="orange" size="sm" fullWidth>
          Play Stacker
        </Button>
      </Link>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-0.5">
        {label}
      </div>
      <div className="text-sm font-mono tabular-nums text-white">{value}</div>
    </div>
  );
}

function fmtRelative(ts_ns: bigint): string {
  const ms = Number(ts_ns / 1_000_000n);
  const delta = Date.now() - ms;
  if (delta < 60_000) return "just now";
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
  return `${Math.floor(delta / 86_400_000)}d ago`;
}
