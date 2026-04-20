"use client";

/**
 * Tiny WebAudio-based SFX engine. No asset files — every sound is a
 * short synthesized envelope so page weight stays zero.
 *
 * Respects the user's `sound` preference (read at call time, not at
 * construct time, so flipping the setting takes effect immediately).
 */

import { PREF_KEYS } from "./prefs";

let ctx: AudioContext | null = null;
let unlocked = false;

function soundEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem("livewager-pref:" + PREF_KEYS.sound);
    if (raw === null) return true; // default on
    return JSON.parse(raw) === true;
  } catch {
    return true;
  }
}

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  return ctx;
}

/**
 * Some browsers suspend the AudioContext until a user gesture. Call
 * this from the first tap/click to unlock. No-op if already unlocked
 * or if sound is off.
 */
export function unlockAudio() {
  if (unlocked) return;
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") {
    c.resume().catch(() => {
      /* ignore */
    });
  }
  unlocked = true;
}

type Tone = {
  freq: number;
  durMs: number;
  type?: OscillatorType;
  /** Peak gain before envelope. */
  gain?: number;
  /** Frequency sweep target by end of tone (for clicks → thunks). */
  freqTo?: number;
};

function playTone({ freq, durMs, type = "sine", gain = 0.14, freqTo }: Tone) {
  if (!soundEnabled()) return;
  const c = getCtx();
  if (!c) return;
  const now = c.currentTime;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (freqTo !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(20, freqTo),
      now + durMs / 1000,
    );
  }
  // Short AD envelope: 4ms attack, exp decay.
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(gain, now + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, now + durMs / 1000);
  osc.connect(g).connect(c.destination);
  osc.start(now);
  osc.stop(now + durMs / 1000 + 0.02);
}

export const sfx = {
  /** Generic tap/lock — short muted thunk. */
  lock() {
    playTone({ freq: 420, freqTo: 260, durMs: 120, type: "triangle", gain: 0.16 });
  },
  /** Perfect stack — bright two-note chirp. */
  perfect() {
    playTone({ freq: 880, durMs: 90, type: "sine", gain: 0.12 });
    setTimeout(
      () => playTone({ freq: 1320, durMs: 140, type: "sine", gain: 0.12 }),
      70,
    );
  },
  /** Game over — descending sawtooth sigh. */
  over() {
    playTone({ freq: 440, freqTo: 110, durMs: 380, type: "sawtooth", gain: 0.14 });
  },
  /** Win / top floor — rising triad. */
  win() {
    playTone({ freq: 660, durMs: 110, type: "sine", gain: 0.12 });
    setTimeout(
      () => playTone({ freq: 880, durMs: 110, type: "sine", gain: 0.12 }),
      95,
    );
    setTimeout(
      () => playTone({ freq: 1320, durMs: 220, type: "sine", gain: 0.14 }),
      200,
    );
  },
  /** UI confirm / toast-style ping. */
  ping() {
    playTone({ freq: 1100, durMs: 70, type: "sine", gain: 0.08 });
  },
};
