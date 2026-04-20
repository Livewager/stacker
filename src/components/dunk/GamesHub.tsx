"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

/* ---------------- Shared clock — one interval for the whole hub ---------------- */
const clockSubs = new Set<(now: number) => void>();
let clockId: ReturnType<typeof setInterval> | null = null;
let clockVisListenerAttached = false;

const fireSubs = () => {
  const now = Date.now();
  clockSubs.forEach((fn) => fn(now));
};

const startClock = () => {
  if (clockId) return;
  clockId = setInterval(fireSubs, 250);
};
const stopClock = () => {
  if (!clockId) return;
  clearInterval(clockId);
  clockId = null;
};

const onVisibility = () => {
  if (typeof document === "undefined") return;
  if (document.visibilityState === "hidden") {
    stopClock();
  } else {
    // Catch up UI instantly, then resume steady ticking
    fireSubs();
    if (clockSubs.size > 0) startClock();
  }
};

const ensureClock = () => {
  if (typeof window === "undefined") return;
  if (!clockVisListenerAttached) {
    document.addEventListener("visibilitychange", onVisibility);
    clockVisListenerAttached = true;
  }
  if (typeof document !== "undefined" && document.visibilityState === "hidden") {
    // Tab is hidden — don't start an interval; we'll start on visibility return
    return;
  }
  startClock();
};

/**
 * Shared ticker. Every consumer samples the same clock from a single interval.
 * intervalMs lets each consumer downsample (so a 5s-interval component only
 * setState's once every 5s even though the shared interval fires 4x/sec).
 */
const useNow = (intervalMs = 1000) => {
  const [now, setNow] = useState(() => (typeof window === "undefined" ? 0 : Date.now()));
  const lastRef = useRef(0);
  useEffect(() => {
    const fn = (t: number) => {
      if (t - lastRef.current >= intervalMs) {
        lastRef.current = t;
        setNow(t);
      }
    };
    ensureClock();
    clockSubs.add(fn);
    // Seed immediately
    fn(Date.now());
    return () => {
      clockSubs.delete(fn);
      if (clockSubs.size === 0) stopClock();
    };
  }, [intervalMs]);
  return now;
};
import { SteadyPour } from "./SteadyPour";
// Note: TryGame + TidalTrace modules still exist for future re-enable; import when needed.
import {
  getAllTimeBest,
  getHourBoard,
  getHourRoundCount,
  getMyHourStats,
  getPlayerFlag,
  getPlayerHandle,
  getPlayerSinceTs,
  getWeekStats,
  pickRandomFlag,
  setPlayerFlag,
  setPlayerHandle,
  useScoreboardVersion,
} from "./scoreboard";
import { ENTRY_USD, useWallet } from "./wallet";

const CYAN = "#22d3ee";
const GOLD = "#facc15";

type GameId = "dunk" | "pour" | "tidal";

const GAMES: { id: GameId; name: string; tag: string; desc: string; color: string; icon: string }[] = [
  {
    id: "pour",
    name: "Steady Pour",
    tag: "Tilt skill · 20s",
    desc: "Tilt your phone to pour. Hold on the line, don't spill. 20 seconds, same seed for everyone.",
    color: CYAN,
    icon: "drop",
  },
];

const IconGlyph = ({ name, className }: { name: string; className?: string }) => {
  switch (name) {
    case "target":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="5.5" />
          <circle cx="12" cy="12" r="2" fill="currentColor" />
        </svg>
      );
    case "drop":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden>
          <path d="M12 3c2.5 3 6 7.5 6 11a6 6 0 11-12 0c0-3.5 3.5-8 6-11z" />
        </svg>
      );
    case "wave":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden>
          <path d="M3 14c2 0 3-3 5-3s3 3 5 3 3-3 5-3 3 3 3 3" />
          <path d="M3 9c2 0 3-3 5-3s3 3 5 3 3-3 5-3 3 3 3 3" opacity="0.4" />
        </svg>
      );
    default:
      return null;
  }
};

/* -------------------- Progressive jackpot header -------------------- */

