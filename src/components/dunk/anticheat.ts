"use client";

/**
 * Anti-cheat input signature for Steady Pour.
 *
 * Human tilt streams have a predictable signature: non-zero variance
 * of tilt deltas (micro-tremor), sparse repeat values, bounded velocity.
 * A scripted stream typically lacks tremor (too-smooth) or has a
 * flat/stepwise profile.
 *
 * Client-side signals here are NOT authoritative — they feed a
 * server-side decision later. For now we compute + log.
 */

export type AntiCheatSample = {
  ts: number; // performance.now()
  beta: number; // smoothed beta degrees
};

export type AntiCheatReport = {
  samples: number;
  durationMs: number;
  tremor: number; // std-dev of deltas, higher = more human-like
  repeatRatio: number; // fraction of samples with |delta| < 1e-4 deg
  maxVelocity: number; // max |delta|/ms
  mean: number;
  std: number;
  suspicious: boolean;
  reasons: string[];
};

const REPEAT_EPS = 1e-4;
// Thresholds tuned for typical human hands (conservative):
const MIN_TREMOR = 0.003; // tremor std-dev floor (deg/sample)
const MAX_REPEAT_RATIO = 0.5; // too many zero-delta samples = likely script
const MIN_SAMPLES = 50;

export const buildReport = (samples: AntiCheatSample[]): AntiCheatReport => {
  const reasons: string[] = [];
  if (samples.length < MIN_SAMPLES) {
    return {
      samples: samples.length,
      durationMs: 0,
      tremor: 0,
      repeatRatio: 1,
      maxVelocity: 0,
      mean: 0,
      std: 0,
      suspicious: true,
      reasons: ["too_few_samples"],
    };
  }

  const deltas: number[] = [];
  let maxVel = 0;
  let repeats = 0;
  for (let i = 1; i < samples.length; i++) {
    const dt = Math.max(1, samples[i].ts - samples[i - 1].ts);
    const d = samples[i].beta - samples[i - 1].beta;
    deltas.push(d);
    const vel = Math.abs(d) / dt;
    if (vel > maxVel) maxVel = vel;
    if (Math.abs(d) < REPEAT_EPS) repeats += 1;
  }

  const mean = samples.reduce((a, s) => a + s.beta, 0) / samples.length;
  const variance =
    samples.reduce((a, s) => a + (s.beta - mean) * (s.beta - mean), 0) / samples.length;
  const std = Math.sqrt(variance);

  const dMean = deltas.reduce((a, d) => a + d, 0) / deltas.length;
  const dVar = deltas.reduce((a, d) => a + (d - dMean) * (d - dMean), 0) / deltas.length;
  const tremor = Math.sqrt(dVar);

  const repeatRatio = repeats / deltas.length;

  if (tremor < MIN_TREMOR) reasons.push("too_smooth");
  if (repeatRatio > MAX_REPEAT_RATIO) reasons.push("too_many_repeats");
  // Note: a flat hand isn't inherently suspicious — only dangerous when
  // combined with a high score. Scoring engine can weight accordingly.

  return {
    samples: samples.length,
    durationMs: samples[samples.length - 1].ts - samples[0].ts,
    tremor,
    repeatRatio,
    maxVelocity: maxVel,
    mean,
    std,
    suspicious: reasons.length > 0,
    reasons,
  };
};

export const createCollector = () => {
  const samples: AntiCheatSample[] = [];
  return {
    add(ts: number, beta: number) {
      // Downsample to ~60Hz to cap memory: skip if less than 14ms since last
      if (samples.length && ts - samples[samples.length - 1].ts < 14) return;
      samples.push({ ts, beta });
      // Cap at 2000 samples (20s × 60Hz = 1200 typical, plenty of headroom)
      if (samples.length > 2000) samples.shift();
    },
    samples,
    build() {
      return buildReport(samples);
    },
    reset() {
      samples.length = 0;
    },
  };
};
