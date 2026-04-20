"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion, useMotionValue, useTransform, useMotionValueEvent } from "framer-motion";
import { getHourBoard, getPlayerHandle, postScore } from "./scoreboard";
import { createCollector, type AntiCheatReport } from "./anticheat";
import { addCredits, chargeForRound, ENTRY_USD, useWallet } from "./wallet";
import { useCopyable } from "@/lib/clipboard";
import { writeRaw, PREF_KEYS } from "@/lib/prefs";

/**
 * Persisted tilt calibration payload. Shape is deliberately small so
 * the JSON write stays cheap. Null fields mean "not captured" (some
 * devices only report one axis). Timestamp is used to expire stale
 * calibrations — phones get picked up differently hour to hour, so
 * anything older than a day starts fresh.
 */
interface StoredTiltCalibration {
  gamma: number | null;
  beta: number | null;
  at: number; // epoch ms
}
const TILT_CAL_TTL_MS = 24 * 60 * 60 * 1000; // 24h

function readStoredTiltCalibration(): StoredTiltCalibration | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem("livewager-pref:" + PREF_KEYS.tiltCalibration);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredTiltCalibration;
    if (!parsed || typeof parsed.at !== "number") return null;
    if (Date.now() - parsed.at > TILT_CAL_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

const CYAN = "#22d3ee";
const HS_KEY = "livewager-dunk-pour-high-score";
const SOUND_KEY = "livewager-dunk-sound";

/* Deterministic PRNG so rounds are replayable and server-seedable later */
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

/** Fixed 20-second round with 7 procedural setpoints (identical for all players). */
const ROUND_MS = 20_000;
const N_SETPOINTS = 7;
const makeRound = (seed: number) => {
  const rng = mulberry32(seed);
  const pts: { target: number; durMs: number }[] = [];
  // Distribute durations so total === ROUND_MS, with some variance
  let remaining = ROUND_MS;
  for (let i = 0; i < N_SETPOINTS; i++) {
    const target = 0.2 + rng() * 0.6; // avoid extremes — pour needs play on both sides
    const slotsLeft = N_SETPOINTS - i;
    // Base share + ±20% variance, clamped so each slot is at least 1.5s
    const base = remaining / slotsLeft;
    const durMs = Math.max(1500, Math.round(base * (0.8 + rng() * 0.4)));
    const final = i === N_SETPOINTS - 1 ? remaining : Math.min(durMs, remaining - (slotsLeft - 1) * 1500);
    pts.push({ target, durMs: final });
    remaining -= final;
  }
  return { pts, totalMs: ROUND_MS };
};

// Deterministic bubble layout — stable across renders so browsers can cache the animation
const ShareScoreButton = ({ score, perfectMs }: { score: number; perfectMs: number }) => {
  const [state, setState] = useState<"idle" | "copied" | "shared">("idle");
  const clipboard = useCopyable();
  if (score <= 0) return null;
  const handleShare = async () => {
    if (typeof window === "undefined") return;
    const pct = Math.round((perfectMs / ROUND_MS) * 100);
    const text = `Poured ${score.toLocaleString()} pts · ${pct}% on the line · livewager.io/dunk — can you beat me?`;
    const url = "https://livewager.io/dunk";
    const nav = window.navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav.share) {
      try {
        await nav.share({ title: "LiveWager · Dunk", text, url });
        setState("shared");
        setTimeout(() => setState("idle"), 2000);
        return;
      } catch {
        /* cancelled */
      }
    }
    const ok = await clipboard(`${text} ${url}`, {
      label: "Share link",
      silent: true, // inline state pill is the signal
    });
    if (ok) {
      setState("copied");
      setTimeout(() => setState("idle"), 2000);
    }
  };
  return (
    <button
      onClick={handleShare}
      aria-label="Share your score"
      className="px-5 py-3 rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 text-white text-sm font-semibold transition flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
    >
      {state === "idle" && (
        <>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4m0 0L8 6m4-4v12" />
          </svg>
          Share score
        </>
      )}
      {state === "copied" && <span className="text-cyan-300">Copied!</span>}
      {state === "shared" && <span className="text-cyan-300">Shared!</span>}
    </button>
  );
};

const DropReadyCta = () => {
  const [ready, setReady] = useState(false);
  const [msLeft, setMsLeft] = useState(0);
  useEffect(() => {
    const check = () => {
      const now = Date.now();
      const nxt = new Date(now);
      nxt.setHours(nxt.getHours() + 1, 0, 0, 0);
      const left = nxt.getTime() - now;
      const me = getPlayerHandle();
      const top = getHourBoard(now)[0];
      setReady(Boolean(me && top && top.handle === me && left <= 120_000 && left > 0));
      setMsLeft(left);
    };
    check();
    const id = setInterval(check, 2000);
    return () => clearInterval(id);
  }, []);
  if (!ready) return null;
  const mins = Math.floor(msLeft / 60000);
  const secs = Math.floor((msLeft % 60000) / 1000);
  return (
    <a
      href="#games"
      className="mt-3 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-black font-black text-sm shadow-xl transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
      style={{
        background: "linear-gradient(90deg, #facc15, #fb923c)",
        boxShadow: "0 0 24px rgba(250,204,21,0.5)",
      }}
    >
      You&apos;re #1 — see the DROP →
      <span className="font-mono text-xs opacity-80">
        {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
      </span>
    </a>
  );
};

/* -------------------- Score submit retry queue -------------------- */

const SCORE_QUEUE_KEY = "livewager-dunk-score-queue";

type PendingScore = {
  // Exact body we POST to /api/dunk/score
  body: Record<string, unknown>;
  // Round window end — drop from queue if server-side expiry would reject it
  expiresAt: number;
  // When we first tried; helps cap retry lifetime
  firstTriedAt: number;
};

const readQueue = (): PendingScore[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SCORE_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};
const writeQueue = (q: PendingScore[]) => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SCORE_QUEUE_KEY, JSON.stringify(q));
  } catch {
    /* quota — drop oldest */
    if (q.length) {
      try {
        localStorage.setItem(SCORE_QUEUE_KEY, JSON.stringify(q.slice(-5)));
      } catch {
        /* ignore */
      }
    }
  }
};

const enqueueScore = (body: Record<string, unknown>, expiresAt: number) => {
  const q = readQueue();
  q.push({ body, expiresAt, firstTriedAt: Date.now() });
  // Hard cap at 10 pending to avoid runaway growth
  writeQueue(q.slice(-10));
};

const flushScoreQueue = async () => {
  if (typeof window === "undefined") return;
  const q = readQueue();
  if (!q.length) return;
  const now = Date.now();
  // Server rejects submissions > 30s past expiry
  const stillValid = q.filter((p) => now <= p.expiresAt + 30_000);
  const remaining: PendingScore[] = [];
  for (const p of stillValid) {
    try {
      const r = await fetch("/api/dunk/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p.body),
      });
      if (!r.ok) {
        // Only retry on 5xx / network-ish errors. 4xx = permanent — drop.
        if (r.status >= 500) remaining.push(p);
      }
    } catch {
      // Still offline — keep it
      remaining.push(p);
    }
  }
  writeQueue(remaining);
};

const SessionRecap = ({
  scores,
  rounds,
  spend,
}: {
  scores: number[];
  rounds: number;
  spend: number;
}) => {
  const best = scores.length ? Math.max(...scores) : 0;
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  return (
    <motion.div
      initial={{ scale: 0.96, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay: 0.5, duration: 0.3 }}
      className="mt-4 w-full max-w-sm mx-auto p-3 rounded-xl border text-left"
      style={{
        background: "linear-gradient(135deg, rgba(34,211,238,0.08), rgba(96,165,250,0.04))",
        borderColor: "rgba(34,211,238,0.28)",
      }}
      role="status"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] uppercase tracking-widest text-cyan-300">Session recap</div>
        <div className="text-[10px] font-mono text-gray-500">Every 5 rounds</div>
      </div>
      <div className="grid grid-cols-4 gap-2 text-center">
        <div>
          <div className="text-[9px] uppercase tracking-widest text-gray-500">Rounds</div>
          <div className="text-sm font-mono font-bold text-white tabular-nums">{rounds}</div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-widest text-gray-500">Best</div>
          <div className="text-sm font-mono font-bold text-white tabular-nums">{best.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-widest text-gray-500">Avg</div>
          <div className="text-sm font-mono font-bold text-white tabular-nums">{avg.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-widest text-gray-500">Spend</div>
          <div className="text-sm font-mono font-bold text-white tabular-nums">${spend.toFixed(2)}</div>
        </div>
      </div>
      <div className="mt-2 text-[10px] text-gray-400 leading-snug">
        Quick check-in — play at a pace that feels right. Your hourly best is what counts for the DROP.
      </div>
    </motion.div>
  );
};

const CONFETTI_COLORS = ["#22d3ee", "#60a5fa", "#a78bfa", "#facc15", "#a3e635"];

const ConfettiBurst = () => {
  const pieces = Array.from({ length: 60 });
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-20" aria-hidden>
      {pieces.map((_, i) => {
        const left = Math.random() * 100;
        const delay = Math.random() * 0.4;
        const duration = 1.4 + Math.random() * 1.2;
        const size = 6 + Math.random() * 6;
        const rotate = Math.random() * 360;
        const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
        const drift = (Math.random() - 0.5) * 40;
        return (
          <span
            key={i}
            style={{
              position: "absolute",
              top: "-10%",
              left: `${left}%`,
              width: size,
              height: size * 0.4,
              background: color,
              transform: `rotate(${rotate}deg)`,
              animation: `pourFall ${duration}s ${delay}s ease-in forwards`,
              opacity: 0.95,
              borderRadius: 2,
              ["--drift" as string]: `${drift}px`,
            } as React.CSSProperties}
          />
        );
      })}
      <style>{`
        @keyframes pourFall {
          0% { transform: translate3d(0, -20px, 0) rotate(0deg); opacity: 1; }
          100% { transform: translate3d(var(--drift), 110%, 0) rotate(720deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
};

const HourRankFlash = () => {
  const [rank, setRank] = useState<number | null>(null);
  const [isMe, setIsMe] = useState(false);
  useEffect(() => {
    const me = getPlayerHandle();
    const board = getHourBoard();
    const idx = board.findIndex((r) => r.game === "pour" && r.handle === me);
    if (idx < 0) {
      setRank(null);
      return;
    }
    setRank(idx + 1);
    setIsMe(true);
  }, []);
  if (!rank || !isMe) return null;
  if (rank === 1) {
    return (
      <motion.div
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 1.1, duration: 0.4, ease: "backOut" }}
        className="mt-3 px-3 py-1.5 rounded-lg font-bold text-black inline-block"
        style={{ background: "#facc15", boxShadow: "0 0 24px rgba(250,204,21,0.6)" }}
      >
        #1 this hour — you can DROP
      </motion.div>
    );
  }
  return (
    <motion.div
      initial={{ y: 6, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 1.0, duration: 0.3 }}
      className="mt-2 text-xs text-cyan-300 font-mono"
    >
      Now #{rank} this hour
    </motion.div>
  );
};

const Stars = ({ count }: { count: number }) => (
  <div className="flex items-center justify-center gap-1" aria-label={`${count} of 5 stars`}>
    {Array.from({ length: 5 }).map((_, i) => (
      <motion.svg
        key={i}
        initial={{ scale: 0.2, opacity: 0, rotate: -30 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ delay: 0.4 + i * 0.08, duration: 0.28, ease: "backOut" }}
        viewBox="0 0 24 24"
        className="w-7 h-7"
        fill={i < count ? "#facc15" : "rgba(255,255,255,0.1)"}
        stroke={i < count ? "#facc15" : "rgba(255,255,255,0.25)"}
        strokeWidth="1.5"
        aria-hidden
      >
        <path d="M12 2l2.8 6.3 6.9.7-5.2 4.7 1.5 6.8L12 17.3 5.9 20.5 7.5 13.7 2.3 9l6.9-.7z" />
      </motion.svg>
    ))}
  </div>
);

const ScoreCountUp = ({ to, durationMs = 1400 }: { to: number; durationMs?: number }) => {
  const [v, setV] = useState(0);
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    if (reduceMotion) {
      setV(to);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const ease = 1 - Math.pow(1 - t, 3);
      setV(Math.round(to * ease));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, durationMs, reduceMotion]);
  return <span className="tabular-nums">{v.toLocaleString()}</span>;
};

const starsFromPerfect = (perfectMs: number, roundMs: number) => {
  const pct = Math.min(1, perfectMs / roundMs);
  // 0.0–0.15 = 1, 0.15–0.3 = 2, 0.3–0.5 = 3, 0.5–0.75 = 4, ≥0.75 = 5
  if (pct >= 0.75) return 5;
  if (pct >= 0.5) return 4;
  if (pct >= 0.3) return 3;
  if (pct >= 0.15) return 2;
  return 1;
};

const BUBBLES = [
  { x: 22, size: 2.5, delay: 0.0, dur: 5.6 },
  { x: 48, size: 3, delay: 1.4, dur: 6.8 },
  { x: 72, size: 2, delay: 0.7, dur: 5.2 },
  { x: 86, size: 2.5, delay: 2.2, dur: 7.0 },
];

const WalletStrip = ({ balance }: { balance: number }) => (
  <div
    className="mx-auto mb-4 inline-flex items-center gap-3 px-3 py-1.5 rounded-full bg-black/40 border border-white/15 text-[11px] font-mono"
    role="status"
    aria-label={`Wallet balance $${balance.toFixed(2)} — ${Math.floor(balance / ENTRY_USD)} rounds left`}
  >
    <span className="text-gray-400">BALANCE</span>
    <span className="text-white font-bold tabular-nums">${balance.toFixed(2)}</span>
    <span className="text-gray-600" aria-hidden>·</span>
    <span className="text-gray-400">{Math.floor(balance / ENTRY_USD)} rounds left</span>
  </div>
);

const BrokeBlock = ({ topUp }: { topUp: (usd: number) => void }) => (
  <div className="space-y-3" role="region" aria-label="Top up credits">
    <div className="text-sm text-red-300" role="status">Out of credits. Top up to keep playing.</div>
    <div className="flex items-center justify-center gap-2 flex-wrap">
      {[
        { label: "$15", usd: 15, note: "5 rounds" },
        { label: "$30", usd: 30, note: "10 rounds" },
        { label: "$90", usd: 90, note: "30 rounds", highlight: true },
      ].map((p) => (
        <button
          key={p.usd}
          onClick={() => topUp(p.usd)}
          className="px-4 py-2.5 rounded-xl text-sm font-bold text-white transition hover:brightness-110"
          style={
            p.highlight
              ? { background: `linear-gradient(90deg, ${CYAN}, #0891b2)`, boxShadow: `0 10px 20px -10px ${CYAN}80` }
              : { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)" }
          }
        >
          <span className="block">{p.label}</span>
          <span className="block text-[10px] font-mono opacity-80 mt-0.5">{p.note}</span>
        </button>
      ))}
    </div>
    <div className="text-[10px] text-gray-500 font-mono">Demo — real payment integration coming soon</div>
  </div>
);

