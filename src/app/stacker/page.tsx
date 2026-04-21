"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import Image from "next/image";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { StackerWager, PAYOUT_MULTIPLIER } from "@/components/stacker/StackerWager";
import { Livestream } from "@/components/stacker/Livestream";
import { HeroTower } from "@/components/stacker/HeroTower";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { ROUTES } from "@/lib/routes";
import { getLedgerActor, loadActiveIdentity } from "@/lib/ic/agent";
import { getScoresActor, GAME_TAG_STACKER } from "@/lib/ic/scores";
import { useToast } from "@/components/shared/Toast";

/**
 * Cost to start a Stacker round — burned on the ICRC-1 ledger before
 * the round begins. The canister refuses the burn if the caller's
 * balance is short, so the gate is server-enforced, not client-hoped.
 *
 * 1 LWP = 10^8 base units at 8 decimals.
 */
const ENTRY_FEE_BASE_UNITS = 100_000_000n; // 1 LWP
const ENTRY_FEE_LABEL = "1 LWP";

/**
 * Entry-fee progress states driving the overlay that covers the
 * game canvas during the burn round-trip. Linear forward-only flow:
 *
 *   idle     → no call in flight, overlay hidden
 *   auth     → checking the active identity (<50ms, rarely visible)
 *   connect  → opening the HTTP agent + fetching the replica root key
 *   charge   → burn RPC in flight on the canister
 *   confirm  → RPC returned Ok, settling state + broadcasting event
 *   done     → flashes a "Ready" frame before the overlay fades out
 *   error    → sticky until the overlay auto-dismisses (~1.5s)
 *
 * Each state has matching copy in STEP_COPY below.
 */
type ChargeStep =
  | "idle"
  | "auth"
  | "connect"
  | "charge"
  | "confirm"
  | "done"
  | "error";

const STEP_COPY: Record<
  ChargeStep,
  { title: string; sub: string; pct: number; tone: "cyan" | "green" | "red" | "amber" }
> = {
  idle: { title: "", sub: "", pct: 0, tone: "cyan" },
  auth: {
    title: "Checking key…",
    sub: "Looking up your active identity in the roster.",
    pct: 10,
    tone: "cyan",
  },
  connect: {
    title: "Connecting to the replica…",
    sub: "Opening agent + fetching root key.",
    pct: 30,
    tone: "cyan",
  },
  charge: {
    title: `Charging ${ENTRY_FEE_LABEL}…`,
    sub: "Burning your entry fee on the ICRC-1 ledger.",
    pct: 70,
    tone: "amber",
  },
  confirm: {
    title: "Burn confirmed.",
    sub: "Settling state + broadcasting to other tabs.",
    pct: 90,
    tone: "green",
  },
  done: {
    title: "Ready.",
    sub: "Round starting.",
    pct: 100,
    tone: "green",
  },
  error: {
    title: "Entry charge failed.",
    sub: "See the toast for detail. Tap again to retry.",
    pct: 100,
    tone: "red",
  },
};

/**
 * Parse a seed query param in the forms: "0xABCD", "ABCD" (hex),
 * or a decimal int. Any malformed value falls through to null so
 * the game uses its own randomSeed(). Clamps to 32 bits to match
 * SeededRng's mulberry32 input.
 */
function parseSeedParam(raw: string | null): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // 0x-prefixed or bare hex — 1..8 hex digits.
  const hex = trimmed.startsWith("0x") || trimmed.startsWith("0X")
    ? trimmed.slice(2)
    : /^[0-9a-fA-F]{1,8}$/.test(trimmed)
      ? trimmed
      : null;
  if (hex !== null && /^[0-9a-fA-F]{1,8}$/.test(hex)) {
    const n = Number.parseInt(hex, 16);
    return Number.isFinite(n) ? n >>> 0 : null;
  }
  // Plain decimal — accept positive 32-bit values.
  const dec = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(dec) || dec < 0) return null;
  return dec >>> 0;
}

const StackerGame = dynamic(() => import("@/components/stacker/StackerGame"), {
  ssr: false,
  loading: () => (
    // SUPER-25 — was a flat animate-pulse rectangle. Now a faded
    // silhouette of the game board: radial-glow background + grid
    // dot pattern + soft 'preparing' eyebrow. Gives users a concrete
    // preview of the layout during the ~200ms dynamic-import
    // window instead of a mystery gray slab. Single-element
    // animate-pulse on the outer card is fine here — no children
    // carry their own pulse (POLISH-313 rule only applies when both
    // layers animate).
    <div
      className="relative mx-auto w-full max-w-[560px] aspect-[3/5] rounded-2xl border border-white/10 overflow-hidden animate-pulse"
      style={{
        background:
          "radial-gradient(600px 500px at 50% -10%, rgba(34,211,238,0.12), transparent 60%), linear-gradient(180deg,#071a2e,#020b18)",
      }}
      aria-label="Preparing the board"
      role="status"
    >
      {/* Grid-dot pattern matches the actual board's 7×15 layout. */}
      <div
        aria-hidden
        className="absolute inset-4"
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.08) 0.8px, transparent 1px)",
          backgroundSize: "calc(100% / 7) calc(100% / 15)",
          backgroundPosition: "center",
        }}
      />
      <div className="absolute top-3 left-3 text-[10px] uppercase tracking-widest text-cyan-300/60 font-mono">
        Preparing · Stacker
      </div>
    </div>
  ),
});

type Phase = "idle" | "playing" | "won" | "over";

export default function StackerPage() {
  // useSearchParams needs a Suspense boundary in Next 15 App Router.
  return (
    <Suspense fallback={null}>
      <StackerPageInner />
    </Suspense>
  );
}

