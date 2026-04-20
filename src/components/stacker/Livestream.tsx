"use client";

/**
 * Livestream placeholder for the /stacker landing page.
 *
 * User-facing goal: give the empty space below the hero a sense of
 * "people are playing this right now" without actually shipping a
 * stream. No network calls, no video element, no hls.js — just a
 * gradient tile dressed up as a video player with fake chat.
 *
 * Why this shape:
 *  - 16:9 gradient fill stands in for the stream canvas. It reads as
 *    "something's playing here" rather than a hard empty slot.
 *  - The chat column sits beside it on desktop (>= md) and rides
 *    over the bottom 40% of the video on mobile, matching how real
 *    mobile stream UIs collapse.
 *  - Messages cycle on a 2.4s timer so the page feels alive even
 *    when the user is reading. The cycle freezes under
 *    prefers-reduced-motion so vestibular users don't see constant
 *    pop-in/pop-out.
 *  - Both the "LIVE" dot and the "demo" pill are always visible.
 *    The dot sells the illusion; the pill keeps us honest about
 *    the fact that this is NOT a real stream yet. Dual-labeling
 *    matches the CONTRIBUTING "demo-banner must survive visual
 *    dressing" rule.
 *
 * What's intentionally not here:
 *  - No <video>, no poster image, no lazy chunk. If we ever wire a
 *    real CDN stream, swap the `<div>` for a <video> behind a
 *    dynamic import so the chat + skeleton stay in the landing
 *    bundle and the HLS worker lazy-loads only on intent.
 *  - No viewer count or bitrate HUD. Those read as "we're faking
 *    it hard" on a demo. The single LIVE dot + demo pill is enough
 *    to plant the idea without over-reaching.
 */

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { Pill } from "@/components/ui/Pill";

type ChatMsg = {
  id: number;
  user: string;
  tone: "cyan" | "amber" | "violet" | "rose" | "emerald";
  body: string;
};

// Seed pool. Each cycle pulls one, so we rotate through a
// representative mix without randomness tracking being visible.
// Kept deliberately mundane — real twitch chat is mundane, and
// manic "POGGERS" type copy reads as placeholder-mush.
const POOL: ChatMsg[] = [
  { id: 1, user: "stax_main", tone: "cyan", body: "clean tower run incoming" },
  { id: 2, user: "queenstacks", tone: "amber", body: "nah the 12th row got me" },
  { id: 3, user: "ftboi", tone: "violet", body: "ranked only cowards" },
  { id: 4, user: "r3m", tone: "rose", body: "someone tip the streamer lmao" },
  { id: 5, user: "atxstax", tone: "emerald", body: "that perfect streak was nuts" },
  { id: 6, user: "lowroll", tone: "cyan", body: "im up 40 LWP tonight" },
  { id: 7, user: "mimic", tone: "amber", body: "go fair-play tier 3 bro" },
  { id: 8, user: "halfdecaf", tone: "violet", body: "seeds are public check fair play" },
  { id: 9, user: "op_five", tone: "rose", body: "tap tap TAP tap 🙏" },
  { id: 10, user: "civic", tone: "emerald", body: "the slider easing tho" },
  { id: 11, user: "dropship", tone: "cyan", body: "wen mobile replay" },
  { id: 12, user: "caligula", tone: "amber", body: "that was a perfect stack??" },
];

// Cycle cadence. 2400ms is slow enough that the user can read each
// message without effort and fast enough that the column doesn't
// feel frozen. Halved if we ever ship a real streamer overlay.
const TICK_MS = 2400;
// Visible chat rows. Any more and the column eats the video; any
// fewer and it reads as a single-message ticker.
const VISIBLE = 5;

function toneClasses(tone: ChatMsg["tone"]): string {
  switch (tone) {
    case "cyan":
      return "text-cyan-300";
    case "amber":
      return "text-amber-300";
    case "violet":
      return "text-violet-300";
    case "rose":
      return "text-rose-300";
    case "emerald":
      return "text-emerald-300";
  }
}

