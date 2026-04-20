"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { postScore } from "./scoreboard";

const GOLD = "#facc15";
const WAVE = "#fbbf24";
const HS_KEY = "livewager-dunk-tidal-high-score";
const SOUND_KEY = "livewager-dunk-sound";

const ROUND_MS = 10_000;

/* Deterministic PRNG */
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

/** Build a wave function y(x) from sum of sines with random amplitudes/phases */
const makeWave = (seed: number) => {
  const rng = mulberry32(seed);
  const comps: { amp: number; freq: number; phase: number }[] = [];
  for (let i = 0; i < 3; i++) {
    comps.push({
      amp: 0.12 + rng() * 0.18, // 0.12–0.30
      freq: (i + 1) * (1.3 + rng() * 0.8), // harmonics
      phase: rng() * Math.PI * 2,
    });
  }
  // y in [0,1], centered around 0.5
  return (x: number) => {
    let y = 0.5;
    for (const c of comps) y += c.amp * Math.sin(c.freq * Math.PI * 2 * x + c.phase);
    return Math.max(0.08, Math.min(0.92, y));
  };
};

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

/**
 * Tidal Trace:
 * - A 10-second wave scrolls right-to-left; user holds finger/mouse on a moving
 *   vertical hit line and moves up/down to match the wave at the line's x position.
 * - Score is (1 - abs(user_y - wave_y)) per rAF, accumulated.
 * - On release (finger-up) mid-round, score stops accumulating until re-touched.
 */