function StackerPageInner() {
  const searchParams = useSearchParams();
  // Consume the ?seed= param once at mount. Subsequent client nav
  // that changes this param won't retroactively rewrite the current
  // round — that'd be surprising. If the user wants a fresh replay
  // they can change the URL and refresh.
  const initialSeed = useMemo(
    () => parseSeedParam(searchParams.get("seed")),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [stake, setStake] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [roundKey, setRoundKey] = useState(0);
  const [entryBusy, setEntryBusy] = useState(false);
  const [chargeStep, setChargeStep] = useState<ChargeStep>("idle");
  // Live mode reference. The wager component owns the persisted
  // value; we mirror it into a ref so chargeEntryFee (called from
  // every tap inside the game) can read the latest without becoming
  // a dependency of every memo'd handler. Updated by handleStart and
  // also pre-warmed on mount via the localStorage value the wager
  // component restores.
  const modeRef = useRef<"practice" | "real">("practice");
  const wagerDisabled = phase === "playing" || entryBusy;
  const toast = useToast();

  /**
   * Burn ENTRY_FEE_BASE_UNITS from the active key's balance as the
   * on-chain entry fee for one round. Returns true on confirmed
   * burn, false on any failure (and fires a toast explaining what
   * went wrong).
   *
   * This is the single authoritative place the fee is charged. Both
   * the wager component's Start button AND every tap-to-start /
   * press-R-to-restart inside the game funnel through here via
   * StackerGame's `beforeStart` prop — see handleStart (wager
   * button path) and the beforeStart={chargeEntryFee} prop on the
   * <StackerGame> below. No duplicate burns.
   */
  const chargeEntryFee = useCallback(async (): Promise<boolean> => {
    // Read the most recent mode the user picked. The wager
    // component persists this to localStorage on every toggle so
    // we can pick up the latest even if the user changed mode
    // without re-clicking Start.
    let liveMode: "practice" | "real" = modeRef.current;
    try {
      const raw = window.localStorage.getItem("livewager-pref:stackerMode");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed === "real" || parsed === "ranked") liveMode = "real";
        else if (parsed === "practice" || parsed === "unranked") {
          liveMode = "practice";
        }
      }
    } catch {
      /* fall through to modeRef */
    }
    modeRef.current = liveMode;

    // Practice mode is a pure local round — no ledger call, no
    // identity required. Flash a quick "starting practice" frame so
    // the tap still feels like it did something, then go.
    if (liveMode === "practice") {
      setChargeStep("done");
      window.setTimeout(() => setChargeStep("idle"), 280);
      return true;
    }

    // 1/ auth — check the roster has an active identity. Fast
    // (synchronous localStorage read); the step still flashes so a
    // signed-out user's error path doesn't jump-cut to the toast.
    setChargeStep("auth");
    const identity = loadActiveIdentity();
    if (!identity) {
      setChargeStep("error");
      toast.push({
        kind: "error",
        title: "Sign in to play Real mode",
        description:
          "Real mode burns 1 LWP per round. Switch to Practice for a free round, or sign in via /icrc.",
      });
      // Let the error frame show for ~1.4s, then clear.
      window.setTimeout(() => setChargeStep("idle"), 1400);
      return false;
    }
    setEntryBusy(true);
    try {
      // 2/ connect — getLedgerActor builds the HTTP agent and
      // fetches the replica root key on cold start. On warm calls
      // this resolves instantly from the cached agent.
      setChargeStep("connect");
      const actor = await getLedgerActor(identity);

      // 3/ charge — the actual update call. This is where the ~200-
      // 500ms replica round-trip lives; the progress bar sits at
      // 70% through the whole wait.
      setChargeStep("charge");
      const res = await actor.burn({
        from_subaccount: [],
        amount: ENTRY_FEE_BASE_UNITS,
        memo: [],
        created_at_time: [],
      });
      if ("Err" in res) {
        setChargeStep("error");
        const variant = Object.keys(res.Err)[0];
        if (variant === "InsufficientFunds") {
          toast.push({
            kind: "error",
            title: `Need ${ENTRY_FEE_LABEL} to play`,
            description:
              "Your balance is short. Grab some from the faucet on /icrc first.",
          });
        } else {
          toast.push({
            kind: "error",
            title: "Ledger rejected the entry fee",
            description: `Burn returned ${variant}; the round was not started.`,
          });
        }
        window.setTimeout(() => setChargeStep("idle"), 1400);
        return false;
      }
      // 4/ confirm — ledger said Ok. Fire the cross-tab repaint
      // event and flash the "Burn confirmed" frame briefly so the
      // user feels the transition rather than it jump-cutting to
      // the round.
      setChargeStep("confirm");
      window.dispatchEvent(new CustomEvent("lw-ledger-mutated"));
      // Brief pause so the "confirmed" frame registers visually.
      await new Promise((r) => window.setTimeout(r, 280));

      // 5/ done — final 100% frame before the overlay fades out.
      setChargeStep("done");
      window.setTimeout(() => setChargeStep("idle"), 500);
      return true;
    } catch (e) {
      setChargeStep("error");
      toast.push({
        kind: "error",
        title: "Couldn't reach the ledger",
        description: (e as Error).message,
      });
      window.setTimeout(() => setChargeStep("idle"), 1400);
      return false;
    } finally {
      setEntryBusy(false);
    }
  }, [toast]);

  /**
   * Wager-button path: the user picked a mode and hit Start. We
   * stash the mode in modeRef (so the game's beforeStart hook reads
   * the latest), reset the stake to zero (no per-round chip in this
   * UI anymore), and remount the game. The actual burn (or skip,
   * for practice) happens on the FIRST tap inside the game, through
   * beforeStart → chargeEntryFee.
   */
  const handleStart = useCallback((mode: "practice" | "real") => {
    modeRef.current = mode;
    setStake(0);
    setRoundKey((k) => k + 1);
    setPhase("idle");
  }, []);

  /**
   * On round-end, post the score to the game_scores canister — but
   * ONLY for Real-mode rounds. Practice rounds are local play; sending
   * them to the public leaderboard would dilute the rankings and let
   * a free-tap user spam the top.
   *
   * Submission failures are silent: any rate-limit or network blip
   * just means the round doesn't get recorded; the player's local
   * best is still tracked by the game itself.
   *
   * Anonymous callers (no roster identity) skip submission too — the
   * canister rejects them anyway, no point round-tripping. A friendly
   * toast nudges them toward /icrc.
   */
  const handleRoundEnd = useCallback(
    async (info: { score: number; streak: number; outcome: "won" | "over" }) => {
      if (modeRef.current !== "real") return;
      if (info.score === 0) return; // canister rejects ScoreZero
      const identity = loadActiveIdentity();
      if (!identity) return;
      try {
        const actor = await getScoresActor(identity);
        const res = await actor.submit_score({
          game: GAME_TAG_STACKER,
          score: BigInt(Math.max(0, Math.floor(info.score))),
          streak: info.streak,
        });
        if ("Ok" in res) {
          const ok = res.Ok;
          // Compose a friendly success toast that calls out the
          // rank if the player landed on the today-board.
          const todayRank = ok.today_rank[0];
          const allTimeRank = ok.all_time_rank[0];
          const parts: string[] = [];
          if (ok.new_personal_best) parts.push("personal best");
          if (typeof todayRank === "number") parts.push(`#${todayRank} today`);
          if (typeof allTimeRank === "number" && allTimeRank <= 10) {
            parts.push(`#${allTimeRank} all time`);
          }
          toast.push({
            kind: parts.length > 0 ? "success" : "info",
            title: `Score posted · ${info.score} pts`,
            description:
              parts.length > 0 ? parts.join(" · ") : "On the leaderboard.",
          });
        } else {
          // RateLimited / GameTagInvalid / etc. — noisy but useful.
          const variant = Object.keys(res.Err)[0];
          toast.push({
            kind: "warning",
            title: "Score not posted",
            description: `Leaderboard returned ${variant}.`,
          });
        }
      } catch (e) {
        // Silent: leaderboard is best-effort. Local best is fine.
        // eslint-disable-next-line no-console
        console.warn("[stacker] score submit failed", e);
      }
    },
    [toast],
  );

  // Scope the scroll-snap behavior to this page only. <html> is the
  // scroll container, so we add/remove a class there. No regression
  // risk because the CSS hides behind a mobile media query.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("lw-snap-page");
    return () => root.classList.remove("lw-snap-page");
  }, []);

  return (
    <div className="min-h-screen bg-background text-white relative overflow-x-hidden">
      <AmbientBackdrop />

      {/* Sticky hero nav: was `relative z-20` so it scrolled off on a
          long landing, which left Deposit + Play CTAs only reachable
          via the in-page scroll-back. Every other route sits under
          AppHeader (sticky top-0 z-40) so /stacker felt janky in
          comparison — a user 3 sections deep who wanted to deposit
          had to scroll all the way back up or find the WagerPrimer
          call-out. sticky top-0 + backdrop-blur matches AppHeader's
          POLISH-368 treatment (safe-area-inset-top on the <nav>
          itself so notched viewports keep the backdrop stretching
          to the hardware edge). */}
      <nav
        aria-label="Site"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
        className="sticky top-0 z-30 border-b border-white/10 bg-background/85 backdrop-blur-md"
      >
        <ScrollProgress />

        <div className="max-w-7xl mx-auto px-5 md:px-8 py-3 md:py-4 flex items-center justify-between gap-3">
          <Link
            href={ROUTES.stacker}
            className="inline-flex items-center rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
            aria-label="Livewager Stacker home"
          >
            <Image
              src="/assets/logo43.png"
              alt="Livewager · Stacker"
              width={440}
              height={144}
              priority
              sizes="(max-width: 768px) 220px, 360px"
              style={{ height: 56, width: "auto", objectFit: "contain" }}
            />
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href={ROUTES.play}
              className="hidden sm:inline-flex rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <Button variant="outline" size="sm" tabIndex={-1}>
                ← All games
              </Button>
            </Link>
            <Link
              href={ROUTES.deposit}
              className="inline-flex rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <Button tone="orange" size="sm" tabIndex={-1}>
                Deposit now
              </Button>
            </Link>
            <a
              href="#play"
              className="inline-flex rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <Button tone="cyan" size="sm" tabIndex={-1}>
                Play
              </Button>
            </a>
          </div>
        </div>
      </nav>

      {/* -------------- HERO -------------- */}
      <Hero />

      {/* -------------- LIVESTREAM PLACEHOLDER --------------
          Social proof of play: a 16:9 gradient tile dressed up as
          a video player with fake cycling chat beside it. Not a
          real stream — the "demo" pill and "Chat input opens once
          the real stream ships" copy keep that honest. */}
      <Livestream />

      {/* -------------- WHY IT'S HARD -------------- */}
      <DifficultyLadder />

      {/* -------------- HOW IT WORKS -------------- */}
      <HowItWorks />

      {/* -------------- WAGER PRIMER -------------- */}
      <WagerPrimer />

      {/* Fair play explainer lives on its own /fair-play route, linked
          from the WagerPrimer's demo-pill row above (STACKER-24). The
          /stacker page overrides AppHeader with its own custom hero
          nav so the global header link isn't reachable from here —
          the inline contextual link inside WagerPrimer is the only
          path forward to fair-play details for users who land on
          /stacker. Previously inlined here; moved out so the /stacker
          landing stays focused on the game itself. */}

      {/* -------------- PLAY -------------- */}
      <section
        id="play"
        className="lw-section relative z-10 max-w-7xl mx-auto px-5 md:px-8 pt-8 pb-16"
      >
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-cyan-300 mb-2 flex items-center gap-2">
              <span>Your round</span>
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-400/[0.08] px-1.5 py-0.5 text-[9px] font-semibold text-emerald-200">
                <span aria-hidden className="h-1 w-1 rounded-full bg-emerald-300 animate-pulse" />
                live demo
              </span>
            </div>
            <h2 className="text-4xl md:text-5xl font-black tracking-tight leading-[0.95]">
              Lock in. Stack{" "}
              <span
                className="bg-clip-text text-transparent"
                style={{
                  backgroundImage:
                    "linear-gradient(90deg,#22d3ee,#fdba74 50%,#facc15)",
                }}
              >
                clean
              </span>
              .
            </h2>
            <p className="text-sm md:text-base text-gray-400 mt-2 max-w-lg">
              Pick a chip, then tap to start. Space or Enter works too. Low on
              LWP?{" "}
              <Link
                href={ROUTES.deposit}
                className="text-orange-300 underline underline-offset-2 hover:text-orange-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300/60 rounded-sm"
              >
                Top up now →
              </Link>
            </p>
          </div>
          <Link
            href={ROUTES.deposit}
            className="hidden md:block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <Button tone="orange" size="lg" tabIndex={-1}>
              Deposit LWP
            </Button>
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-[minmax(0,560px)_1fr] items-start">
          {/* Game board with a pulsing bloom behind it on idle, so
              the eye tracks to it. Bloom fades the moment the round
              begins so it doesn't fight the gameplay canvas. */}
          <div className="relative">
            <div
              aria-hidden
              className={`absolute -inset-6 rounded-[2rem] pointer-events-none transition-opacity duration-500 ${
                phase === "playing" ? "opacity-0" : "opacity-100"
              }`}
              style={{
                background:
                  "radial-gradient(500px 420px at 50% 50%, rgba(34,211,238,0.16), rgba(249,115,22,0.08) 55%, transparent 75%)",
                filter: "blur(6px)",
              }}
            />
            <StackerGame
              key={roundKey}
              stake={stake}
              winMultiplier={PAYOUT_MULTIPLIER.win}
              // Seed replay: ?seed=0x... on the very first mounted
              // round only. Subsequent rounds (roundKey > 0) fall back
              // to a fresh random seed so the user doesn't get locked
              // into the same level forever.
              initialSeed={roundKey === 0 ? initialSeed : null}
              onPhaseChange={(p) => setPhase(p)}
              // Every round-start (tap-to-start, press-space, press-R-
              // to-restart, wager-button path) is gated on this burn.
              // See chargeEntryFee for the exact contract.
              beforeStart={chargeEntryFee}
              onRoundEnd={handleRoundEnd}
            />
            <ChargingOverlay step={chargeStep} />
          </div>

          <div className="space-y-4">
            <StackerWager
              disabled={wagerDisabled}
              onStart={handleStart}
            />
            {/* Entry-fee disclosure. Surfaced here rather than in
                the wager card so the copy can call out the real on-
                chain effect (burn) without the wager component needing
                to know about the ledger. */}
            <div className="rounded-xl border border-yellow-300/30 bg-yellow-300/[0.04] px-4 py-3 text-[12px] text-yellow-100 leading-snug">
              <span className="font-mono text-yellow-300 font-bold">
                {ENTRY_FEE_LABEL}
              </span>{" "}
              is burned on the ICRC-1 ledger when the round starts. No
              payouts yet — scoring only. Out of LWP? Claim from the{" "}
              <Link
                href={ROUTES.icrc}
                className="underline underline-offset-2 text-yellow-200 hover:text-yellow-50"
              >
                faucet
              </Link>
              .
            </div>

            {/* Compact livestream — watch-while-playing widget that
                now sits immediately under the wager in the right
                column. Removed the three Tip cards (Controls /
                Scoring / Prize) that used to sit between them so
                the stream rides up next to the game where the
                empty space was.

                Rules the Tip cards covered still live on /stacker
                farther down the page (HowItWorks section + the
                Prize-mode strip under the wager card), so nothing
                was lost — just decongested. */}
            <Livestream compact />
          </div>
        </div>

        {/* Sticky mobile-only deposit rail — only after the fold.
            Puts a fat orange CTA within thumb reach the moment the
            user has scrolled to the actual play area. */}
        <StickyDepositRail />
      </section>
    </div>
  );
}