const Jackpot = () => {
  const reduceMotion = useReducedMotion();
  const now = useNow(500); // 500ms resolution for jitter + countdown

  // Pot values derive from round activity. Re-read on each clock tick so
  // the numbers stay in sync with the simulated hour competitors.
  const HOURLY_BASE = 120; // carryover floor so the pot isn't $0 at :00:05
  const WEEKLY_BASE = 4200; // Monday-morning starting pot
  // Assume ~6,500 rounds/day site-wide at steady state → 10% of $3 × 6500 = $1,950/day into weekly
  const WEEKLY_DAILY_CONTRIB = 1950;

  const hourRoundCount = getHourRoundCount(now);
  const hourlyDerived = HOURLY_BASE + Math.round(hourRoundCount * 0.3 * 100) / 100;

  // Days into the week (Sun-start) + fractional current-day progress
  const nowForWeek = new Date(now || Date.now());
  const startOfWeek = new Date(
    Date.UTC(nowForWeek.getUTCFullYear(), nowForWeek.getUTCMonth(), nowForWeek.getUTCDate() - nowForWeek.getUTCDay()),
  );
  const daysElapsed = (now - startOfWeek.getTime()) / (24 * 60 * 60 * 1000);
  const weeklyDerived = Math.round(WEEKLY_BASE + daysElapsed * WEEKLY_DAILY_CONTRIB);

  // Smooth jitter: bump the displayed numbers up toward target in small steps
  // so the UI still feels alive instead of snapping to exact values.
  const [hourly, setHourly] = useState(() => Math.max(HOURLY_BASE, hourlyDerived));
  const [weekly, setWeekly] = useState(() => Math.max(WEEKLY_BASE, weeklyDerived));
  const lastBumpRef = useRef(0);
  useEffect(() => {
    if (reduceMotion) {
      setHourly(hourlyDerived);
      setWeekly(weeklyDerived);
      return;
    }
    if (now - lastBumpRef.current < 900) return;
    lastBumpRef.current = now;
    setHourly((v) => {
      if (v >= hourlyDerived) return v; // don't tick backward mid-hour
      return Math.min(hourlyDerived, v + Math.max(1, Math.floor((hourlyDerived - v) * 0.12)));
    });
    setWeekly((v) => {
      if (v >= weeklyDerived) return v;
      return Math.min(weeklyDerived, v + Math.max(2, Math.floor((weeklyDerived - v) * 0.08)));
    });
  }, [now, hourlyDerived, weeklyDerived, reduceMotion]);

  // Derived countdowns — pure function of `now`
  const nowDate = new Date(now || Date.now());
  const nextHour = new Date(nowDate);
  nextHour.setHours(nowDate.getHours() + 1, 0, 0, 0);
  const hourMs = nextHour.getTime() - nowDate.getTime();

  const endOfWeekUTC = new Date(
    Date.UTC(
      nowDate.getUTCFullYear(),
      nowDate.getUTCMonth(),
      nowDate.getUTCDate() + (7 - nowDate.getUTCDay()),
      23,
      59,
      59,
      999,
    ),
  );
  const weekMs = endOfWeekUTC.getTime() - nowDate.getTime();

  const hMins = Math.floor(hourMs / 60000);
  const hSecs = Math.floor((hourMs % 60000) / 1000);

  const wDays = Math.floor(weekMs / (24 * 60 * 60 * 1000));
  const wHours = Math.floor((weekMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const wMins = Math.floor((weekMs % (60 * 60 * 1000)) / 60000);

  const Pot = ({
    label,
    value,
    accent,
    countdown,
    cd_label,
    sub,
  }: {
    label: string;
    value: number;
    accent: string;
    countdown: string;
    cd_label: string;
    sub: string;
  }) => (
    <div
      className="relative rounded-2xl p-4 md:p-5 border overflow-hidden min-w-0 h-full flex flex-col"
      style={{
        background: `linear-gradient(135deg, ${accent}14, rgba(10,14,24,0.6) 80%)`,
        borderColor: `${accent}40`,
      }}
    >
      <div className="flex items-center gap-1.5 mb-2 min-w-0">
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-70" style={{ background: accent }} />
          <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: accent }} />
        </span>
        <span className="text-[10px] uppercase tracking-widest truncate" style={{ color: accent }}>
          {label}
        </span>
      </div>
      <div className="text-[10px] font-mono text-gray-400 mb-2 line-clamp-1">{sub}</div>
      <div className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight text-white tabular-nums leading-none">
        <span className="inline-block">${value.toLocaleString()}</span>
      </div>
      <div className="mt-auto pt-3 border-t border-white/5 flex items-center justify-between text-xs text-gray-400 gap-2">
        <span className="truncate">{cd_label}</span>
        <span className="font-mono text-white tabular-nums shrink-0">{countdown}</span>
      </div>
    </div>
  );

  return (
    <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-gradient-to-br from-[#0e1424] via-[#0a0e18] to-[#090d16] p-4 md:p-5">
      <div
        className="absolute inset-0 pointer-events-none opacity-60"
        style={{
          backgroundImage: `radial-gradient(circle at 20% 0%, ${CYAN}1a, transparent 50%), radial-gradient(circle at 80% 100%, ${GOLD}14, transparent 50%), radial-gradient(circle at 50% 100%, #f472b614, transparent 45%)`,
        }}
      />
      <div className="relative grid grid-cols-2 gap-2.5 md:gap-4">
        <Pot
          label="Hourly pot"
          value={hourly}
          accent={CYAN}
          countdown={`${String(hMins).padStart(2, "0")}:${String(hSecs).padStart(2, "0")}`}
          cd_label="Drop in"
          sub="Top score this hour wins"
        />
        <Pot
          label="Weekly progressive"
          value={weekly}
          accent="#f472b6"
          countdown={wDays > 0 ? `${wDays}d ${wHours}h ${wMins}m` : `${wHours}h ${wMins}m`}
          cd_label="Resets in"
          sub="Best score of the week wins"
        />
      </div>
      <div className="relative mt-4 flex items-center justify-between text-xs text-gray-400 gap-3 flex-wrap">
        <span className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: CYAN }} />
          <span className="tabular-nums">{(800 + hourRoundCount * 6).toLocaleString()}</span> online now
        </span>
        <div className="flex items-center gap-3 flex-wrap">
          <WalletPill />
          <span className="font-mono hidden sm:inline">20% of every ${ENTRY_USD} → pots</span>
        </div>
      </div>
    </div>
  );
};

