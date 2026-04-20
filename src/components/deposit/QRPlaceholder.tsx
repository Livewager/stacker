"use client";

/**
 * Tiny dependency-free "QR-like" grid. Intentionally NOT a real QR —
 * we label it DEMO and don't want anyone scanning a fake address. It
 * just gives the deposit card visual weight where a real QR will go.
 *
 * Pattern is deterministic off `seed` so the same principal/address
 * always renders the same square.
 */

import { useMemo } from "react";

export function QRPlaceholder({
  seed,
  size = 192,
  className = "",
}: {
  seed: string;
  size?: number;
  className?: string;
}) {
  const grid = useMemo(() => build(seed), [seed]);
  const cells = 25;
  const cell = size / cells;
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      aria-hidden
      className={className}
      role="presentation"
    >
      <rect x="0" y="0" width={size} height={size} fill="#020b18" rx="8" />
      {grid.map((row, y) =>
        row.map((on, x) =>
          on ? (
            <rect
              key={`${x}-${y}`}
              x={x * cell}
              y={y * cell}
              width={cell * 0.92}
              height={cell * 0.92}
              rx={cell * 0.18}
              fill="#e6f7fb"
              opacity={0.92}
            />
          ) : null,
        ),
      )}
      {/* Three anchor squares top-left, top-right, bottom-left (classic QR finder pattern). */}
      <FinderSquare x={0} y={0} cell={cell} />
      <FinderSquare x={cell * (cells - 7)} y={0} cell={cell} />
      <FinderSquare x={0} y={cell * (cells - 7)} cell={cell} />
    </svg>
  );
}

function FinderSquare({ x, y, cell }: { x: number; y: number; cell: number }) {
  return (
    <g>
      <rect x={x} y={y} width={cell * 7} height={cell * 7} rx={cell * 0.5} fill="#020b18" />
      <rect
        x={x + cell * 0.5}
        y={y + cell * 0.5}
        width={cell * 6}
        height={cell * 6}
        rx={cell * 0.4}
        fill="#22d3ee"
      />
      <rect
        x={x + cell * 1.2}
        y={y + cell * 1.2}
        width={cell * 4.6}
        height={cell * 4.6}
        rx={cell * 0.35}
        fill="#020b18"
      />
      <rect
        x={x + cell * 2}
        y={y + cell * 2}
        width={cell * 3}
        height={cell * 3}
        rx={cell * 0.25}
        fill="#22d3ee"
      />
    </g>
  );
}

/** Deterministic 25×25 grid derived from the seed. */
function build(seed: string): boolean[][] {
  const rng = xmur3(seed);
  const rand = mulberry32(rng());
  const n = 25;
  const g: boolean[][] = Array.from({ length: n }, () => Array(n).fill(false));
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      // Skip finder-pattern zones so we don't double-draw.
      const inFinder =
        (x < 8 && y < 8) ||
        (x > n - 9 && y < 8) ||
        (x < 8 && y > n - 9);
      if (inFinder) continue;
      g[y][x] = rand() > 0.55;
    }
  }
  return g;
}

// Small deterministic PRNG combo (Mulberry32 + xmur3).
function xmur3(str: string) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}
function mulberry32(a: number) {
  return () => {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
