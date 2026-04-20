"use client";

import { useEffect, useState } from "react";

export type GameId = "dunk" | "pour" | "tidal" | "stacker";

export type ScoreEntry = {
  id: string;
  game: GameId;
  handle: string;
  flag: string;
  score: number;
  seed?: number;
  ts: number;
};

/* -------------------- Hour simulation (client-side mock) -------------------- */

const SIM_HANDLES: { h: string; flag: string }[] = [
  { h: "steady_hands", flag: "🇯🇵" },
  { h: "calmwater", flag: "🇦🇪" },
  { h: "sipgod", flag: "🇸🇬" },
  { h: "wavepainter", flag: "🇨🇦" },
  { h: "ltcmaxi", flag: "🇨🇦" },
  { h: "tiltgod", flag: "🇺🇸" },
  { h: "notmissing", flag: "🇬🇧" },
  { h: "paintking", flag: "🇩🇪" },
  { h: "she_dropped", flag: "🇳🇱" },
  { h: "whale_lord", flag: "🇯🇵" },
  { h: "basedhunter", flag: "🇰🇷" },
  { h: "firststreamer", flag: "🇫🇷" },
];

const mulberry32 = (seed: number) => {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/**
 * Deterministic simulated pour scores for the current hour. Everyone viewing
 * the page in the same hour sees the same set of scores — the set only grows
 * as the hour progresses (scores "appear" at their simulated timestamp).
 *
 * Returns entries already filtered to those whose ts <= now.
 */
const getSimulatedHourScores = (now = Date.now()): ScoreEntry[] => {
  const hourMs = 60 * 60 * 1000;
  const hourStart = Math.floor(now / hourMs) * hourMs;
  const rng = mulberry32(hourStart);
  const count = 7 + Math.floor(rng() * 4); // 7–10 competitors

  const entries: ScoreEntry[] = [];
  // Shuffle indices so we pick handles without repetition
  const order = [...SIM_HANDLES.keys()].sort(() => rng() - 0.5);
  for (let i = 0; i < count && i < order.length; i++) {
    const p = SIM_HANDLES[order[i]];
    // Score bell: most land 4–7k, a couple push 8–9.5k
    const base = 3800 + Math.floor(rng() * 3600);
    const boost = rng() < 0.25 ? 2000 + Math.floor(rng() * 2000) : 0;
    const score = Math.min(9700, base + boost);
    // Timestamp somewhere in the hour so far — spread across 0..elapsed
    const elapsed = now - hourStart;
    const ts = hourStart + Math.floor(rng() * Math.max(1, elapsed));
    entries.push({
      id: `sim-${hourStart}-${i}`,
      game: "pour",
      handle: p.h,
      flag: p.flag,
      score,
      ts,
    });
  }
  return entries.filter((e) => e.ts <= now);
};

const STORE_KEY = "livewager-dunk-scores";
const HANDLE_KEY = "livewager-dunk-handle";
const FLAG_KEY = "livewager-dunk-flag";
const BUS = "livewager-dunk-scores-updated";
const MAX_ENTRIES = 200;

const DEFAULT_FLAGS = ["🇺🇸", "🇯🇵", "🇨🇦", "🇩🇪", "🇦🇺", "🇲🇽", "🇰🇷", "🇫🇷", "🇬🇧", "🇳🇱", "🇧🇷"];

export const pickRandomFlag = () => DEFAULT_FLAGS[Math.floor(Math.random() * DEFAULT_FLAGS.length)];

const readStore = (): ScoreEntry[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ScoreEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeStore = (list: ScoreEntry[]) => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(list.slice(0, MAX_ENTRIES)));
    window.dispatchEvent(new CustomEvent(BUS));
  } catch {
    /* ignore quota issues */
  }
};

export const getPlayerHandle = (): string => {
  if (typeof window === "undefined") return "anon";
  return localStorage.getItem(HANDLE_KEY) || "";
};
export const setPlayerHandle = (h: string) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(HANDLE_KEY, h);
  window.dispatchEvent(new CustomEvent(BUS));
};
export const getPlayerFlag = (): string => {
  if (typeof window === "undefined") return "🏁";
  let f = localStorage.getItem(FLAG_KEY);
  if (!f) {
    f = pickRandomFlag();
    localStorage.setItem(FLAG_KEY, f);
  }
  return f;
};
export const setPlayerFlag = (f: string) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(FLAG_KEY, f);
  window.dispatchEvent(new CustomEvent(BUS));
};

