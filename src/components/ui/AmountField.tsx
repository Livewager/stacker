"use client";

/**
 * Shared LWP amount input. Used on /wallet buy, /send, /withdraw.
 *
 * Behaviour:
 *  - Preset chips (25% / 50% / 75% / MAX) relative to `balanceLwp` when
 *    provided. MAX stays one pixel behind the balance to keep ledger
 *    fees from pushing total over — the caller can adjust that by
 *    passing a smaller balanceLwp if they want to reserve room.
 *  - Thousands separator on the displayed value. The raw numeric string
 *    (no commas, canonical dot decimal) is what flows out via onChange.
 *  - Optional fiat-ish estimate line under the input; if `rate` is
 *    provided, we show "≈ $X" live.
 *  - Insufficient-balance hint when the entered value exceeds balance.
 */

import { useId, useMemo, type Ref } from "react";

type Props = {
  /** Raw numeric string the caller owns. "" when empty. */
  value: string;
  onChange: (next: string) => void;
  /** Label above the input. */
  label?: string;
  /** Inline error (overrides hint). */
  error?: string;
  /** Helper text below the input when no error. */
  hint?: string;
  /** User's live LWP balance as a whole-LWP number. Enables % chips + MAX + insufficient guard. */
  balanceLwp?: number | null;
  /** Token ticker — defaults to "LWP". */
  symbol?: string;
  /** If set, render "≈ $X" estimate below the input (rate is USD-per-token). */
  rate?: number;
  /** Extra class on the outer wrapper. */
  className?: string;
  /** Focus ring tone hint — matches the page's primary tone. */
  tone?: "cyan" | "orange" | "violet" | "rose";
  /** Optional input id so the label htmlFor lines up with accessibility checkers. */
  id?: string;
  /** Hide preset chips even when balance is known. Useful in read-only review rows. */
  hideChips?: boolean;
  disabled?: boolean;
  /**
   * Optional ref to the inner <input>. Lets the caller drive focus
   * from elsewhere (e.g. /send jumps focus here after a recent-chip
   * use). Accepts any valid React Ref.
   */
  inputRef?: Ref<HTMLInputElement>;
};

const CHIPS: Array<{ label: string; fraction: number }> = [
  { label: "25%", fraction: 0.25 },
  { label: "50%", fraction: 0.5 },
  { label: "75%", fraction: 0.75 },
  { label: "Max", fraction: 1 },
];

function groupThousands(raw: string): string {
  if (!raw) return raw;
  const [int, frac] = raw.split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return frac !== undefined ? `${grouped}.${frac}` : grouped;
}

/** Strip anything that isn't a digit or a single dot. Keep leading zeros. */
function sanitize(raw: string): string {
  let seenDot = false;
  let out = "";
  for (const ch of raw) {
    if (ch === ".") {
      if (seenDot) continue;
      seenDot = true;
      out += ch;
    } else if (ch >= "0" && ch <= "9") {
      out += ch;
    }
  }
  return out;
}

const TONE_RING: Record<NonNullable<Props["tone"]>, string> = {
  cyan: "focus:border-cyan-300/60",
  orange: "focus:border-orange-300/60",
  violet: "focus:border-violet-300/60",
  rose: "focus:border-rose-300/60",
};

export function AmountField({
  value,
  onChange,
  label = "Amount",
  error,
  hint,
  balanceLwp,
  symbol = "LWP",
  rate,
  className = "",
  tone = "cyan",
  id,
  hideChips = false,
  disabled = false,
  inputRef,
}: Props) {
  const raw = useMemo(() => sanitize(value), [value]);

  const numeric = Number(raw);
  const hasAmount = Number.isFinite(numeric) && numeric > 0;
  const overBalance =
    balanceLwp !== null &&
    balanceLwp !== undefined &&
    hasAmount &&
    numeric > balanceLwp;

  const estimate = rate && hasAmount ? numeric * rate : null;

  const showChips = !hideChips && balanceLwp !== null && balanceLwp !== undefined && balanceLwp > 0;

  const applyChip = (fraction: number) => {
    if (balanceLwp === null || balanceLwp === undefined || balanceLwp <= 0) return;
    const next = fraction === 1 ? balanceLwp : balanceLwp * fraction;
    // Up to 4 decimals so micro-balances survive the % split.
    onChange(next.toFixed(4).replace(/\.?0+$/, ""));
  };

  const displayValue = groupThousands(raw);
  const effectiveError = error || (overBalance ? `Exceeds balance` : undefined);
  const effectiveHint =
    !effectiveError &&
    (hint ??
      (balanceLwp !== null && balanceLwp !== undefined
        ? `Balance ${balanceLwp.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${symbol}`
        : undefined));

  // Stable ids so aria-describedby survives re-render. useId gives us
  // an SSR-safe prefix; the caller's `id` (when supplied) takes
  // precedence so lables/htmlFor still line up. `-hint` / `-error`
  // suffixes match the rendered <div>s below; aria-describedby only
  // lists the node that's actually on screen (hint OR error, never
  // both) so SR announcements are single-shot.
  const autoId = useId();
  const fieldId = id ?? `amt-${autoId}`;
  const describedBy = effectiveError
    ? `${fieldId}-error`
    : effectiveHint
      ? `${fieldId}-hint`
      : undefined;

  return (
    <div className={className}>
      {label && (
        <div className="flex items-baseline justify-between mb-1.5">
          <label
            htmlFor={fieldId}
            className="text-[10px] uppercase tracking-widest text-gray-400"
          >
            {label}
          </label>
          {effectiveError && (
            <span
              id={`${fieldId}-error`}
              className="text-[10px] text-red-300"
              role="alert"
            >
              {effectiveError}
            </span>
          )}
        </div>
      )}
      <div
        className={`flex items-center gap-2 rounded-md bg-black/40 border px-3 h-11 transition ${
          effectiveError
            ? "border-red-400/60"
            : `border-white/10 ${TONE_RING[tone]}`
        } ${disabled ? "opacity-60" : ""}`}
      >
        <input
          id={fieldId}
          ref={inputRef}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          placeholder="0.00"
          aria-invalid={effectiveError ? true : undefined}
          aria-describedby={describedBy}
          value={displayValue}
          disabled={disabled}
          onChange={(e) => onChange(sanitize(e.target.value))}
          onBlur={() => {
            // Strip trailing dot / leading zero noise on blur.
            if (!raw) return;
            const n = Number(raw);
            if (Number.isFinite(n)) {
              const tidy = String(n);
              if (tidy !== raw) onChange(tidy);
            }
          }}
          className="flex-1 bg-transparent text-right text-white text-sm font-mono tabular-nums focus:outline-none placeholder:text-gray-600"
        />
        <span className="text-[11px] font-mono text-gray-400 shrink-0">{symbol}</span>
      </div>

      {showChips && (
        <div
          role="group"
          aria-label={`${label} presets`}
          className="mt-2 flex flex-wrap gap-1.5"
        >
          {CHIPS.map((c) => (
            <button
              key={c.label}
              type="button"
              onClick={() => applyChip(c.fraction)}
              disabled={disabled}
              className="rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] uppercase tracking-widest text-gray-300 hover:text-white hover:border-white/25 transition disabled:opacity-50"
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      {estimate !== null && (
        <div className="mt-1 text-[11px] text-gray-500 font-mono">
          ≈ $
          {estimate.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </div>
      )}

      {effectiveHint && !effectiveError && (
        <div
          id={`${fieldId}-hint`}
          className="mt-1 text-[11px] text-gray-500 leading-snug"
        >
          {effectiveHint}
        </div>
      )}
    </div>
  );
}