// =============================================================
// Background
// =============================================================

function AmbientBackdrop() {
  return (
    <div
      aria-hidden
      className="absolute inset-0 z-0 pointer-events-none"
      style={{
        background:
          "radial-gradient(1200px 700px at 10% -10%, rgba(34,211,238,0.18), transparent 60%), radial-gradient(900px 600px at 110% 10%, rgba(249,115,22,0.14), transparent 55%), radial-gradient(1000px 700px at 50% 110%, rgba(139,92,246,0.12), transparent 60%)",
      }}
    />
  );
}

// =============================================================
// Hero
// =============================================================

function Hero() {
  return (
    <section className="lw-section relative z-10 max-w-7xl mx-auto px-5 md:px-8 pt-4 pb-12 md:pt-10 md:pb-20">
      <div className="grid gap-8 md:grid-cols-[1.15fr_1fr] items-center">
        <div>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="flex items-center gap-2 mb-4 flex-wrap"
          >
            <Pill status="demo">Arcade · demo</Pill>
            <span className="text-[10px] uppercase tracking-widest text-gray-500">
              Stacker · Livewager
            </span>
            <LivePulse />
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.05 }}
            className="text-5xl md:text-7xl font-black tracking-tight leading-[0.95] mb-4"
          >
            Stack to the{" "}
            <span className="relative inline-block">
              {/* Pulsing glow behind the gradient word. Scoped to
                  the word itself so the rest of the h1 stays static.
                  Respects reduced-motion via the global CSS clamp in
                  style.css which drops transition-duration to 0.001ms
                  — the framer-motion animate prop also defers to OS
                  preference. */}
              <motion.span
                aria-hidden
                className="absolute inset-0 blur-xl pointer-events-none"
                style={{
                  background:
                    "linear-gradient(90deg,rgba(34,211,238,0.55),rgba(253,186,116,0.55) 50%,rgba(250,204,21,0.55))",
                  borderRadius: 12,
                }}
                initial={{ opacity: 0.35, scale: 0.96 }}
                animate={{ opacity: [0.35, 0.7, 0.35], scale: [0.96, 1.04, 0.96] }}
                transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
              />
              <span
                className="relative bg-clip-text text-transparent"
                style={{
                  backgroundImage:
                    "linear-gradient(90deg,#22d3ee,#fdba74 50%,#facc15)",
                }}
              >
                top.
              </span>
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.12 }}
            className="text-gray-300 text-base md:text-lg max-w-lg leading-snug mb-6"
          >
            Fifteen rows. A sliding block. One tap to lock it. Miss the window
            and the stack narrows — hit zero and it collapses. The top floor
            pays{" "}
            <span className="text-yellow-300 font-semibold">
              {PAYOUT_MULTIPLIER.win}×
            </span>{" "}
            your stake.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.18 }}
            className="flex flex-wrap items-center gap-3"
          >
            <a
              href="#play"
              className="inline-flex rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <Button tone="cyan" size="lg" tabIndex={-1}>
                Play now
              </Button>
            </a>
            <Link
              href={ROUTES.deposit}
              className="inline-flex rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <Button tone="orange" size="lg" tabIndex={-1}>
                Deposit LWP
              </Button>
            </Link>
            <a
              href="#how"
              className="group inline-flex rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <Button
                variant="outline"
                size="lg"
                tabIndex={-1}
                trailing={
                  /* ENHANCE-04 — tertiary CTA's behavior (scroll to
                     "Three rules" section) wasn't obvious from the
                     label alone; the chevron signals in-page jump
                     vs. route navigation. Nudges 2px on hover to
                     reinforce the anchor affordance, matching the
                     /play "Stacker →" arrow pattern from SUPER-14. */
                  <svg
                    aria-hidden
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="h-4 w-4 opacity-70 transition-transform group-hover:translate-y-[2px]"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 3a1 1 0 0 1 1 1v9.586l3.293-3.293a1 1 0 0 1 1.414 1.414l-5 5a1 1 0 0 1-1.414 0l-5-5a1 1 0 0 1 1.414-1.414L9 13.586V4a1 1 0 0 1 1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                }
              >
                How it works
              </Button>
            </a>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.35 }}
            // Mobile: horizontal scroll with snap + chrome-free scrollbar.
            // Desktop (sm+): falls back to the original flex-wrap so the
            // stat chips never collide with the hero copy (POLISH-223).
            className="mt-8 flex items-center gap-x-6 gap-y-2 text-[11px] text-gray-500 overflow-x-auto snap-x snap-mandatory no-scrollbar -mx-5 px-5 sm:mx-0 sm:px-0 sm:flex-wrap sm:overflow-visible sm:snap-none"
          >
            <StatChip label="Grid" value="7 × 15" />
            <StatChip label="Round" value="~30s" />
            <StatChip label="Perfect bonus" value="15 × streak" />
            <StatChip label="Prize mode" value={`${PAYOUT_MULTIPLIER.win}× stake`} />
          </motion.div>
        </div>

        {/* /stacker hero: portrait 3/5 aspect, max 360px wide, centered
            in its grid cell. Matches the inline sizing HeroTower had
            before the extract. */}
        <div className="relative mx-auto w-full max-w-[360px] aspect-[3/5]">
          <HeroTower />
        </div>
      </div>

      <WinnersMarquee />
    </section>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-2 shrink-0 snap-start rounded-full border border-white/10 bg-white/[0.03] pl-2 pr-2.5 py-1">
      <span aria-hidden className="h-1 w-1 rounded-full bg-cyan-300/60" />
      <span className="text-[10px] uppercase tracking-widest text-gray-500">{label}</span>
      <span className="font-mono text-xs text-white tabular-nums">{value}</span>
    </span>
  );
}