export const postScore = (game: GameId, score: number, seed?: number) => {
  if (typeof window === "undefined") return;
  const handle = getPlayerHandle() || "guest_" + Math.random().toString(36).slice(2, 7);
  const flag = getPlayerFlag();
  const entry: ScoreEntry = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    game,
    handle,
    flag,
    score,
    seed,
    ts: Date.now(),
  };
  const next = [entry, ...readStore()];
  writeStore(next);
};

/** Latest score per handle+game, scoped to the current hour, sorted desc.
 *  Merges real local scores with deterministic simulated competitors so the
 *  board feels populated even pre-launch. Real scores always win if the same
 *  handle appears in both (real player beats their sim ghost). */
export const getHourBoard = (now = Date.now()) => {
  const hourMs = 60 * 60 * 1000;
  const real = readStore().filter((e) => now - e.ts < hourMs);
  const sim = getSimulatedHourScores(now);
  const all = [...real, ...sim];
  const bestByKey = new Map<string, ScoreEntry>();
  for (const e of all) {
    const key = `${e.handle}:${e.game}`;
    const prev = bestByKey.get(key);
    // Prefer non-sim entries if two sources tie on the same handle
    const prevIsSim = prev?.id.startsWith("sim-");
    const curIsSim = e.id.startsWith("sim-");
    if (!prev || e.score > prev.score || (prev.score === e.score && prevIsSim && !curIsSim)) {
      bestByKey.set(key, e);
    }
  }
  return Array.from(bestByKey.values()).sort((a, b) => b.score - a.score);
};

/** Earliest score timestamp for a handle, or 0 if never played. */
export const getPlayerSinceTs = (handle: string): number => {
  if (!handle) return 0;
  return readStore()
    .filter((e) => e.handle === handle)
    .reduce<number>((m, e) => (m === 0 || e.ts < m ? e.ts : m), 0);
};

/** All-time best score for a (game, handle) pair. */
export const getAllTimeBest = (game: GameId, handle: string) => {
  if (!handle) return 0;
  return readStore()
    .filter((e) => e.game === game && e.handle === handle)
    .reduce((m, e) => (e.score > m ? e.score : m), 0);
};

/**
 * Total pour rounds this hour across *all* entries (real + simulated).
 * Drives jackpot value estimates.
 */
export const getHourRoundCount = (now = Date.now()) => {
  const hourMs = 60 * 60 * 1000;
  const real = readStore().filter((e) => e.game === "pour" && now - e.ts < hourMs).length;
  const sim = getSimulatedHourScores(now).length;
  return real + sim;
};

/** This-week stats for a (game, handle) pair. Counts only real local rounds. */
export const getWeekStats = (
  game: GameId,
  handle: string,
  entryUsd: number,
  now = Date.now(),
) => {
  if (!handle) return { rounds: 0, spend: 0, best: 0 };
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const mine = readStore().filter(
    (e) => e.game === game && e.handle === handle && now - e.ts < weekMs,
  );
  const best = mine.reduce((m, e) => (e.score > m ? e.score : m), 0);
  return { rounds: mine.length, spend: Number((mine.length * entryUsd).toFixed(2)), best };
};

/** Per-player stats for the current hour. */
export const getMyHourStats = (game: GameId, handle: string, now = Date.now()) => {
  if (!handle) return { best: 0, rounds: 0, lastTs: 0 };
  const hourMs = 60 * 60 * 1000;
  const mine = readStore().filter(
    (e) => e.game === game && e.handle === handle && now - e.ts < hourMs,
  );
  const best = mine.reduce((m, e) => (e.score > m ? e.score : m), 0);
  const lastTs = mine.reduce((m, e) => (e.ts > m ? e.ts : m), 0);
  return { best, rounds: mine.length, lastTs };
};

/** Live-ish subscription to scoreboard updates */
export const useScoreboardVersion = () => {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const bump = () => setV((x) => x + 1);
    window.addEventListener(BUS, bump);
    window.addEventListener("storage", (e) => {
      if (e.key === STORE_KEY) bump();
    });
    return () => {
      window.removeEventListener(BUS, bump);
    };
  }, []);
  return v;
};