export function Livestream() {
  const reducedMotion = useReducedMotion();
  // Start with the last VISIBLE entries of the pool so the first
  // render isn't a blank column that fills in. Slice from the end
  // so the most "recent" messages are at the bottom (chat grows
  // downward, matches twitch semantics).
  const [feed, setFeed] = useState<ChatMsg[]>(() =>
    POOL.slice(POOL.length - VISIBLE),
  );
  // Monotonic counter so every pushed entry has a unique React key,
  // even if the same pool row is re-picked across many cycles.
  const seqRef = useRef<number>(POOL.length);
  // POLISH-381 — threshold dividing "this row was in the initial
  // paint" from "this row was pushed in mid-session." Initial feed
  // carries POOL ids (1..POOL.length); every subsequent cycle bumps
  // seqRef and mints a strictly-larger id. Newly pushed rows get
  // the .lw-chat-slide entrance; the first 5 skip it so the column
  // doesn't slide-in-all-at-once on page load.
  const initialIdMax = POOL.length;

  useEffect(() => {
    if (reducedMotion) return;
    // Pause cycling when the tab is hidden. Same reasoning as the
    // StackerGame visibilityState gate (POLISH-250): background
    // tabs shouldn't drain CPU animating a card nobody can see.
    let cancelled = false;
    let nextIdx = 0;
    const id = window.setInterval(() => {
      if (cancelled || document.hidden) return;
      const source = POOL[nextIdx % POOL.length];
      nextIdx += 1;
      seqRef.current += 1;
      setFeed((prev) => {
        const next = [...prev.slice(1), { ...source, id: seqRef.current }];
        return next;
      });
    }, TICK_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [reducedMotion]);

  return (
    <section
      aria-label="Stacker livestream (demo placeholder)"
      className="lw-section relative z-10 max-w-7xl mx-auto px-5 md:px-8 py-8 md:py-12"
    >
      {/* POLISH-379 — pin the header to Shape 1 from CONTRIBUTING
          (POLISH-343): flat text eyebrow + inline <Pill size="xs"
          mono>demo</Pill> as a sibling span. Originally shipped the
          Pill top-right via justify-between which was Pattern B
          (tile-right, used inside cards like /wallet Mint tile) and
          drifted from how /send and /withdraw render their section
          headers. Now matches the money-flow shape verbatim — one
          placement pattern for section-level eyebrows across
          demo-labeled surfaces. */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] uppercase tracking-widest text-rose-300">
            Live now · Stacker
          </span>
          <Pill status="demo" size="xs" mono title="No real stream — placeholder">
            demo
          </Pill>
        </div>
        <h2 className="text-2xl md:text-3xl font-black tracking-tight">
          Watch a round in progress
        </h2>
      </div>

      <div className="grid gap-4 md:grid-cols-[1.6fr_1fr]">
        {/* -------- video placeholder -------- */}
        <div className="relative aspect-video rounded-2xl overflow-hidden border border-white/10 bg-black">
          {/* Gradient stand-in for the stream canvas. Radial glows
              echo the AmbientBackdrop on the rest of the page so
              this block doesn't feel stitched on. */}
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(600px 400px at 30% 20%, rgba(34,211,238,0.25), transparent 60%), radial-gradient(500px 400px at 80% 80%, rgba(249,115,22,0.22), transparent 60%), linear-gradient(180deg, rgba(15,23,42,0.9), rgba(2,6,23,1))",
            }}
          />
          {/* Faux scanline texture — very subtle, mostly sells
              "this is a video surface" on retina displays. */}
          <div
            aria-hidden
            className="absolute inset-0 opacity-[0.06] mix-blend-overlay"
            style={{
              backgroundImage:
                "repeating-linear-gradient(0deg, rgba(255,255,255,0.4) 0 1px, transparent 1px 3px)",
            }}
          />

          {/* Top-left LIVE dot. Uses animate-pulse tied to the
              `reducedMotion` gate so the same signal still reads
              as "active" without the pulse for motion-sensitive
              users (green dot alone = still). */}
          <div className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full border border-rose-300/40 bg-black/60 backdrop-blur px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-rose-100">
            <span
              className={`h-1.5 w-1.5 rounded-full bg-rose-400 ${reducedMotion ? "" : "animate-pulse"}`}
              aria-hidden
            />
            Live
          </div>

          {/* Top-right viewer/stream label. Plain text, no counter
              spin — over-the-top HUDs read as placeholder. */}
          <div className="absolute top-3 right-3 rounded-full border border-white/10 bg-black/60 backdrop-blur px-2.5 py-1 text-[10px] font-mono uppercase tracking-widest text-gray-300">
stacker · livewager
          </div>

          {/* Center play glyph — the only "this is a video" cue.
              Not clickable, so no onClick + focus ring.

              POLISH-380 — ramp the size through three breakpoints.
              On ultra-narrow (280px effective viewport → ~240px
              video wide → 135px tall at 16:9), the original
              h-16/w-16 ate ~47% of the video height and crowded
              the chat overlay below. h-12 default (48px) sits at
              ~36% height on 240px and scales up to h-16 at sm,
              h-20 at md. Inner svg tracks the same ladder. */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="h-12 w-12 sm:h-16 sm:w-16 md:h-20 md:w-20 rounded-full bg-white/10 border border-white/20 backdrop-blur flex items-center justify-center">
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                className="h-5 w-5 sm:h-7 sm:w-7 md:h-8 md:w-8 text-white/80 translate-x-[2px]"
                aria-hidden
              >
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>

          {/* Mobile-only chat overlay. Below the md breakpoint the
              chat column hides and we float a short 3-row feed
              over the bottom of the video, matching how mobile
              stream UIs collapse side panels. Pointer-events-none
              so the placeholder doesn't steal taps from the eventual
              real video.

              POLISH-378 — aria-hidden the entire overlay. These are
              decorative fake messages that cycle on a timer with no
              meaning; announcing them (even once) would plant
              nonsense in an SR user's model of the page. Paired
              with the desktop chat getting the same treatment
              below, so neither viewport exposes the churn.

              POLISH-380 — tighten scrim padding on ultra-narrow
              viewports. Original pt-10 (40px) ate more than half
              the video at 280px (video is ~135px tall there).
              pt-6 (24px) default + pt-10 at sm keeps the 3-row
              feed legible without crowding the play glyph above.
              Also trim to 2 rows below sm so the feed never
              exceeds ~40% of the video's vertical budget on the
              tightest breakpoint. */}
          <div
            aria-hidden="true"
            className="md:hidden absolute inset-x-0 bottom-0 p-3 pt-6 sm:pt-10 pointer-events-none bg-gradient-to-t from-black/80 via-black/40 to-transparent"
          >
            {/* Hide the oldest row below sm so ultra-narrow keeps
                just 2 messages visible. Tailwind's first:hidden
                on .sm:inline hides the first <li> until sm+. */}
            <ul className="space-y-1 text-[12px] leading-snug [&>li:first-child]:hidden sm:[&>li:first-child]:list-item">
              {feed.slice(-3).map((m) => (
                <li
                  key={m.id}
                  className={`truncate ${m.id > initialIdMax ? "lw-chat-slide" : ""}`}
                >
                  <span className={`font-semibold ${toneClasses(m.tone)}`}>
                    {m.user}
                  </span>
                  <span className="text-gray-200"> {m.body}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* -------- chat panel (desktop) --------
            POLISH-378 — the <aside> stays as a complementary
            landmark so an SR user scanning landmarks sees "Demo
            stream chat placeholder" and knows what occupies the
            right column. But the *content* (the cycling fake
            message rows) is aria-hidden because it's placeholder
            churn — real live-region announcements on every tick
            would be hostile. aria-live was already "off" to
            silence the polite-region announcement path; the
            aria-hidden on the inner <ul> makes the rows invisible
            to AT walking the subtree too, so VoiceOver/NVDA
            rotor doesn't show 5 ghost list items.

            Landmark label rewritten from "Stream chat" to spell
            out the placeholder-ness — matches the dual-labeling
            pattern we use elsewhere (POLISH-99 demo banner
            audit). */}
        <aside
          aria-label="Demo stream chat placeholder"
          className="hidden md:flex flex-col rounded-2xl border border-white/10 bg-white/[0.02] p-4"
        >
          <div
            className="flex items-center justify-between pb-3 mb-3 border-b border-white/5"
            aria-hidden="true"
          >
            <div className="text-[10px] uppercase tracking-widest text-gray-400">
              Chat
            </div>
            <div className="text-[10px] uppercase tracking-widest text-gray-500 font-mono">
              demo · static
            </div>
          </div>
          <ul
            aria-hidden="true"
            className="flex-1 min-h-0 space-y-2 text-[13px] leading-snug overflow-hidden"
          >
            {feed.map((m) => (
              <li
                key={m.id}
                className={`flex gap-2 ${m.id > initialIdMax ? "lw-chat-slide" : ""}`}
              >
                <span
                  className={`shrink-0 font-semibold ${toneClasses(m.tone)}`}
                >
                  {m.user}
                </span>
                <span className="text-gray-200 break-words min-w-0">
                  {m.body}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-3 pt-3 border-t border-white/5">
            <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] text-gray-500">
              Chat input opens once the real stream ships.
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