const WalletPill = () => {
  const { balance } = useWallet();
  const rounds = Math.floor(balance / ENTRY_USD);
  const low = balance < ENTRY_USD;
  return (
    <a
      href="#games"
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60"
      style={{
        background: low ? "rgba(239,68,68,0.12)" : "rgba(34,211,238,0.10)",
        borderColor: low ? "rgba(239,68,68,0.35)" : "rgba(34,211,238,0.30)",
      }}
      title={low ? "Out of credits — top up" : `${rounds} rounds left`}
    >
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden style={{ color: low ? "#f87171" : CYAN }}>
        <rect x="3" y="6" width="18" height="13" rx="2" />
        <path d="M16 13h2" />
      </svg>
      <span className="text-[11px] font-mono tabular-nums" style={{ color: low ? "#fca5a5" : "white" }}>
        ${balance.toFixed(2)}
      </span>
      {low ? (
        <span className="text-[10px] uppercase tracking-widest font-mono" style={{ color: "#fca5a5" }}>
          Top up
        </span>
      ) : (
        <span className="text-[10px] uppercase tracking-widest font-mono text-gray-400">{rounds} rds</span>
      )}
    </a>
  );
};

/* -------------------- Hourly leaderboard -------------------- */


const ONBOARD_KEY = "livewager-dunk-onboarded";

const HandleEditor = () => {
  const [handle, setHandle] = useState("");
  const [flag, setFlag] = useState("🏁");
  const [editing, setEditing] = useState(false);
  const [isEmpty, setIsEmpty] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const h = getPlayerHandle() || "";
    setHandle(h);
    setFlag(getPlayerFlag());
    setIsEmpty(!h);
  }, []);

  const save = () => {
    const clean = handle.trim().replace(/[^a-zA-Z0-9_]/g, "").slice(0, 20);
    const finalHandle = clean || `guest_${Math.random().toString(36).slice(2, 7)}`;
    setPlayerHandle(finalHandle);
    setHandle(finalHandle);
    setIsEmpty(false);
    setEditing(false);
  };

  const beginEdit = () => {
    setEditing(true);
    // Pre-fill with blank if still showing guest_X autogen (never persisted by user)
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <div className="flex items-center gap-2 min-w-0">
      <button
        onClick={() => setPlayerFlag(pickRandomFlag())}
        title="Shuffle flag"
        className="text-lg shrink-0 hover:scale-110 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60 rounded"
        aria-label="Shuffle country flag"
      >
        {flag}
      </button>
      {editing ? (
        <input
          ref={inputRef}
          autoFocus
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => e.key === "Enter" && save()}
          placeholder="your_handle"
          className="bg-black/40 border rounded px-2 py-1 text-sm font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-300/60 w-32"
          style={{
            borderColor: isEmpty ? "rgba(250,204,21,0.6)" : "rgba(255,255,255,0.15)",
            boxShadow: isEmpty ? "0 0 12px rgba(250,204,21,0.25)" : undefined,
          }}
          maxLength={20}
        />
      ) : isEmpty ? (
        <button
          onClick={beginEdit}
          className="px-2.5 py-1 rounded-md text-xs font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-300/70"
          style={{
            background: "rgba(250,204,21,0.18)",
            color: "#facc15",
            border: "1px solid rgba(250,204,21,0.45)",
          }}
        >
          + Pick your handle
        </button>
      ) : (
        <>
          <button
            onClick={beginEdit}
            className="font-semibold text-white text-sm truncate hover:text-yellow-300 transition"
          >
            @{handle}
          </button>
          <TenureBadge handle={handle} />
        </>
      )}
    </div>
  );
};

const TenureBadge = ({ handle }: { handle: string }) => {
  useScoreboardVersion();
  const since = getPlayerSinceTs(handle);
  if (!since) return null;
  const days = Math.floor((Date.now() - since) / (24 * 60 * 60 * 1000));
  const label =
    days < 1
      ? "since today"
      : days < 7
        ? `since ${days}d ago`
        : days < 60
          ? `since ${Math.floor(days / 7)}w ago`
          : `since ${Math.floor(days / 30)}mo ago`;
  return (
    <span
      className="text-[9px] uppercase tracking-widest text-gray-500 font-mono truncate"
      title={`First pour: ${new Date(since).toLocaleString()}`}
    >
      {label}
    </span>
  );
};

