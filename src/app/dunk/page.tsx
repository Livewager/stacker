"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";

// DropWallet (Internet Identity + ICRC points balance). Dynamic but
// imported aggressively (no ssr:false gate) so the chunk arrives on
// first paint — the wallet section is now a core part of the demo,
// not something buried below the fold.
const DropWallet = dynamic(() => import("@/components/dunk/DropWallet"), {
  loading: () => (
    <div className="mt-12 md:mt-16 rounded-2xl border border-white/10 bg-white/[0.03] p-8 min-h-[200px] animate-pulse" />
  ),
});
import {
  motion,
  AnimatePresence,
  useScroll,
  useTransform,
  useReducedMotion,
} from "framer-motion";

/* ============================================================
   DunkShot demo — public page at /dunk
   Self-contained, no Clerk, no DefaultLayout chrome.
   ============================================================ */

const ACCENT = "#FF4D4D"; // legacy — kept for danger/warning accents only
const WATER = "#22d3ee";
const WATER_DEEP = "#2563eb";

/* -------------------- Live stream mock -------------------- */

const CHAT_POOL = [
  { h: "whale_lord", t: "spilled again lol" },
  { h: "steady_hands", t: "held it for 14 of 20" },
  { h: "calmwater", t: "that was smooth" },
  { h: "sipgod", t: "new pb 🙌" },
  { h: "laservision", t: "hold it hold it" },
  { h: "she_dropped", t: "SHE DROPPED" },
  { h: "firststreamer", t: "just joined. how do i play" },
  { h: "ltcmaxi", t: "6k and climbing" },
  { h: "notmissing", t: "three 8ks in a row" },
  { h: "basedhunter", t: "💧💧" },
  { h: "roastbeef", t: "my hands are shaking lol" },
  { h: "watchmework", t: "rebuying for the next one" },
];

