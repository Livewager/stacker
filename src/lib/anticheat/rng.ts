"use client";

/**
 * Deterministic RNG for Stacker rounds.
 *
 * Design
 *  - Uses splitmix32: tiny, deterministic, fast, no external dep.
 *  - Seed is captured at round start so the entire round is
 *    reproducible from (seed, transcript). This lets the future
 *    ANTICHEAT-T1 server replay verify that the sequence of spawn
 *    randomizations matches what the client claims.
 *  - randomSeed() generates a 32-bit unsigned seed from
 *    crypto.getRandomValues() when available, falling back to
 *    Math.random() on ancient browsers.
 *
 * The splitmix32 implementation below is a straightforward TS port of
 * the classic mulberry-style mixer. Good enough for game-surface RNG
 * — NOT for cryptography.
 */

export type SeededRng = {
  /** Returns a uint32 in [0, 2^32). */
  nextU32: () => number;
  /** Returns a float in [0, 1). */
  next: () => number;
  /** Returns true with probability 0.5, using one uint32. */
  coin: () => boolean;
  /** The seed used to initialize — exposed so transcript can persist it. */
  readonly seed: number;
};

export function randomSeed(): number {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] >>> 0;
  }
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}

export function createRng(seed: number): SeededRng {
  let state = seed >>> 0;
  function nextU32(): number {
    // splitmix32 — 32-bit variant of Sebastiano Vigna's splitmix
    state = (state + 0x9e3779b9) >>> 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    z = (z ^ (z >>> 16)) >>> 0;
    return z;
  }
  function next(): number {
    return nextU32() / 0x100000000;
  }
  function coin(): boolean {
    return (nextU32() & 1) === 1;
  }
  return { nextU32, next, coin, seed: seed >>> 0 };
}