export const TidalTrace = () => {
  const reduceMotion = useReducedMotion();
  const [status, setStatus] = useState<"idle" | "playing" | "over">("idle");
  const [seed, setSeed] = useState<number>(() => Math.floor(Math.random() * 1_000_000));
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [countdown, setCountdown] = useState(10);
  const [soundOn, setSoundOn] = useState(true);
  const [isTracking, setIsTracking] = useState(false);
  const [userY, setUserY] = useState(0.5);
  const [waveY, setWaveY] = useState(0.5);
  const [onlineMs, setOnlineMs] = useState(0); // total time finger was down
  const [accuracy, setAccuracy] = useState(0);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef(0);
  const waveFnRef = useRef<(x: number) => number>(() => 0.5);
  const trailRef = useRef<{ x: number; y: number; t: number }[]>([]);
  const [trailVersion, setTrailVersion] = useState(0); // force re-render of trail
  const fieldRef = useRef<HTMLDivElement | null>(null);

  /* Init */
  useEffect(() => {
    if (typeof window === "undefined") return;
    setHighScore(Number(localStorage.getItem(HS_KEY) || 0));
    const savedSound = localStorage.getItem(SOUND_KEY);
    if (savedSound !== null) setSoundOn(savedSound === "1");
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

  /* Game loop */
  const startGame = () => {
    const s = Math.floor(Math.random() * 1_000_000);
    setSeed(s);
    waveFnRef.current = makeWave(s);
    trailRef.current = [];
    setScore(0);
    setAccuracy(0);
    setCountdown(10);
    setOnlineMs(0);
    setStatus("playing");
  };

  useEffect(() => {
    if (status !== "playing") return;
    const startTs = performance.now();
    let lastTs = startTs;
    let accumScore = 0;
    let accumOnline = 0;
    let samples = 0;
    let sumAccuracy = 0;

    const step = (now: number) => {
      const elapsed = now - startTs;
      const dt = now - lastTs;
      lastTs = now;

      if (elapsed >= ROUND_MS) {
        setStatus("over");
        const final = Math.round(accumScore);
        setScore(final);
        setAccuracy(samples ? sumAccuracy / samples : 0);
        setOnlineMs(Math.round(accumOnline));
        if (final > highScore) {
          localStorage.setItem(HS_KEY, String(final));
          setHighScore(final);
        }
        if (final > 0) postScore("tidal", final, seed);
        const ctx = ensureAudio();
        if (ctx) {
          playBeep(ctx, 740, 0.18, "triangle", 0.06);
          setTimeout(() => playBeep(ctx, 988, 0.22, "triangle", 0.05), 120);
        }
        return;
      }

      const t = elapsed / ROUND_MS; // 0..1
      const currentWaveY = waveFnRef.current(t);
      setWaveY(currentWaveY);
      setCountdown(Math.max(0, Math.ceil((ROUND_MS - elapsed) / 1000)));

      setIsTracking((tracking) => {
        setUserY((uy) => {
          if (tracking) {
            const diff = Math.abs(uy - currentWaveY);
            const precision = Math.max(0, 1 - diff * 3); // perfect within ~0.33
            accumScore += precision * dt * 0.9; // ~900 pts/s max
            accumOnline += dt;
            samples += 1;
            sumAccuracy += precision;

            // Trail point (drop old ones)
            trailRef.current.push({ x: t, y: uy, t: now });
            if (trailRef.current.length > 80) trailRef.current.shift();
            setTrailVersion((v) => v + 1);
          }
          return uy;
        });
        return tracking;
      });

      setScore(Math.round(accumScore));
      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, seed]);

  /* Pointer handling */
  const moveFromPointer = (clientY: number) => {
    const rect = fieldRef.current?.getBoundingClientRect();
    if (!rect) return;
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    setUserY(y);
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if (status !== "playing") return;
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    setIsTracking(true);
    moveFromPointer(e.clientY);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (status !== "playing") return;
    moveFromPointer(e.clientY);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    setIsTracking(false);
    try {
      (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  // Pre-generate ghost path of the wave for visualization (before round start)
  const ghostPath = (() => {
    const fn = status === "idle" ? makeWave(seed) : waveFnRef.current;
    const pts: string[] = [];
    const N = 60;
    for (let i = 0; i <= N; i++) {
      const x = i / N;
      pts.push(`${(x * 100).toFixed(2)},${(fn(x) * 100).toFixed(2)}`);
    }
    return pts.join(" ");
  })();

  // Current-position marker on wave (for visual feedback)
  const waveXPct = status === "playing" ? ((ROUND_MS - countdown * 1000) / ROUND_MS) * 100 : 0;
  // Elapsed-based wave marker position
  const elapsedPct = status === "playing" ? ((10000 - countdown * 1000) / 10000) * 100 : 0;

  const diff = Math.abs(userY - waveY);
  const inZone = diff < 0.06;

  return (
    <div
      ref={fieldRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      role="application"
      aria-label="Tidal Trace. Touch and drag to follow the wave."
      className="relative aspect-video w-full rounded-2xl overflow-hidden ring-1 ring-white/10 shadow-2xl bg-gradient-to-br from-[#1a1308] via-[#0e0a04] to-[#060502] select-none touch-none cursor-crosshair"
    >
      {/* Wave SVG */}
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id="waveFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={WAVE} stopOpacity="0.25" />
            <stop offset="100%" stopColor={WAVE} stopOpacity="0" />
          </linearGradient>
          <filter id="waveGlow">
            <feGaussianBlur stdDeviation="0.8" />
          </filter>
        </defs>
        {/* Ghost wave (target) */}
        <polyline
          points={ghostPath}
          fill="none"
          stroke={WAVE}
          strokeOpacity={status === "playing" ? 0.45 : 0.7}
          strokeWidth="0.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polyline
          points={ghostPath}
          fill="none"
          stroke={WAVE}
          strokeOpacity="0.4"
          strokeWidth="1.6"
          filter="url(#waveGlow)"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Area under wave */}
        <path d={`M0,100 L${ghostPath.replace(/ /g, " L")} L100,100 Z`} fill="url(#waveFill)" />

        {/* User trail */}
        {trailRef.current.length > 1 && (
          <polyline
            points={trailRef.current.map((p) => `${(p.x * 100).toFixed(2)},${(p.y * 100).toFixed(2)}`).join(" ")}
            fill="none"
            stroke="#fff"
            strokeOpacity="0.9"
            strokeWidth="0.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Current wave marker dot */}
        {status === "playing" && (
          <>
            <circle cx={elapsedPct} cy={waveY * 100} r="1.6" fill={WAVE} />
            <circle cx={elapsedPct} cy={waveY * 100} r="3.4" fill={WAVE} fillOpacity="0.25">
              <animate attributeName="r" values="3;4.5;3" dur="0.8s" repeatCount="indefinite" />
            </circle>
          </>
        )}

        {/* User cursor dot */}
        {status === "playing" && (
          <circle
            cx={elapsedPct}
            cy={userY * 100}
            r="1.8"
            fill={inZone ? "#a3e635" : "#ffffff"}
            stroke={inZone ? "#a3e635" : "#ffffff"}
            strokeOpacity="0.6"
            strokeWidth="0.6"
          />
        )}
      </svg>

      {/* Vertical progress line */}
      {status === "playing" && (
        <div
          className="absolute top-0 bottom-0 w-px pointer-events-none"
          style={{
            left: `${elapsedPct}%`,
            background: `linear-gradient(180deg, transparent, ${inZone ? "#a3e635" : "#facc15"}80, transparent)`,
          }}
        />
      )}

      {/* HUD */}
      <div className="absolute top-3 left-3 right-3 flex items-start justify-between gap-2 pointer-events-none">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="bg-black/60 backdrop-blur px-2.5 py-1 rounded-md text-[11px] font-mono text-white whitespace-nowrap">
            TIME <span className={countdown <= 3 ? "text-red-400" : "text-yellow-300"}>{String(countdown).padStart(2, "0")}s</span>
          </span>
          <span className="bg-black/60 backdrop-blur px-2.5 py-1 rounded-md text-[11px] font-mono text-white whitespace-nowrap">
            SCORE <span className="text-yellow-300 tabular-nums">{score}</span>
          </span>
          {inZone && status === "playing" && isTracking && (
            <motion.span
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-lime-500/90 backdrop-blur px-2.5 py-1 rounded-md text-[11px] font-mono font-bold text-black whitespace-nowrap"
            >
              LOCKED
            </motion.span>
          )}
        </div>
        <span className="bg-black/60 backdrop-blur px-2.5 py-1 rounded-md text-[11px] font-mono text-white whitespace-nowrap shrink-0">
          HI <span className="text-yellow-300">{highScore}</span>
        </span>
      </div>

      {status === "playing" && !isTracking && (
        <div className="absolute inset-x-0 bottom-6 text-center pointer-events-none">
          <div className="inline-block bg-black/70 backdrop-blur px-3 py-1.5 rounded-md text-xs font-mono text-yellow-300 uppercase tracking-widest">
            Touch and hold to trace
          </div>
        </div>
      )}

      {status !== "playing" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 text-center">
          <div className="max-w-sm">
            {status === "idle" ? (
              <>
                <div className="text-xs uppercase tracking-widest mb-3" style={{ color: GOLD }}>
                  Tidal Trace · 10 sec
                </div>
                <h3 className="text-2xl md:text-3xl font-black mb-2 text-white">Ride the wave.</h3>
                <p className="text-sm text-gray-300 mb-5">
                  Hold your finger down and move up and down with the gold wave. Let go and score stops.
                </p>
                <div className="flex items-center justify-center gap-2 mb-4 flex-wrap">
                  <button
                    onClick={() => {
                      const next = !soundOn;
                      setSoundOn(next);
                      localStorage.setItem(SOUND_KEY, next ? "1" : "0");
                    }}
                    aria-pressed={soundOn}
                    aria-label={soundOn ? "Mute" : "Unmute"}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white/5 text-white border border-white/15 hover:bg-white/10 transition"
                  >
                    <span aria-hidden>{soundOn ? "🔊" : "🔇"}</span>
                  </button>
                </div>
                <button
                  onClick={startGame}
                  className="px-6 py-3 rounded-xl text-black font-bold shadow-xl transition hover:brightness-110"
                  style={{
                    background: `linear-gradient(90deg, ${GOLD}, ${WAVE})`,
                    boxShadow: `0 10px 30px -10px ${GOLD}80`,
                  }}
                >
                  Start tracing
                </button>
              </>
            ) : (
              <>
                <div className="text-xs uppercase tracking-widest text-yellow-300 mb-3">Round complete</div>
                <h3 className="text-3xl md:text-4xl font-black mb-2 text-white">
                  {score} <span className="text-gray-500 text-xl">pts</span>
                </h3>
                <div className="text-sm text-gray-300 mb-5 space-y-0.5">
                  <div>
                    Match accuracy:{" "}
                    <span className="font-mono text-yellow-300">{Math.round(accuracy * 100)}%</span>
                  </div>
                  <div>
                    Time on wave: <span className="font-mono text-yellow-300">{(onlineMs / 1000).toFixed(1)}s</span>
                  </div>
                  {score >= highScore && score > 0 && (
                    <div className="text-yellow-200 font-bold mt-2">NEW HIGH SCORE</div>
                  )}
                </div>
                <button
                  onClick={startGame}
                  className="px-6 py-3 rounded-xl text-black font-bold shadow-xl transition hover:brightness-110"
                  style={{
                    background: `linear-gradient(90deg, ${GOLD}, ${WAVE})`,
                    boxShadow: `0 10px 30px -10px ${GOLD}80`,
                  }}
                >
                  Play again
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {status === "playing" && (
        <div className="absolute bottom-3 left-3 text-[10px] font-mono text-white/40 pointer-events-none">
          seed {seed.toString(36).toUpperCase()}
        </div>
      )}

      {/* Suppress unused var warning from trailVersion tracking */}
      <span className="hidden" aria-hidden>
        {trailVersion}
      </span>
    </div>
  );
};