const playBeep = (ctx: AudioContext, freq: number, dur: number, type: OscillatorType = "sine", gain = 0.06) => {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(gain, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + dur);
};

// 1 second of white noise sampled once — loop forever at the filter
const createNoiseBuffer = (ctx: AudioContext) => {
  const sampleRate = ctx.sampleRate;
  const buffer = ctx.createBuffer(1, sampleRate, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
};

const startPourNoise = (ctx: AudioContext) => {
  const src = ctx.createBufferSource();
  src.buffer = createNoiseBuffer(ctx);
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 600;
  filter.Q.value = 0.8;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  src.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  src.start();
  // Fade in
  gain.gain.linearRampToValueAtTime(0.04, ctx.currentTime + 0.12);
  return { src, filter, gain };
};

const stopPourNoise = (
  ctx: AudioContext,
  nodes: { src: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode },
) => {
  const now = ctx.currentTime;
  nodes.gain.gain.cancelScheduledValues(now);
  nodes.gain.gain.setValueAtTime(nodes.gain.gain.value, now);
  nodes.gain.gain.linearRampToValueAtTime(0, now + 0.15);
  try {
    nodes.src.stop(now + 0.2);
  } catch {
    /* already stopped */
  }
};

// Zone-entry ding: major third chord
const playZoneDing = (ctx: AudioContext) => {
  playBeep(ctx, 880, 0.16, "sine", 0.05);
  setTimeout(() => playBeep(ctx, 1108.7, 0.22, "sine", 0.04), 40);
};
// Zone-exit soft: low muted tone
const playZoneExit = (ctx: AudioContext) => {
  playBeep(ctx, 220, 0.08, "sine", 0.025);
};
// Round-end flourish: tritone walk up
const playRoundEnd = (ctx: AudioContext) => {
  playBeep(ctx, 523.25, 0.16, "triangle", 0.05);
  setTimeout(() => playBeep(ctx, 659.25, 0.16, "triangle", 0.05), 130);
  setTimeout(() => playBeep(ctx, 783.99, 0.32, "triangle", 0.05), 260);
};

// Mobile haptic feedback — safe no-op on platforms without the API.
// Patterns: number or number[] of [vibrate, pause, vibrate, ...] in ms.
const HAPTICS_KEY = "livewager-dunk-haptics";
const isHapticsAllowed = () => {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return false;
  if (typeof localStorage === "undefined") return true;
  const saved = localStorage.getItem(HAPTICS_KEY);
  return saved === null ? true : saved === "1";
};
const haptic = (pattern: number | number[]) => {
  if (!isHapticsAllowed()) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* some browsers reject without user gesture — ignore */
  }
};
const HAPTIC_ZONE_IN = 12;
const HAPTIC_ZONE_OUT = 6;
const HAPTIC_COUNTDOWN_PULSE = 30;
const HAPTIC_ROUND_END = [60, 70, 60, 70, 140];

/**
 * Steady Pour:
 * - Glass with a target fill line that moves to 7 setpoints over 20s
 * - User tilts phone (gamma) to control pour rate; tilt controls water level
 * - On desktop: drag vertically to set level (mouse Y during drag)
 * - Score: cumulative ms-near-target × precision factor
 */