const LiveStreamMock = () => {
  const [viewers, setViewers] = useState(12847);
  const [chat, setChat] = useState<{ id: number; h: string; t: string }[]>([]);
  const [level, setLevel] = useState(0.55);
  const [target, setTarget] = useState(0.6);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [splashKey, setSplashKey] = useState(0);
  const [secsLeft, setSecsLeft] = useState(20);
  const counterRef = useRef(0);
  const lastRoundIdRef = useRef(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) return;
    let t = 0;
    let targetPhase = 0;
    const tick = setInterval(() => {
      t += 1;
      const now = Date.now();
      const roundMs = 20_000;
      const roundId = Math.floor(now / roundMs);
      const elapsedInRound = now - roundId * roundMs;
      const left = Math.max(0, Math.ceil((roundMs - elapsedInRound) / 1000));
      setSecsLeft(left);

      // New round: reset score + combo, re-seed target phase
      if (roundId !== lastRoundIdRef.current) {
        lastRoundIdRef.current = roundId;
        setScore(0);
        setCombo(0);
        targetPhase = (roundId % 10) * 0.7; // deterministic-ish per round
      }
      targetPhase += 0.18;

      setViewers((v) => v + Math.floor(Math.random() * 7) - 2);
      const nextTarget = 0.55 + Math.sin(targetPhase) * 0.2;
      setTarget(nextTarget);

      setLevel((L) => {
        const jitter = (Math.random() - 0.5) * 0.02;
        const next = L + (nextTarget - L) * 0.22 + jitter;
        const inZone = Math.abs(next - nextTarget) < 0.05;
        setScore((s) => s + (inZone ? 16 : 4));
        if (inZone && !(t % 12)) setSplashKey((k) => k + 1);
        if (inZone) setCombo((c) => Math.min(99, c + 1));
        else setCombo(0);
        return Math.max(0.08, Math.min(0.92, next));
      });
      if (t % 2 === 0) {
        const msg = CHAT_POOL[Math.floor(Math.random() * CHAT_POOL.length)];
        counterRef.current += 1;
        setChat((prev) => [...prev.slice(-4), { id: counterRef.current, ...msg }]);
      }
    }, 1200);
    return () => clearInterval(tick);
  }, [reduceMotion]);

  const inZone = Math.abs(level - target) < 0.05;

  return (
    <div className="relative aspect-video w-full rounded-2xl overflow-hidden ring-1 ring-white/10 shadow-2xl bg-gradient-to-br from-[#0b1a2a] via-[#051224] to-[#020b18]">
      {/* Ambient glow backdrop */}
      <div
        className="absolute inset-0 pointer-events-none opacity-80"
        style={{
          backgroundImage:
            "radial-gradient(circle at 30% 20%, rgba(34,211,238,0.12), transparent 55%), radial-gradient(circle at 80% 90%, rgba(96,165,250,0.1), transparent 55%)",
        }}
      />

      {/* Glass — hero visual */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          className="relative w-[30%] h-[78%] rounded-[10px_10px_16px_16px] overflow-hidden"
          style={{
            border: "2px solid rgba(255,255,255,0.22)",
            background: "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))",
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.3), inset 2px 0 4px rgba(255,255,255,0.08), inset -2px 0 4px rgba(0,0,0,0.3), 0 30px 60px -30px rgba(0,0,0,0.8)",
          }}
        >
          {/* Rim highlight */}
          <div
            className="absolute top-2 left-1 bottom-3 w-[2px] rounded-full pointer-events-none"
            style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.5), rgba(255,255,255,0.05))" }}
          />
          {/* Water */}
          <motion.div
            className="absolute inset-x-0 bottom-0"
            animate={{ height: `${level * 100}%` }}
            transition={{ type: "tween", duration: 0.3, ease: "linear" }}
            style={{
              background: "linear-gradient(180deg, rgba(34,211,238,0.55) 0%, rgba(34,211,238,0.75) 40%, rgba(8,145,178,0.88) 100%)",
              boxShadow: "inset 0 2px 6px rgba(255,255,255,0.3)",
            }}
          >
            <div
              className="absolute inset-x-0 top-0 h-0.5"
              style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent)" }}
            />
          </motion.div>
          {/* Target line */}
          <motion.div
            className="absolute inset-x-0 pointer-events-none"
            animate={{ bottom: `${target * 100}%` }}
            transition={{ type: "tween", duration: 0.3, ease: "linear" }}
            style={{
              height: 2,
              background: inZone ? "#a3e635" : "#facc15",
              boxShadow: `0 0 ${inZone ? 16 : 8}px ${inZone ? "#a3e635" : "#facc15"}`,
              transform: "translateY(50%)",
            }}
          />
          {/* Splash ripple when in zone */}
          <AnimatePresence>
            {splashKey > 0 && (
              <motion.div
                key={splashKey}
                initial={{ scale: 0.4, opacity: 0.8 }}
                animate={{ scale: 2.2, opacity: 0 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className="absolute left-1/2 w-10 h-10 rounded-full pointer-events-none"
                style={{
                  bottom: `${target * 100}%`,
                  marginLeft: -20,
                  marginBottom: -20,
                  border: "2px solid #a3e635",
                  boxShadow: "0 0 16px rgba(163,230,53,0.5)",
                }}
              />
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* LIVE badge */}
      <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/60 backdrop-blur px-2.5 py-1 rounded-md">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
        </span>
        <span className="text-[11px] font-bold tracking-widest text-white">LIVE</span>
      </div>

      {/* Viewer count */}
      <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-black/60 backdrop-blur px-2.5 py-1 rounded-md">
        <svg className="w-3 h-3 text-cyan-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
        <motion.span
          key={viewers}
          initial={{ scale: 0.95, opacity: 0.7 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.2 }}
          className="text-[11px] font-mono text-white tabular-nums"
          aria-label={`${viewers} viewers`}
        >
          {viewers.toLocaleString()}
        </motion.span>
      </div>

      {/* Player handle + score + time chip — broadcast overlay style */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-black/60 backdrop-blur px-3 py-1 rounded-md">
        <span className="text-base">🇯🇵</span>
        <span className="text-[11px] font-semibold text-white">@steady_hands</span>
        <span className="text-[10px] font-mono text-gray-500" aria-hidden>·</span>
        <motion.span
          key={score}
          initial={{ opacity: 0.6 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15 }}
          className="text-[11px] font-mono text-cyan-300 tabular-nums"
        >
          {score.toLocaleString()}
        </motion.span>
        <span className="text-[10px] font-mono text-gray-500" aria-hidden>·</span>
        <span
          className={`text-[11px] font-mono tabular-nums ${
            secsLeft <= 3 ? "text-red-300 font-bold" : "text-gray-300"
          }`}
        >
          {String(secsLeft).padStart(2, "0")}s
        </span>
      </div>

      {/* Combo chip when streaking */}
      <AnimatePresence>
        {combo >= 5 && (
          <motion.div
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute top-14 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold text-black"
            style={{ background: "#a3e635" }}
          >
            IN THE ZONE
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat */}
      <div className="absolute bottom-3 left-3 w-[45%] max-w-xs space-y-1 pointer-events-none">
        <AnimatePresence>
          {chat.map((m) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="text-[11px] bg-black/50 backdrop-blur-sm rounded px-2 py-0.5 w-fit max-w-full truncate"
            >
              <span className="text-cyan-300 font-semibold">@{m.h}</span>{" "}
              <span className="text-white/80">{m.t}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Round state pill */}
      <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur px-2.5 py-1 rounded-md text-[10px] font-mono text-cyan-300 uppercase tracking-widest">
        Round · 20s
      </div>
    </div>
  );
};

import { GamesHub } from "@/components/dunk/GamesHub";
import { ENTRY_USD, useWallet } from "@/components/dunk/wallet";
import { getHourBoard, getPlayerHandle, useScoreboardVersion } from "@/components/dunk/scoreboard";
import { WalletNav } from "@/components/dunk/WalletNav";

/* -------------------- Keyboard shortcuts overlay -------------------- */

const SHORTCUTS: { keys: string[]; desc: string; group: string }[] = [
  { keys: ["?"], desc: "Show/hide shortcuts", group: "General" },
  { keys: ["Esc"], desc: "Close overlay", group: "General" },
  { keys: ["G"], desc: "Jump to the game", group: "Navigation" },
  { keys: ["W"], desc: "Jump to waitlist", group: "Navigation" },
  { keys: ["D"], desc: "Jump to the DROP", group: "Navigation" },
  { keys: ["↑", "↓"], desc: "Raise / lower water", group: "Game" },
  { keys: ["PgUp", "PgDn"], desc: "Bigger level nudge", group: "Game" },
  { keys: ["Home", "End"], desc: "Full / empty", group: "Game" },
];

const Kbd = ({ children }: { children: React.ReactNode }) => (
  <kbd className="inline-flex items-center justify-center min-w-6 h-6 px-1.5 rounded bg-white/10 border border-white/15 text-[11px] font-mono text-white shadow-[0_1px_0_rgba(0,0,0,0.4)]">
    {children}
  </kbd>
);

const ShortcutsOverlay = () => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't swallow typing in inputs
      const tgt = e.target as HTMLElement | null;
      const typing = tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || tgt.isContentEditable);
      if (typing) return;

      if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") {
        setOpen(false);
      } else if (!e.metaKey && !e.ctrlKey && !e.altKey) {
        const go = (id: string) => {
          document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
          setOpen(false);
        };
        if (e.key === "g" || e.key === "G") go("games");
        else if (e.key === "w" || e.key === "W") go("waitlist");
        else if (e.key === "d" || e.key === "D") go("drop");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const groups = Array.from(new Set(SHORTCUTS.map((s) => s.group)));

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Show keyboard shortcuts"
        title="Keyboard shortcuts (?)"
        className="hidden md:flex fixed z-40 w-10 h-10 items-center justify-center rounded-full bg-white/5 border border-white/10 text-white/70 hover:text-white hover:bg-white/10 hover:border-white/20 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60"
        style={{
          bottom: "max(1.25rem, env(safe-area-inset-bottom))",
          right: "max(1.25rem, env(safe-area-inset-right))",
        }}
      >
        <span className="font-mono text-sm" aria-hidden>
          ?
        </span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="shortcuts-title"
          >
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-[#0a0e18] border border-white/10 rounded-2xl p-5 md:p-6 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-5">
                <div>
                  <div className="text-[11px] uppercase tracking-widest" style={{ color: WATER }}>
                    Keyboard
                  </div>
                  <h3 id="shortcuts-title" className="text-xl font-black text-white">
                    Shortcuts
                  </h3>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Close shortcuts"
                  className="w-11 h-11 flex items-center justify-center rounded-lg text-white/60 hover:text-white hover:bg-white/5 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M6 18L18 6" />
                  </svg>
                </button>
              </div>
              <div className="space-y-5">
                {groups.map((g) => (
                  <div key={g}>
                    <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">{g}</div>
                    <ul className="space-y-2">
                      {SHORTCUTS.filter((s) => s.group === g).map((s) => (
                        <li key={s.desc} className="flex items-center justify-between gap-4 text-sm">
                          <span className="text-gray-300">{s.desc}</span>
                          <span className="flex items-center gap-1">
                            {s.keys.map((k, i) => (
                              <Kbd key={i}>{k}</Kbd>
                            ))}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

/* -------------------- Sticky mobile CTA -------------------- */

const StickyMobileCTA = () => {
  const [visible, setVisible] = useState(false);
  const { balance } = useWallet();
  const [dropReady, setDropReady] = useState(false);

  useEffect(() => {
    let scrolledPastHero = false;
    const onScroll = () => {
      scrolledPastHero = window.scrollY > 600;
      update();
    };
    let gamesInView = false;
    let waitlistInView = false;
    const ios: IntersectionObserver[] = [];
    const attach = (id: string, cb: (v: boolean) => void) => {
      const el = document.getElementById(id);
      if (el && typeof IntersectionObserver !== "undefined") {
        const io = new IntersectionObserver(
          (entries) => {
            cb(entries[0]?.isIntersecting ?? false);
            update();
          },
          { rootMargin: "-10% 0px -10% 0px" },
        );
        io.observe(el);
        ios.push(io);
      }
    };
    attach("games", (v) => (gamesInView = v));
    attach("waitlist", (v) => (waitlistInView = v));

    function update() {
      setVisible(scrolledPastHero && !gamesInView && !waitlistInView);
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      ios.forEach((io) => io.disconnect());
    };
  }, []);

  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      const next = new Date(now);
      const nxt = new Date(next);
      nxt.setHours(next.getHours() + 1, 0, 0, 0);
      const secsLeft = Math.floor((nxt.getTime() - now) / 1000);
      const me = getPlayerHandle();
      const top = getHourBoard(now)[0];
      setDropReady(Boolean(me && top && top.handle === me && secsLeft <= 120 && secsLeft > 0));
    };
    tick();
    const id = setInterval(tick, 3000);
    return () => clearInterval(id);
  }, []);

  const canPlay = balance >= ENTRY_USD;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="fixed bottom-3 z-40 md:hidden pointer-events-auto"
          style={{
            left: "max(0.75rem, env(safe-area-inset-left))",
            right: "max(0.75rem, env(safe-area-inset-right))",
            paddingBottom: "env(safe-area-inset-bottom)",
          }}
        >
          <div className="flex items-center gap-2 p-2 rounded-2xl bg-black/75 backdrop-blur-md border border-white/10 shadow-2xl">
            <div className="flex-shrink-0 px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-[10px] font-mono text-white">
              <span className="text-gray-400 mr-1">BAL</span>
              <span className="tabular-nums">${balance.toFixed(2)}</span>
            </div>
            {dropReady ? (
              <a
                href="#games"
                className="flex-1 text-center py-2.5 rounded-xl text-black font-black text-sm transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                style={{
                  background: "linear-gradient(90deg, #facc15, #fb923c)",
                  boxShadow: "0 0 24px rgba(250,204,21,0.5)",
                }}
              >
                See the DROP →
              </a>
            ) : canPlay ? (
              <a
                href="#games"
                className="flex-1 text-center py-2.5 rounded-xl text-white font-bold text-sm shadow-lg transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                style={{
                  background: "linear-gradient(90deg, #22d3ee, #2563eb)",
                  boxShadow: "0 10px 25px -10px #22d3ee80",
                }}
              >
                Pour · ${ENTRY_USD}
              </a>
            ) : (
              <a
                href="#games"
                className="flex-1 text-center py-2.5 rounded-xl text-white font-bold text-sm shadow-lg transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                style={{
                  background: "rgba(239,68,68,0.7)",
                  boxShadow: "0 10px 25px -10px rgba(239,68,68,0.7)",
                }}
              >
                Top up to play
              </a>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

/* -------------------- Live activity ticker -------------------- */

const TICKER_EVENTS = [
  { k: "score", h: "steady_hands", t: "posted 8,420 pts · 68% on line", flag: "🇯🇵" },
  { k: "rebuy", h: "ltcmaxi", t: "added $30 · 10 more rounds", flag: "🇨🇦" },
  { k: "score", h: "calmwater", t: "72% perfect hold — personal best", flag: "🇦🇪" },
  { k: "win", h: "sipgod", t: "won the 02:00 drop — pot claimed", flag: "🇸🇬" },
  { k: "score", h: "tiltgod", t: "crept to #2 on the hour", flag: "🇺🇸" },
  { k: "rebuy", h: "wavepainter", t: "topped up · back in the round", flag: "🇨🇦" },
  { k: "score", h: "notmissing", t: "seven rounds, best 6,450", flag: "🇬🇧" },
  { k: "win", h: "calmwater", t: "dropped the talent on camera", flag: "🇦🇪" },
  { k: "score", h: "paintking", t: "in the zone for 11.8 of 20 seconds", flag: "🇩🇪" },
  { k: "rebuy", h: "she_dropped", t: "rebuy $15 · joined round", flag: "🇳🇱" },
] as const;

const LiveTicker = () => {
  const [idx, setIdx] = useState(0);
  const reduceMotion = useReducedMotion();
  const version = useScoreboardVersion();
  // Transient milestone override — shown for 4s when a real local score ≥ 8000 posts
  const [milestone, setMilestone] = useState<null | { k: "milestone"; h: string; t: string; flag: string }>(null);
  const lastSeenVersionRef = useRef(0);

  useEffect(() => {
    if (reduceMotion) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % TICKER_EVENTS.length), 2600);
    return () => clearInterval(id);
  }, [reduceMotion]);

  useEffect(() => {
    if (version === lastSeenVersionRef.current) return;
    lastSeenVersionRef.current = version;
    if (version === 0) return;
    const me = getPlayerHandle();
    if (!me) return;
    const board = getHourBoard();
    const mine = board.find((r) => r.game === "pour" && r.handle === me);
    if (!mine || mine.score < 8000) return;
    setMilestone({
      k: "milestone",
      h: me,
      t: `crushed an ${mine.score.toLocaleString()} — new record!`,
      flag: mine.flag,
    });
    const t = setTimeout(() => setMilestone(null), 4000);
    return () => clearTimeout(t);
  }, [version]);

  const ev = milestone ?? TICKER_EVENTS[idx];
  const dotColor =
    ev.k === "milestone"
      ? "#f472b6"
      : ev.k === "win"
        ? "#facc15"
        : ev.k === "rebuy"
          ? "#a3e635"
          : "#22d3ee";

  return (
    <div className="relative z-10 max-w-7xl mx-auto px-5 md:px-8 mb-6 md:mb-8">
      <div
        className="flex items-center gap-3 bg-white/[0.03] border border-white/10 rounded-full pl-3 pr-4 py-2 text-xs md:text-sm overflow-hidden"
        role="status"
        aria-live="polite"
      >
        <span className="flex items-center gap-1.5 shrink-0 uppercase tracking-widest text-[10px] font-mono text-gray-400">
          <span className="relative flex h-2 w-2">
            <span
              className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
              style={{ background: dotColor }}
            />
            <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: dotColor }} />
          </span>
          Live
        </span>
        <AnimatePresence mode="wait">
          <motion.span
            key={milestone ? `ms-${milestone.t}` : `i-${idx}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.3 }}
            className="truncate text-gray-300"
          >
            <span className="mr-1.5">{ev.flag}</span>
            <span className="font-semibold text-white">@{ev.h}</span>{" "}
            <span className="text-gray-400">{ev.t}</span>
          </motion.span>
        </AnimatePresence>
      </div>
    </div>
  );
};

/* -------------------- Sparkline -------------------- */

/** Countdown to the next weekly occurrence of (dow, hourUTC). */
const TalentCountdown = ({ dow, hourUTC }: { dow: number; hourUTC: number }) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000); // 30s is plenty for Xd Xh Xm
    return () => clearInterval(id);
  }, []);
  const current = new Date(now);
  const next = new Date(current);
  next.setUTCHours(hourUTC, 0, 0, 0);
  const daysAhead = (dow - current.getUTCDay() + 7) % 7;
  next.setUTCDate(current.getUTCDate() + daysAhead);
  // If the computed "next" is still in the past (same day, earlier hour), push a week
  if (next.getTime() <= current.getTime()) {
    next.setUTCDate(next.getUTCDate() + 7);
  }
  const ms = next.getTime() - current.getTime();
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  const mins = Math.floor((ms % 3_600_000) / 60_000);
  return (
    <span>
      in{" "}
      {days > 0 ? `${days}d ${hours}h` : hours > 0 ? `${hours}h ${mins}m` : `${mins}m`}
    </span>
  );
};

const Sparkline = ({
  data,
  color = WATER,
  width = 100,
  height = 24,
}: {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
}) => {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = width / (data.length - 1);
  const points = data
    .map((v, i) => {
      const x = i * step;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  // Area path (first point down to baseline, polyline, last point down to baseline)
  const areaPath = `M0,${height} L${points.replace(/ /g, " L")} L${width},${height} Z`;
  const lastX = width;
  const lastY = height - ((data[data.length - 1] - min) / range) * height;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="w-full h-6 mt-2"
      aria-hidden
    >
      <defs>
        <linearGradient id={`sparkFill-${color.replace("#", "")}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#sparkFill-${color.replace("#", "")})`} />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r="1.8" fill={color} />
    </svg>
  );
};

/* -------------------- Count-up number -------------------- */

const CountUp = ({ to, suffix = "", duration = 1.4 }: { to: number; suffix?: string; duration?: number }) => {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [display, setDisplay] = useState(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) {
      setDisplay(to);
      return;
    }
    const el = ref.current;
    if (!el) return;
    let started = false;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting && !started) {
            started = true;
            const start = performance.now();
            const tick = (now: number) => {
              const p = Math.min(1, (now - start) / (duration * 1000));
              const eased = 1 - Math.pow(1 - p, 3);
              setDisplay(Math.round(to * eased));
              if (p < 1) requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
            io.disconnect();
          }
        });
      },
      { rootMargin: "-10% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [to, duration, reduceMotion]);

  return (
    <span ref={ref}>
      {display.toLocaleString()}
      {suffix}
    </span>
  );
};