const WelcomeCallout = () => {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!localStorage.getItem(ONBOARD_KEY)) setVisible(true);
  }, []);
  const dismiss = () => {
    if (typeof window !== "undefined") localStorage.setItem(ONBOARD_KEY, "1");
    setVisible(false);
  };
  if (!visible) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="relative rounded-2xl p-4 mb-3"
      style={{
        background: `linear-gradient(90deg, ${CYAN}14, ${GOLD}10, transparent)`,
        border: `1px solid ${CYAN}40`,
      }}
      role="status"
    >
      <button
        onClick={dismiss}
        aria-label="Dismiss welcome"
        className="absolute top-1.5 right-1.5 w-9 h-9 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition flex items-center justify-center"
      >
        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M6 18L18 6" />
        </svg>
      </button>
      <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: CYAN }}>
        Welcome
      </div>
      <div className="text-sm text-gray-200 leading-snug pr-6">
        We&apos;ve loaded <span className="text-white font-semibold">$15</span> in your wallet — 5 free rounds to
        try Steady Pour. Pick a handle and a flag so the broadcast knows who dropped the talent.
      </div>
    </motion.div>
  );
};

const HourEndingNotice = () => {
  useScoreboardVersion();
  const now = useNow(5000);

  const nextHour = new Date(now);
  nextHour.setHours(new Date(now).getHours() + 1, 0, 0, 0);
  const msLeft = nextHour.getTime() - now;
  const secsLeft = Math.floor(msLeft / 1000);
  const mins = Math.floor(secsLeft / 60);

  // Only within last 5 min of the hour
  if (secsLeft > 300 || secsLeft <= 0) return null;

  // And only if the player has posted a pour score this hour (they care)
  const me = getPlayerHandle();
  if (!me) return null;
  const stats = getMyHourStats("pour", me, now);
  if (stats.rounds < 1) return null;

  // Are they on the board? If yes, what rank?
  const board = getHourBoard(now);
  const rank = board.findIndex((r) => r.game === "pour" && r.handle === me) + 1;
  const top = board[0];
  const topIsMe = rank === 1;
  const pointsBehind = !topIsMe && top ? Math.max(0, top.score - stats.best + 1) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-4 px-4 py-2.5 rounded-xl border flex flex-wrap items-center justify-between gap-2"
      style={{
        background: "linear-gradient(90deg, rgba(250,204,21,0.12), rgba(251,146,60,0.04))",
        borderColor: "rgba(250,204,21,0.38)",
      }}
      role="status"
    >
      <div className="flex items-center gap-2 text-sm text-yellow-200">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: "#facc15" }} />
          <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: "#facc15" }} />
        </span>
        <span className="font-mono font-bold">
          {mins >= 1 ? `${mins}m ${secsLeft % 60}s` : `${secsLeft}s`}
        </span>
        <span className="text-yellow-100/90">left on the hour</span>
      </div>
      <div className="text-xs text-yellow-200/80">
        {topIsMe ? (
          <>Hold your #1 spot — the DROP is yours at :00</>
        ) : pointsBehind > 0 ? (
          <>
            <span className="font-mono">+{pointsBehind.toLocaleString()}</span> to overtake #1
          </>
        ) : (
          <>Land one clean pour to make the board</>
        )}
      </div>
    </motion.div>
  );
};