export const SteadyPour = () => {
  const reduceMotion = useReducedMotion();
  const { balance } = useWallet();
  const [status, setStatus] = useState<"idle" | "calibrating" | "ready" | "playing" | "over">("idle");
  const [preCount, setPreCount] = useState(3);
  const [seed, setSeed] = useState<number>(() => Math.floor(Date.now() / ROUND_MS));
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [level, setLevel] = useState(0.5); // 0 empty, 1 full
  const [target, setTarget] = useState(0.5);
  // Motion values — drive DOM at display rate without React re-render
  const levelMV = useMotionValue(0.5);
  const sloshMV = useMotionValue(0);
  // Transforms for water styling
  const waterHeightPct = useTransform(levelMV, (v) => `${v * 100}%`);
  const waterClipPath = useTransform(sloshMV, (s) => {
    // Apply a soft threshold so micro-slosh doesn't judder the top edge.
    // Below ~0.08, no surface tilt; above, scale linearly to 14% dip.
    const mag = Math.abs(s);
    const effective = mag < 0.08 ? 0 : (mag - 0.08) * (14 / 0.92);
    const leftDip = s < 0 ? effective : 0;
    const rightDip = s > 0 ? effective : 0;
    return `polygon(0% ${leftDip}%, 100% ${rightDip}%, 100% 100%, 0% 100%)`;
  });
  // Target line rotation follows slosh so the line tilts together with the water surface.
  // Smaller max angle than the water because the line represents a fixed target in the world.
  // Soft threshold so micro-slosh doesn't jitter the rotation.
  const targetRotateDeg = useTransform(sloshMV, (s) => {
    const mag = Math.abs(s);
    const effective = mag < 0.08 ? 0 : (mag - 0.08) * (4 / 0.92);
    return Math.sign(s) * effective;
  });
  // Level velocity for spring physics (kept in ref so raf mutates it directly)
  const levelVelRef = useRef(0);
  const sloshVelRef = useRef(0);
  // Calibration sample buffer (source of truth for "calibrating" is status === "calibrating")
  const calibrationSamplesRef = useRef<number[]>([]);
  const betaCalibrationSamplesRef = useRef<number[]>([]);
  const [countdown, setCountdown] = useState(20);
  const [tiltEnabled, setTiltEnabled] = useState(false);
  const [needsPerm, setNeedsPerm] = useState(false);
  const [tiltAvailable, setTiltAvailable] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [hapticsOn, setHapticsOn] = useState(true);
  const hapticsOnRef = useRef(true);
  useEffect(() => { hapticsOnRef.current = hapticsOn; }, [hapticsOn]);
  const [hapticsSupported, setHapticsSupported] = useState(false);
  const [perfectMs, setPerfectMs] = useState(0);
  const [bullseyeCount, setBullseyeCount] = useState(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const pourNodesRef = useRef<{
    src: AudioBufferSourceNode;
    filter: BiquadFilterNode;
    gain: GainNode;
  } | null>(null);
  const lastLevelRef = useRef(0.5);
  const lastInZoneRef = useRef(false);
  const lastBullseyeRef = useRef(false);
  // Tilt tuning refs
  const betaNeutralRef = useRef<number | null>(null); // set on round start
  const smoothedBetaRef = useRef<number | null>(null); // low-pass state
  const gammaNeutralRef = useRef<number | null>(null);
  const smoothedGammaRef = useRef<number | null>(null);
  const [slosh, setSlosh] = useState(0); // -1..+1 normalized L/R slosh for water surface
  const collectorRef = useRef(createCollector());
  const [signedSeed, setSignedSeed] = useState<null | { roundId: number; signature: string; expiresAt: number }>(null);
  const [serverResult, setServerResult] = useState<null | { accepted: boolean; suspicious: string[]; error?: string }>(null);
  const [lastReport, setLastReport] = useState<AntiCheatReport | null>(null);
  const [splashKey, setSplashKey] = useState(0);
  // Wall-slap splash — fires when slosh crosses into extreme range. Sign = which wall.
  const [wallSplash, setWallSplash] = useState<{ key: number; side: "L" | "R" } | null>(null);
  const wallArmedRef = useRef<"L" | "R" | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const rafRef = useRef(0);

  const [probeSettled, setProbeSettled] = useState(false);
  /* -------------------- Init -------------------- */
  useEffect(() => {
    if (typeof window === "undefined") return;
    setHighScore(Number(localStorage.getItem(HS_KEY) || 0));
    const savedSound = localStorage.getItem(SOUND_KEY);
    if (savedSound !== null) setSoundOn(savedSound === "1");
    const savedHap = localStorage.getItem(HAPTICS_KEY);
    if (savedHap !== null) setHapticsOn(savedHap === "1");
    // Seed the calibration sample buffers from a recent stored
    // calibration. Round-start wipes the *neutral* refs (so fresh
    // samples take priority if the phone is held differently now),
    // but the sample buffers survive — the stored median counts as
    // prior weight in the pre-warm path, shortcutting the 1.8s
    // calibration to the 600ms fast path when the user's pose
    // hasn't changed.
    const storedCal = readStoredTiltCalibration();
    if (storedCal) {
      if (storedCal.gamma !== null) {
        calibrationSamplesRef.current = Array(30).fill(storedCal.gamma);
      }
      if (storedCal.beta !== null) {
        betaCalibrationSamplesRef.current = Array(30).fill(storedCal.beta);
      }
    }
    setHapticsSupported(typeof navigator !== "undefined" && typeof navigator.vibrate === "function");
    const anyDOE = (
      window as unknown as {
        DeviceOrientationEvent?: { requestPermission?: () => Promise<"granted" | "denied"> };
      }
    ).DeviceOrientationEvent;
    if (anyDOE && typeof anyDOE.requestPermission === "function") setNeedsPerm(true);

    // Runtime capability detection: listen for a real orientation event. If one
    // arrives with a finite gamma, this device has an accelerometer and can play.
    // Otherwise treat as desktop and gate. 2000ms is enough for every mobile
    // device I've tested; Android fires within ~50ms, iOS fires after first
    // requestPermission grant.
    let settled = false;
    const probe = (e: DeviceOrientationEvent) => {
      if (settled) return;
      if (e.gamma !== null && e.gamma !== undefined && Number.isFinite(e.gamma)) {
        settled = true;
        setTiltAvailable(true);
        setProbeSettled(true);
        window.removeEventListener("deviceorientation", probe);
      }
    };
    window.addEventListener("deviceorientation", probe);
    const gateTimer = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        setProbeSettled(true);
        window.removeEventListener("deviceorientation", probe);
      }
    }, 2000);

    return () => {
      window.removeEventListener("deviceorientation", probe);
      window.clearTimeout(gateTimer);
    };
  }, []);

  const ensureAudio = useCallback(() => {
    if (!soundOn || typeof window === "undefined") return null;
    if (!audioCtxRef.current) {
      const AC =
        (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
          .AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AC) audioCtxRef.current = new AC();
    }
    return audioCtxRef.current;
  }, [soundOn]);

  // Expose live game state on window for emulator/test harness (debug=1 only)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.location.search.includes("debug=1")) return;
    const pub = () => {
      (window as unknown as { __dunkDebug?: Record<string, unknown> }).__dunkDebug = {
        status,
        score,
        level,
        slosh,
        gamma: rawGammaRef.current,
        beta: rawBetaRef.current,
        gammaNeutral: gammaNeutralRef.current,
        betaNeutral: betaNeutralRef.current,
      };
    };
    pub();
    const id = setInterval(pub, 100);
    return () => clearInterval(id);
  }, [status, score, level, slosh]);

  /* -------------------- Tilt controls -------------------- */
  // Classic tilt-game tuning (Rolando/Labyrinth style):
  // - Both axes contribute: gamma (L/R roll) + beta (forward/back pitch)
  // - Wide ranges so casual hand movement barely moves the water
  // - Generous deadzones per axis ignore micro-tremor
  // - Ease-IN curve: tiny tilts → tiny motion; big tilts → proportional
  // - Slow spring so water glides, not snaps
  const GAMMA_RANGE_DEG = 20;       // gamma: ±20° spans full glass (was 25; smaller = more responsive)
  const BETA_RANGE_DEG = 20;        // beta: ±20° spans full glass (was 25)
  const TILT_DEADZONE_DEG = 2;      // per-axis deadzone (was 3; smaller = more responsive)
  // Level spring — snappier now to overcome sensor smoothing + ease-in curve.
  const LEVEL_STIFFNESS = 140;      // was 80
  const LEVEL_DAMPING = 2 * Math.sqrt(LEVEL_STIFFNESS);
  // Slosh — slightly softer + underdamped for visible surface wobble
  const SLOSH_STIFFNESS = 120;      // was 70
  const SLOSH_DAMPING = 2 * Math.sqrt(SLOSH_STIFFNESS) * 0.85;

  // Apply deadzone + shortest-arc to a raw sensor delta
  const applyDeadzone = (delta: number, deadzone: number) => {
    if (Math.abs(delta) < deadzone) return 0;
    return delta - Math.sign(delta) * deadzone;
  };

  // Latest raw sensor values — written in the event listener, read in the raf loop
  const rawGammaRef = useRef<number | null>(null);
  const rawBetaRef = useRef<number | null>(null);
  // Throttle React state updates so conditional UI (edge-glow, directional hint)
  // doesn't reconcile every frame. Motion values carry the real animation.
  const lastStateTickRef = useRef(0);
  // Timestamp of when status flipped to "playing" — used to soft-ramp spring
  // stiffness over the first ~500ms so any small neutral mismatch doesn't
  // cause the water to yank on the very first frame.
  const playStartMsRef = useRef<number | null>(null);
  // Desktop control surface: pointer drag + arrow keys feed a 0..1 target
  // directly, bypassing the gyro pipeline. Non-null = desktop mode is
  // driving this frame.
  const desktopTargetLevelRef = useRef<number | null>(null);
  const rootDivRef = useRef<HTMLDivElement | null>(null);
  const isDesktopMode = () => probeSettled && !tiltAvailable;
  // Shortest-arc delta: wrap differences at ±180° so no catastrophic jump near ±90°
  const shortestArc = (delta: number) => {
    while (delta > 180) delta -= 360;
    while (delta < -180) delta += 360;
    return delta;
  };

  useEffect(() => {
    if (!tiltEnabled) return;
    // Run in all status modes except "over" (we don't need tilt on round-complete screen)
    if (status === "over") return;

    const onOrient = (e: DeviceOrientationEvent) => {
      // Accept only finite numeric readings. If a browser emits null (some
      // Android WebViews), keep the last known value so we don't inject a 0
      // that looks like extreme tilt relative to a non-zero neutral.
      const beta = Number.isFinite(e.beta) ? (e.beta as number) : null;
      const gamma = Number.isFinite(e.gamma) ? (e.gamma as number) : null;
      if (gamma === null && beta === null) return;
      if (gamma !== null) {
        rawGammaRef.current = gamma;
        if (smoothedGammaRef.current === null) smoothedGammaRef.current = gamma;
      }
      if (beta !== null) {
        rawBetaRef.current = beta;
        if (smoothedBetaRef.current === null) smoothedBetaRef.current = beta;
      }

      // Feed calibration sampler if active, OR during idle so we have a
      // pre-warmed median the moment the user clicks Start. This lets us
      // shorten the explicit calibration phase.
      if (status === "calibrating" || status === "idle") {
        if (gamma !== null) {
          const samples = calibrationSamplesRef.current;
          samples.push(gamma);
          if (samples.length > 120) samples.shift(); // cap at ~2s @ 60Hz
        }
        if (beta !== null) {
          const bSamples = betaCalibrationSamplesRef.current;
          bSamples.push(beta);
          if (bSamples.length > 120) bSamples.shift();
        }
      }

      // Fallback neutral so water isn't frozen if user hasn't hit Start yet
      if (gammaNeutralRef.current === null && gamma !== null) gammaNeutralRef.current = gamma;
      if (betaNeutralRef.current === null && beta !== null) betaNeutralRef.current = beta;
    };

    let rafId = 0;
    let lastT = performance.now();
    const loop = (t: number) => {
      const dt = Math.min(0.05, (t - lastT) / 1000); // clamp dt after tab-switch
      lastT = t;

      const rawG = rawGammaRef.current;
      const rawB = rawBetaRef.current;
      if (rawG !== null && rawB !== null) {
        // Light smoothing on raw input (alpha per-frame ≈ 0.55 at 60fps)
        const sensorAlpha = 1 - Math.exp(-48 * dt);
        const prevG = smoothedGammaRef.current ?? rawG;
        const prevB = smoothedBetaRef.current ?? rawB;
        const smoothedG = prevG + shortestArc(rawG - prevG) * sensorAlpha;
        const smoothedB = prevB + shortestArc(rawB - prevB) * sensorAlpha;
        smoothedGammaRef.current = smoothedG;
        smoothedBetaRef.current = smoothedB;

        if (status === "playing") {
          collectorRef.current.add(t, smoothedB);
        }

        if (gammaNeutralRef.current !== null && betaNeutralRef.current !== null) {
          // Per-axis deltas with shortest-arc + deadzone
          const gDelta = applyDeadzone(shortestArc(smoothedG - gammaNeutralRef.current), TILT_DEADZONE_DEG);
          // Beta convention: tilt phone TOWARD you (top closer) INCREASES beta
          // → water rises (filling). Tilt AWAY (top farther, pour forward)
          // DECREASES beta → bDelta negative → lower level. So mapping is
          // just bDelta / BETA_RANGE_DEG — positive delta = higher level.
          const bDelta = applyDeadzone(shortestArc(smoothedB - betaNeutralRef.current), TILT_DEADZONE_DEG);

          // Per-axis normalized contributions — gentle ease-in so small tilts
          // move water a bit, big tilts move it a lot.
          const gNorm = Math.max(-1, Math.min(1, gDelta / GAMMA_RANGE_DEG));
          const bNorm = Math.max(-1, Math.min(1, bDelta / BETA_RANGE_DEG));
          // Mild ease: ^1.15 feels near-linear but still tames micro-jitter
          const gEased = Math.sign(gNorm) * (Math.abs(gNorm) ** 1.15);
          const bEased = Math.sign(bNorm) * (Math.abs(bNorm) ** 1.15);

          // Combine: both axes contribute additively, clamped. Gamma weighted
          // slightly more since it's the primary "roll" control.
          const combined = gEased * 0.6 + bEased * 0.4;
          const targetLevel = Math.max(0, Math.min(1, 0.5 + combined * 0.5));

          // Ease-in factor for first 500ms of play so neutral mismatch at GO
          // doesn't yank the water. 0 at t=0 → 1 at t=500ms (smootherstep).
          let rampIn = 1;
          if (playStartMsRef.current !== null) {
            const sincePlay = t - playStartMsRef.current;
            if (sincePlay < 500) {
              const x = Math.max(0, sincePlay / 500);
              // smootherstep: 6x^5 - 15x^4 + 10x^3
              rampIn = x * x * x * (x * (x * 6 - 15) + 10);
            }
          }

          // Second-order spring on level (stiffness scaled by rampIn)
          const curLevel = levelMV.get();
          const effLevelStiff = LEVEL_STIFFNESS * rampIn;
          const effLevelDamp = LEVEL_DAMPING * Math.max(0.5, rampIn);
          const levelAccel = (targetLevel - curLevel) * effLevelStiff - levelVelRef.current * effLevelDamp;
          levelVelRef.current += levelAccel * dt;
          const nextLevel = Math.max(0, Math.min(1, curLevel + levelVelRef.current * dt));
          levelMV.set(nextLevel);

          // Slosh target — driven by gamma (L/R) only since surface tilts horizontally
          const sloshTarget = Math.max(-1, Math.min(1, gDelta / (GAMMA_RANGE_DEG * 0.8)));
          const curSlosh = sloshMV.get();
          const effSloshStiff = SLOSH_STIFFNESS * rampIn;
          const effSloshDamp = SLOSH_DAMPING * Math.max(0.5, rampIn);
          const sloshAccel = (sloshTarget - curSlosh) * effSloshStiff - sloshVelRef.current * effSloshDamp;
          sloshVelRef.current += sloshAccel * dt;
          const nextSlosh = Math.max(-1, Math.min(1, curSlosh + sloshVelRef.current * dt));
          sloshMV.set(nextSlosh);

          // Wall-slap detection
          const WALL_THRESH = 0.85;
          if (status === "playing") {
            if (nextSlosh > WALL_THRESH && wallArmedRef.current !== "R") {
              wallArmedRef.current = "R";
              setWallSplash({ key: t, side: "R" });
              if (hapticsOnRef.current && navigator.vibrate) {
                try { navigator.vibrate(10); } catch { /* ignore */ }
              }
            } else if (nextSlosh < -WALL_THRESH && wallArmedRef.current !== "L") {
              wallArmedRef.current = "L";
              setWallSplash({ key: t, side: "L" });
              if (hapticsOnRef.current && navigator.vibrate) {
                try { navigator.vibrate(10); } catch { /* ignore */ }
              }
            } else if (Math.abs(nextSlosh) < 0.5) {
              wallArmedRef.current = null;
            }
          }

          // Level state updated rarely (every 250ms) just for aria + infrequent
          // conditional UI. Water animation is driven entirely by the motion values.
          if (t - lastStateTickRef.current > 250) {
            lastStateTickRef.current = t;
            setLevel(nextLevel);
            setSlosh(nextSlosh);
          }
        }
      } else if (desktopTargetLevelRef.current !== null) {
        // Desktop input path: no gyro, just a target level 0..1 fed by
        // pointer drag / arrow keys. Reuses the exact same spring so
        // the feel matches the gyro version.
        const targetLevel = Math.max(0, Math.min(1, desktopTargetLevelRef.current));

        let rampIn = 1;
        if (playStartMsRef.current !== null) {
          const sincePlay = t - playStartMsRef.current;
          if (sincePlay < 500) {
            const x = Math.max(0, sincePlay / 500);
            rampIn = x * x * x * (x * (x * 6 - 15) + 10);
          }
        }

        const curLevel = levelMV.get();
        const effLevelStiff = LEVEL_STIFFNESS * rampIn;
        const effLevelDamp = LEVEL_DAMPING * Math.max(0.5, rampIn);
        const levelAccel =
          (targetLevel - curLevel) * effLevelStiff - levelVelRef.current * effLevelDamp;
        levelVelRef.current += levelAccel * dt;
        const nextLevel = Math.max(0, Math.min(1, curLevel + levelVelRef.current * dt));
        levelMV.set(nextLevel);
        // No slosh on desktop — no physical tilt axis.
        sloshMV.set(0);

        if (t - lastStateTickRef.current > 250) {
          lastStateTickRef.current = t;
          setLevel(nextLevel);
          setSlosh(0);
        }
      }
      rafId = requestAnimationFrame(loop);
    };

    const onOrientationChange = () => {
      if (smoothedGammaRef.current !== null) gammaNeutralRef.current = smoothedGammaRef.current;
      if (smoothedBetaRef.current !== null) betaNeutralRef.current = smoothedBetaRef.current;
      // Re-arm the ramp-in so the spring doesn't yank the level across the
      // discontinuity in sensor reading at the rotation event.
      if (status === "playing") {
        playStartMsRef.current = performance.now();
        levelVelRef.current = 0;
        sloshVelRef.current = 0;
      }
    };

    window.addEventListener("deviceorientation", onOrient);
    window.addEventListener("orientationchange", onOrientationChange);
    rafId = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener("deviceorientation", onOrient);
      window.removeEventListener("orientationchange", onOrientationChange);
      if (rafId) cancelAnimationFrame(rafId);
    };
    // Motion values and spring constants are stable refs/primitives; safe to omit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tiltEnabled, status]);

  // Desktop input: activate when the tilt probe settled and no sensor
  // is available. Pointer drag over the game area AND arrow-up/down
  // anywhere (when focused) move the target level. Step for arrows
  // is 5% per press; holding repeats via the native key-repeat.
  useEffect(() => {
    if (!probeSettled || tiltAvailable) return;
    // Seed the target so the very first frame after Start has something
    // to spring toward (mid-glass).
    if (desktopTargetLevelRef.current === null) {
      desktopTargetLevelRef.current = 0.5;
    }

    const el = rootDivRef.current;
    if (!el) return;

    let dragging = false;
    const rectYToLevel = (clientY: number) => {
      const r = el.getBoundingClientRect();
      // Top of the rect = full, bottom = empty.
      const ratio = (clientY - r.top) / r.height;
      return Math.max(0, Math.min(1, 1 - ratio));
    };

    const onPointerDown = (e: PointerEvent) => {
      dragging = true;
      el.setPointerCapture?.(e.pointerId);
      desktopTargetLevelRef.current = rectYToLevel(e.clientY);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return;
      desktopTargetLevelRef.current = rectYToLevel(e.clientY);
    };
    const onPointerUp = () => { dragging = false; };

    const onKey = (e: KeyboardEvent) => {
      // Only act when this element has focus (tabIndex=0 already set).
      if (document.activeElement !== el) return;
      const cur = desktopTargetLevelRef.current ?? 0.5;
      if (e.key === "ArrowUp") {
        e.preventDefault();
        desktopTargetLevelRef.current = Math.min(1, cur + 0.05);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        desktopTargetLevelRef.current = Math.max(0, cur - 0.05);
      }
    };

    el.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("keydown", onKey);
    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("keydown", onKey);
    };
  }, [probeSettled, tiltAvailable]);

  const [tiltDenied, setTiltDenied] = useState(false);
  // iOS requires requestPermission to be *called* synchronously from a user
  // gesture. The returned promise can be awaited afterwards; what matters
  // is that the call itself happens in the same task as the click event.
  const enableTilt = () => {
    type ReqPerm = () => Promise<"granted" | "denied">;
    const anyDOE = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: ReqPerm } }).DeviceOrientationEvent;
    const anyDME = (window as unknown as { DeviceMotionEvent?: { requestPermission?: ReqPerm } }).DeviceMotionEvent;

    // Call both permission APIs synchronously (iOS Safari gates each separately).
    const doePromise = anyDOE?.requestPermission ? anyDOE.requestPermission() : null;
    const dmePromise = anyDME?.requestPermission ? anyDME.requestPermission() : null;

    // If neither API is present, we're on Android / desktop — just enable.
    if (!doePromise && !dmePromise) {
      setTiltEnabled(true);
      setTiltDenied(false);
      return;
    }

    Promise.all([doePromise, dmePromise].filter(Boolean) as Promise<"granted" | "denied">[])
      .then((results) => {
        const granted = results.every((r) => r === "granted");
        if (granted) {
          setTiltEnabled(true);
          setTiltDenied(false);
        } else {
          setTiltDenied(true);
        }
      })
      .catch(() => setTiltDenied(true));
  };


  /* -------------------- Game loop -------------------- */
  const PRACTICE_KEY = "livewager-dunk-practice-used";
  const [chargeFailed, setChargeFailed] = useState(false);
  const [isPractice, setIsPractice] = useState(false);
  const sessionScoresRef = useRef<number[]>([]);
  const [sessionRounds, setSessionRounds] = useState(0);
  const [sessionSpend, setSessionSpend] = useState(0);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const lastCooldownRoundRef = useRef(0);
  const [sessionCap, setSessionCap] = useState<number | null>(null); // max $ to spend this session
  const [practiceAvailable, setPracticeAvailable] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setPracticeAvailable(!localStorage.getItem(PRACTICE_KEY));
    // Flush any queued score submissions from previous sessions
    flushScoreQueue();
  }, []);

  // Screen wake-lock: keep the screen awake from ready → over
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    type WL = { release?: () => Promise<void> };
    type WLNav = { wakeLock?: { request: (t: "screen") => Promise<WL> } };
    const nav = navigator as unknown as WLNav;
    if (!nav.wakeLock) return;
    const active = status === "calibrating" || status === "ready" || status === "playing" || status === "over";
    if (!active) return;
    let sentinel: WL | null = null;
    let cancelled = false;
    nav.wakeLock
      .request("screen")
      .then((s) => {
        if (cancelled) void s.release?.();
        else sentinel = s;
      })
      .catch(() => {
        /* ignore — user can still play */
      });
    return () => {
      cancelled = true;
      if (sentinel) void sentinel.release?.();
    };
  }, [status]);

  // Lock body scroll during play so mobile tilt doesn't scroll the page
  // and pull-to-refresh can't fire mid-round.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const locked = status === "playing" || status === "ready" || status === "calibrating";
    if (!locked) return;
    const prevOverflow = document.body.style.overflow;
    const prevOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "contain";
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.overscrollBehavior = prevOverscroll;
    };
  }, [status]);

  // Cooldown tick
  useEffect(() => {
    if (cooldownUntil <= 0) {
      setCooldownLeft(0);
      return;
    }
    const update = () => {
      const left = Math.max(0, cooldownUntil - Date.now());
      setCooldownLeft(left);
      if (left <= 0) setCooldownUntil(0);
    };
    update();
    const id = setInterval(update, 250);
    return () => clearInterval(id);
  }, [cooldownUntil]);

  const lastStartAtRef = useRef(0);
  const startGame = (practice = false) => {
    // Double-tap debounce: ignore a second start within 500ms of the last
    const now = Date.now();
    if (now - lastStartAtRef.current < 500) return;
    lastStartAtRef.current = now;
    if (status === "ready" || status === "playing") return;
    if (!practice && cooldownUntil > now) return;
    if (!practice && sessionCap !== null && sessionSpend + ENTRY_USD > sessionCap) return;
    // Stamp a "last played" marker so /play can render "X ago" on
    // the Tilt Pour card. Idempotent, localStorage-only.
    try {
      window.localStorage.setItem(
        "livewager-pref:pourLastPlayed",
        JSON.stringify(Date.now()),
      );
    } catch {
      /* ignore quota / private */
    }
    // Auto-request tilt permission on the same user gesture (required by iOS Safari).
    // Always attempt — `enableTilt()` is a no-op on devices without the API.
    if (!tiltEnabled) {
      enableTilt();
    }
    // Warm the AudioContext on the user gesture so the first ding isn't late.
    ensureAudio();
    if (!practice) {
      if (!chargeForRound()) {
        setChargeFailed(true);
        return;
      }
    } else {
      try {
        localStorage.setItem(PRACTICE_KEY, "1");
        setPracticeAvailable(false);
      } catch {
        /* ignore */
      }
    }
    setIsPractice(practice);
    setChargeFailed(false);
    // Shared round seed: everyone who starts a round in the same 20-second
    // wall-clock window gets identical setpoints. Fair by construction, and
    // will be server-signed later for tamper resistance.
    const s = Math.floor(Date.now() / ROUND_MS);
    setSeed(s);
    setScore(0);
    setPerfectMs(0);
    setBullseyeCount(0);
    setCountdown(Math.round(ROUND_MS / 1000));
    lastInZoneRef.current = false;
    lastBullseyeRef.current = false;
    lastLevelRef.current = 0.5;
    setLevel(0.5);
    setPreCount(3);
    collectorRef.current.reset();
    setLastReport(null);
    setServerResult(null);
    // Retry any pending score submissions from earlier dropped network
    flushScoreQueue();
    // Reset spring physics + motion values for a clean round
    levelVelRef.current = 0;
    sloshVelRef.current = 0;
    levelMV.set(0.5);
    sloshMV.set(0);
    // Clear any prior neutral so calibration captures a fresh one.
    // Keep any pre-warmed idle samples — they seed the median and let the
    // explicit calibration phase be shorter.
    gammaNeutralRef.current = null;
    betaNeutralRef.current = null;
    playStartMsRef.current = null;
    setStatus("calibrating");
  };

  // Calibration phase: collect gamma samples for ~1.8s, take the median as neutral,
  // then transition into ready (pre-countdown). Runs regardless of how the phone
  // is held — lying down, sitting, standing all work.
  useEffect(() => {
    if (status !== "calibrating") return;
    // Desktop has no gyro to calibrate against — skip the wait.
    const desktop = probeSettled && !tiltAvailable;
    // If we already have a warm buffer from idle, calibrate in 600ms instead of 1800ms.
    // Otherwise allow the full 1800ms to collect.
    const preWarm = calibrationSamplesRef.current.length;
    const CAL_MS = desktop ? 200 : preWarm >= 30 ? 600 : 1800;
    const start = performance.now();
    let frame = 0;
    const tick = () => {
      const elapsed = performance.now() - start;
      if (elapsed >= CAL_MS) {
        const samples = calibrationSamplesRef.current.slice();
        if (samples.length > 0) {
          samples.sort((a, b) => a - b);
          const median = samples[Math.floor(samples.length / 2)];
          gammaNeutralRef.current = median;
        } else if (smoothedGammaRef.current !== null) {
          gammaNeutralRef.current = smoothedGammaRef.current;
        } else {
          gammaNeutralRef.current = 0;
        }
        const bSamples = betaCalibrationSamplesRef.current.slice();
        if (bSamples.length > 0) {
          bSamples.sort((a, b) => a - b);
          betaNeutralRef.current = bSamples[Math.floor(bSamples.length / 2)];
        } else if (smoothedBetaRef.current !== null) {
          betaNeutralRef.current = smoothedBetaRef.current;
        } else {
          betaNeutralRef.current = 60;
        }
        // Persist the neutral so the next round can skip the 1.8s wait.
        // 24h TTL lives inside the read path — stale calibrations (phone
        // was set down differently yesterday) expire automatically.
        writeRaw<StoredTiltCalibration>(PREF_KEYS.tiltCalibration, {
          gamma: gammaNeutralRef.current,
          beta: betaNeutralRef.current,
          at: Date.now(),
        });
        setStatus("ready");
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [status]);

  // Fetch server-signed seed when entering ready (best-effort — no block if it fails)
  useEffect(() => {
    if (status !== "ready") {
      setSignedSeed(null);
      return;
    }
    const ac = new AbortController();
    fetch("/api/dunk/round", { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && typeof data.roundId === "number") {
          setSignedSeed({
            roundId: data.roundId,
            signature: data.signature,
            expiresAt: data.expiresAt,
          });
        }
      })
      .catch(() => {
        /* swallow — client seed still works */
      });
    return () => ac.abort();
  }, [status]);

  // Pre-round 3-2-1 countdown → "playing"
  useEffect(() => {
    if (status !== "ready") return;
    const ctx = ensureAudio();
    if (ctx) playBeep(ctx, 440, 0.12, "triangle", 0.05);
    haptic(20);
    const tick = setInterval(() => {
      setPreCount((c) => {
        const next = c - 1;
        if (next <= 0) {
          clearInterval(tick);
          // Neutral gamma/beta were already captured during the calibration phase.
          // Don't overwrite them here — that would reset to a possibly-unstable
          // reading right at GO.
          const goCtx = audioCtxRef.current;
          if (goCtx) {
            playBeep(goCtx, 880, 0.22, "triangle", 0.07);
            if (!pourNodesRef.current) {
              pourNodesRef.current = startPourNoise(goCtx);
            }
          }
          haptic(60);
          setStatus("playing");
          return 0;
        }
        const c2 = audioCtxRef.current;
        if (c2) playBeep(c2, 440, 0.1, "triangle", 0.045);
        haptic(20);
        return next;
      });
    }, 800);
    return () => clearInterval(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);
  const topUp = (usd: number) => {
    addCredits(usd);
    setChargeFailed(false);
  };

  useEffect(() => {
    if (status !== "playing") return;
    // Reset spring state + seed level to current motion value so first frame
    // of the play raf loop doesn't fight a stale velocity. Capture play start
    // time so the tilt raf loop can soft-ramp stiffness for 500ms.
    levelVelRef.current = 0;
    sloshVelRef.current = 0;
    playStartMsRef.current = performance.now();
    const round = makeRound(seed);
    const startTs = performance.now();
    let lastTs = startTs;
    let accumScore = 0;
    let accumPerfect = 0;
    let lastScorePublish = startTs;
    // How long (ms) the player has been in the bullseye zone continuously.
    // Scales the bullseye multiplier from 2× at 0ms → up to 3× at 500ms+.
    let bullseyeHeldMs = 0;

    const step = (now: number) => {
      const elapsed = now - startTs;
      const dt = now - lastTs;
      lastTs = now;

      if (elapsed >= round.totalMs) {
        setStatus("over");
        const finalScore = Math.round(accumScore);
        setScore(finalScore);
        setPerfectMs(Math.round(accumPerfect));
        if (finalScore > highScore) {
          localStorage.setItem(HS_KEY, String(finalScore));
          setHighScore(finalScore);
        }
        const report = collectorRef.current.build();
        setLastReport(report);
        if (process.env.NODE_ENV !== "production") {
          // eslint-disable-next-line no-console
          console.log("[pour.anticheat]", report);
        }
        if (!isPractice) {
          // Track session regardless of score (a zero-score paid round still counts toward spend/rounds)
          sessionScoresRef.current = [...sessionScoresRef.current, finalScore];
          setSessionRounds((r) => {
            const next = r + 1;
            // Fire a mandatory 30s cooldown at every 20th paid round
            if (next > 0 && next % 20 === 0 && lastCooldownRoundRef.current !== next) {
              lastCooldownRoundRef.current = next;
              setCooldownUntil(Date.now() + 30_000);
            }
            return next;
          });
          setSessionSpend((s) => Number((s + ENTRY_USD).toFixed(2)));
        }
        if (finalScore > 0 && !isPractice) {
          postScore("pour", finalScore, seed);
          // Server-side submission (best-effort, with retry queue)
          if (signedSeed && signedSeed.roundId === seed) {
            const me = getPlayerHandle();
            if (me) {
              const perfectMsLocal = Math.round(accumPerfect);
              const submitBody: Record<string, unknown> = {
                game: "pour",
                handle: me,
                flag: typeof window !== "undefined" ? localStorage.getItem("livewager-dunk-flag") : undefined,
                score: finalScore,
                roundId: signedSeed.roundId,
                expiresAt: signedSeed.expiresAt,
                signature: signedSeed.signature,
                perfectMs: perfectMsLocal,
                tremor: report.tremor,
                repeatRatio: report.repeatRatio,
                samples: report.samples,
              };
              fetch("/api/dunk/score", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(submitBody),
              })
                .then(async (r) => {
                  const data = await r.json().catch(() => null);
                  if (!r.ok && r.status >= 500) {
                    // Transient server error — queue for retry
                    enqueueScore(submitBody, signedSeed.expiresAt);
                  }
                  if (data && typeof data === "object") {
                    setServerResult({
                      accepted: Boolean(data.ok && data.accepted),
                      suspicious: Array.isArray(data.suspicious) ? data.suspicious : [],
                      error: typeof data.error === "string" ? data.error : undefined,
                    });
                  }
                })
                .catch(() => {
                  // Offline — queue it; flushed on next round start + page load
                  enqueueScore(submitBody, signedSeed.expiresAt);
                });
            }
          }
          // Decide if the round earned a celebration
          const me = getPlayerHandle();
          const board = getHourBoard();
          const myIdx = board.findIndex((r) => r.game === "pour" && r.handle === me);
          const isTop3 = myIdx >= 0 && myIdx < 3;
          const isNewHigh = finalScore > highScore;
          const isBigRound = finalScore >= 5000;
          if (isNewHigh || isTop3 || isBigRound) {
            setCelebrate(true);
            setTimeout(() => setCelebrate(false), 3400);
          }
        }
        const ctx = ensureAudio();
        if (ctx) {
          if (pourNodesRef.current) {
            stopPourNoise(ctx, pourNodesRef.current);
            pourNodesRef.current = null;
          }
          playRoundEnd(ctx);
        }
        haptic(HAPTIC_ROUND_END);
        return;
      }

      // Figure out which setpoint we're in + ease between them
      let t = 0;
      let idx = 0;
      for (; idx < round.pts.length; idx++) {
        if (elapsed < t + round.pts[idx].durMs) break;
        t += round.pts[idx].durMs;
      }
      const segT = Math.min(1, (elapsed - t) / round.pts[Math.min(idx, round.pts.length - 1)].durMs);
      const from = idx === 0 ? 0.5 : round.pts[idx - 1].target;
      const to = round.pts[Math.min(idx, round.pts.length - 1)].target;
      // Ease in/out so target glides — softened (smoothstep) so setpoint
      // transitions feel gentle rather than snappy.
      const ease = segT * segT * (3 - 2 * segT);
      const tgt = from + (to - from) * ease;
      setTarget(tgt);

      // Score curve — reads the live level from the motion value (not stale state).
      //   precision = (1 - diff*3)^2 so the gradient is gentler (was *4)
      //   in-zone widened from 0.05 → 0.07 for more forgiving scoring
      //   bullseye stays tight (diff < 0.02, up slightly from 0.01) for obvious payoff
      const curr = levelMV.get();
      {
        const diff = Math.abs(curr - tgt);
        const linear = Math.max(0, 1 - diff * 3);
        const precision = linear * linear;
        // Bullseye streak: 2× base, +1× extra scaled over first 500ms held.
        // Breaks the moment diff leaves bullseye zone.
        if (diff < 0.02) {
          bullseyeHeldMs += dt;
        } else {
          bullseyeHeldMs = 0;
        }
        const streakBonus = diff < 0.02 ? Math.min(1, bullseyeHeldMs / 500) : 0;
        const bullseye = diff < 0.02 ? 2 + streakBonus : 1;
        accumScore += precision * bullseye * dt * 0.3;
        if (diff < 0.07) accumPerfect += dt;

        // Publish live score every 150ms so the HUD SCORE chip ticks up
        if (now - lastScorePublish > 150) {
          lastScorePublish = now;
          setScore(Math.round(accumScore));
        }

        // Audio: modulate pour noise filter by |velocity|, play ding/exit on transitions
        const ctx = audioCtxRef.current;
        if (ctx && pourNodesRef.current) {
          const velocity = Math.abs(curr - lastLevelRef.current) / Math.max(dt, 1);
          const targetFreq = 220 + Math.min(1, velocity * 80) * 1600;
          const targetVol = 0.012 + Math.min(1, velocity * 40) * 0.035;
          const now = ctx.currentTime;
          pourNodesRef.current.filter.frequency.linearRampToValueAtTime(targetFreq, now + 0.04);
          pourNodesRef.current.gain.gain.linearRampToValueAtTime(targetVol, now + 0.08);
        }
        lastLevelRef.current = curr;

        collectorRef.current.add(now, curr * 90);

        // Hysteresis: enter zone at 0.06, exit at 0.08 — prevents rapid flip
        // and the visual flicker in the target band when hovering near edge.
        const wasInZone = lastInZoneRef.current;
        const inZoneNow = wasInZone ? diff < 0.08 : diff < 0.06;
        if (inZoneNow !== wasInZone) {
          const ctx2 = audioCtxRef.current;
          if (ctx2) {
            if (inZoneNow) playZoneDing(ctx2);
            else playZoneExit(ctx2);
          }
          haptic(inZoneNow ? HAPTIC_ZONE_IN : HAPTIC_ZONE_OUT);
          if (inZoneNow) setSplashKey((k) => k + 1);
          lastInZoneRef.current = inZoneNow;
        }

        // Same hysteresis on bullseye: enter at 0.015, exit at 0.025.
        const wasBullseye = lastBullseyeRef.current;
        const bullseyeNow = wasBullseye ? diff < 0.025 : diff < 0.015;
        if (bullseyeNow !== wasBullseye) {
          if (bullseyeNow) {
            haptic([8, 40, 12]);
            const ctx2 = audioCtxRef.current;
            if (ctx2) playBeep(ctx2, 1567, 0.1, "sine", 0.045);
            setBullseyeCount((n) => n + 1);
          }
          lastBullseyeRef.current = bullseyeNow;
        }
      }

      const nextCountdown = Math.max(0, Math.ceil((round.totalMs - elapsed) / 1000));
      setCountdown((prev) => {
        if (prev !== nextCountdown && nextCountdown > 0 && nextCountdown <= 3) {
          haptic(HAPTIC_COUNTDOWN_PULSE);
        }
        return nextCountdown;
      });

      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      // Ensure pour noise is stopped if the round aborts early (e.g. status change)
      const ctx = audioCtxRef.current;
      if (ctx && pourNodesRef.current) {
        stopPourNoise(ctx, pourNodesRef.current);
        pourNodesRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, seed]);

  const diff = Math.abs(level - target);
  const inZone = diff < 0.07;
  const bullseye = diff < 0.02;
  const finalSeconds = status === "playing" && countdown > 0 && countdown <= 3;

  /* -------------------- Render -------------------- */
  return (
    <div
      ref={rootDivRef}
      className="relative aspect-[3/4] sm:aspect-video w-full rounded-2xl overflow-hidden ring-1 ring-white/10 shadow-2xl bg-gradient-to-br from-[#0b1a2a] via-[#051224] to-[#020b18] select-none touch-none focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
      role="slider"
      aria-label={isDesktopMode() ? "Water level. Drag up/down or use arrow keys to match the target line." : "Water level. Tilt your phone to match the target line."}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(level * 100)}
      aria-valuetext={`Water level ${Math.round(level * 100)} percent. Target ${Math.round(target * 100)} percent.${inZone ? " In zone." : ""}`}
      aria-orientation="vertical"
      tabIndex={0}
      style={{ cursor: isDesktopMode() ? "ns-resize" : "default" }}
    >
      {/* Ground plane — soft shadow + subtle water ring reflection directly under the glass */}
      <div
        className="absolute left-1/2 -translate-x-1/2 pointer-events-none"
        aria-hidden
        style={{
          bottom: "6%",
          width: "58%",
          height: 28,
          borderRadius: "50%",
          background:
            "radial-gradient(ellipse at center, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.3) 40%, transparent 70%)",
          filter: "blur(6px)",
        }}
      />
      <div
        className="absolute left-1/2 -translate-x-1/2 pointer-events-none"
        aria-hidden
        style={{
          bottom: "5.5%",
          width: "48%",
          height: 10,
          borderRadius: "50%",
          background: `radial-gradient(ellipse at center, ${CYAN}55 0%, transparent 70%)`,
          filter: "blur(4px)",
          opacity: 0.6,
        }}
      />

      {/* Glass visualization — proper depth with thickness, rim highlights, bottom catch */}
      <div className="absolute inset-0 flex items-center justify-center">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="relative w-[56%] h-[88%] rounded-[18px_18px_28px_28px] overflow-hidden"
          style={{
            border: finalSeconds
              ? "2px solid rgba(251,146,60,0.9)"
              : "1.5px solid rgba(255,255,255,0.45)",
            background: "rgba(255,255,255,0.025)",
            boxShadow: finalSeconds
              ? "inset 0 1px 0 rgba(255,255,255,0.5), 0 0 32px rgba(251,146,60,0.5), 0 30px 60px -20px rgba(0,0,0,0.9)"
              : "inset 0 1px 0 rgba(255,255,255,0.5), 0 30px 60px -20px rgba(0,0,0,0.9)",
            transition: "border-color 0.25s ease, box-shadow 0.25s ease",
          }}
        >
          {/* Glass bottom "puddle" highlight — shows there's glass thickness below water */}
          <div
            className="absolute inset-x-0 bottom-0 h-3 pointer-events-none"
            style={{
              background: "linear-gradient(0deg, rgba(255,255,255,0.12), transparent)",
            }}
          />
          {/* Vertical rim highlight (left) */}
          <div
            className="absolute top-2 left-1 bottom-3 w-[3px] rounded-full pointer-events-none"
            style={{
              background: "linear-gradient(180deg, rgba(255,255,255,0.55), rgba(255,255,255,0.05))",
              filter: "blur(0.5px)",
            }}
          />
          {/* Vertical rim highlight (right, subtler) */}
          <div
            className="absolute top-3 right-1 bottom-6 w-[2px] rounded-full pointer-events-none"
            style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.25), rgba(255,255,255,0.02))" }}
          />

          {/* Water — fill height + diagonal surface clip driven by motion values.
              Updates DOM at native refresh rate (60/120Hz) without React reconciliation. */}
          <motion.div
            className="absolute inset-x-0 bottom-0 overflow-hidden"
            style={{
              background: `linear-gradient(180deg, ${CYAN} 0%, ${CYAN} 40%, #0891b2 100%)`,
              boxShadow: `inset 0 2px 8px rgba(255,255,255,0.45), inset 0 -6px 14px rgba(0,0,0,0.3)`,
              willChange: "height, clip-path",
              height: waterHeightPct,
              clipPath: reduceMotion ? undefined : waterClipPath,
            }}
          >
            {/* Animated wave surface (SVG) — only during play to save CPU */}
            {!reduceMotion && status === "playing" && (
              <svg
                className="absolute left-0 right-0 top-[-4px] h-3 w-full"
                viewBox="0 0 100 10"
                preserveAspectRatio="none"
                aria-hidden
              >
                <defs>
                  <linearGradient id="surfaceShine" x1="0" x2="1">
                    <stop offset="0%" stopColor="rgba(255,255,255,0)" />
                    <stop offset="50%" stopColor="rgba(255,255,255,0.7)" />
                    <stop offset="100%" stopColor="rgba(255,255,255,0)" />
                  </linearGradient>
                </defs>
                <path d="M0,5 Q25,4 50,5 T100,5 L100,10 L0,10 Z" fill={CYAN} />
                <path d="M0,5 Q25,4 50,5 T100,5" fill="none" stroke="url(#surfaceShine)" strokeWidth="0.6" />
              </svg>
            )}

            {/* Bubbles — deterministic positions; gated to playing so idle doesn't burn CPU */}
            {!reduceMotion && status === "playing" &&
              BUBBLES.map((b, i) => (
                <span
                  key={i}
                  className="absolute rounded-full bg-white/30"
                  style={{
                    left: `${b.x}%`,
                    bottom: 0,
                    width: b.size,
                    height: b.size,
                    animation: `pourBubble ${b.dur}s ${b.delay}s linear infinite`,
                    willChange: "transform, opacity",
                  }}
                />
              ))}
          </motion.div>

          {/* Edge-glow warnings */}
          {level > 0.95 && (
            <div
              className="absolute inset-x-0 top-0 h-6 pointer-events-none"
              style={{ background: "linear-gradient(180deg, rgba(239,68,68,0.5), transparent)" }}
            />
          )}
          {level < 0.05 && (
            <div
              className="absolute inset-x-0 bottom-0 h-6 pointer-events-none"
              style={{ background: "linear-gradient(0deg, rgba(239,68,68,0.5), transparent)" }}
            />
          )}

          {/* Target band — grows thick + pulses when in-zone so the hit is visceral */}
          <motion.div
            className="absolute inset-x-0 pointer-events-none"
            animate={{
              bottom: `${target * 100}%`,
              height: inZone ? (bullseye ? 5 : 4) : 2,
            }}
            transition={{
              bottom: { type: "tween", duration: 0.05, ease: "linear" },
              height: { type: "spring", stiffness: 500, damping: 30 },
            }}
            style={{
              background: inZone ? (bullseye ? "#a3e635" : "#bef264") : "#facc15",
              boxShadow: `0 0 ${inZone ? (bullseye ? 32 : 22) : 10}px ${inZone ? "#a3e635" : "#facc15"}, 0 0 ${inZone ? (bullseye ? 48 : 32) : 0}px ${inZone ? "#a3e635" : "transparent"}`,
              rotate: targetRotateDeg,
              y: "-50%",
              transformOrigin: "50% 50%",
            }}
          >
            <motion.span
              className="absolute -right-1.5 top-1/2 -translate-y-1/2 rounded-full"
              animate={{
                width: bullseye ? 14 : inZone ? 12 : 10,
                height: bullseye ? 14 : inZone ? 12 : 10,
              }}
              transition={{ type: "spring", stiffness: 500, damping: 28 }}
              style={{
                background: inZone ? "#a3e635" : "#facc15",
                boxShadow: bullseye ? "0 0 18px #a3e635, 0 0 30px #a3e635" : inZone ? "0 0 12px #a3e635" : "none",
                y: "-50%",
              }}
            />
            <span
              className="absolute -left-16 top-1/2 -translate-y-1/2 text-[10px] font-mono tracking-widest"
              style={{ color: inZone ? "#a3e635" : "#facc15" }}
            >
              TARGET
            </span>
          </motion.div>

          {/* (Directional hint removed — caused flicker at low state-update rate.
              The tilting target line + water give enough directional feedback.) */}

          {/* Bullseye halo — continuous soft pulse while inside 1% of target */}
          {status === "playing" && bullseye && !reduceMotion && (
            <motion.div
              className="absolute left-1/2 pointer-events-none"
              style={{
                bottom: `${target * 100}%`,
                marginLeft: -24,
                marginBottom: -12,
                width: 48,
                height: 24,
                borderRadius: "50%",
                border: "2px solid #a3e635",
                boxShadow: "0 0 18px rgba(163,230,53,0.7), inset 0 0 10px rgba(163,230,53,0.4)",
              }}
              animate={{
                scale: [1, 1.25, 1],
                opacity: [0.9, 0.45, 0.9],
              }}
              transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut" }}
              aria-hidden
            />
          )}

          {/* Wall-slap splash — fires on extreme slosh edge-trigger */}
          <AnimatePresence>
            {wallSplash && !reduceMotion && (
              <motion.div
                key={`wall-${wallSplash.key}`}
                initial={{ opacity: 0.5, scaleY: 0.4 }}
                animate={{ opacity: 0, scaleY: 1.4 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                onAnimationComplete={() => setWallSplash(null)}
                className="absolute top-0 bottom-0 w-8 pointer-events-none"
                style={{
                  [wallSplash.side === "L" ? "left" : "right"]: 0,
                  background: `linear-gradient(${wallSplash.side === "L" ? "90deg" : "270deg"}, rgba(34,211,238,0.4), transparent)`,
                  transformOrigin: wallSplash.side === "L" ? "left center" : "right center",
                }}
                aria-hidden
              />
            )}
          </AnimatePresence>

          {/* Splash ripple on zone entry */}
          <AnimatePresence>
            {splashKey > 0 && !reduceMotion && (
              <motion.div
                key={splashKey}
                initial={{ scale: 0.3, opacity: 0.9 }}
                animate={{ scale: 2.6, opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.55, ease: "easeOut" }}
                className="absolute left-1/2 w-16 h-16 rounded-full pointer-events-none"
                style={{
                  bottom: `${target * 100}%`,
                  marginLeft: -32,
                  marginBottom: -32,
                  border: "2px solid #a3e635",
                  boxShadow: "0 0 20px rgba(163,230,53,0.5), inset 0 0 12px rgba(163,230,53,0.3)",
                }}
                aria-hidden
              />
            )}
          </AnimatePresence>
          {/* Small droplets burst (faster, tighter) */}
          <AnimatePresence>
            {splashKey > 0 && !reduceMotion && (
              <motion.div
                key={`d-${splashKey}`}
                initial={{ opacity: 1 }}
                animate={{ opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5 }}
                className="absolute left-1/2 pointer-events-none"
                style={{ bottom: `${target * 100}%` }}
                aria-hidden
              >
                {[0, 60, 120, 180, 240, 300].map((angle, i) => (
                  <motion.span
                    key={i}
                    className="absolute w-1 h-1 rounded-full bg-lime-300"
                    initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                    animate={{
                      x: Math.cos((angle * Math.PI) / 180) * 28,
                      y: Math.sin((angle * Math.PI) / 180) * 28,
                      opacity: 0,
                      scale: 0.4,
                    }}
                    transition={{ duration: 0.45, ease: "easeOut" }}
                    style={{ boxShadow: "0 0 6px #a3e635" }}
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Outer glass reflection dot */}
          <div
            className="absolute top-3 left-[22%] w-2 h-6 rounded-full opacity-60 pointer-events-none"
            style={{ background: "rgba(255,255,255,0.5)", filter: "blur(1px)" }}
          />
        </motion.div>
      </div>

      {/* Bubble keyframes */}
      <style>{`
        @keyframes pourBubble {
          0% { transform: translate3d(0, 0, 0); opacity: 0; }
          15% { opacity: 0.85; }
          100% { transform: translate3d(0, -100%, 0); opacity: 0; }
        }
      `}</style>

      {/* Final-seconds red vignette */}
      <AnimatePresence>
        {finalSeconds && !reduceMotion && (
          <motion.div
            key="vignette"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.45, 0.9, 0.45] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
            className="absolute inset-0 pointer-events-none rounded-2xl"
            style={{
              boxShadow: "inset 0 0 80px rgba(239,68,68,0.55)",
            }}
            aria-hidden
          />
        )}
      </AnimatePresence>

      {/* HUD */}
      <div className="absolute top-2.5 sm:top-3 left-2.5 sm:left-3 right-2.5 sm:right-3 flex items-start justify-between gap-2 pointer-events-none">
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap min-w-0">
          <motion.span
            key={countdown <= 3 && status === "playing" ? `t-${countdown}` : "t-normal"}
            animate={
              reduceMotion || status !== "playing" || countdown > 3
                ? undefined
                : { scale: [1, 1.18, 1] }
            }
            transition={{ duration: 0.5, ease: "easeOut" }}
            className={`px-2 sm:px-2.5 py-1 rounded-md text-[10px] sm:text-[11px] font-mono whitespace-nowrap ${
              status === "playing" && countdown <= 3
                ? "text-white"
                : "bg-black/80 text-white"
            }`}
            style={
              status === "playing" && countdown <= 3
                ? {
                    background: "rgba(239,68,68,0.3)",
                    boxShadow: "0 0 18px rgba(239,68,68,0.45)",
                    border: "1px solid rgba(239,68,68,0.6)",
                  }
                : undefined
            }
          >
            TIME{" "}
            <span className={status === "playing" && countdown <= 3 ? "text-red-200 font-bold" : "text-cyan-300"}>
              {String(countdown).padStart(2, "0")}s
            </span>
          </motion.span>
          <motion.span
            className="bg-black/80 px-2 sm:px-2.5 py-1 rounded-md text-[10px] sm:text-[11px] font-mono text-white whitespace-nowrap origin-left"
            aria-live="polite"
            aria-atomic
            animate={reduceMotion || status !== "playing" ? undefined : { scale: [1, 1.12, 1] }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            key={`score-pulse-${bullseyeCount}`}
          >
            SCORE <span className="text-cyan-300 tabular-nums inline-block text-right" style={{ minWidth: "4ch" }}>{Math.round(score || (status === "playing" ? 0 : score))}</span>
          </motion.span>
          {status === "playing" && bullseyeCount > 0 && (
            <motion.span
              key={bullseyeCount}
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 400, damping: 22 }}
              className="bg-black/80 px-2 sm:px-2.5 py-1 rounded-md text-[10px] sm:text-[11px] font-mono whitespace-nowrap border border-lime-300/40"
              aria-label={`${bullseyeCount} bullseyes`}
              title="Bullseye hits (entered <2% of target)"
              style={{
                boxShadow: `0 0 ${Math.min(24, bullseyeCount * 3)}px rgba(163,230,53,${Math.min(0.55, bullseyeCount * 0.06)})`,
              }}
            >
              <span className="text-lime-300">◎</span>{" "}
              <span className="text-white tabular-nums">{bullseyeCount}</span>
            </motion.span>
          )}
          {isPractice && status === "playing" && (
            <span className="bg-white/10 border border-white/20 px-2 sm:px-2.5 py-1 rounded-md text-[10px] sm:text-[11px] font-mono text-white/80 whitespace-nowrap">
              PRACTICE
            </span>
          )}
        </div>
        <span className="bg-black/80 px-2 sm:px-2.5 py-1 rounded-md text-[10px] sm:text-[11px] font-mono text-white whitespace-nowrap shrink-0">
          HI <span className="text-cyan-300">{highScore}</span>
        </span>
      </div>

      {/* Distance-to-target readout during play — helps players feel
          how close/far they are without staring at the band */}
      {status === "playing" && (
        <div
          className="absolute bottom-3 right-3 bg-black/80 px-2.5 py-1 rounded-md text-[10px] font-mono uppercase tracking-widest pointer-events-none"
          style={{
            color: inZone ? (bullseye ? "#a3e635" : "#bef264") : "#facc15",
          }}
        >
          {bullseye ? "BULLSEYE" : inZone ? "IN ZONE" : `OFF · ${(diff * 100).toFixed(0)}%`}
        </div>
      )}

      {/* Tilt-alive indicator: only visible during calibrating/ready (pre-play).
          Once play starts, we trust the sensor is working and don't clutter
          the HUD. Users who need to diagnose can still use ?debug=1. */}
      {(status === "ready" || status === "calibrating") && (
        <div
          className="absolute bottom-3 left-3 bg-black/70 px-2 py-0.5 rounded-full text-[9px] font-mono pointer-events-none flex items-center gap-1.5"
          aria-hidden
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: tiltEnabled && tiltAvailable ? "#a3e635" : "#f87171" }}
          />
          <span className="text-white/70">
            TILT {tiltEnabled && tiltAvailable ? "LIVE" : "WAITING"}
          </span>
        </div>
      )}

      {/* Diagnostic readout: append ?debug=1 to the URL to show live gamma values */}
      {typeof window !== "undefined" && window.location.search.includes("debug=1") && (
        <div className="absolute top-14 left-2 bg-black/90 px-2 py-1 rounded text-[9px] font-mono text-white/80 pointer-events-none leading-tight">
          <div>tiltEnabled: {tiltEnabled ? "Y" : "N"}</div>
          <div>tiltAvailable: {tiltAvailable ? "Y" : "N"}</div>
          <div>gamma: {rawGammaRef.current?.toFixed(1) ?? "—"}</div>
          <div>beta: {rawBetaRef.current?.toFixed(1) ?? "—"}</div>
          <div>gN: {gammaNeutralRef.current?.toFixed(1) ?? "—"} bN: {betaNeutralRef.current?.toFixed(1) ?? "—"}</div>
          <div>level: {level.toFixed(2)}</div>
          <div>slosh: {slosh.toFixed(2)}</div>
          <div>score: {score}</div>
          <div>status: {status}</div>
        </div>
      )}

      {/* Perfect / Bullseye chip — absolute so the top HUD never reflows when it appears */}
      <AnimatePresence>
        {inZone && status === "playing" && (
          <motion.div
            key="perfect-chip"
            initial={{ scale: 0.8, opacity: 0, y: 4 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.8, opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
            className="absolute bottom-3 left-3 bg-lime-500 px-2.5 py-1 rounded-md text-[10px] sm:text-[11px] font-mono font-bold text-black whitespace-nowrap pointer-events-none"
          >
            {bullseye ? "BULLSEYE ×2" : "PERFECT"}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Overlays */}
      {cooldownLeft > 0 && status !== "playing" && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 text-center"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="cooldown-title"
          aria-describedby="cooldown-desc"
        >
          <div className="max-w-sm w-full">
            <div className="text-[10px] uppercase tracking-widest text-cyan-300 mb-3">
              Session break · 20 rounds · ${sessionSpend.toFixed(0)} in
            </div>
            <div
              className="text-5xl md:text-6xl font-black text-white tabular-nums mb-3"
              aria-live="polite"
              aria-atomic="true"
            >
              {Math.ceil(cooldownLeft / 1000)}s
            </div>
            <h3 id="cooldown-title" className="text-xl md:text-2xl font-black text-white mb-2">
              Take a breath.
            </h3>
            <p id="cooldown-desc" className="text-sm text-gray-300 leading-snug mb-4">
              You&apos;ve poured 20 rounds. Stretch. Drink water. Your hourly best is already banked — the DROP
              only cares about your top score, not your round count.
            </p>

            {sessionCap === null ? (
              <div className="mb-4">
                <div className="text-[10px] uppercase tracking-widest text-gray-400 mb-2">
                  Optional · Set a cap for this session
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {[
                    { label: "+$30", cap: sessionSpend + 30 },
                    { label: "+$60", cap: sessionSpend + 60 },
                    { label: "+$120", cap: sessionSpend + 120 },
                    { label: "Stop here", cap: sessionSpend },
                  ].map((opt) => (
                    <button
                      key={opt.label}
                      onClick={() => setSessionCap(opt.cap)}
                      className="px-2 py-2 rounded-lg text-[11px] font-bold text-white bg-white/5 hover:bg-white/10 border border-white/15 transition"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mb-4 text-[11px] text-cyan-300">
                Session cap set · ${sessionCap.toFixed(0)} total
                <button
                  onClick={() => setSessionCap(null)}
                  className="ml-2 underline text-gray-400 hover:text-white"
                >
                  remove
                </button>
              </div>
            )}

            <div
              className="h-1.5 w-full rounded-full overflow-hidden"
              style={{ background: "rgba(255,255,255,0.1)" }}
            >
              <div
                className="h-full"
                style={{
                  width: `${100 - (cooldownLeft / 30_000) * 100}%`,
                  background: "linear-gradient(90deg, #22d3ee, #2563eb)",
                  transition: "width 0.25s linear",
                }}
              />
            </div>
          </div>
        </div>
      )}

      {status === "calibrating" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 backdrop-blur-[2px] p-5 text-center">
          <div className="text-xs uppercase tracking-widest text-cyan-300 mb-3">Calibrating</div>
          <h3 className="text-2xl md:text-3xl font-black text-white mb-3">Hold steady.</h3>
          <p className="text-sm text-gray-300 mb-6 max-w-xs leading-relaxed">
            Hold however feels natural — lying down, sitting, standing.
            Locking in your neutral position.
          </p>
          <div className="relative w-16 h-16 mb-2">
            <motion.div
              className="absolute inset-0 rounded-full border-2"
              style={{ borderColor: CYAN }}
              initial={{ pathLength: 0, rotate: 0 }}
              animate={{ rotate: 360 }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
            />
            <motion.div
              className="absolute inset-2 rounded-full"
              style={{ background: `${CYAN}30` }}
              animate={{ scale: [0.9, 1.05, 0.9] }}
              transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
            />
          </div>
        </div>
      )}

      {status === "ready" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-[2px] p-4 text-center">
          <div className="text-xs uppercase tracking-widest text-cyan-300 mb-3">Get ready</div>
          <AnimatePresence mode="wait">
            <motion.div
              key={preCount > 0 ? `pc-${preCount}` : "pc-go"}
              initial={{ scale: 0.5, opacity: 0, y: 8 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 1.6, opacity: 0 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              className="text-7xl md:text-9xl font-black text-white tabular-nums"
              style={{
                textShadow: "0 0 30px rgba(34,211,238,0.6), 0 0 60px rgba(34,211,238,0.3)",
              }}
            >
              {preCount > 0 ? preCount : "GO"}
            </motion.div>
          </AnimatePresence>
        </div>
      )}

      {status !== "playing" && status !== "ready" && status !== "calibrating" && (
        <div className="absolute inset-0 flex flex-col bg-black/60 backdrop-blur-sm p-4 sm:p-6 text-center">
          {/* Top-right settings chip (idle only) */}
          {status === "idle" && (
            <div className="absolute top-3 right-3 flex items-center gap-1.5 z-10">
              <button
                onClick={() => {
                  const next = !soundOn;
                  setSoundOn(next);
                  localStorage.setItem(SOUND_KEY, next ? "1" : "0");
                }}
                aria-pressed={soundOn}
                aria-label={soundOn ? "Mute" : "Unmute"}
                className="w-9 h-9 rounded-full bg-black/50 backdrop-blur border border-white/10 hover:bg-black/70 transition inline-flex items-center justify-center text-sm"
              >
                <span aria-hidden>{soundOn ? "🔊" : "🔇"}</span>
              </button>
              {hapticsSupported && (
                <button
                  onClick={() => {
                    const next = !hapticsOn;
                    setHapticsOn(next);
                    localStorage.setItem(HAPTICS_KEY, next ? "1" : "0");
                    if (next) {
                      try {
                        navigator.vibrate(20);
                      } catch {
                        /* ignore */
                      }
                    }
                  }}
                  aria-pressed={hapticsOn}
                  aria-label={hapticsOn ? "Turn off haptics" : "Turn on haptics"}
                  className="w-9 h-9 rounded-full bg-black/50 backdrop-blur border border-white/10 hover:bg-black/70 transition inline-flex items-center justify-center text-sm"
                >
                  <span aria-hidden>{hapticsOn ? "📳" : "📴"}</span>
                </button>
              )}
            </div>
          )}

          <div className="flex-1 flex flex-col items-center justify-center max-w-sm mx-auto w-full">
            {status === "idle" ? (
              <>
                <div className="text-xs uppercase tracking-widest text-cyan-300 mb-3">Steady Pour · 20 sec round</div>
                <h3 className="text-2xl md:text-3xl font-black mb-3 text-white">Match the line.</h3>
                <p className="text-sm text-gray-300 mb-5 leading-relaxed max-w-xs">
                  Tilt your phone to move the water.
                  Keep it on the yellow line. No spills, no sloshing.
                </p>
                <WalletStrip balance={balance} />
                {sessionCap !== null && sessionSpend + ENTRY_USD > sessionCap ? (
                  <div className="space-y-3">
                    <div
                      className="mx-auto max-w-xs p-3 rounded-xl border"
                      style={{
                        background: "rgba(34,211,238,0.08)",
                        borderColor: "rgba(34,211,238,0.3)",
                      }}
                    >
                      <div className="text-[10px] uppercase tracking-widest text-cyan-300 mb-1">
                        Session cap reached
                      </div>
                      <div className="text-sm text-gray-200">
                        You set a ${sessionCap.toFixed(0)} cap and poured ${sessionSpend.toFixed(0)}. Good call. Come
                        back tomorrow — your all-time best lives on.
                      </div>
                      <button
                        onClick={() => setSessionCap(null)}
                        className="mt-2 text-[11px] underline text-gray-400 hover:text-white"
                      >
                        Remove cap
                      </button>
                    </div>
                  </div>
                ) : balance >= ENTRY_USD ? (
                  <div className="flex items-center justify-center gap-2 flex-wrap">
                    <motion.button
                      onClick={() => startGame(false)}
                      className="px-7 py-3.5 rounded-xl text-white font-bold shadow-xl transition hover:brightness-110 text-base"
                      style={{
                        background: `linear-gradient(90deg, ${CYAN}, #0891b2)`,
                        boxShadow: `0 10px 30px -10px ${CYAN}80`,
                      }}
                      whileHover={reduceMotion ? undefined : { scale: 1.03 }}
                      whileTap={reduceMotion ? undefined : { scale: 0.97 }}
                      animate={reduceMotion ? undefined : { boxShadow: [`0 10px 30px -10px ${CYAN}80`, `0 10px 38px -8px ${CYAN}cc`, `0 10px 30px -10px ${CYAN}80`] }}
                      transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                    >
                      Start pour · ${ENTRY_USD}
                    </motion.button>
                    {practiceAvailable && (
                      <button
                        onClick={() => startGame(true)}
                        className="px-4 py-3 rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 text-white text-sm font-semibold transition"
                      >
                        Try one round free →
                      </button>
                    )}
                  </div>
                ) : practiceAvailable ? (
                  <div className="space-y-3">
                    <button
                      onClick={() => startGame(true)}
                      className="px-6 py-3 rounded-xl text-white font-bold shadow-xl transition hover:brightness-110"
                      style={{
                        background: `linear-gradient(90deg, ${CYAN}, #0891b2)`,
                        boxShadow: `0 10px 30px -10px ${CYAN}80`,
                      }}
                    >
                      Try one round free
                    </button>
                    <div className="text-[11px] text-gray-400">Doesn&apos;t count for the pot — just a practice run.</div>
                    <BrokeBlock topUp={topUp} />
                  </div>
                ) : (
                  <BrokeBlock topUp={topUp} />
                )}
                {chargeFailed && balance >= ENTRY_USD && (
                  <p className="text-xs text-red-300 mt-3">Couldn&apos;t charge that round. Try again.</p>
                )}
                {tiltDenied && (
                  <p className="text-xs text-red-300 mt-3" role="status">
                    Tilt permission denied. Go to{" "}
                    <span className="text-white font-mono">Settings › Safari › Motion &amp; Orientation Access</span>{" "}
                    and retry.
                  </p>
                )}
              </>
            ) : (
              <>
                {celebrate && !reduceMotion && <ConfettiBurst />}
                <div className="text-xs uppercase tracking-widest text-cyan-300 mb-3">Round complete</div>

                <Stars count={starsFromPerfect(perfectMs, ROUND_MS)} />

                <div className="mt-4 text-5xl md:text-6xl font-black text-white">
                  <ScoreCountUp to={Math.round(score)} />
                  <span className="text-gray-500 text-xl ml-2">pts</span>
                </div>

                <div className="text-sm text-gray-300 mt-4 mb-5 space-y-1">
                  <div>
                    Perfect hold:{" "}
                    <span className="font-mono text-cyan-300">{(perfectMs / 1000).toFixed(1)}s</span>
                    <span className="text-gray-500">
                      {" "}
                      ({Math.round((perfectMs / ROUND_MS) * 100)}%)
                    </span>
                  </div>
                  {bullseyeCount > 0 && (
                    <div>
                      Bullseyes:{" "}
                      <span className="font-mono text-lime-300">◎ {bullseyeCount}</span>
                      <span className="text-gray-500">
                        {" "}
                        (×2 while held)
                      </span>
                    </div>
                  )}
                  {score >= highScore && score > 0 && (
                    <motion.div
                      initial={{ scale: 0.6, opacity: 0, y: 6 }}
                      animate={{ scale: 1, opacity: 1, y: 0 }}
                      transition={{ delay: 1.1, duration: 0.4, type: "spring", stiffness: 360, damping: 22 }}
                      className="text-yellow-300 font-bold mt-2 tracking-wider"
                      style={{
                        textShadow: "0 0 12px rgba(253,224,71,0.6), 0 0 24px rgba(253,224,71,0.3)",
                      }}
                    >
                      ★ NEW HIGH SCORE ★
                    </motion.div>
                  )}
                  <HourRankFlash />
                  {(lastReport || serverResult) && (() => {
                    // Server verdict takes priority
                    const serverFlagged = serverResult && serverResult.suspicious.length > 0;
                    const serverAccepted = serverResult && serverResult.accepted && !serverFlagged;
                    const clientFlagged = lastReport?.suspicious;
                    const flagged = serverFlagged || (!serverResult && clientFlagged);
                    const verified = serverAccepted;
                    const clientOnly = !serverResult && !clientFlagged && lastReport;

                    let label = "";
                    let tip = "";
                    if (flagged) {
                      label = "⚠ Score held for review";
                      const reasons = serverResult?.suspicious ?? lastReport?.reasons ?? [];
                      tip = `Flags: ${reasons.join(", ")}`;
                    } else if (verified) {
                      label = "✓ Score verified by server";
                      tip = lastReport ? `Tremor ${lastReport.tremor.toFixed(3)}°, samples ${lastReport.samples}` : "";
                    } else if (clientOnly) {
                      label = "✓ Score looks clean";
                      tip = `Tremor ${lastReport.tremor.toFixed(3)}°, samples ${lastReport.samples} · offline`;
                    }
                    if (!label) return null;

                    return (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 1.2, duration: 0.3 }}
                        className="mt-2 inline-flex items-center gap-1.5 text-[10px] font-mono px-2 py-1 rounded"
                        style={{
                          background: flagged ? "rgba(239,68,68,0.15)" : "rgba(34,197,94,0.12)",
                          color: flagged ? "#fca5a5" : "#86efac",
                          border: flagged
                            ? "1px solid rgba(239,68,68,0.35)"
                            : "1px solid rgba(34,197,94,0.3)",
                        }}
                        title={tip}
                      >
                        {label}
                      </motion.div>
                    );
                  })()}
                </div>
                {sessionRounds > 0 && sessionRounds % 5 === 0 && (
                  <SessionRecap
                    scores={sessionScoresRef.current}
                    rounds={sessionRounds}
                    spend={sessionSpend}
                  />
                )}
                <WalletStrip balance={balance} />
                <div className="flex items-center justify-center gap-2 flex-wrap">
                  {sessionCap !== null && sessionSpend + ENTRY_USD > sessionCap ? (
                    <div className="text-[11px] text-cyan-300 font-mono mr-1">
                      Cap ${sessionCap.toFixed(0)} reached
                    </div>
                  ) : balance >= ENTRY_USD ? (
                    <motion.button
                      onClick={() => startGame(false)}
                      className="px-6 py-3 rounded-xl text-white font-bold shadow-xl transition hover:brightness-110"
                      style={{
                        background: `linear-gradient(90deg, ${CYAN}, #0891b2)`,
                        boxShadow: `0 10px 30px -10px ${CYAN}80`,
                      }}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.8, duration: 0.3 }}
                    >
                      Play again · ${ENTRY_USD}
                    </motion.button>
                  ) : null}
                  <ShareScoreButton score={score} perfectMs={perfectMs} />
                </div>
                <DropReadyCta />
                {balance < ENTRY_USD && <BrokeBlock topUp={topUp} />}
              </>
            )}
          </div>
        </div>
      )}

      {/* Subtle help line */}
      <AnimatePresence>
        {status === "playing" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute bottom-3 left-3 text-[10px] font-mono text-white/40 pointer-events-none"
          >
            {signedSeed && signedSeed.roundId === seed ? (
              <>
                seed {seed.toString(36).toUpperCase()} ·{" "}
                <span className="text-emerald-300" title={`sig ${signedSeed.signature.slice(0, 8)}…`}>
                  ✓ server-signed
                </span>
              </>
            ) : (
              <>seed {seed.toString(36).toUpperCase()} · shared</>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