// =============================================================
// Live pulse — "N playing now" chip in the badge row
// =============================================================

/**
 * Small live-ish pulse that sits next to the hero's eyebrow row.
 * Deterministic per-minute: the "playing now" count comes from a
 * mulberry32 hash of the current minute so every visitor in the
 * same minute sees the same number (the social-proof trick). Dot
 * pulses via animate-pulse, gated by prefers-reduced-motion via
 * the framer-motion hook.
 */
function LivePulse() {
  const reduced = useReducedMotion();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    // Refresh every 30s so the count drifts as the user reads.
    const id = window.setInterval(() => setTick((t) => t + 1), 30_000);
    return () => window.clearInterval(id);
    // tick unused — interval just re-runs the closure to bump state
  }, []);
  const n = useMemo(() => {
    const m = Math.floor(Date.now() / 60_000);
    let h = (m ^ 0x9e3779b9) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 2246822507) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
    h ^= h >>> 16;
    // 180..420 playing now, stable per minute.
    return 180 + (h % 240);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-400/[0.08] px-2 py-0.5 text-[10px] uppercase tracking-widest font-semibold text-emerald-200"
      role="status"
      aria-live="off"
      title="Live players (demo)"
    >
      <span
        aria-hidden
        className={`h-1.5 w-1.5 rounded-full bg-emerald-300 ${reduced ? "" : "animate-pulse"}`}
      />
      <span className="font-mono tabular-nums">{n}</span>
      <span className="text-emerald-300/80">playing now</span>
    </span>
  );
}

// =============================================================
// Scroll progress — 2px gradient bar pinned to the sticky nav top
// =============================================================

/**
 * Thin cyan→orange→yellow progress bar that grows across the top
 * of the sticky hero nav as the user scrolls the page. Fills 0→1
 * over the full scrollable range. Passive scroll listener + rAF
 * throttling so the bar can't drop frames on low-end mobile. Uses
 * transform: scaleX so the browser composites on the GPU and
 * avoids layout thrash.
 */