/* -------------------- Recent pours feed -------------------- */

const POUR_POOL = [
  { h: "steady_hands", c: "🇯🇵", score: 8420, holdPct: 68 },
  { h: "calmwater", c: "🇦🇪", score: 7915, holdPct: 61 },
  { h: "sipgod", c: "🇸🇬", score: 7580, holdPct: 58 },
  { h: "ltcmaxi", c: "🇨🇦", score: 7340, holdPct: 56 },
  { h: "wavepainter", c: "🇨🇦", score: 7122, holdPct: 53 },
  { h: "tiltgod", c: "🇺🇸", score: 6810, holdPct: 50 },
  { h: "notmissing", c: "🇬🇧", score: 6450, holdPct: 47 },
  { h: "paintking", c: "🇩🇪", score: 6100, holdPct: 44 },
  { h: "firststreamer", c: "🇫🇷", score: 5720, holdPct: 40 },
  { h: "she_dropped", c: "🇳🇱", score: 5430, holdPct: 37 },
];

type PourEvent = { id: number; h: string; c: string; score: number; holdPct: number; ts: number };

const formatAgo = (ms: number) => {
  const s = Math.max(1, Math.floor(ms / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
};

const RecentPours = () => {
  const reduceMotion = useReducedMotion();
  const scoreboardVersion = useScoreboardVersion();
  const [events, setEvents] = useState<PourEvent[]>(() => {
    const now = Date.now();
    return POUR_POOL.slice(0, 5).map((d, i) => ({ ...d, id: i + 1, ts: now - (i + 1) * 14000 }));
  });
  const idRef = useRef(POUR_POOL.length);
  const [, forceTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => forceTick((x) => x + 1), 5000);
    return () => clearInterval(t);
  }, []);

  // Surface any real local pour scores at the top of the feed whenever the
  // scoreboard bus tells us something was posted.
  useEffect(() => {
    if (scoreboardVersion === 0) return;
    const me = getPlayerHandle();
    if (!me) return;
    const board = getHourBoard();
    const mine = board.find((e) => e.game === "pour" && e.handle === me);
    if (!mine) return;
    idRef.current += 1;
    const holdPct = Math.min(80, Math.max(25, Math.round((mine.score / 10000) * 75)));
    setEvents((list) => {
      // Drop any previous event from the same handle so we don't stack duplicates
      const filtered = list.filter((e) => e.h !== me);
      return [
        { id: idRef.current, h: me, c: mine.flag, score: mine.score, holdPct, ts: mine.ts },
        ...filtered,
      ].slice(0, 5);
    });
  }, [scoreboardVersion]);

  useEffect(() => {
    if (reduceMotion) return;
    const t = setInterval(() => {
      idRef.current += 1;
      const pick = POUR_POOL[Math.floor(Math.random() * POUR_POOL.length)];
      // Jitter the score a bit so the feed feels live rather than scripted
      const jitter = Math.round((Math.random() - 0.5) * 600);
      setEvents((list) =>
        [
          { ...pick, score: Math.max(0, pick.score + jitter), id: idRef.current, ts: Date.now() },
          ...list,
        ].slice(0, 5),
      );
    }, 7000);
    return () => clearInterval(t);
  }, [reduceMotion]);

  return (
    <aside
      className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 md:p-5 h-fit"
      aria-label="Recent pours"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs uppercase tracking-widest text-gray-400">Recent pours</div>
        <span className="flex items-center gap-1.5 text-[10px] font-mono text-gray-500">
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#22d3ee" }} />
          LIVE
        </span>
      </div>
      <ul className="space-y-2" role="list">
        <AnimatePresence initial={false}>
          {events.map((e) => (
            <motion.li
              key={e.id}
              initial={{ opacity: 0, y: -8, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className="flex items-center gap-2.5 text-sm overflow-hidden"
            >
              <span className="text-base shrink-0">{e.c}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-1.5">
                  <span className="font-semibold text-white truncate">@{e.h}</span>
                  {typeof window !== "undefined" && e.h === getPlayerHandle() && (
                    <span
                      className="text-[9px] px-1.5 py-0.5 rounded font-bold shrink-0"
                      style={{ background: "rgba(250,204,21,0.25)", color: "#facc15" }}
                    >
                      YOU
                    </span>
                  )}
                  {e.holdPct >= 60 && (
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded font-bold shrink-0"
                      style={{ background: "rgba(163,230,53,0.22)", color: "#a3e635" }}
                    >
                      STEADY
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-gray-500 truncate">
                  <span className="text-cyan-300 font-mono tabular-nums">{e.score.toLocaleString()}</span> pts ·{" "}
                  {e.holdPct}% on line · {formatAgo(Date.now() - e.ts)}
                </div>
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </aside>
  );
};

/* -------------------- Icons -------------------- */

const Icon = ({ d, className }: { d: string; className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d={d} />
  </svg>
);

const LTC = () => (
  <svg viewBox="0 0 32 32" className="w-5 h-5" aria-hidden>
    <circle cx="16" cy="16" r="16" fill="#345D9D" />
    <path
      d="M10.5 9.3h4.2l-1.5 5.5 2.9-.8-.5 1.9-2.9.8-1 3.7h8l-.7 2.6H8.4l1.5-5.4-1.8.5.5-1.9 1.8-.5 1-3.4-.9-2z"
      fill="#fff"
    />
  </svg>
);
const BTC = () => (
  <svg viewBox="0 0 32 32" className="w-5 h-5" aria-hidden>
    <circle cx="16" cy="16" r="16" fill="#F7931A" />
    <path
      d="M21.5 14.4c.3-1.9-1.1-2.9-3-3.6l.6-2.5-1.5-.4-.6 2.4-1.2-.3.6-2.4-1.5-.4-.6 2.5c-.3-.1-.7-.2-1-.2l-2-.5-.4 1.6s1.1.3 1.1.3c.6.2.7.5.7.8l-.7 2.8v.1l-1 3.9c-.1.2-.3.5-.7.4 0 0-1.1-.3-1.1-.3l-.7 1.7 1.9.5c.4.1.7.2 1 .3l-.6 2.5 1.5.4.6-2.5 1.2.3-.6 2.5 1.5.4.6-2.5c2.6.5 4.5.3 5.3-2 .7-1.9 0-3-1.4-3.7 1-.2 1.8-.9 2-2.3zm-3.5 4.8c-.5 1.9-3.7.9-4.8.6l.8-3.4c1 .3 4.4.8 4 2.8zm.5-4.8c-.4 1.8-3.1.9-4 .6l.7-3.1c.9.3 3.8.7 3.3 2.5z"
      fill="#fff"
    />
  </svg>
);
const DUNK = () => (
  <svg viewBox="0 0 32 32" className="w-5 h-5" aria-hidden>
    <defs>
      <linearGradient id="dg" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0" stopColor={WATER} />
        <stop offset="1" stopColor={WATER_DEEP} />
      </linearGradient>
    </defs>
    <circle cx="16" cy="16" r="16" fill="url(#dg)" />
    <path d="M10 10h3l3 8 3-8h3l-4.5 12h-3z" fill="#fff" />
  </svg>
);

/* -------------------- Page -------------------- */

export default function DunkPage() {
  const reduceMotion = useReducedMotion();
  const heroRef = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const heroY = useTransform(scrollYProgress, [0, 1], [0, reduceMotion ? 0 : -60]);
  const heroScale = useTransform(scrollYProgress, [0, 1], [1, reduceMotion ? 1 : 0.96]);

  const { scrollY, scrollYProgress: pageProgress } = useScroll();
  const glowLeftY = useTransform(scrollY, [0, 2000], [0, reduceMotion ? 0 : 180]);
  const glowRightY = useTransform(scrollY, [0, 2000], [0, reduceMotion ? 0 : -220]);
  const progressScaleX = useTransform(pageProgress, [0, 1], [0, 1]);

  const [email, setEmail] = useState("");
  const [waitState, setWaitState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [errMsg, setErrMsg] = useState<string>("");

  const submitWaitlist = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrMsg("");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setWaitState("error");
      setErrMsg("Enter a valid email address.");
      return;
    }
    setWaitState("loading");
    try {
      const r = await fetch("/api/dunk/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (r.ok) {
        setWaitState("done");
        return;
      }
      const data = (await r.json().catch(() => ({}))) as { error?: string };
      setWaitState("error");
      setErrMsg(
        data.error === "rate_limited"
          ? "Too many requests — wait a minute and try again."
          : data.error === "invalid_email"
            ? "That doesn't look like a valid email."
            : "Couldn't submit. Try again in a moment.",
      );
    } catch {
      setWaitState("error");
      setErrMsg("Network error. Check your connection and try again.");
    }
  };

  const howItWorks = useMemo(
    () => [
      { n: "01", t: "Join the round", d: "Every 20 seconds a new round starts. Everyone on the stream plays the same seed at the same time. No accounts, no KYC.", ic: "M12 2a10 10 0 100 20 10 10 0 000-20zM12 7v5l3 2" },
      { n: "02", t: "Tilt to pour", d: "Hold your phone like a glass. Gyroscope reads your angle 240× a second and sets your water level on-screen.", ic: "M7 3h10l-2 14a3 3 0 01-3 2h0a3 3 0 01-3-2L7 3zM9 11h6" },
      { n: "03", t: "Match the line", d: "The yellow line moves. Keep your water on it. No spills. No sloshing. Closer = more points, faster.", ic: "M4 12h4l2-6 4 12 2-6h4" },
      { n: "04", t: "Top the hour", d: "Highest score on the hour earns the DROP button. Tap it — the seat drops, your handle flashes on-broadcast, the jackpot pays out.", ic: "M3 12c0 4.97 4.03 9 9 9s9-4.03 9-9H3zM12 3v6" },
    ],
    [],
  );


  // Today-leaderboard: top pours from across the day
  const leaderboard = [
    { h: "steady_hands", c: "🇯🇵", best: 9820, rounds: 42, holdPct: 73 },
    { h: "calmwater", c: "🇦🇪", best: 9512, rounds: 28, holdPct: 70 },
    { h: "sipgod", c: "🇸🇬", best: 9310, rounds: 51, holdPct: 66 },
    { h: "wavepainter", c: "🇨🇦", best: 9195, rounds: 19, holdPct: 64 },
    { h: "ltcmaxi", c: "🇨🇦", best: 9020, rounds: 33, holdPct: 62 },
    { h: "tiltgod", c: "🇺🇸", best: 8884, rounds: 47, holdPct: 59 },
    { h: "paintking", c: "🇩🇪", best: 8701, rounds: 22, holdPct: 56 },
    { h: "notmissing", c: "🇬🇧", best: 8540, rounds: 31, holdPct: 54 },
  ];

  // Weekly schedule — dow is 0=Sun…6=Sat, hour is UTC (EST = UTC-5, so 9pm EST = 02:00 UTC next day)
  const talent: { handle: string; followers: string; dow: number; hourUTC: number; drops: number; live?: boolean }[] = [
    { handle: "nova_onair", followers: "482k", dow: -1, hourUTC: -1, drops: 61, live: true },
    { handle: "kairos_k",   followers: "311k", dow: 6, hourUTC: 2,  drops: 43 }, // Fri 9pm EST = Sat 02:00 UTC
    { handle: "iris_f",     followers: "229k", dow: 0, hourUTC: 1,  drops: 38 }, // Sat 8pm EST = Sun 01:00 UTC
    { handle: "mika_y",     followers: "166k", dow: 1, hourUTC: 3,  drops: 27 }, // Sun 10pm EST = Mon 03:00 UTC
    { handle: "ryo_x",      followers: "140k", dow: 2, hourUTC: 2,  drops: 22 }, // Mon 9pm EST = Tue 02:00 UTC
    { handle: "zoe_t",      followers: "112k", dow: 4, hourUTC: 2,  drops: 17 }, // Wed 9pm EST = Thu 02:00 UTC
  ];

  const stats = [
    {
      k: "Pours this hour",
      n: 3128,
      suffix: "",
      trend: [1800, 2000, 2100, 2250, 2400, 2550, 2650, 2700, 2820, 2900, 2980, 3050, 3100, 3128],
    },
    {
      k: "Avg. perfect hold",
      n: 54,
      suffix: "%",
      trend: [42, 44, 43, 46, 47, 48, 49, 51, 52, 52, 53, 53, 54, 54],
    },
    {
      k: "Hourly winners paid",
      n: 642,
      suffix: "",
      trend: [420, 440, 460, 480, 505, 525, 545, 565, 585, 600, 615, 625, 635, 642],
    },
    {
      k: "Countries pouring",
      n: 87,
      suffix: "",
      trend: [62, 65, 68, 70, 72, 74, 76, 78, 80, 82, 84, 85, 86, 87],
    },
  ];

  const testimonials = [
    {
      q: "Topped the hour on round twelve. Tapped DROP from an airport in Berlin. The talent screamed. My IG tripled overnight.",
      h: "steady_hands",
      role: "streamer · 412k followers",
      flag: "🇯🇵",
    },
    {
      q: "The beauty is you can't cheat it. Same seed, same 20 seconds, same yellow line. Either your hand is steady or it isn't.",
      h: "pourmaster",
      role: "early beta · mobile UX lead",
      flag: "🇨🇦",
    },
    {
      q: "Started watching, tilted my phone out of curiosity, scored 4k on my first try. Forty-five minutes later I'm still playing.",
      h: "first_pour",
      role: "new to crypto · first session",
      flag: "🇬🇧",
    },
  ];

  const faq = [
    {
      q: "How much does it cost?",
      a: "$3 per 20-second round. 20% ($0.60) splits into the pots — $0.30 into the hourly pot, $0.30 into the weekly progressive. Play as many rounds per hour as you want; we only count your best.",
    },
    {
      q: "Is this gambling?",
      a: "Skill, not chance. Same seed, same 20 seconds, same target line for every player. The outcome is determined by how steady your hand is, not by a random draw — and local regulations classify it as a skill-based contest, not a wager.",
    },
    {
      q: "How is the score calculated?",
      a: "Your phone's gyroscope sets a water level. The target line moves. Every millisecond you're close, you earn points — exponentially more for being dead-on the line. Perfect round caps at 10,000.",
    },
    {
      q: "How do I win the hourly DROP?",
      a: "Buy in, pour, repeat. We take your best score of the hour. Whoever sits at #1 when the clock hits :00 unlocks the DROP button — one tap, the seat drops, the pot pays out.",
    },
    {
      q: "What's the weekly progressive?",
      a: "A second, bigger pot. 10% of every $3 entry rolls into it for a full 7 days. The highest weekly score wins the whole thing when the week ends — then the pot resets and starts rolling again.",
    },
    {
      q: "Can a bot cheat?",
      a: "Bots can fake a gyroscope stream, but they can't fake the micro-tremor signature a real hand produces. We also detect impossible-perfect streams and silently exclude them from the hour.",
    },
    {
      q: "Who are the talent?",
      a: "A rotating roster of streamers, athletes, and performers — all consenting, contracted, and paid a flat rate per stream plus revenue share. Nobody is dropped without agreeing in advance.",
    },
  ];

  const fadeUp = {
    hidden: { opacity: 0, y: 24 },
    show: { opacity: 1, y: 0, transition: { duration: 0.6 } },
  };

  return (
    <div className="min-h-screen bg-[#05070d] text-white overflow-x-hidden antialiased">
      <a
        href="#top"
        className="sr-only focus:not-sr-only focus:fixed focus:z-50 focus:px-3 focus:py-2 focus:text-white focus:rounded"
        style={{
          background: WATER,
          top: "max(0.75rem, env(safe-area-inset-top))",
          left: "max(0.75rem, env(safe-area-inset-left))",
        }}
      >
        Skip to content
      </a>

      <motion.div
        aria-hidden
        className="fixed top-0 left-0 right-0 h-0.5 z-50 origin-left"
        style={{
          scaleX: progressScaleX,
          background: `linear-gradient(90deg, ${WATER}, ${WATER_DEEP})`,
        }}
      />


      <div className="pointer-events-none fixed inset-0 z-0" aria-hidden>
        <motion.div
          style={{ y: glowLeftY, background: `${WATER}1a`, willChange: "transform" }}
          className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full blur-[120px]"
        />
        <motion.div
          style={{ y: glowRightY, willChange: "transform" }}
          className="absolute top-40 -right-40 w-[500px] h-[500px] rounded-full bg-cyan-500/10 blur-[120px]"
        />
      </div>

      <nav
        aria-label="Site"
        className="relative z-20 max-w-7xl mx-auto px-4 sm:px-5 md:px-8 py-4 sm:py-5 flex items-center justify-between gap-3"
      >
        <a href="#top" className="flex items-center" aria-label="Livewager Dunk home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/assets/logo43.png"
            alt="Livewager · Dunk"
            width={880}
            height={288}
            style={{ height: 224, width: "auto", objectFit: "contain" }}
          />
        </a>
        <div className="hidden md:flex items-center gap-5 lg:gap-6 text-sm text-gray-300">
          {[
            { href: "#games", label: "Play" },
            { href: "#how", label: "How" },
            { href: "#drop", label: "The DROP" },
            { href: "#leaderboard", label: "Leaderboard" },
            { href: "#talent", label: "Talent" },
            { href: "#reviews", label: "Reviews" },
          ].map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="relative hover:text-white transition rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#05070d] px-1 after:content-[''] after:absolute after:left-1 after:right-1 after:-bottom-1 after:h-px after:bg-white/60 after:scale-x-0 hover:after:scale-x-100 after:origin-left after:transition-transform after:duration-200"
            >
              {l.label}
            </a>
          ))}
        </div>
        <WalletNav />
      </nav>

      <section
        id="top"
        ref={heroRef}
        /* min-h guard: on short viewports (landscape phone ~375x667)
           the parallax-driven heroY transform can pull the hero grid
           underneath the sticky nav. Pin a floor so the content + CTA
           always have room to breathe. */
        className="relative z-10 max-w-7xl mx-auto px-5 md:px-8 pt-6 md:pt-12 pb-16 md:pb-24 min-h-[640px] md:min-h-[560px]"
      >
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-12 items-center">
          <motion.div style={{ y: heroY }} initial="hidden" animate="show" variants={fadeUp}>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 backdrop-blur text-xs tracking-widest uppercase text-gray-300 mb-6">
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#22d3ee" }} /> Live now · 20-second rounds
            </div>
            <h1 className="text-[2.4rem] xs:text-4xl md:text-6xl lg:text-7xl font-black leading-[1.02] tracking-tight mb-6 break-words">
              Tilt.
              <br />
              <span
                className="bg-clip-text text-transparent"
                style={{ backgroundImage: `linear-gradient(135deg, #22d3ee, #60a5fa, #a78bfa)` }}
              >
                Pour.
              </span>
              <br />
              Don&apos;t spill.
            </h1>
            <p className="text-lg md:text-xl text-gray-300 max-w-lg mb-8 leading-relaxed">
              A 10-second skill game you play with your phone.{" "}
              <span className="text-white">Steadiest hand on the hour drops the talent — live, on camera.</span>
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <a
                href="#games"
                className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-xl text-white font-bold shadow-xl transition hover:brightness-110"
                style={{ background: `linear-gradient(90deg, #22d3ee, #2563eb)`, boxShadow: `0 20px 40px -15px #22d3ee80` }}
              >
                Pour now
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                  <path d="M5 12h14M13 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </a>
              <a
                href="#how"
                className="inline-flex items-center justify-center px-7 py-4 rounded-xl bg-white/5 border border-white/10 text-white font-semibold hover:bg-white/10 transition"
              >
                How it works
              </a>
            </div>
            <div className="mt-8 flex items-center gap-6 text-xs text-gray-400">
              <div className="flex items-center gap-2"><LTC /> Litecoin</div>
              <div className="flex items-center gap-2"><BTC /> Bitcoin</div>
              <div className="flex items-center gap-2"><DUNK /> $DUNK</div>
            </div>

            {/* Stat-chip strip. Mirrors /stacker's hero signature so the
                two game landings feel like siblings at a glance. */}
            <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px] text-gray-500">
              <span className="inline-flex items-baseline gap-1.5">
                <span className="uppercase tracking-widest text-gray-500">Round</span>
                <span className="font-mono text-white">~10s</span>
              </span>
              <span className="inline-flex items-baseline gap-1.5">
                <span className="uppercase tracking-widest text-gray-500">Input</span>
                <span className="font-mono text-white">gyroscope · keys</span>
              </span>
              <span className="inline-flex items-baseline gap-1.5">
                <span className="uppercase tracking-widest text-gray-500">Leaderboard</span>
                <span className="font-mono text-white">hourly</span>
              </span>
              <span className="inline-flex items-baseline gap-1.5">
                <span className="uppercase tracking-widest text-gray-500">Prize</span>
                <span className="font-mono text-white">live drop</span>
              </span>
            </div>
          </motion.div>

          <motion.div
            style={{ scale: heroScale }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
          >
            <LiveStreamMock />
            <div className="mt-3 flex items-center justify-between text-xs text-gray-400 px-1">
              <span>Stream · tokyo-edge-1 · 42 ms</span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" /> 4K · 120 FPS
              </span>
            </div>
          </motion.div>
        </div>

        <motion.a
          href="#games"
          aria-label="Scroll to the game"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.4, duration: 0.6 }}
          className="hidden lg:flex items-center justify-center mt-12 mx-auto w-10 h-16 rounded-full border border-white/15 hover:border-white/30 transition group focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60"
        >
          <motion.span
            className="block w-1 h-2 rounded-full bg-white/70 group-hover:bg-white transition"
            animate={reduceMotion ? {} : { y: [0, 10, 0] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          />
        </motion.a>
      </section>

      <LiveTicker />

      <section className="relative z-10 max-w-7xl mx-auto px-5 md:px-8 pb-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          {stats.map((s) => (
            <div
              key={s.k}
              className="bg-white/[0.03] border border-white/10 rounded-xl p-4 md:p-5 text-center md:text-left hover:border-white/20 hover:bg-white/[0.05] transition flex flex-col"
            >
              <div className="text-2xl md:text-3xl font-black tracking-tight text-white tabular-nums">
                <CountUp to={s.n} suffix={s.suffix} />
              </div>
              <div className="text-[11px] uppercase tracking-widest text-gray-400 mt-1">{s.k}</div>
              <div className="mt-auto pt-2">
                <Sparkline data={s.trend} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <GamesHub />

      {/* Wallet preview right under the game so it's visible without
          scrolling to #drop. Same component, so state + auth work the
          same way. */}
      <section
        id="drop-top"
        className="relative z-10 max-w-7xl mx-auto px-5 md:px-8 pt-4 pb-8 md:pt-6 md:pb-12"
      >
        <DropWallet />
      </section>

      <section
        id="phone"
        className="relative z-10 max-w-7xl mx-auto px-5 md:px-8 py-12 md:py-20 scroll-mt-20"
      >
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-80px" }}
            variants={fadeUp}
          >
            <div className="text-xs uppercase tracking-widest text-cyan-300 mb-3">
              Pour with your phone
            </div>
            <h2 className="text-3xl md:text-5xl font-black tracking-tight mb-5">
              Your phone <span className="text-cyan-300">IS</span> the glass.
            </h2>
            <p className="text-gray-300 text-lg leading-relaxed mb-6">
              Hold your phone upright. Roll it left, the water slides one way. Roll it right, the water slides the other.
              Match the yellow line without spilling. The steadier you hold, the higher you score.
            </p>
            <ul className="space-y-3 text-sm text-gray-400">
              {[
                "Accelerometer sampled every frame — the water tracks your tilt instantly",
                "Same seed, same line, same 20 seconds for every player",
                "No app install — works right in your mobile browser",
              ].map((x) => (
                <li key={x} className="flex items-start gap-2">
                  <span className="mt-0.5 text-cyan-300">▸</span> {x}
                </li>
              ))}
            </ul>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="relative mx-auto"
          >
            <motion.div
              className="relative w-[220px] sm:w-[260px] h-[440px] sm:h-[520px] rounded-[48px] bg-black border-[10px] border-gray-800 mx-auto"
              style={{
                boxShadow: "0 40px 80px -30px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.04) inset",
                transformOrigin: "center bottom",
              }}
              animate={reduceMotion ? {} : { rotate: [-6, 4, -6] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            >
              {/* Notch */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-28 h-6 bg-black rounded-b-2xl z-10" />
              {/* Screen */}
              <div className="absolute inset-2 rounded-[38px] overflow-hidden bg-gradient-to-br from-[#06111f] via-[#040b18] to-[#020710]">
                {/* Status */}
                <div className="absolute top-4 left-0 right-0 text-center z-20">
                  <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-black/60 backdrop-blur">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cyan-400" />
                    </span>
                    <span className="text-[9px] uppercase tracking-widest text-cyan-200 font-mono">Round 1 · 14s</span>
                  </div>
                </div>

                {/* Glass inside phone screen */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="relative w-[55%] h-[62%] rounded-[8px_8px_14px_14px] border-2 border-white/25 bg-white/[0.02] overflow-hidden">
                    {/* Water */}
                    <motion.div
                      className="absolute inset-x-0 bottom-0"
                      animate={reduceMotion ? { height: "60%" } : { height: ["45%", "70%", "55%", "65%", "58%"] }}
                      transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                      style={{
                        background: "linear-gradient(180deg, rgba(34,211,238,0.5) 0%, rgba(34,211,238,0.7) 40%, rgba(8,145,178,0.85) 100%)",
                        boxShadow: "inset 0 2px 6px rgba(255,255,255,0.3)",
                      }}
                    >
                      <div
                        className="absolute inset-x-0 top-0 h-0.5"
                        style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.7), transparent)" }}
                      />
                    </motion.div>
                    {/* Target line */}
                    <div
                      className="absolute inset-x-0 pointer-events-none"
                      style={{
                        bottom: "60%",
                        height: 2,
                        background: "#facc15",
                        boxShadow: "0 0 10px #facc15",
                      }}
                    >
                      <span className="absolute -left-12 top-1/2 -translate-y-1/2 text-[8px] font-mono tracking-widest text-yellow-300">
                        TARGET
                      </span>
                    </div>
                  </div>
                </div>

                {/* Score chip */}
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded-md bg-black/60 backdrop-blur text-[10px] font-mono text-white">
                  SCORE <span className="text-cyan-300">4,812</span>
                </div>
              </div>
            </motion.div>
            <div className="absolute -inset-10 -z-10 blur-3xl rounded-full" style={{ background: "rgba(34,211,238,0.12)" }} />
          </motion.div>
        </div>
      </section>

      <section id="how" className="relative z-10 max-w-7xl mx-auto px-5 md:px-8 py-12 md:py-20 scroll-mt-20">
        <motion.div initial="hidden" whileInView="show" viewport={{ once: true, margin: "-80px" }} variants={fadeUp} className="max-w-2xl mb-12">
          <div className="text-xs uppercase tracking-widest mb-3 text-cyan-300">
            How it works
          </div>
          <h2 className="text-3xl md:text-5xl font-black tracking-tight mb-4">
            Four steps to the DROP.
          </h2>
          <p className="text-gray-400 text-lg">
            Same game for everyone. Same 20-second round. Same seed. Only the steadiest hand wins the hour.
          </p>
        </motion.div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5 items-stretch">
          {howItWorks.map((s, i) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className="relative h-full bg-white/[0.03] backdrop-blur border border-white/10 rounded-2xl p-5 md:p-6 hover:bg-white/[0.06] hover:border-white/20 hover:-translate-y-0.5 transition-all duration-200 group flex flex-col"
            >
              <div className="text-[11px] font-mono mb-4" style={{ color: `${WATER}cc` }}>
                {s.n}
              </div>
              <Icon d={s.ic} className="w-7 h-7 text-cyan-300 mb-4 transition" />
              <h3 className="text-lg font-bold mb-2">{s.t}</h3>
              <p className="text-sm text-gray-400 leading-relaxed">{s.d}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <section id="drop" className="relative z-10 max-w-7xl mx-auto px-5 md:px-8 py-12 md:py-20 scroll-mt-20">
        <motion.div initial="hidden" whileInView="show" viewport={{ once: true, margin: "-80px" }} variants={fadeUp} className="max-w-2xl mb-12">
          <div className="text-xs uppercase tracking-widest mb-3 text-cyan-300">The DROP</div>
          <h2 className="text-3xl md:text-5xl font-black tracking-tight mb-4">
            $3 a round. Two pots. Two winners.
          </h2>
          <p className="text-gray-400 text-lg">
            Every round is $3. 20% of every entry feeds the pots — split between an <span className="text-white">hourly
            drop</span> and a rolling <span className="text-white">weekly progressive</span>. Top hourly scorer takes
            the hour. Top weekly scorer takes the week.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-4 md:gap-5 items-stretch">
          {[
            {
              step: "01",
              title: "Pay $3. Pour.",
              desc: "Each 20-second round costs $3. 20% ($0.60) auto-splits into the hourly pot and the weekly progressive. Play as many rounds as you want — we keep your best.",
              color: "#22d3ee",
              icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-6 h-6">
                  <path d="M7 3h10l-2 14a3 3 0 01-3 2h0a3 3 0 01-3-2L7 3z" />
                  <path d="M9 11h6" />
                </svg>
              ),
            },
            {
              step: "02",
              title: "Top the leaderboard.",
              desc: "When the clock hits :00, whoever sits at #1 on the hour board wins. Live-ranked, tie-break by timestamp.",
              color: "#facc15",
              icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-6 h-6">
                  <path d="M12 2l2.4 5 5.6.6-4.2 3.8 1.2 5.6L12 14l-5 3 1.2-5.6L4 7.6 9.6 7z" />
                </svg>
              ),
            },
            {
              step: "03",
              title: "Tap DROP. Collect.",
              desc: "Your phone lights up. One tap — the seat drops, your handle flashes on broadcast, the jackpot pays to your wallet.",
              color: "#f472b6",
              icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-6 h-6">
                  <path d="M3 12c0 4.97 4.03 9 9 9s9-4.03 9-9H3z" />
                  <path d="M12 3v6" />
                </svg>
              ),
            },
          ].map((s, i) => (
            <motion.div
              key={s.step}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="relative h-full rounded-2xl p-5 md:p-6 border border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05] transition flex flex-col"
            >
              <div className="flex items-center justify-between mb-4">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: `${s.color}18`, color: s.color, border: `1px solid ${s.color}33` }}
                >
                  {s.icon}
                </div>
                <span className="text-[11px] font-mono" style={{ color: s.color }}>
                  {s.step}
                </span>
              </div>
              <h3 className="text-lg font-bold text-white mb-2">{s.title}</h3>
              <p className="text-sm text-gray-400 leading-relaxed">{s.desc}</p>
            </motion.div>
          ))}
        </div>

        <div
          className="mt-8 rounded-2xl border overflow-hidden"
          style={{
            background: "linear-gradient(90deg, rgba(34,211,238,0.08), transparent)",
            borderColor: "rgba(34,211,238,0.25)",
          }}
        >
          <div className="p-5 md:p-6 border-b border-white/10 flex items-end justify-between gap-4 flex-wrap">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-cyan-300 mb-1.5">Entry</div>
              <div className="text-4xl md:text-5xl font-black text-white tabular-nums leading-none">$3.00</div>
              <div className="text-xs text-gray-400 mt-2 leading-snug">per 20-second round</div>
            </div>
            <div className="text-right text-[11px] text-gray-400 leading-snug max-w-[200px]">
              20% goes to the pots — winners take <span className="text-white font-semibold">100%</span> of what they win.
            </div>
          </div>
          <div className="grid grid-cols-3 divide-x divide-white/10 text-center">
            <div className="p-3 md:p-4">
              <div className="text-[9px] uppercase tracking-widest text-gray-500 mb-1 leading-tight">Hourly pot</div>
              <div className="text-xl md:text-2xl font-black tabular-nums text-cyan-300 leading-none">10%</div>
              <div className="text-[10px] text-gray-500 mt-1">$0.30</div>
            </div>
            <div className="p-3 md:p-4">
              <div className="text-[9px] uppercase tracking-widest text-gray-500 mb-1 leading-tight">Weekly pot</div>
              <div className="text-xl md:text-2xl font-black tabular-nums leading-none" style={{ color: "#f472b6" }}>10%</div>
              <div className="text-[10px] text-gray-500 mt-1">$0.30 · 7d</div>
            </div>
            <div className="p-3 md:p-4">
              <div className="text-[9px] uppercase tracking-widest text-gray-500 mb-1 leading-tight">To winners</div>
              <div className="text-xl md:text-2xl font-black tabular-nums leading-none" style={{ color: "#facc15" }}>100%</div>
              <div className="text-[10px] text-gray-500 mt-1">of each pot</div>
            </div>
          </div>
        </div>

        {/* Non-custodial points wallet (ICP-08). Lives inside #drop so the
            marketing explainer + wallet UI share one anchor. */}
        <DropWallet />
      </section>

      <section id="leaderboard" className="relative z-10 max-w-7xl mx-auto px-5 md:px-8 py-12 md:py-20 scroll-mt-20">
        <motion.div initial="hidden" whileInView="show" viewport={{ once: true, margin: "-80px" }} variants={fadeUp} className="max-w-2xl mb-10">
          <div className="text-xs uppercase tracking-widest mb-3 text-cyan-300">Leaderboard</div>
          <h2 className="text-3xl md:text-5xl font-black tracking-tight mb-4">
            The steadiest hands of the day.
          </h2>
          <p className="text-gray-400 text-lg">
            Ranked by best single pour. Resets daily at midnight UTC. Weekly progressive pays out the #1 of the week.
          </p>
        </motion.div>
        <div className="grid lg:grid-cols-[minmax(0,1fr)_360px] gap-4 lg:gap-6 items-start">
          <div className="bg-white/[0.03] border border-white/10 rounded-2xl overflow-hidden">
            <div className="hidden md:grid grid-cols-12 px-6 py-3 text-[11px] uppercase tracking-widest text-gray-500 border-b border-white/5">
              <div className="col-span-1">#</div>
              <div className="col-span-5">Handle</div>
              <div className="col-span-2 text-right">Best pour</div>
              <div className="col-span-2 text-right">Rounds</div>
              <div className="col-span-2 text-right">Hold %</div>
            </div>
            {leaderboard.map((l, i) => (
              <div
                key={l.h}
                className="grid grid-cols-5 md:grid-cols-12 items-center gap-2 md:gap-0 px-4 md:px-6 py-3.5 md:py-4 border-b border-white/5 last:border-0"
                style={
                  i === 0
                    ? { background: "linear-gradient(90deg, rgba(34,211,238,0.12), transparent)" }
                    : undefined
                }
              >
                <div className="col-span-1 font-mono text-gray-500">{String(i + 1).padStart(2, "0")}</div>
                <div className="col-span-3 md:col-span-5 flex items-center gap-2.5 min-w-0">
                  <span className="text-xl">{l.c}</span>
                  <span className="font-semibold truncate">@{l.h}</span>
                  {i === 0 && (
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded font-bold"
                      style={{ background: "rgba(34,211,238,0.22)", color: "#22d3ee" }}
                    >
                      #1 today
                    </span>
                  )}
                </div>
                <div className="col-span-1 md:col-span-2 text-right font-mono text-white tabular-nums">
                  {l.best.toLocaleString()}
                </div>
                <div className="hidden md:block md:col-span-2 text-right font-mono text-gray-400 tabular-nums">
                  {l.rounds}
                </div>
                <div className="hidden md:block md:col-span-2 text-right font-mono text-cyan-300 tabular-nums">
                  {l.holdPct}%
                </div>
              </div>
            ))}
          </div>

          <RecentPours />
        </div>
      </section>

      <section id="talent" className="relative z-10 max-w-7xl mx-auto px-5 md:px-8 py-12 md:py-20 scroll-mt-20">
        <motion.div initial="hidden" whileInView="show" viewport={{ once: true, margin: "-80px" }} variants={fadeUp} className="max-w-2xl mb-10">
          <div className="text-xs uppercase tracking-widest mb-3 text-cyan-300">Talent roster</div>
          <h2 className="text-3xl md:text-5xl font-black tracking-tight mb-4">Who you can drop.</h2>
          <p className="text-gray-400 text-lg">
            Consenting performers on a rotating schedule. Each lives in the tank for their session — the
            hour&apos;s top scorer pulls the lever.
          </p>
        </motion.div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5 items-stretch">
          {talent.map((p, i) => (
            <motion.div
              key={p.handle}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.05 }}
              className="group relative h-full bg-white/[0.03] border rounded-2xl p-5 md:p-6 transition overflow-hidden flex flex-col"
              style={
                p.live
                  ? {
                      borderColor: "rgba(239,68,68,0.45)",
                      background: "linear-gradient(135deg, rgba(239,68,68,0.08), rgba(255,255,255,0.03))",
                      boxShadow: "0 0 0 1px rgba(239,68,68,0.25), 0 10px 30px -15px rgba(239,68,68,0.3)",
                    }
                  : { borderColor: "rgba(255,255,255,0.1)" }
              }
            >
              <div className="flex items-center gap-4">
                <div
                  className="relative w-14 h-14 rounded-full flex items-center justify-center overflow-hidden"
                  style={{ background: `linear-gradient(135deg, rgba(34,211,238,0.55), rgba(96,165,250,0.4))` }}
                >
                  <svg className="w-8 h-8 text-white/70" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M12 12a5 5 0 100-10 5 5 0 000 10zm0 2c-5 0-9 2.5-9 6v2h18v-2c0-3.5-4-6-9-6z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold truncate">@{p.handle}</div>
                  <div className="text-xs text-gray-400">{p.followers} followers · IG</div>
                </div>
                {p.live ? (
                  <div className="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded font-mono whitespace-nowrap bg-red-500/20 text-red-300">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
                    </span>
                    IN THE TANK
                  </div>
                ) : (
                  <div className="text-[10px] px-2 py-1 rounded font-mono whitespace-nowrap bg-white/5 text-gray-400 border border-white/10">
                    SCHEDULED
                  </div>
                )}
              </div>
              <div className="mt-4 pt-4 border-t border-white/5 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <div className="text-[9px] uppercase tracking-widest text-gray-500">Next session</div>
                  <div className="text-white font-mono">
                    {p.live ? "Live now" : <TalentCountdown dow={p.dow} hourUTC={p.hourUTC} />}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[9px] uppercase tracking-widest text-gray-500">Times dropped</div>
                  <div className="font-mono text-cyan-300 tabular-nums">{p.drops}</div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      <section id="reviews" className="relative z-10 max-w-7xl mx-auto px-5 md:px-8 py-12 md:py-20 scroll-mt-20">
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          variants={fadeUp}
          className="max-w-2xl mb-10"
        >
          <div className="text-xs uppercase tracking-widest mb-3 text-cyan-300">
            What they say
          </div>
          <h2 className="text-3xl md:text-5xl font-black tracking-tight">
            Steady hands, live drops.
          </h2>
        </motion.div>
        <div className="grid md:grid-cols-3 gap-4 md:gap-5 items-stretch">
          {testimonials.map((t, i) => (
            <motion.figure
              key={t.h}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className="relative h-full bg-white/[0.03] border border-white/10 rounded-2xl p-5 md:p-6 hover:border-white/20 hover:bg-white/[0.05] transition flex flex-col"
            >
              <svg
                className="absolute top-5 right-5 w-8 h-8 opacity-20"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden
                style={{ color: WATER }}
              >
                <path d="M9 7v4H7c-1.1 0-2 .9-2 2v4h4v-4H7V9h2zm8 0v4h-2c-1.1 0-2 .9-2 2v4h4v-4h-2V9h2z" />
              </svg>
              <blockquote className="text-sm md:text-base text-gray-200 leading-relaxed mb-5">
                &ldquo;{t.q}&rdquo;
              </blockquote>
              <figcaption className="mt-auto flex items-center gap-2.5 pt-4 border-t border-white/5">
                <span className="text-xl">{t.flag}</span>
                <div className="min-w-0">
                  <div className="font-semibold text-white text-sm truncate">@{t.h}</div>
                  <div className="text-[11px] text-gray-400 truncate">{t.role}</div>
                </div>
              </figcaption>
            </motion.figure>
          ))}
        </div>
      </section>

      <section id="faq" className="relative z-10 max-w-3xl mx-auto px-5 md:px-8 py-12 md:py-20 scroll-mt-20">
        <motion.div initial="hidden" whileInView="show" viewport={{ once: true, margin: "-80px" }} variants={fadeUp} className="mb-10">
          <div className="text-xs uppercase tracking-widest mb-3 text-cyan-300">
            FAQ
          </div>
          <h2 className="text-3xl md:text-5xl font-black tracking-tight">Straight answers.</h2>
        </motion.div>
        <div className="space-y-3">
          {faq.map((f) => (
            <details
              key={f.q}
              className="group bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden transition"
            >
              <summary className="list-none cursor-pointer px-5 py-4 flex items-center justify-between gap-4 select-none">
                <span className="font-semibold text-white">{f.q}</span>
                <span className="transition-transform group-open:rotate-45 text-xl leading-none" style={{ color: WATER }}>
                  +
                </span>
              </summary>
              <div className="px-5 pb-5 text-sm text-gray-300 leading-relaxed">{f.a}</div>
            </details>
          ))}
        </div>
      </section>

      <section id="waitlist" className="relative z-10 max-w-3xl mx-auto px-5 md:px-8 py-12 md:py-20 scroll-mt-20">
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          variants={fadeUp}
          className="relative border border-white/10 rounded-2xl p-6 md:p-10 text-center overflow-hidden"
          style={{ background: `linear-gradient(135deg, ${WATER}1a, rgba(96,165,250,0.05), transparent)` }}
        >
          <div
            className="absolute -top-20 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full blur-3xl"
            style={{ background: `${WATER}33` }}
            aria-hidden
          />
          <div className="relative">
            <div className="text-xs uppercase tracking-widest mb-3 text-cyan-300">
              Early access
            </div>
            <h2 className="text-3xl md:text-5xl font-black tracking-tight mb-4">
              Be first to pour.
            </h2>
            <p className="text-gray-300 text-lg mb-8 max-w-md mx-auto">
              One email, 24 hours before the first public stream goes live. No spam, one-click unsubscribe.
            </p>
            {waitState === "done" ? (
              <div
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-green-500/10 border border-green-500/30 text-green-300"
                role="status"
                aria-live="polite"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                You&apos;re on the list. Lock and load.
              </div>
            ) : (
              <form onSubmit={submitWaitlist} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto" noValidate>
                <label htmlFor="wl-email" className="sr-only">
                  Email
                </label>
                <input
                  id="wl-email"
                  type="email"
                  required
                  autoComplete="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setWaitState("idle");
                    setErrMsg("");
                  }}
                  placeholder="you@domain.com"
                  aria-invalid={waitState === "error"}
                  aria-describedby={waitState === "error" ? "wl-err" : undefined}
                  className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder-gray-500 focus:outline-none focus:border-red-400 focus:ring-2 focus:ring-red-400/40 transition"
                />
                <button
                  type="submit"
                  disabled={waitState === "loading"}
                  className="px-6 py-3.5 rounded-xl text-white font-bold shadow-lg transition disabled:opacity-60 hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                  style={{ background: `linear-gradient(90deg, ${WATER}, ${WATER_DEEP})`, boxShadow: `0 15px 30px -15px ${WATER}80` }}
                >
                  {waitState === "loading" ? "Joining…" : "Notify me"}
                </button>
              </form>
            )}
            {waitState === "error" && (
              <p id="wl-err" role="alert" aria-live="assertive" className="text-sm text-red-400 mt-3">
                {errMsg || "Couldn't submit — check your email and try again."}
              </p>
            )}
          </div>
        </motion.div>
      </section>

      <StickyMobileCTA />
      <ShortcutsOverlay />

      <footer className="relative z-10 border-t border-white/5 mt-12">
        <div className="max-w-7xl mx-auto px-5 md:px-8 py-10 grid gap-8 md:grid-cols-[1.2fr_1fr_1fr_1fr] text-sm">
          <div>
            <div className="mb-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/assets/logo43.png"
                alt="Livewager · Dunk"
                width={440}
                height={144}
                style={{ height: 112, width: "auto", objectFit: "contain" }}
              />
            </div>
            <p className="text-gray-400 leading-snug">
              A 20-second skill game. Tilt to pour, match the line. Top scorer on the hour drops the talent, live.
            </p>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-3">Play</div>
            <ul className="space-y-1.5 text-gray-400">
              <li><a href="#games" className="hover:text-white transition">Start a round</a></li>
              <li><a href="#how" className="hover:text-white transition">How it works</a></li>
              <li><a href="#drop" className="hover:text-white transition">The DROP</a></li>
              <li><a href="#leaderboard" className="hover:text-white transition">Leaderboard</a></li>
            </ul>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-3">Company</div>
            <ul className="space-y-1.5 text-gray-400">
              <li><a href="#talent" className="hover:text-white transition">Talent</a></li>
              <li><a href="#reviews" className="hover:text-white transition">Reviews</a></li>
              <li><a href="#faq" className="hover:text-white transition">FAQ</a></li>
              <li>
                <a href="mailto:hello@livewager.io" className="hover:text-white transition">
                  hello@livewager.io
                </a>
              </li>
            </ul>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-3">Play responsibly</div>
            <ul className="space-y-1.5 text-gray-400">
              <li>Set a session cap</li>
              <li>30-sec pause every 20 rounds</li>
              <li>Only your hourly best counts</li>
              <li>
                <a
                  href="https://www.ncpgambling.org/help-treatment/national-helpline-1-800-522-4700/"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="underline hover:text-white transition"
                >
                  Need to talk?
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-5 md:px-8 pb-8 border-t border-white/5 pt-4 flex flex-col md:flex-row items-start md:items-center gap-2 md:gap-4 text-[11px] text-gray-500">
          <span>© 2026 LiveWager · Concept build</span>
          <span className="hidden md:inline text-gray-700">·</span>
          <span>18+. Skill-based contest — not a game of chance.</span>
          <span className="hidden md:inline text-gray-700">·</span>
          <span>Availability limited to jurisdictions where skill-gaming is lawful.</span>
          <span className="hidden md:inline text-gray-700">·</span>
          <span>Consent-based talent performances.</span>
        </div>
      </footer>
    </div>
  );
}