const YourStats = () => {
  useScoreboardVersion();
  const { rounds: walletRounds } = useWallet();
  const me = getPlayerHandle();
  const best = me ? getAllTimeBest("pour", me) : 0;
  const week = me ? getWeekStats("pour", me, ENTRY_USD) : { rounds: 0, spend: 0, best: 0 };

  // Hide until the player has any real activity
  if (walletRounds < 1 && best === 0) return null;

  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 md:p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-widest text-gray-400">Your stats</div>
      </div>

      {/* This week */}
      <div>
        <div className="text-[10px] uppercase tracking-widest text-cyan-300 mb-1.5">This week</div>
        <div className="grid grid-cols-3 gap-2">
          <div className="px-2 py-1.5 rounded-lg bg-white/[0.03] border border-white/10">
            <div className="text-[9px] uppercase tracking-widest text-gray-500">Best pour</div>
            <div className="text-sm font-mono font-bold text-white tabular-nums">
              {week.best.toLocaleString()}
            </div>
          </div>
          <div className="px-2 py-1.5 rounded-lg bg-white/[0.03] border border-white/10">
            <div className="text-[9px] uppercase tracking-widest text-gray-500">Rounds</div>
            <div className="text-sm font-mono font-bold text-white tabular-nums">{week.rounds}</div>
          </div>
          <div className="px-2 py-1.5 rounded-lg bg-white/[0.03] border border-white/10">
            <div className="text-[9px] uppercase tracking-widest text-gray-500">Spend</div>
            <div className="text-sm font-mono font-bold text-white tabular-nums">${week.spend.toFixed(2)}</div>
          </div>
        </div>
      </div>

      {/* All time */}
      <div>
        <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1.5">All time</div>
        <div className="grid grid-cols-2 gap-2">
          <div className="px-2 py-1.5 rounded-lg bg-white/[0.03] border border-white/10">
            <div className="text-[9px] uppercase tracking-widest text-gray-500">Best pour</div>
            <div className="text-sm font-mono font-bold text-white tabular-nums">{best.toLocaleString()}</div>
          </div>
          <div className="px-2 py-1.5 rounded-lg bg-white/[0.03] border border-white/10">
            <div className="text-[9px] uppercase tracking-widest text-gray-500">Rounds</div>
            <div className="text-sm font-mono font-bold text-white tabular-nums">{walletRounds}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

const HourBoard = () => {
  useScoreboardVersion(); // re-render on score posts
  // getHourBoard already merges real + simulated competitors (T101)
  const merged = getHourBoard()
    .map((e) => ({ h: e.handle, g: e.game, s: e.score, flag: e.flag }))
    .slice(0, 8);
  const myHandle = getPlayerHandle();
  const myStats = getMyHourStats("pour", myHandle);
  const topScore = merged[0]?.s ?? 0;
  const pointsToBeat = Math.max(0, topScore - myStats.best + 1);
  const myRank = merged.findIndex((r) => r.h === myHandle) + 1; // 1-based; 0 if not found

  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 md:p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-gray-400">Top of the hour</div>
          <div className="text-sm text-gray-300 mt-0.5">#1 gets to drop</div>
        </div>
        <span className="flex items-center gap-1.5 text-[10px] font-mono text-gray-500">
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: GOLD }} />
          LIVE
        </span>
      </div>
      <div className="mb-3 pb-3 border-b border-white/5">
        <HandleEditor />
      </div>

      {myHandle && (myStats.rounds > 0 || myRank > 0) && (
        <div className="grid grid-cols-3 gap-2 mb-3 pb-3 border-b border-white/5">
          <div className="px-2 py-1.5 rounded-lg bg-white/[0.03] border border-white/10">
            <div className="text-[9px] uppercase tracking-widest text-gray-500">Your best</div>
            <div className="text-sm font-mono font-bold text-white tabular-nums">
              {myStats.best.toLocaleString()}
            </div>
          </div>
          <div className="px-2 py-1.5 rounded-lg bg-white/[0.03] border border-white/10">
            <div className="text-[9px] uppercase tracking-widest text-gray-500">Rounds</div>
            <div className="text-sm font-mono font-bold text-white tabular-nums">{myStats.rounds}</div>
          </div>
          <div
            className="px-2 py-1.5 rounded-lg border"
            style={
              myRank === 1
                ? { background: `${GOLD}1a`, borderColor: `${GOLD}50` }
                : { background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.1)" }
            }
          >
            <div className="text-[9px] uppercase tracking-widest text-gray-500">
              {myRank === 1 ? "Rank" : "To beat #1"}
            </div>
            <div
              className="text-sm font-mono font-bold tabular-nums"
              style={{ color: myRank === 1 ? GOLD : "white" }}
            >
              {myRank === 1 ? "#1" : `+${pointsToBeat.toLocaleString()}`}
            </div>
          </div>
        </div>
      )}

      <ol className="space-y-1.5">
        {merged.map((row, i) => {
          const isMe = row.h === myHandle;
          return (
            <li
              key={`${row.h}-${row.g}-${i}`}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg transition ${
                i === 0
                  ? "bg-gradient-to-r from-yellow-500/10 via-transparent to-transparent"
                  : isMe
                    ? "bg-white/[0.04]"
                    : "hover:bg-white/[0.03]"
              }`}
              style={isMe ? { boxShadow: `inset 0 0 0 1px ${GOLD}33` } : undefined}
            >
              <span className="font-mono text-xs text-gray-500 w-6">#{i + 1}</span>
              <span className="text-lg">{row.flag}</span>
              <span className="font-semibold text-white text-sm truncate flex-1 min-w-0">
                @{row.h}
                {isMe && <span className="ml-1.5 text-[9px] font-mono text-yellow-300">YOU</span>}
              </span>
              <span className="font-mono text-white text-sm tabular-nums w-16 text-right">
                {row.s.toLocaleString()}
              </span>
              {i === 0 && (
                <span
                  className="text-[10px] px-2 py-0.5 rounded font-bold"
                  style={{ background: `${GOLD}22`, color: GOLD }}
                >
                  CAN DROP
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
};

/* -------------------- Game picker tabs -------------------- */

const GamePicker = ({ active, onSelect }: { active: GameId; onSelect: (id: GameId) => void }) => {
  return (
    <div role="tablist" aria-label="Choose a game" className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {GAMES.map((g) => {
        const isActive = g.id === active;
        return (
          <button
            key={g.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(g.id)}
            className="relative group text-left p-4 rounded-2xl border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60"
            style={{
              background: isActive ? `linear-gradient(135deg, ${g.color}1a, transparent 70%)` : "rgba(255,255,255,0.03)",
              borderColor: isActive ? `${g.color}80` : "rgba(255,255,255,0.1)",
              boxShadow: isActive ? `0 20px 40px -25px ${g.color}66, inset 0 0 0 1px ${g.color}22` : undefined,
            }}
          >
            <div className="flex items-center gap-3 mb-2">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  background: `${g.color}18`,
                  color: g.color,
                  border: `1px solid ${g.color}33`,
                }}
              >
                <IconGlyph name={g.icon} className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="font-bold text-white text-base leading-tight truncate">{g.name}</div>
                <div className="text-[10px] uppercase tracking-widest" style={{ color: g.color }}>
                  {g.tag}
                </div>
              </div>
            </div>
            <div className="text-xs text-gray-400 leading-snug">{g.desc}</div>
            {isActive && (
              <motion.div
                layoutId="activeGameDot"
                className="absolute top-3 right-3 w-2 h-2 rounded-full"
                style={{ background: g.color, boxShadow: `0 0 12px ${g.color}` }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
};

/* -------------------- Waiting room (synchronized round window) -------------------- */

const QUEUE_POOL: { h: string; flag: string }[] = [
  { h: "tiltgod", flag: "🇺🇸" },
  { h: "steady_hands", flag: "🇯🇵" },
  { h: "wavepainter", flag: "🇨🇦" },
  { h: "ltcmaxi", flag: "🇨🇦" },
  { h: "she_dropped", flag: "🇳🇱" },
  { h: "whale_lord", flag: "🇯🇵" },
  { h: "paintking", flag: "🇩🇪" },
  { h: "notmissing", flag: "🇬🇧" },
  { h: "laservision", flag: "🇦🇺" },
  { h: "cryptocowboy", flag: "🇲🇽" },
  { h: "basedhunter", flag: "🇰🇷" },
  { h: "firststreamer", flag: "🇫🇷" },
  { h: "roastbeef", flag: "🇧🇷" },
  { h: "sipgod", flag: "🇸🇬" },
  { h: "calmwater", flag: "🇦🇪" },
];

const ROUND_MS_CONST = 20_000;

const WaitingRoom = () => {
  const now = useNow(250);
  const [offset, setOffset] = useState(0);
  const reduceMotion = useReducedMotion();
  const me = getPlayerHandle();

  useEffect(() => {
    if (reduceMotion) return;
    const id = setInterval(() => setOffset((o) => (o + 1) % QUEUE_POOL.length), 3000);
    return () => clearInterval(id);
  }, [reduceMotion]);

  // Wall-clock synchronized round boundary
  const roundStart = Math.floor(now / ROUND_MS_CONST) * ROUND_MS_CONST;
  const roundEnd = roundStart + ROUND_MS_CONST;
  const msLeft = Math.max(0, roundEnd - now);
  const secsLeft = Math.ceil(msLeft / 1000);
  const pct = Math.max(0, Math.min(100, (1 - msLeft / ROUND_MS_CONST) * 100));
  const roundId = roundStart / ROUND_MS_CONST;
  const seedBase36 = roundId.toString(36).toUpperCase();
  const nextUp = secsLeft <= 3;

  // Rotate the visible avatars through the pool
  const visible = Array.from({ length: 12 }).map(
    (_, i) => QUEUE_POOL[(offset + i) % QUEUE_POOL.length],
  );

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:p-5 h-full">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] uppercase tracking-widest text-gray-400">Waiting room</div>
        <div className="flex items-center gap-1.5 text-[10px] font-mono text-gray-500">
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: CYAN }} />
          SEED {seedBase36}
        </div>
      </div>

      <div className="flex -space-x-2 mb-3 flex-wrap gap-y-2">
        {visible.map((p, i) => (
          <div
            key={`${p.h}-${i}-${offset}`}
            className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm transition ${
              me === p.h ? "border-yellow-300" : "border-[#0a0e18]"
            } bg-white/10`}
            title={`@${p.h}`}
          >
            {p.flag}
          </div>
        ))}
        <div className="w-8 h-8 rounded-full bg-white/10 border-2 border-[#0a0e18] flex items-center justify-center text-[10px] font-mono text-gray-300">
          +{112 + (offset % 9)}
        </div>
      </div>

      {/* Round progress bar */}
      <div className="relative h-1.5 rounded-full bg-white/5 overflow-hidden mb-2">
        <div
          className="absolute inset-y-0 left-0"
          style={{
            width: `${pct}%`,
            background: nextUp
              ? "linear-gradient(90deg, #facc15, #fb923c)"
              : `linear-gradient(90deg, ${CYAN}, #0891b2)`,
            transition: "width 0.25s linear, background 0.3s ease",
          }}
        />
      </div>

      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-400">
          <span className="text-white font-mono tabular-nums">
            {Math.max(72, Math.round(getHourRoundCount(now) / 2) + 60 + (offset % 9))}
          </span>{" "}
          playing now
        </span>
        <span className={nextUp ? "text-yellow-300 font-bold font-mono" : "text-gray-400 font-mono"}>
          {nextUp ? `Next round · ${secsLeft}s` : `Round ends · ${secsLeft}s`}
        </span>
      </div>
    </div>
  );
};

