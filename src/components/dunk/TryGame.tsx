"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { postScore } from "./scoreboard";
import { useCopyable } from "@/lib/clipboard";

const ACCENT = "#FF4D4D";

/* -------------------- Interactive game -------------------- */

type Shot = { id: number; x: number; y: number; hit: boolean };
type Difficulty = "easy" | "hard";

const TARGET_HOME = { x: 72, y: 40, r: 9 };
const HS_KEY_EASY = "livewager-dunk-high-score";
const HS_KEY_HARD = "livewager-dunk-high-score-hard";
const SOUND_KEY = "livewager-dunk-sound";

const CONFETTI_COLORS = ["#FF4D4D", "#22d3ee", "#facc15", "#a3e635", "#f472b6"];

const ConfettiBurst = () => {
  const pieces = Array.from({ length: 60 });
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
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
              animation: `dunkFall ${duration}s ${delay}s ease-in forwards`,
              opacity: 0.95,
              borderRadius: 2,
              ["--drift" as string]: `${drift}px`,
            } as React.CSSProperties}
          />
        );
      })}
      <style>{`
        @keyframes dunkFall {
          0% { transform: translate3d(0, -20px, 0) rotate(0deg); opacity: 1; }
          100% { transform: translate3d(var(--drift), 110vh, 0) rotate(720deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
};

const playBeep = (ctx: AudioContext, freq: number, dur: number, type: OscillatorType = "sine", gain = 0.08) => {
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

export const TryGame = () => {
  const reduceMotion = useReducedMotion();
  const clipboard = useCopyable();
  const fieldRef = useRef<HTMLDivElement | null>(null);
  const [aim, setAim] = useState({ x: 50, y: 50 });
  const [shots, setShots] = useState<Shot[]>([]);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [highScoreEasy, setHighScoreEasy] = useState(0);
  const [highScoreHard, setHighScoreHard] = useState(0);
  const [timeLeft, setTimeLeft] = useState(30);
  const [status, setStatus] = useState<"idle" | "playing" | "over">("idle");
  const [dropped, setDropped] = useState(false);
  const [tiltEnabled, setTiltEnabled] = useState(false);
  const [tiltAvailable, setTiltAvailable] = useState(false);
  const [needsPerm, setNeedsPerm] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
  const [soundOn, setSoundOn] = useState(true);
  const [target, setTarget] = useState(TARGET_HOME);
  const [bonus, setBonus] = useState<{ x: number; y: number; r: number; expiresAt: number } | null>(null);
  const shotIdRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const highScore = difficulty === "hard" ? highScoreHard : highScoreEasy;

  const ensureAudio = useCallback(() => {
    if (!soundOn) return null;
    if (typeof window === "undefined") return null;
    if (!audioCtxRef.current) {
      const AC =
        (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AC) audioCtxRef.current = new AC();
    }
    return audioCtxRef.current;
  }, [soundOn]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setHighScoreEasy(Number(localStorage.getItem(HS_KEY_EASY) || 0));
    setHighScoreHard(Number(localStorage.getItem(HS_KEY_HARD) || 0));
    const savedSound = localStorage.getItem(SOUND_KEY);
    if (savedSound !== null) setSoundOn(savedSound === "1");
    const ua = window.navigator.userAgent;
    const isTouch =
      "ontouchstart" in window ||
      (window as unknown as { DeviceOrientationEvent?: unknown }).DeviceOrientationEvent;
    setTiltAvailable(Boolean(isTouch));
    const anyDOE = (
      window as unknown as {
        DeviceOrientationEvent?: { requestPermission?: () => Promise<"granted" | "denied"> };
      }
    ).DeviceOrientationEvent;
    if (anyDOE && typeof anyDOE.requestPermission === "function") setNeedsPerm(true);
    if (/Mobi|Android|iPhone|iPad|iPod/.test(ua)) setTiltAvailable(true);
  }, []);

  const [celebrate, setCelebrate] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);

  useEffect(() => {
    if (status !== "playing") return;
    if (timeLeft <= 0) {
      setStatus("over");
      setScore((s) => {
        const prevBest = difficulty === "hard" ? highScoreHard : highScoreEasy;
        if (s > prevBest && s > 0) {
          setCelebrate(true);
          setTimeout(() => setCelebrate(false), 3600);
        }
        if (difficulty === "hard") {
          if (s > highScoreHard) {
            localStorage.setItem(HS_KEY_HARD, String(s));
            setHighScoreHard(s);
          }
        } else if (s > highScoreEasy) {
          localStorage.setItem(HS_KEY_EASY, String(s));
          setHighScoreEasy(s);
        }
        if (s > 0) postScore("dunk", s);
        return s;
      });
      const ctx = ensureAudio();
      if (ctx) playBeep(ctx, 200, 0.4, "sawtooth", 0.05);
      return;
    }
    const t = setTimeout(() => setTimeLeft((x) => x - 1), 1000);
    return () => clearTimeout(t);
  }, [timeLeft, status, highScoreEasy, highScoreHard, difficulty, ensureAudio]);

  // Moving target on hard — uses rAF so it pauses automatically when tab is hidden
  useEffect(() => {
    if (status !== "playing" || difficulty !== "hard") {
      setTarget(TARGET_HOME);
      return;
    }
    let raf = 0;
    let t0 = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      t0 += dt * 1.25;
      setTarget({
        x: TARGET_HOME.x + Math.sin(t0) * 12,
        y: TARGET_HOME.y + Math.cos(t0 * 0.7) * 8,
        r: TARGET_HOME.r * 0.78,
      });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [status, difficulty]);

  useEffect(() => {
    if (!tiltEnabled || status !== "playing") return;
    let rafId = 0;
    let pending: { x: number; y: number } | null = null;
    const flush = () => {
      if (pending) {
        setAim(pending);
        pending = null;
      }
      rafId = 0;
    };
    const onOrient = (e: DeviceOrientationEvent) => {
      const beta = e.beta ?? 0;
      const gamma = e.gamma ?? 0;
      const x = 50 + Math.max(-45, Math.min(45, gamma));
      const y = 50 + Math.max(-30, Math.min(30, beta - 40)) * 1.2;
      pending = { x: Math.max(2, Math.min(98, x)), y: Math.max(6, Math.min(94, y)) };
      if (!rafId) rafId = requestAnimationFrame(flush);
    };
    window.addEventListener("deviceorientation", onOrient);
    return () => {
      window.removeEventListener("deviceorientation", onOrient);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [tiltEnabled, status]);

  const fireAt = useCallback(
    (x: number, y: number) => {
      // Bonus target takes priority if live
      let hitBonus = false;
      if (bonus && bonus.expiresAt > Date.now()) {
        const bdx = x - bonus.x;
        const bdy = y - bonus.y;
        if (Math.sqrt(bdx * bdx + bdy * bdy) <= bonus.r) hitBonus = true;
      }
      const dx = x - target.x;
      const dy = y - target.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const hit = hitBonus || dist <= target.r;

      shotIdRef.current += 1;
      const id = shotIdRef.current;
      setShots((s) => [...s.slice(-10), { id, x, y, hit }]);
      const ctx = ensureAudio();

      if (hit) {
        if (ctx) {
          playBeep(ctx, hitBonus ? 1174 : 880, 0.08, "triangle", 0.08);
          setTimeout(() => playBeep(ctx, hitBonus ? 1760 : 1320, 0.14, "triangle", 0.07), 70);
          if (hitBonus) setTimeout(() => playBeep(ctx, 2093, 0.18, "triangle", 0.06), 160);
        }
        setDropped(true);
        setShakeKey((k) => k + 1);
        setTimeout(() => setDropped(false), 800);
        setCombo((c) => {
          const next = c + 1;
          setBestCombo((b) => Math.max(b, next));
          return next;
        });
        const diffMult = difficulty === "hard" ? 1.5 : 1;
        const bonusMult = hitBonus ? 2 : 1;
        const base = 100 + Math.min(combo, 9) * 25;
        setScore((s) => s + Math.round(base * diffMult * bonusMult));

        if (hitBonus) setBonus(null);

        // 22% chance to spawn a bonus gold target if none active
        if (!hitBonus && Math.random() < 0.22) {
          const bx = 20 + Math.random() * 60;
          const by = 18 + Math.random() * 24;
          setBonus({ x: bx, y: by, r: 5.5, expiresAt: Date.now() + 3000 });
          setTimeout(() => setBonus((b) => (b && b.expiresAt <= Date.now() ? null : b)), 3100);
        }
      } else {
        if (ctx) playBeep(ctx, 180, 0.08, "square", 0.04);
        setCombo(0);
        setScore((s) => Math.max(0, s - 10));
      }
      setTimeout(() => setShots((s) => s.filter((sh) => sh.id !== id)), 900);
    },
    [combo, target, difficulty, ensureAudio, bonus],
  );

  useEffect(() => {
    if (status !== "playing") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") setAim((a) => ({ ...a, x: Math.max(2, a.x - 4) }));
      if (e.key === "ArrowRight") setAim((a) => ({ ...a, x: Math.min(98, a.x + 4) }));
      if (e.key === "ArrowUp") setAim((a) => ({ ...a, y: Math.max(6, a.y - 4) }));
      if (e.key === "ArrowDown") setAim((a) => ({ ...a, y: Math.min(94, a.y + 4) }));
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        fireAt(aim.x, aim.y);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [status, aim, fireAt]);

  // Unified pointer handling — works for mouse, touch, pen
  const pointerRafRef = useRef(0);
  const pointerPendingRef = useRef<{ x: number; y: number } | null>(null);
  const lastFireRef = useRef(0);
  const pointerDownAtRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const MIN_FIRE_INTERVAL_MS = 120; // anti-rapid-tap cheat guard
  const TAP_MOVE_THRESHOLD = 12; // px — more than this and it's a drag, not a tap

  const pctFromPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
      rect,
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (status !== "playing" || tiltEnabled) return;
    // Only hover-style updates from mouse/pen; for touch we only update aim on down/tap
    if (e.pointerType === "touch" && !pointerDownAtRef.current) return;
    const { x, y } = pctFromPointer(e);
    pointerPendingRef.current = { x, y };
    if (!pointerRafRef.current) {
      pointerRafRef.current = requestAnimationFrame(() => {
        if (pointerPendingRef.current) setAim(pointerPendingRef.current);
        pointerRafRef.current = 0;
      });
    }
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (status !== "playing") return;
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    const { x, y } = pctFromPointer(e);
    pointerDownAtRef.current = { x: e.clientX, y: e.clientY, t: performance.now() };
    if (!tiltEnabled) setAim({ x, y });
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (status !== "playing") return;
    const down = pointerDownAtRef.current;
    pointerDownAtRef.current = null;
    try {
      (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (!down) return;
    // Treat as tap only if movement is small (not a drag/scroll recovery)
    const dx = e.clientX - down.x;
    const dy = e.clientY - down.y;
    if (Math.sqrt(dx * dx + dy * dy) > TAP_MOVE_THRESHOLD) return;
    // Anti rapid-tap debounce
    const now = performance.now();
    if (now - lastFireRef.current < MIN_FIRE_INTERVAL_MS) return;
    lastFireRef.current = now;

    const { x, y } = pctFromPointer(e);
    if (!tiltEnabled) setAim({ x, y });
    fireAt(x, y);
  };

  const enableTilt = async () => {
    const anyDOE = (
      window as unknown as {
        DeviceOrientationEvent?: { requestPermission?: () => Promise<"granted" | "denied"> };
      }
    ).DeviceOrientationEvent;
    if (anyDOE?.requestPermission) {
      try {
        const r = await anyDOE.requestPermission();
        if (r === "granted") setTiltEnabled(true);
      } catch {
        /* denied */
      }
    } else {
      setTiltEnabled(true);
    }
  };

  const startGame = () => {
    setScore(0);
    setCombo(0);
    setBestCombo(0);
    setTimeLeft(30);
    setShots([]);
    setStatus("playing");
  };

  const [shareState, setShareState] = useState<"idle" | "copied" | "shared">("idle");

  const shareScore = async () => {
    if (typeof window === "undefined") return;
    const accuracyPct = shots.length
      ? Math.round((shots.filter((s) => s.hit).length / shots.length) * 100)
      : 0;
    const text = `I dunked ${score} pts · ×${bestCombo} combo · ${accuracyPct}% accuracy on LiveWager.io/dunk · can you beat me?`;
    const url = "https://livewager.io/dunk";
    const nav = window.navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav.share) {
      try {
        await nav.share({ title: "LiveWager · Dunk", text, url });
        setShareState("shared");
        setTimeout(() => setShareState("idle"), 2000);
        return;
      } catch {
        /* user cancelled — fall through to clipboard */
      }
    }
    const ok = await clipboard(`${text} ${url}`, {
      label: "Share link",
      silent: true, // inline "Copied" pill carries the feedback
    });
    if (ok) {
      setShareState("copied");
      setTimeout(() => setShareState("idle"), 2000);
    }
  };

  const accuracy = useMemo(() => {
    const total = shots.length;
    if (!total) return 0;
    return Math.round((shots.filter((s) => s.hit).length / total) * 100);
  }, [shots]);

  return (
    <section
      id="try"
      className="relative z-10 max-w-7xl mx-auto px-5 md:px-8 py-16 md:py-24 scroll-mt-20"
    >
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.6 }}
        className="max-w-2xl mb-10"
      >
        <div className="text-xs uppercase tracking-widest mb-3" style={{ color: ACCENT }}>
          Try it now
        </div>
        <h2 className="text-3xl md:text-5xl font-black tracking-tight mb-4 text-white">
          30 seconds. Infinite dunks.
        </h2>
        <p className="text-gray-400 text-lg">
          Aim and fire. Land shots to chain combos. On mobile, tilt your phone. On desktop, use
          mouse or arrow keys + space.
        </p>
      </motion.div>

      <div className="grid lg:grid-cols-[1fr_300px] gap-5">
        <motion.div
          ref={fieldRef}
          onPointerMove={onPointerMove}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          role="application"
          aria-label="Dunk tank target practice. Use arrow keys to aim, space or enter to fire."
          aria-describedby="dunk-keyboard-help"
          tabIndex={0}
          animate={
            reduceMotion
              ? undefined
              : shakeKey > 0
                ? { x: [0, -4, 5, -3, 2, 0], y: [0, 2, -1, 2, -1, 0] }
                : { x: 0, y: 0 }
          }
          transition={{ duration: 0.35 }}
          className={`relative aspect-video w-full rounded-2xl overflow-hidden ring-1 ring-white/10 shadow-2xl bg-[radial-gradient(ellipse_at_center,#0b1020_0%,#020617_80%)] ${
            status === "playing" ? "cursor-crosshair" : "cursor-default"
          } focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/70 touch-none select-none`}
        >
          <span id="dunk-keyboard-help" className="sr-only">
            Arrow keys to aim. Space or Enter to fire. On mobile, tilt your device and tap the
            field. Enable tilt from the start screen first if you want motion controls.
          </span>
          <svg className="absolute inset-0 w-full h-full opacity-90" viewBox="0 0 100 56" preserveAspectRatio="none" aria-hidden>
            <defs>
              <linearGradient id="water2" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#0891b2" stopOpacity="0.55" />
                <stop offset="100%" stopColor="#164e63" stopOpacity="0.95" />
              </linearGradient>
              <radialGradient id="spot" cx="0.5" cy="0.5" r="0.5">
                <stop offset="0%" stopColor="#fff" stopOpacity="0.12" />
                <stop offset="100%" stopColor="#fff" stopOpacity="0" />
              </radialGradient>
            </defs>
            <ellipse cx="25" cy="20" rx="18" ry="10" fill="url(#spot)" />
            <rect x="10" y="36" width="30" height="18" rx="2" fill="url(#water2)" />
            <rect x="10" y="36" width="30" height="2" fill="#22d3ee" opacity="0.6" />
            <rect x="8" y="18" width="2" height="36" fill="#475569" />
            <rect x="40" y="18" width="2" height="36" fill="#475569" />
            <rect x="8" y="18" width="34" height="2" fill="#475569" />
            <g
              style={{
                transform: dropped ? "translateY(18px)" : "translateY(0)",
                transition: "transform 0.35s cubic-bezier(.7,.1,.3,1)",
              }}
            >
              <rect x="22" y="26" width="6" height="2" fill="#94a3b8" />
              <circle cx="25" cy="22" r="2.4" fill="#e2e8f0" />
              <path d="M22 24 q3 -1 6 0 l-1 3 h-4 z" fill="#e2e8f0" />
            </g>
            <g transform={`translate(${target.x}, ${target.y})`}>
              <circle r={target.r} fill="#0f172a" stroke={ACCENT} strokeWidth="0.9" />
              <circle r={target.r * 0.66} fill="none" stroke={ACCENT} strokeWidth="0.6" />
              <circle r={target.r * 0.33} fill={ACCENT} />
            </g>
            {bonus && bonus.expiresAt > Date.now() && (
              <g transform={`translate(${bonus.x}, ${bonus.y})`}>
                <circle r={bonus.r + 1.5} fill="none" stroke="#facc15" strokeWidth="0.4" opacity="0.5">
                  <animate attributeName="r" values={`${bonus.r + 1};${bonus.r + 2.5};${bonus.r + 1}`} dur="0.9s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.7;0.2;0.7" dur="0.9s" repeatCount="indefinite" />
                </circle>
                <circle r={bonus.r} fill="#422006" stroke="#facc15" strokeWidth="0.7" />
                <circle r={bonus.r * 0.55} fill="#facc15" />
                <text y="0.8" textAnchor="middle" fontSize="3.2" fontWeight="900" fill="#422006">
                  2×
                </text>
              </g>
            )}
          </svg>

          <AnimatePresence>
            {shots.map((s) => (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, scale: 0.4 }}
                animate={{ opacity: 0.9, scale: 1 }}
                exit={{ opacity: 0, scale: 1.6 }}
                transition={{ duration: 0.5 }}
                className="absolute pointer-events-none"
                style={{
                  left: `${s.x}%`,
                  top: `${s.y}%`,
                  width: s.hit ? 64 : 28,
                  height: s.hit ? 64 : 28,
                  marginLeft: s.hit ? -32 : -14,
                  marginTop: s.hit ? -32 : -14,
                  borderRadius: "9999px",
                  background: s.hit
                    ? "radial-gradient(circle, rgba(255,77,77,0.75), transparent 70%)"
                    : "radial-gradient(circle, rgba(34,211,238,0.55), transparent 70%)",
                }}
              />
            ))}
          </AnimatePresence>

          {status === "playing" && (
            <div
              className="absolute pointer-events-none"
              style={{
                left: `${aim.x}%`,
                top: `${aim.y}%`,
                transform: "translate(-50%, -50%)",
                transition: tiltEnabled ? "left 60ms linear, top 60ms linear" : "none",
              }}
            >
              <div className="w-14 h-14 relative">
                <div className="absolute inset-0 rounded-full border border-cyan-300/50" />
                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-cyan-300/60" />
                <div className="absolute top-1/2 left-0 right-0 h-px bg-cyan-300/60" />
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-cyan-300 shadow-[0_0_10px] shadow-cyan-300" />
              </div>
            </div>
          )}

          <div className="absolute top-2 left-2 right-2 sm:top-3 sm:left-3 sm:right-3 flex items-start justify-between gap-2 pointer-events-none">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0">
              <span className="bg-black/60 backdrop-blur px-2 sm:px-2.5 py-1 rounded-md text-[10px] sm:text-[11px] font-mono text-white whitespace-nowrap">
                TIME{" "}
                <span className={timeLeft <= 5 ? "text-red-400" : "text-cyan-300"}>
                  {String(timeLeft).padStart(2, "0")}s
                </span>
              </span>
              <span className="bg-black/60 backdrop-blur px-2 sm:px-2.5 py-1 rounded-md text-[10px] sm:text-[11px] font-mono text-white whitespace-nowrap">
                SCORE <span style={{ color: ACCENT }}>{score}</span>
              </span>
              {combo >= 2 && (
                <motion.span
                  key={combo}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="backdrop-blur px-2 sm:px-2.5 py-1 rounded-md text-[10px] sm:text-[11px] font-mono font-bold text-white whitespace-nowrap"
                  style={{ background: `${ACCENT}cc` }}
                >
                  ×{combo} COMBO
                </motion.span>
              )}
              {bonus && bonus.expiresAt > Date.now() && (
                <motion.span
                  key={bonus.expiresAt}
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="backdrop-blur px-2 sm:px-2.5 py-1 rounded-md text-[10px] sm:text-[11px] font-mono font-bold whitespace-nowrap"
                  style={{ background: "#facc15cc", color: "#422006" }}
                >
                  2× BONUS
                </motion.span>
              )}
            </div>
            <span className="bg-black/60 backdrop-blur px-2 sm:px-2.5 py-1 rounded-md text-[10px] sm:text-[11px] font-mono text-white whitespace-nowrap shrink-0">
              HI <span className="text-cyan-300">{highScore}</span>
            </span>
          </div>

          {celebrate && !reduceMotion && <ConfettiBurst />}

          {status !== "playing" && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <div className="text-center max-w-sm">
                {status === "idle" ? (
                  <>
                    <div className="text-xs uppercase tracking-widest mb-3" style={{ color: ACCENT }}>
                      30 second challenge
                    </div>
                    <h3 className="text-2xl md:text-3xl font-black mb-2 text-white">
                      Dunk tank — practice round
                    </h3>
                    <p className="text-sm text-gray-300 mb-4">
                      Hit the red target to drop her. Combos multiply score. Misses cost 10.
                    </p>
                    <div
                      role="radiogroup"
                      aria-label="Game difficulty"
                      className="flex items-center justify-center gap-2 mb-4 flex-wrap"
                    >
                      <button
                        role="radio"
                        aria-checked={difficulty === "easy"}
                        onClick={() => setDifficulty("easy")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/70 ${
                          difficulty === "easy"
                            ? "bg-white text-black border-white"
                            : "bg-white/5 text-white border-white/15 hover:bg-white/10"
                        }`}
                      >
                        Easy · static
                      </button>
                      <button
                        role="radio"
                        aria-checked={difficulty === "hard"}
                        onClick={() => setDifficulty("hard")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/70 ${
                          difficulty === "hard"
                            ? "text-white border-transparent"
                            : "bg-white/5 text-white border-white/15 hover:bg-white/10"
                        }`}
                        style={difficulty === "hard" ? { background: ACCENT, borderColor: ACCENT } : undefined}
                      >
                        Hard · moving ×1.5
                      </button>
                      <button
                        onClick={() => {
                          const next = !soundOn;
                          setSoundOn(next);
                          localStorage.setItem(SOUND_KEY, next ? "1" : "0");
                        }}
                        aria-pressed={soundOn}
                        aria-label={soundOn ? "Mute game sounds" : "Unmute game sounds"}
                        title={soundOn ? "Mute" : "Unmute"}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white/5 text-white border border-white/15 hover:bg-white/10 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/70"
                      >
                        <span aria-hidden>{soundOn ? "🔊" : "🔇"}</span>
                      </button>
                    </div>
                    <button
                      onClick={startGame}
                      className="px-6 py-3 rounded-xl text-white font-bold shadow-xl transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                      style={{ background: `linear-gradient(90deg, ${ACCENT}, #ec4899)`, boxShadow: `0 10px 30px -10px ${ACCENT}80` }}
                    >
                      Start game
                    </button>
                    {tiltAvailable && !tiltEnabled && (
                      <button
                        onClick={enableTilt}
                        className="ml-2 px-4 py-3 rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 text-white text-sm transition"
                      >
                        {needsPerm ? "Enable tilt (iOS)" : "Enable tilt"}
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <div className="text-xs uppercase tracking-widest text-cyan-300 mb-3">
                      Round complete
                    </div>
                    <h3 className="text-3xl md:text-4xl font-black mb-2 text-white">
                      {score} <span className="text-gray-500 text-xl">pts</span>
                    </h3>
                    <div className="text-sm text-gray-300 mb-5 space-y-0.5">
                      <div>
                        Best combo:{" "}
                        <span className="font-mono" style={{ color: ACCENT }}>
                          ×{bestCombo}
                        </span>
                      </div>
                      <div>
                        Accuracy: <span className="text-cyan-300 font-mono">{accuracy}%</span>
                      </div>
                      {score >= highScore && score > 0 && (
                        <div className="text-yellow-300 font-bold mt-2">NEW HIGH SCORE</div>
                      )}
                    </div>
                    <div className="flex items-center justify-center gap-2 flex-wrap">
                      <button
                        onClick={startGame}
                        className="px-6 py-3 rounded-xl text-white font-bold shadow-xl transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                        style={{ background: `linear-gradient(90deg, ${ACCENT}, #ec4899)`, boxShadow: `0 10px 30px -10px ${ACCENT}80` }}
                      >
                        Play again
                      </button>
                      {score > 0 && (
                        <button
                          onClick={shareScore}
                          aria-label="Share your score"
                          className="px-5 py-3 rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 text-white text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80 flex items-center gap-2"
                        >
                          {shareState === "idle" && (
                            <>
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4m0 0L8 6m4-4v12" />
                              </svg>
                              Share
                            </>
                          )}
                          {shareState === "copied" && <span className="text-cyan-300">Copied!</span>}
                          {shareState === "shared" && <span className="text-cyan-300">Shared!</span>}
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </motion.div>

        <div className="space-y-4">
          <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-5">
            <div className="text-xs uppercase tracking-widest text-gray-400 mb-3">Controls</div>
            <ul className="space-y-2.5 text-sm text-gray-300">
              <li className="flex items-start gap-2">
                <span className="mt-0.5" style={{ color: ACCENT }}>
                  ▸
                </span>
                <span>
                  <span className="text-white font-semibold">Mouse</span> — move to aim, click to fire
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5" style={{ color: ACCENT }}>
                  ▸
                </span>
                <span>
                  <span className="text-white font-semibold">Keyboard</span> — arrows + space/enter
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5" style={{ color: ACCENT }}>
                  ▸
                </span>
                <span>
                  <span className="text-white font-semibold">Mobile</span> — tilt + tap to fire
                </span>
              </li>
            </ul>
          </div>
          <div
            className="border rounded-2xl p-5"
            style={{
              background: `linear-gradient(135deg, ${ACCENT}1a, transparent)`,
              borderColor: `${ACCENT}4d`,
            }}
          >
            <div className="text-xs uppercase tracking-widest mb-3" style={{ color: ACCENT }}>
              Scoring
            </div>
            <ul className="space-y-2 text-sm text-gray-300">
              <li className="flex justify-between">
                <span>Base hit</span>
                <span className="font-mono text-white">+100</span>
              </li>
              <li className="flex justify-between">
                <span>Combo bonus</span>
                <span className="font-mono" style={{ color: ACCENT }}>
                  +25 × n
                </span>
              </li>
              <li className="flex justify-between">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full" style={{ background: "#facc15" }} />
                  Gold target
                </span>
                <span className="font-mono" style={{ color: "#facc15" }}>
                  ×2
                </span>
              </li>
              <li className="flex justify-between">
                <span>Miss</span>
                <span className="font-mono text-red-400">−10</span>
              </li>
            </ul>
          </div>
          <a
            href="#waitlist"
            className="block text-center px-5 py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition text-sm font-semibold text-white"
          >
            Want the real thing? →
          </a>
        </div>
      </div>
    </section>
  );
};