function ScrollProgress() {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    let rafId = 0;
    const tick = () => {
      const max =
        (document.documentElement.scrollHeight || 0) - window.innerHeight;
      const y = window.scrollY;
      setPct(max > 0 ? Math.min(1, Math.max(0, y / max)) : 0);
      rafId = 0;
    };
    const onScroll = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(tick);
    };
    tick();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, []);
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-white/5 overflow-hidden"
      style={{ top: "env(safe-area-inset-top, 0px)" }}
    >
      <div
        className="h-full origin-left"
        style={{
          background:
            "linear-gradient(90deg,#22d3ee,#fdba74 55%,#facc15)",
          transform: `scaleX(${pct.toFixed(4)})`,
        }}
      />
    </div>
  );
}

// =============================================================
// Winners marquee — scrolling ticker of recent fake wins
// =============================================================

type MarqueeEntry = { handle: string; amount: number; tier: "big" | "mid" | "small" };
const MARQUEE_POOL: MarqueeEntry[] = [
  { handle: "topfloor", amount: 300, tier: "big" },
  { handle: "queenstacks", amount: 75, tier: "mid" },
  { handle: "basedhunter", amount: 300, tier: "big" },
  { handle: "r3m", amount: 15, tier: "small" },
  { handle: "cosmic", amount: 75, tier: "mid" },
  { handle: "mimic", amount: 15, tier: "small" },
  { handle: "elev8", amount: 300, tier: "big" },
  { handle: "ftboi", amount: 75, tier: "mid" },
  { handle: "ricochet", amount: 300, tier: "big" },
  { handle: "civic", amount: 15, tier: "small" },
  { handle: "atxstax", amount: 75, tier: "mid" },
  { handle: "dropship", amount: 15, tier: "small" },
];

/**
 * Auto-scrolling winners ticker below the hero. Renders two copies
 * of the pool end-to-end and translates the container by -50% over
 * a long duration so the loop seams are invisible (the half-offset
 * lines up with the duplicate starting position). Pauses on hover
 * and when prefers-reduced-motion is set; reduced users get a
 * static "recent wins" chip strip instead.
 */
