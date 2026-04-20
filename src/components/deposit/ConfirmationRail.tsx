"use client";

/**
 * A four-step progress ribbon for the LTC deposit demo:
 *   1. signed  — user hit Deposit
 *   2. seen    — oracle "observed" the tx
 *   3. confirm — 1/2 confirmations
 *   4. minted  — LWP credited, ICRC-3 block emitted
 *
 * In production these steps come from real LTC confirmation events. In
 * the demo the parent component advances the active step alongside the
 * /api/dunk/ltc-deposit round-trip so the UI has the feel of a real
 * oracle flow.
 */

export type ConfirmationStep = "idle" | "signed" | "seen" | "confirm" | "minted";

const ORDER: ConfirmationStep[] = ["signed", "seen", "confirm", "minted"];

const DEFAULT_LABELS: Record<ConfirmationStep, { title: string; detail: string }> = {
  idle: { title: "Ready", detail: "Enter an amount to preview your deposit." },
  signed: { title: "Signed", detail: "Request queued with your II principal." },
  seen: { title: "Observed", detail: "Oracle picked up the transaction." },
  confirm: { title: "Confirming", detail: "Waiting on block confirmations." },
  minted: { title: "Minted", detail: "LWP credited. ICRC-3 block emitted." },
};

export interface ConfirmationRailProps {
  step: ConfirmationStep;
  /**
   * Live confirmation counter. When provided and `step === "confirm"`, the
   * rail replaces the default label with "N/M confirmations" and renders
   * a thin progress arc inside the active step's dot. Omit to fall back
   * to the static "Confirming" copy.
   */
  confirmations?: { current: number; target: number };
}

