"use client";

/**
 * Tap entropy capture — groundwork for ANTICHEAT-T2.
 *
 * Records tap events during a Stacker round into a bounded buffer and
 * computes simple distribution statistics at finalize time. This is
 * *client-local* only for now: no network calls, no canister upload.
 * When ANTICHEAT-T1 replay ships we'll start hashing + signing the
 * transcript; until then the buffer just proves the wiring is sound
 * and lets us show "captured N taps" in debug surfaces.
 *
 * Design notes
 *  - Events are plain POJOs so they can be JSON-serialized into a
 *    future signed transcript without ceremony.
 *  - We only keep what matters for anomaly scoring: slider position,
 *    slider direction, current row, wall-clock timestamp, and the
 *    touch metadata the browser actually hands us (radius + pressure
 *    when available — many browsers don't expose these).
 *  - The buffer is bounded at MAX_EVENTS so a pathologically long
 *    round can't exhaust memory; oldest events drop.
 */

const MAX_EVENTS = 256;

export type TapEvent = {
  /** Monotonic per-round index, starts at 0. */
  seq: number;
  /** Integer row the lock landed on. */
  row: number;
  /** Slider left-edge column at lock time. Fractional (0..cols-gridwidth). */
  sliderCol: number;
  /** +1 moving right, -1 moving left at lock time. */
  sliderDir: 1 | -1;
  /** Slider width (cells) at lock time. */
  sliderWidth: number;
  /** ms from performance.now() at lock. */
  tRound: number;
  /** ms delta since previous tap (0 for first). */
  dtPrev: number;
  /** Touch radius in CSS px if the browser exposes it, else null. */
  touchRadius: number | null;
  /** Touch force 0..1 if available, else null. */
  touchForce: number | null;
};

export interface RoundTranscript {
  startedAt: number; // epoch ms
  durationMs: number;
  events: TapEvent[];
  stats: {
    count: number;
    meanDt: number; // ms
    stdDt: number; // ms
    minDt: number;
    maxDt: number;
    /** Lag-1 autocorrelation on dt values. NaN when count < 3. */
    autocorr1: number;
  };
}

export function createRound() {
  const events: TapEvent[] = [];
  const t0 = performance.now();
  const startedAt = Date.now();
  let lastT = t0;

  function record(input: {
    row: number;
    sliderCol: number;
    sliderDir: 1 | -1;
    sliderWidth: number;
    touch?: Touch | null;
    pointerEvent?: PointerEvent | null;
  }): TapEvent {
    const now = performance.now();
    const tRound = now - t0;
    const dtPrev = events.length === 0 ? 0 : now - lastT;
    lastT = now;

    const touchRadius = input.touch?.radiusX ?? null;
    // Safari/Chrome call it "force", some expose pointerEvent.pressure.
    const touchForce =
      input.touch?.force ??
      input.pointerEvent?.pressure ??
      null;

    const ev: TapEvent = {
      seq: events.length,
      row: input.row,
      sliderCol: input.sliderCol,
      sliderDir: input.sliderDir,
      sliderWidth: input.sliderWidth,
      tRound: Math.round(tRound),
      dtPrev: Math.round(dtPrev),
      touchRadius,
      touchForce,
    };
    events.push(ev);
    if (events.length > MAX_EVENTS) events.shift();
    return ev;
  }

  function finalize(): RoundTranscript {
    const durationMs = performance.now() - t0;
    const dts = events.slice(1).map((e) => e.dtPrev);
    const count = dts.length;
    const meanDt = count > 0 ? dts.reduce((a, b) => a + b, 0) / count : 0;
    const varDt =
      count > 0
        ? dts.reduce((a, b) => a + (b - meanDt) * (b - meanDt), 0) / count
        : 0;
    const stdDt = Math.sqrt(varDt);
    const minDt = count > 0 ? Math.min(...dts) : 0;
    const maxDt = count > 0 ? Math.max(...dts) : 0;

    // Lag-1 autocorrelation. Flat sequences → near 0; rhythmic bots
    // trend toward 1. Skip when we don't have enough data.
    let autocorr1 = NaN;
    if (count >= 3 && varDt > 0) {
      let num = 0;
      for (let i = 0; i < count - 1; i++) {
        num += (dts[i] - meanDt) * (dts[i + 1] - meanDt);
      }
      autocorr1 = num / ((count - 1) * varDt);
    }

    return {
      startedAt,
      durationMs,
      events: events.slice(),
      stats: {
        count: events.length,
        meanDt,
        stdDt,
        minDt,
        maxDt,
        autocorr1,
      },
    };
  }

  function length(): number {
    return events.length;
  }

  return { record, finalize, length };
}

export type Round = ReturnType<typeof createRound>;