function WinnersMarquee() {
  const reduced = useReducedMotion();
  const entries = [...MARQUEE_POOL, ...MARQUEE_POOL];
  return (
    <div
      aria-label="Recent winners (demo)"
      role="region"
      className="mt-10 relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-r from-white/[0.03] via-white/[0.05] to-white/[0.03]"
    >
      {/* Left + right fade masks. ENHANCE-01 — w-16 + linear gradient
          left partial chips readable past the fade on wide viewports
          (a half-rendered `@minimal...` chip was visibly clipped at
          the right edge). Widened to w-24 and pushed the opaque stop
          to 55% so the rightmost ~14px fully obscures any partial
          glyph while the inner 40–50px still feathers smoothly. */}
      <div
        aria-hidden
        className="absolute inset-y-0 left-0 w-24 z-10 pointer-events-none"
        style={{
          background:
            "linear-gradient(90deg, rgba(2,11,24,1) 0%, rgba(2,11,24,1) 45%, rgba(2,11,24,0) 100%)",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-y-0 right-0 w-24 z-10 pointer-events-none"
        style={{
          background:
            "linear-gradient(270deg, rgba(2,11,24,1) 0%, rgba(2,11,24,1) 45%, rgba(2,11,24,0) 100%)",
        }}
      />

      <div className="flex items-center gap-3 py-3 pl-4 pr-4">
        <span className="shrink-0 text-[10px] uppercase tracking-widest font-mono text-yellow-300/90 z-20 relative">
          Recent wins
        </span>
        <div className="relative flex-1 overflow-hidden">
          {reduced ? (
            // Static row when reduced — show 4 entries, no motion.
            <div className="flex items-center gap-4">
              {MARQUEE_POOL.slice(0, 4).map((e, i) => (
                <MarqueeChip key={i} entry={e} />
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-4 animate-[lw-marquee_34s_linear_infinite] hover:[animation-play-state:paused]">
              {entries.map((e, i) => (
                <MarqueeChip key={i} entry={e} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Keyframes scoped to this component */}
      <style>{`
        @keyframes lw-marquee {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}

// =============================================================
// Sticky deposit rail — mobile-only, appears after scroll
// =============================================================

/**
 * Thumb-reach DEPOSIT NOW button fixed to the bottom-right on
 * mobile only. Appears after the user has scrolled ~500px past
 * the hero (so it doesn't crowd the first-paint), sits above the
 * BottomNav safe-area-inset, and dismisses if the user dismisses
 * it. Hidden at md+ because desktop already shows deposit buttons
 * in the sticky top nav, the hero CTA rail, the Play section
 * header, and the WagerPrimer panel.
 */
function StickyDepositRail() {
  const reduced = useReducedMotion();
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > 500);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  if (dismissed) return null;
  return (
    <div
      className="md:hidden fixed right-4 z-40 flex items-center gap-1.5 transition-[opacity,transform] duration-200"
      style={{
        bottom: "calc(80px + env(safe-area-inset-bottom, 0px))",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(8px)",
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      <Link
        href={ROUTES.deposit}
        aria-label="Deposit LWP"
        className="relative inline-flex items-center gap-2 rounded-full border border-orange-300/60 px-4 py-2.5 text-sm font-black uppercase tracking-widest text-black shadow-[0_10px_24px_-10px_rgba(249,115,22,0.55)] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
        style={{
          background:
            "linear-gradient(90deg,#fdba74,#f97316 60%,#ea580c)",
        }}
      >
        <span aria-hidden className={`h-1.5 w-1.5 rounded-full bg-black/70 ${reduced ? "" : "animate-pulse"}`} />
        Deposit now
      </Link>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss deposit reminder"
        className="inline-flex items-center justify-center h-8 w-8 rounded-full border border-white/15 bg-background/85 backdrop-blur-sm text-gray-300 hover:text-white hover:border-white/30 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3" aria-hidden>
          <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
        </svg>
      </button>
    </div>
  );
}

/**
 * Hash handle → deterministic "seconds ago" in [8, 420). Stable
 * per-handle so the same chip always shows the same relative time
 * across mounts within a page view, which keeps the marquee honest
 * even though the data is fake. FNV-1a is overkill but cheap.
 */
function handleSecondsAgo(handle: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < handle.length; i++) {
    h ^= handle.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  // 8s..7m spread — matches the feel of a live chat.
  return 8 + (h % 412);
}

function formatRelative(s: number): string {
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  return `${m}m ago`;
}

function MarqueeChip({ entry }: { entry: MarqueeEntry }) {
  const toneCls =
    entry.tier === "big"
      ? "border-yellow-400/40 bg-yellow-400/[0.08] text-yellow-200"
      : entry.tier === "mid"
        ? "border-cyan-300/40 bg-cyan-300/[0.08] text-cyan-200"
        : "border-white/15 bg-white/[0.04] text-gray-300";
  const relTs = formatRelative(handleSecondsAgo(entry.handle));
  return (
    <span
      className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-mono ${toneCls}`}
    >
      <span className="font-semibold">@{entry.handle}</span>
      <span className="text-white/90">+{entry.amount} LWP</span>
      <span className="text-white/40 hidden sm:inline">· {relTs}</span>
    </span>
  );
}


// =============================================================
// Difficulty ladder — visual speed ramp
// =============================================================

function DifficultyLadder() {
  const reduced = useReducedMotion();
  return (
    <section className="lw-section relative z-10 max-w-7xl mx-auto px-5 md:px-8 py-10">
      <div className="mb-6 max-w-xl">
        <div className="text-[10px] uppercase tracking-widest text-orange-300 mb-2">
          The climb
        </div>
        <h2 className="text-2xl md:text-3xl font-black tracking-tight mb-2">
          Easy at the bottom.{" "}
          <span
            className="bg-clip-text text-transparent"
            style={{
              backgroundImage:
                "linear-gradient(90deg,#fdba74,#f97316 50%,#facc15)",
            }}
          >
            Brutal at the top.
          </span>
        </h2>
        <p className="text-sm text-gray-400 leading-snug">
          Speed ramps cubically across the tower. Past row 6 the slider can
          spawn on either side — past row 8 the speed jitters on two irrational
          sines so there&apos;s no rhythm to lock onto.
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 md:p-6">
        <div className="grid gap-4 md:grid-cols-[1.2fr_1fr] items-center">
          {/* Speed bars */}
          <div>
            <div className="text-[10px] uppercase tracking-widest text-gray-400 mb-3">
              Slider speed (cells/sec)
            </div>
            <div className="flex items-end gap-1 h-32">
              {Array.from({ length: 15 }, (_, row) => {
                const t = row / 14;
                // Kept in lockstep with SPEED_BY_ROW in StackerGame.tsx.
                // Curve retuned to 5.2 + t³·8.3 (was 3.6 + t³·9.9) —
                // quicker floor, same ceiling, no 3.6 free-ride.
                const speed = 5.2 + t * t * t * 8.3;
                const heightPct = (speed / 14) * 100;
                // Hot-zone tiers follow the mechanic breakpoints:
                // jitter kicks at row 6, top-tier glow at row 12.
                const hot = row >= 6;
                const veryHot = row >= 12;
                return (
                  <motion.div
                    key={row}
                    className="flex-1 rounded-t-sm relative"
                    initial={reduced ? {} : { height: 0 }}
                    whileInView={{ height: `${heightPct}%` }}
                    viewport={{ once: true, margin: "-50px" }}
                    transition={
                      reduced
                        ? { duration: 0 }
                        : { delay: row * 0.025, duration: 0.35, ease: "easeOut" }
                    }
                    style={{
                      background: veryHot
                        ? "linear-gradient(180deg,#facc15,#f59e0b)"
                        : hot
                          ? "linear-gradient(180deg,#fb923c,#f97316)"
                          : "linear-gradient(180deg,#22d3ee,#0891b2)",
                      minHeight: "4px",
                      boxShadow: veryHot
                        ? "0 0 8px rgba(250,204,21,0.35)"
                        : undefined,
                    }}
                    aria-label={`Row ${row}: ${speed.toFixed(1)} cells/sec`}
                  />
                );
              })}
            </div>
            <div className="mt-2 flex justify-between text-[10px] font-mono text-gray-500">
              <span>row 0 · 5.2</span>
              <span className="text-orange-300">row 6 · 6.5</span>
              <span className="text-yellow-300">row 14 · 13.5+</span>
            </div>
          </div>

          {/* Mechanics list. Breakpoints tracking StackerGame.tsx:
              RANDOM_DIR_ROW=3, JITTER_ROW=6. Retuned alongside the
              speed curve — no 5-row coast before the tower starts
              punching back. */}
          <ul className="space-y-3">
            <LadderRule
              tone="cyan"
              row="0–2"
              title="Warm-up"
              body="Predictable left-to-right slider at 5.2 cells/sec. Short runway — learn the window fast."
            />
            <LadderRule
              tone="orange"
              row="3+"
              title="Random spawn side"
              body="Slider can appear on either edge moving either direction. Muscle memory stops working three rows in."
            />
            <LadderRule
              tone="yellow"
              row="6+"
              title="Speed jitter"
              body="Two irrational sines layer over the base speed. No BPM to lock. Good luck."
            />
          </ul>
        </div>
      </div>
    </section>
  );
}

function LadderRule({
  tone,
  row,
  title,
  body,
}: {
  tone: "cyan" | "orange" | "yellow";
  row: string;
  title: string;
  body: string;
}) {
  const fg =
    tone === "cyan"
      ? "text-cyan-300"
      : tone === "orange"
        ? "text-orange-300"
        : "text-yellow-300";
  const dot =
    tone === "cyan"
      ? "bg-cyan-300"
      : tone === "orange"
        ? "bg-orange-400"
        : "bg-yellow-300";
  return (
    <li className="flex items-start gap-3">
      <span className={`mt-1.5 inline-block h-2 w-2 rounded-full ${dot} shrink-0`} />
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <span className={`text-[10px] uppercase tracking-widest font-mono ${fg}`}>
            row {row}
          </span>
          <span className="text-sm font-semibold text-white">{title}</span>
        </div>
        <div className="text-xs text-gray-400 leading-snug mt-0.5">{body}</div>
      </div>
    </li>
  );
}

// =============================================================
// How it works
// =============================================================

function HowItWorks() {
  const cards = [
    {
      idx: "01",
      title: "Slider bounces across",
      body:
        "A row of blocks slides left and right above your stack. It never stops on its own.",
      visual: <SliderAnim />,
      tone: "cyan" as const,
    },
    {
      idx: "02",
      title: "Tap to lock",
      body:
        "Space, Enter, click, or tap. Whatever overlaps the block below stays — anything hanging off falls off.",
      visual: <LockAnim />,
      tone: "violet" as const,
    },
    {
      idx: "03",
      title: "Don't let it hit zero",
      body:
        "Each imperfect lock narrows the window. Zero width is game over. A perfect lock keeps the width and chains into a streak bonus.",
      visual: <ChopAnim />,
      tone: "orange" as const,
    },
  ];

  return (
    <section id="how" className="lw-section relative z-10 max-w-7xl mx-auto px-5 md:px-8 py-10">
      <div className="mb-6 max-w-xl">
        <div className="text-[10px] uppercase tracking-widest text-cyan-300 mb-2">
          How it works
        </div>
        <h2 className="text-2xl md:text-3xl font-black tracking-tight mb-2">
          Three rules. Fifteen rows.
        </h2>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {cards.map((c) => (
          <motion.div
            key={c.idx}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.4 }}
            whileHover={{ y: -2 }}
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 overflow-hidden transition-[border-color,background-color] hover:border-white/25 hover:bg-white/[0.05]"
          >
            {/* ENHANCE-02 — step numerals were a dim 10px mono
                glyph in the corner, dwarfed by the bright toned Pill
                on the opposite side. Upgrade to a tone-colored
                numeric chip: monospace bold digits on a matching
                translucent fill with a subtle border. Balances the
                card header visually and reads as a numbered step,
                not an internal ID string. */}
            <div className="flex items-center justify-between mb-3">
              <span
                className={`inline-flex items-center justify-center h-7 min-w-[1.75rem] px-2 rounded-md border text-[13px] font-mono font-bold tabular-nums ${
                  c.tone === "cyan"
                    ? "border-cyan-300/30 bg-cyan-300/[0.08] text-cyan-200"
                    : c.tone === "violet"
                      ? "border-violet-300/30 bg-violet-300/[0.08] text-violet-200"
                      : "border-orange-300/30 bg-orange-300/[0.08] text-orange-200"
                }`}
                aria-label={`Step ${parseInt(c.idx, 10)}`}
              >
                {c.idx}
              </span>
              <Pill status={c.tone === "cyan" ? "demo" : c.tone === "violet" ? "beta" : "soon"}>
                {c.tone === "cyan" ? "core" : c.tone === "violet" ? "tap" : "decay"}
              </Pill>
            </div>
            <div className="relative aspect-[5/3] mb-4 rounded-xl overflow-hidden border border-white/5 bg-black/40">
              {c.visual}
            </div>
            <h3 className="text-lg font-semibold text-white mb-1">{c.title}</h3>
            <p className="text-sm text-gray-400 leading-snug">{c.body}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

// ---- How-it-works mini animations ----

function SliderAnim() {
  const reduced = useReducedMotion();
  return (
    <svg viewBox="0 0 100 60" className="absolute inset-0 w-full h-full p-3">
      {[0, 1, 2].map((i) => (
        <rect
          key={i}
          x={20 + i * 20}
          y={45}
          width={18}
          height={10}
          rx={2}
          fill="rgba(34,211,238,0.3)"
        />
      ))}
      <motion.rect
        x={0}
        y={15}
        width={30}
        height={10}
        rx={2}
        fill="#22d3ee"
        initial={{ x: 5 }}
        animate={reduced ? {} : { x: [5, 65, 5] }}
        transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
      />
    </svg>
  );
}

function LockAnim() {
  const reduced = useReducedMotion();
  return (
    <svg viewBox="0 0 100 60" className="absolute inset-0 w-full h-full p-3">
      <rect x={25} y={42} width={50} height={10} rx={2} fill="rgba(139,92,246,0.3)" />
      <motion.rect
        x={28}
        y={22}
        width={50}
        height={10}
        rx={2}
        fill="#a78bfa"
        initial={{ x: 28, y: 22 }}
        animate={reduced ? {} : { x: [28, 28], y: [22, 22, 32] }}
        transition={{ duration: 2.4, repeat: Infinity, times: [0, 0.6, 1], ease: "easeIn" }}
      />
      {/* "tap" ripple */}
      {!reduced && (
        <motion.circle
          cx={50}
          cy={42}
          r={4}
          fill="none"
          stroke="rgba(167,139,250,0.7)"
          strokeWidth={1}
          initial={{ r: 0, opacity: 0 }}
          animate={{ r: [0, 18], opacity: [0.8, 0] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: 1.4 }}
        />
      )}
    </svg>
  );
}

function ChopAnim() {
  const reduced = useReducedMotion();
  return (
    <svg viewBox="0 0 100 60" className="absolute inset-0 w-full h-full p-3">
      <rect x={35} y={42} width={30} height={10} rx={2} fill="rgba(251,146,60,0.25)" />
      <motion.rect
        x={25}
        y={22}
        width={50}
        height={10}
        rx={2}
        fill="#f97316"
        initial={{ x: 25, opacity: 1 }}
        animate={reduced ? {} : { x: [25, 25, 35], width: [50, 50, 30], opacity: [1, 1, 1] }}
        transition={{ duration: 2.6, repeat: Infinity, times: [0, 0.55, 0.7] }}
      />
      {/* Falling chop */}
      {!reduced && (
        <motion.rect
          x={66}
          y={22}
          width={9}
          height={10}
          rx={2}
          fill="#f97316"
          initial={{ y: 22, opacity: 0 }}
          animate={{ y: [22, 22, 60], opacity: [0, 1, 0], rotate: [0, 0, 25] }}
          transition={{ duration: 2.6, repeat: Infinity, times: [0, 0.55, 0.95] }}
        />
      )}
    </svg>
  );
}

// =============================================================
// Wager primer
// =============================================================

function WagerPrimer() {
  // Sub-values derived from PAYOUT_MULTIPLIER.win so the chip
  // payouts never drift if the multiplier is ever tuned.
  // SUPER-39 — was hardcoded '→ 15' / '→ 75' / '→ 300' which
  // silently went stale after any payout adjustment. Same
  // drift-guard pattern as SUPER-22 (HeroTower prize badge).
  const stakes: Array<{ label: string; stake: number; accent: string }> = [
    { label: "Free", stake: 0, accent: "bg-white/30" },
    { label: "5 LWP", stake: 5, accent: "bg-cyan-300" },
    { label: "25 LWP", stake: 25, accent: "bg-orange-300" },
    { label: "100 LWP", stake: 100, accent: "bg-yellow-300" },
  ];
  const chips = stakes.map((s) => ({
    label: s.label,
    accent: s.accent,
    sub: s.stake === 0 ? "no stake" : `→ ${s.stake * PAYOUT_MULTIPLIER.win}`,
  }));
  return (
    <section className="lw-section relative z-10 max-w-7xl mx-auto px-5 md:px-8 py-10">
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-white/[0.02] p-6 md:p-8">
        <div className="grid gap-6 md:grid-cols-[1fr_1.1fr] items-center">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-yellow-300 mb-2">
              Wager · demo mode
            </div>
            <h2 className="text-2xl md:text-3xl font-black tracking-tight mb-2">
              Skin in the game,{" "}
              <span
                className="bg-clip-text text-transparent"
                style={{
                  backgroundImage:
                    "linear-gradient(90deg,#22d3ee,#fdba74 50%,#facc15)",
                }}
              >
                without the risk
              </span>
              .
            </h2>
            <p className="text-sm text-gray-300 leading-snug mb-4 max-w-md">
              Pick a chip before you start. Reach the top and you&apos;d win{" "}
              <span className="text-yellow-300 font-semibold">
                {PAYOUT_MULTIPLIER.win}×
              </span>{" "}
              your stake. Collapse and it&apos;s gone. The demo round doesn&apos;t
              actually move LWP on-chain — the mechanic is real, the ledger call
              is not (yet).
            </p>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
              <Pill status="demo">demo</Pill>
              <span>ICRC-1 wager canister shipping next.</span>
              <Link
                href={ROUTES.fairPlay}
                className="ml-1 underline underline-offset-2 text-cyan-300/80 hover:text-cyan-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60 rounded-sm"
              >
                How fair play works →
              </Link>
            </div>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {chips.map((c, i) => (
                <motion.div
                  key={c.label}
                  initial={{ opacity: 0, y: 8 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-50px" }}
                  transition={{ duration: 0.3, delay: i * 0.06 }}
                  className="relative overflow-hidden rounded-xl border border-white/10 bg-black/40 p-3 text-center"
                >
                  {/* SUPER-18 — tier accent bar. Cool → warm ramp
                      (white/30 → cyan → orange → yellow) so the
                      'bigger stake, hotter reward' story reads as
                      a visual gradient across the 4 chips without
                      needing to scan the sub-values. 2px top bar,
                      full width of each chip. */}
                  <span aria-hidden className={`absolute inset-x-0 top-0 h-[2px] ${c.accent}`} />
                  <div className="text-sm font-bold text-white">{c.label}</div>
                  <div className="text-[10px] uppercase tracking-widest text-yellow-300/90 font-mono mt-1">
                    {c.sub}
                  </div>
                </motion.div>
              ))}
            </div>

            {/* STACKER-R1 + SUPER-13 + SUPER-15 — primary CTA on
                the wager panel. Originally a full-bleed orange bar
                stretching the entire right column (~540px wide), which
                visually crushed the 4 chip tiles above it. Now pill-
                sized: inline-flex with its own width (not w-full),
                centered under the chip grid via a flex wrapper. Reads
                as 'here's one clear action' rather than 'here's a
                massive orange stripe'. Routes to /deposit — the only
                way to grow LWP beyond the 15-free starter. */}
            <div className="flex justify-center pt-1">
              <Link href={ROUTES.deposit} aria-label="Deposit LWP to unlock bigger chips">
                <motion.span
                  initial={{ opacity: 0, y: 6 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.35, delay: 0.28 }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="relative inline-flex items-center gap-2 overflow-hidden rounded-full cursor-pointer py-2 px-5 border border-orange-300/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 shadow-[0_8px_22px_-10px_rgba(249,115,22,0.65)]"
                  style={{
                    background:
                      "linear-gradient(90deg, #fdba74, #f97316 50%, #ea580c)",
                  }}
                >
                  {/* Sheen sweep */}
                  <motion.span
                    aria-hidden
                    className="absolute inset-y-0 -left-1/3 w-1/3 pointer-events-none"
                    style={{
                      background:
                        "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.35) 50%, rgba(255,255,255,0) 100%)",
                      mixBlendMode: "soft-light",
                    }}
                    animate={{ left: ["-33%", "133%"] }}
                    transition={{
                      duration: 2.6,
                      repeat: Infinity,
                      ease: "easeInOut",
                      repeatDelay: 1.2,
                    }}
                  />
                  <span className="relative font-black uppercase tracking-widest text-sm text-black">
                    Deposit now →
                  </span>
                </motion.span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}


/**
 * Full-cover overlay that sits on top of the StackerGame canvas
 * during the entry-fee burn round-trip. Shows what the system is
 * doing right now (auth → connect → charge → confirm → done)
 * with a smooth-animating progress bar and step-specific copy.
 *
 * Hidden when `step === "idle"`. Stays visible briefly on `done`
 * (~500ms) and `error` (~1.4s) so the user perceives the outcome
 * before the overlay clears. Pointer-events stay enabled while
 * visible so a click during the round-trip doesn't bleed through
 * to the canvas (which would otherwise count as a lock-attempt
 * tap the moment the round actually starts).
 *
 * Accessibility: aria-live="polite" so screen readers announce
 * the changing step copy. The progress bar carries an aria-
 * valuenow so AT users get a numeric reading too.
 */
function ChargingOverlay({ step }: { step: ChargeStep }) {
  const visible = step !== "idle";
  const copy = STEP_COPY[step];
  const toneClasses = {
    cyan: {
      ring: "border-cyan-300/40",
      bg: "from-cyan-300/[0.10] via-cyan-300/[0.04] to-transparent",
      bar: "from-cyan-300 to-cyan-500",
      title: "text-cyan-100",
      glyph: "text-cyan-300",
    },
    amber: {
      ring: "border-amber-300/50",
      bg: "from-amber-300/[0.12] via-amber-300/[0.04] to-transparent",
      bar: "from-amber-300 to-orange-400",
      title: "text-amber-100",
      glyph: "text-amber-300",
    },
    green: {
      ring: "border-emerald-300/50",
      bg: "from-emerald-300/[0.12] via-emerald-300/[0.04] to-transparent",
      bar: "from-emerald-300 to-emerald-500",
      title: "text-emerald-100",
      glyph: "text-emerald-300",
    },
    red: {
      ring: "border-red-400/50",
      bg: "from-red-400/[0.12] via-red-400/[0.04] to-transparent",
      bar: "from-red-400 to-red-500",
      title: "text-red-100",
      glyph: "text-red-300",
    },
  } as const;
  const t = toneClasses[copy.tone];

  return (
    <div
      aria-hidden={!visible}
      role={visible ? "status" : undefined}
      aria-live="polite"
      className={`absolute inset-0 z-30 flex items-center justify-center rounded-2xl transition-opacity duration-300 ${
        visible ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
    >
      {/* Frosted backdrop. Pointer-events on so a misfire tap during
          the burn doesn't bleed through to the canvas. */}
      <div
        aria-hidden
        className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${t.bg} backdrop-blur-md`}
      />
      <div
        className={`relative w-[min(420px,90%)] rounded-2xl border ${t.ring} bg-background/85 px-5 py-5 md:px-6 md:py-6 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.7)]`}
      >
        <div className="flex items-center gap-3 mb-3">
          {step === "error" ? (
            <ErrorGlyph className={t.glyph} />
          ) : step === "done" || step === "confirm" ? (
            <CheckGlyph className={t.glyph} />
          ) : (
            <SpinnerGlyph className={t.glyph} />
          )}
          <div className="min-w-0 flex-1">
            <div
              className={`text-base md:text-lg font-bold leading-tight ${t.title}`}
            >
              {copy.title || "…"}
            </div>
            <div className="text-xs md:text-sm text-gray-300 leading-snug mt-0.5">
              {copy.sub}
            </div>
          </div>
        </div>

        {/* Progress bar. Width animates between step pcts via a CSS
            transition so the bar 'travels' rather than jumping. */}
        <div
          className="h-1.5 rounded-full bg-white/10 overflow-hidden"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(copy.pct)}
        >
          <div
            className={`h-full rounded-full bg-gradient-to-r ${t.bar} transition-[width] duration-500 ease-out`}
            style={{
              width: `${copy.pct}%`,
              boxShadow:
                copy.tone === "amber"
                  ? "0 0 12px rgba(251,191,36,0.55)"
                  : copy.tone === "green"
                    ? "0 0 12px rgba(110,231,183,0.55)"
                    : copy.tone === "red"
                      ? "0 0 10px rgba(248,113,113,0.45)"
                      : "0 0 10px rgba(103,232,249,0.45)",
            }}
          />
        </div>

        {/* Step ladder — small visual map of where we are in the
            sequence. Colored chips fill in as the progress moves. */}
        <div className="mt-3 flex items-center justify-between gap-1.5">
          {(["auth", "connect", "charge", "confirm", "done"] as const).map(
            (s, i) => {
              const order: Record<ChargeStep, number> = {
                idle: -1,
                auth: 0,
                connect: 1,
                charge: 2,
                confirm: 3,
                done: 4,
                error: -1,
              };
              const cur = order[step];
              const isError = step === "error";
              const reached = !isError && cur >= i;
              const active = !isError && cur === i;
              return (
                <div
                  key={s}
                  className={`flex-1 h-[3px] rounded-full transition-colors duration-300 ${
                    isError
                      ? "bg-red-400/40"
                      : reached
                        ? active
                          ? "bg-cyan-300"
                          : "bg-emerald-300/70"
                        : "bg-white/10"
                  }`}
                  title={s}
                />
              );
            },
          )}
        </div>
      </div>
    </div>
  );
}

function SpinnerGlyph({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={`h-7 w-7 shrink-0 animate-spin ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
    >
      <path d="M21 12a9 9 0 1 1-9-9" />
      <path d="M21 12a9 9 0 0 0-3.6-7.2" opacity={0.4} />
    </svg>
  );
}

function CheckGlyph({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={`h-7 w-7 shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx={12} cy={12} r={10} opacity={0.35} />
      <path d="M7.5 12.5l3 3 6-6.5" />
    </svg>
  );
}

function ErrorGlyph({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={`h-7 w-7 shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx={12} cy={12} r={10} opacity={0.35} />
      <path d="M9 9l6 6M15 9l-6 6" />
    </svg>
  );
}
