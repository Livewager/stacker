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

const LABELS: Record<ConfirmationStep, { title: string; detail: string }> = {
  idle: { title: "Ready", detail: "Enter an amount to preview your deposit." },
  signed: { title: "Signed", detail: "Request queued with your II principal." },
  seen: { title: "Observed", detail: "Oracle picked up the transaction." },
  confirm: { title: "1 / 2 confirmations", detail: "Minter warming up." },
  minted: { title: "Minted", detail: "LWP credited. ICRC-3 block emitted." },
};

export function ConfirmationRail({ step }: { step: ConfirmationStep }) {
  const activeIdx = step === "idle" ? -1 : ORDER.indexOf(step);
  return (
    <div className="rounded-xl border border-white/10 bg-black/30 p-4">
      <div className="flex items-center justify-between">
        {ORDER.map((s, i) => {
          const done = activeIdx > i;
          const active = activeIdx === i;
          return (
            <div key={s} className="flex items-center flex-1 min-w-0">
              <StepDot done={done} active={active} />
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
                      transform: `scaleX(${done ? 1 : active ? 0.6 : 0})`,
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
    </div>
  );
}

function StepDot({ done, active }: { done: boolean; active: boolean }) {
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
      ) : active ? (
        <span className="h-2 w-2 rounded-full bg-cyan-300 animate-pulse" />
      ) : (
        <span className="h-1.5 w-1.5 rounded-full bg-gray-500" />
      )}
    </div>
  );
}