export function ConfirmationRail({ step, confirmations }: ConfirmationRailProps) {
  const activeIdx = step === "idle" ? -1 : ORDER.indexOf(step);
  const LABELS = { ...DEFAULT_LABELS };
  if (confirmations && step === "confirm") {
    const { current, target } = confirmations;
    LABELS.confirm = {
      title: `${current} / ${target} confirmations`,
      detail:
        current >= target
          ? "Confirmations satisfied. Finalising the mint."
          : `Waiting on ${target - current} more block${target - current === 1 ? "" : "s"}.`,
    };
  }
  // Human-readable "Step N of 4" phrasing for the live region. When
  // idle we don't emit a stage announcement — the rail hasn't started.
  const stepNumber = activeIdx + 1;
  const totalSteps = ORDER.length;
  const phrased =
    step === "idle"
      ? "Deposit ready. Enter an amount to begin."
      : `Step ${stepNumber} of ${totalSteps}: ${LABELS[step].title}. ${LABELS[step].detail}`;

  return (
    <div
      role="group"
      aria-label="Deposit progress"
      className="rounded-xl border border-white/10 bg-black/30 p-4"
    >
      {/* POLISH-332 audit: rail doesn't overflow at 320px. Math:
          320 viewport − 32 page px (p-4 ×2) − 32 card px (p-4 ×2) =
          256 content box. 4 dots × 28px = 112. Remaining 144 split
          3 ways + mx-1.5 spacing (6×2 per connector) = ~36 px per
          connector bar, which is still a visible bar. Labels
          ("1 / 2 confirmations", "Waiting on 1 more block.") render
          below the rail as free-flowing divs — natural line wrap,
          no risk of pushing the rail itself. Premise was overflow;
          the rail is a scaling flex, not a fixed-width strip.
          Kept as-is. */}
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={totalSteps}
        aria-valuenow={Math.max(0, stepNumber)}
        aria-valuetext={phrased}
        className="flex items-center justify-between"
      >
        {ORDER.map((s, i) => {
          const done = activeIdx > i;
          const active = activeIdx === i;
          // During the confirm step, use the real N/M ratio to fill the
          // dot's ring so the progress is physically visible — not just
          // an abstract "something is happening" pulse.
          const ratio =
            s === "confirm" && active && confirmations
              ? Math.min(1, Math.max(0, confirmations.current / confirmations.target))
              : undefined;
          return (
            <div key={s} className="flex items-center flex-1 min-w-0">
              <StepDot done={done} active={active} ratio={ratio} />
              {i < ORDER.length - 1 && (
                <div
                  className="flex-1 h-[2px] mx-1.5 rounded-full overflow-hidden"
                  style={{ background: "rgba(255,255,255,0.08)" }}
                  aria-hidden
                >
                  <div
                    className="h-full origin-left transition-transform duration-500 ease-out"
                    style={{
                      background: "linear-gradient(90deg,#22d3ee,#0891b2)",
                      transform: `scaleX(${done ? 1 : active ? (ratio ?? 0.6) : 0})`,
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-3 text-sm text-white font-semibold">{LABELS[step].title}</div>
      <div className="text-xs text-gray-400 leading-snug">{LABELS[step].detail}</div>
      {/* Phrased live update — aria-atomic so the SR reads the full
          sentence on each transition instead of diffing labels.
          POLISH-228 audit 2026-04-20: the phrased string embeds both
          the stage (via title/detail lookup on `step`) and, during
          the confirm stage, the live N/M counter — so an increment
          from 1/2 → 2/2 updates the span text and the polite-live
          region fires, no separate aria-live needed per N tick. The
          progressbar's aria-valuetext carries the same phrasing as
          a fallback for SRs that ignore sr-only live regions. No
          throttling concern at realistic cadence (stage every
          ~1–2s, confirm ticks every ~500ms). */}
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {phrased}
      </span>
    </div>
  );
}

function StepDot({
  done,
  active,
  ratio,
}: {
  done: boolean;
  active: boolean;
  /** 0..1 progress fill for the active dot. When provided, replaces
   *  the generic pulse with a real arc driven by block confirmations. */
  ratio?: number;
}) {
  return (
    <div
      className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors ${
        done || active
          ? "border-cyan-300 bg-cyan-300/20 text-cyan-200"
          : "border-white/15 bg-white/5 text-gray-500"
      }`}
      aria-hidden
    >
      {done ? (
        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="currentColor">
          <path d="M16.707 5.293a1 1 0 0 1 0 1.414l-7.5 7.5a1 1 0 0 1-1.414 0l-3.5-3.5a1 1 0 1 1 1.414-1.414L8.5 12.086l6.793-6.793a1 1 0 0 1 1.414 0Z" />
        </svg>
      ) : active && typeof ratio === "number" ? (
        <ProgressArc ratio={ratio} />
      ) : active ? (
        <span className="h-2 w-2 rounded-full bg-cyan-300 animate-pulse" />
      ) : (
        <span className="h-1.5 w-1.5 rounded-full bg-gray-500" />
      )}
    </div>
  );
}

/** Thin cyan arc that sweeps from top (12 o'clock) clockwise in
 *  proportion to `ratio`. Pure SVG; no motion lib; composites on
 *  the GPU. Radius is sized to match the dot's 28px box.
 *
 *  Reduced-motion:
 *   - The global CSS pipeline (style.css: media prefers-reduced-motion
 *     AND html.lw-reduce-motion) already clamps transition-duration
 *     to 0.001ms, so the stroke sweep effectively snaps. Each
 *     demo-ticker bump of `ratio` still lands on the correct frame —
 *     just without the 400ms ease-out.
 *   - animate-pulse on the non-ratio active-dot path is also
 *     explicitly disabled (opacity:1) by the same pipeline.
 *   - The 500ms transition on the connector <div> in the parent is
 *     covered by the same global rule.
 *   Audited 2026-04-20 — no local motion-safe guard needed. The
 *   inline `transition` style below is still honoured by non-reduce
 *   clients because the global rules target duration, not the
 *   property; terminal frames are always correct. */
function ProgressArc({ ratio }: { ratio: number }) {
  const r = 9;
  const c = 2 * Math.PI * r;
  const dashOffset = c * (1 - Math.min(1, Math.max(0, ratio)));
  return (
    <svg viewBox="0 0 22 22" className="h-5 w-5 -rotate-90" aria-hidden>
      <circle
        cx={11}
        cy={11}
        r={r}
        fill="none"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth={2}
      />
      <circle
        cx={11}
        cy={11}
        r={r}
        fill="none"
        stroke="#22d3ee"
        strokeWidth={2}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={dashOffset}
        style={{ transition: "stroke-dashoffset 400ms ease-out" }}
      />
    </svg>
  );
}