/* -------------------- DROP overlay (last 2 min of hour when #1) -------------------- */

const DropOverlay = ({ force = false, onClose }: { force?: boolean; onClose?: () => void }) => {
  useScoreboardVersion();
  const [dismissed, setDismissed] = useState(false);
  const [dropped, setDropped] = useState(false);
  const now = useNow(1000);

  // Reset internal state each time a forced preview is re-opened
  useEffect(() => {
    if (force) {
      setDismissed(false);
      setDropped(false);
    }
  }, [force]);

  const nowDate = new Date(now);
  const nextHour = new Date(nowDate);
  nextHour.setHours(nowDate.getHours() + 1, 0, 0, 0);
  const secsToHour = Math.floor((nextHour.getTime() - now) / 1000);
  const withinWindow = secsToHour <= 120 && secsToHour > 0;

  const me = getPlayerHandle();
  const board = getHourBoard(now);
  const top = board[0];
  const isTopMe = Boolean(me && top && top.handle === me);

  const shouldShow = force || (withinWindow && isTopMe);
  if (!shouldShow || dismissed) return null;

  const close = () => {
    setDismissed(true);
    if (force) onClose?.();
  };

  const handleDrop = () => {
    setDropped(true);
    // Dramatic sound via a shared AudioContext
    if (typeof window !== "undefined") {
      try {
        const AC =
          (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
            .AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AC) {
          const ctx = new AC();
          const play = (freq: number, t: number, dur = 0.35) => {
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.type = "triangle";
            o.frequency.value = freq;
            g.gain.setValueAtTime(0.08, ctx.currentTime + t);
            g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + dur);
            o.connect(g);
            g.connect(ctx.destination);
            o.start(ctx.currentTime + t);
            o.stop(ctx.currentTime + t + dur + 0.05);
          };
          play(784, 0, 0.18);
          play(988, 0.12, 0.22);
          play(1319, 0.24, 0.5);
        }
      } catch {
        /* ignore */
      }
      try {
        navigator.vibrate?.([120, 80, 200]);
      } catch {
        /* ignore */
      }
    }
  };

  const mins = Math.floor(secsToHour / 60);
  const secs = secsToHour % 60;

  return (
    <AnimatePresence>
      <motion.div
        key="drop-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] flex items-center justify-center px-4"
        style={{
          background: "radial-gradient(circle at center, rgba(250,204,21,0.18), rgba(0,0,0,0.88) 70%)",
          backdropFilter: "blur(6px)",
        }}
        role="dialog"
        aria-labelledby="drop-title"
        aria-modal="true"
      >
        <motion.div
          initial={{ scale: 0.9, y: 10 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.9, y: 10 }}
          transition={{ duration: 0.25 }}
          className="relative max-w-md w-full rounded-3xl p-6 md:p-8 text-center"
          style={{
            background: "linear-gradient(180deg, rgba(250,204,21,0.14), rgba(10,14,24,0.85))",
            border: "1px solid rgba(250,204,21,0.6)",
            boxShadow: "0 40px 80px -30px rgba(250,204,21,0.4), inset 0 0 0 1px rgba(250,204,21,0.2)",
          }}
        >
          <button
            onClick={close}
            aria-label="Dismiss"
            className="absolute top-3 right-3 w-8 h-8 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition flex items-center justify-center"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M6 18L18 6" />
            </svg>
          </button>

          {!dropped ? (
            <>
              <div
                className="text-[11px] uppercase tracking-widest mb-3 font-mono"
                style={{ color: "#facc15" }}
              >
                You&apos;re #1 this hour
              </div>
              <h3 id="drop-title" className="text-3xl md:text-4xl font-black mb-2 text-white">
                Time to DROP.
              </h3>
              <p className="text-sm text-gray-300 mb-5">
                Tap the button when you&apos;re ready. The seat drops, your handle flashes on broadcast, the
                hourly pot is yours.
              </p>
              <div className="text-[11px] font-mono text-gray-400 mb-4">
                Window closes in{" "}
                <span className="text-white tabular-nums">
                  {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
                </span>
              </div>
              <motion.button
                onClick={handleDrop}
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                className="relative w-40 h-40 md:w-48 md:h-48 rounded-full text-black font-black text-3xl md:text-4xl tracking-widest transition focus:outline-none focus-visible:ring-4 focus-visible:ring-yellow-300/70"
                style={{
                  background: "radial-gradient(circle at 30% 30%, #fef08a, #facc15 55%, #ca8a04)",
                  boxShadow:
                    "0 0 0 3px rgba(250,204,21,0.35), 0 0 60px rgba(250,204,21,0.6), inset 0 -6px 12px rgba(0,0,0,0.3)",
                }}
              >
                DROP
              </motion.button>
              <div className="mt-5 text-[11px] font-mono text-gray-500">
                @{top?.handle} · {top?.score.toLocaleString()} pts
              </div>
            </>
          ) : (
            <div className="py-4">
              <motion.div
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.4, ease: "backOut" }}
                className="text-5xl md:text-7xl font-black mb-3"
                style={{
                  background: "linear-gradient(90deg, #facc15, #fb7185, #22d3ee)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                  color: "transparent",
                }}
              >
                DROPPED
              </motion.div>
              <p className="text-gray-200 text-lg mb-5">
                Your handle is live on the broadcast overlay. The pot is paying out to your wallet now.
              </p>
              <button
                onClick={close}
                className="px-5 py-3 rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 text-white font-semibold transition"
              >
                Close
              </button>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

/* -------------------- The hub -------------------- */

export const GamesHub = () => {
  const [active, setActive] = useState<GameId>("pour");
  const activeGame = useMemo(() => GAMES.find((g) => g.id === active)!, [active]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [previewDrop, setPreviewDrop] = useState(false);
  const [showPreviewBtn, setShowPreviewBtn] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const dev = process.env.NODE_ENV !== "production";
    const flagged =
      window.location.search.includes("preview=1") ||
      window.location.hash.includes("preview");
    setShowPreviewBtn(dev || flagged);
  }, []);

  return (
    <section
      id="games"
      className="relative z-10 max-w-7xl mx-auto px-5 md:px-8 py-12 md:py-20 scroll-mt-20"
    >
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.6 }}
        className="max-w-2xl mb-5 md:mb-8"
      >
        <div className="text-xs uppercase tracking-widest mb-2 md:mb-3" style={{ color: CYAN }}>
          The Game
        </div>
        <h2 className="text-3xl md:text-5xl font-black tracking-tight mb-3 md:mb-4">One pour. Twenty seconds.</h2>
        <p className="text-gray-400 text-lg">
          Everyone plays the same seed at the same moment. No luck, no tiers, no pay-to-win — just how steady your
          hand is. Top score on the hour wins the <span className="text-white font-semibold">DROP</span>.
        </p>
      </motion.div>

      <div className="mb-2">
        <Jackpot />
      </div>

      <HourEndingNotice />

      {showPreviewBtn && (
        <div className="mb-6 flex justify-end">
          <button
            onClick={() => setPreviewDrop(true)}
            className="text-[11px] font-mono text-gray-500 hover:text-yellow-300 transition inline-flex items-center gap-1.5 px-2 py-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-300/60"
            aria-label="Preview the DROP screen"
          >
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M3 12c0 4.97 4.03 9 9 9s9-4.03 9-9H3z" />
              <path d="M12 3v6" />
            </svg>
            Preview DROP screen
          </button>
        </div>
      )}

      <DropOverlay force={previewDrop} onClose={() => setPreviewDrop(false)} />

      {GAMES.length > 1 && (
        <div className="mb-6">
          <GamePicker
            active={active}
            onSelect={(id) => {
              setActive(id);
              requestAnimationFrame(() => {
                scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
              });
            }}
          />
        </div>
      )}

      <div ref={scrollRef} className="grid lg:grid-cols-[minmax(0,1fr)_360px] gap-5 items-start">
        <div
          key={active}
          className="relative min-w-0"
          style={{
            filter: "drop-shadow(0 30px 60px rgba(0,0,0,0.4))",
          }}
        >
          {active === "pour" && <SteadyPour />}
        </div>

        <div className="space-y-3 md:space-y-4 min-w-0">
          <WelcomeCallout />
          <YourStats />
          <div
            className="rounded-2xl border p-4 md:p-5"
            style={{
              background: `linear-gradient(135deg, ${activeGame.color}14, transparent)`,
              borderColor: `${activeGame.color}40`,
            }}
          >
            <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: activeGame.color }}>
              How to play
            </div>
            <div className="text-sm text-gray-200 leading-relaxed">{activeGame.desc}</div>
          </div>
        </div>
      </div>

      {/* Secondary row: hourly board + waiting room flow across the full width */}
      <div className="mt-5 grid md:grid-cols-[minmax(0,1fr)_360px] gap-4 md:gap-5 items-start">
        <HourBoard />
        <WaitingRoom />
      </div>
    </section>
  );
};
