"use client";

/**
 * Tiny balance-over-time sparkline derived from the ICRC-3 block log.
 * Walks the last ~200 events oldest→newest, summing deltas for the
 * signed-in principal, and draws an SVG polyline of the running
 * balance. No new canister call beyond the one ActivityFeed already
 * fires — we re-fetch here because the feed may be compact/paginated
 * differently; the extra call is acceptable for a once-on-mount
 * visualization.
 *
 * Renders nothing when:
 *   - no principal (signed out)
 *   - fewer than 2 events (not enough line to draw)
 *   - ledger call errors (silent)
 */

import { useEffect, useState } from "react";
import { Principal } from "@dfinity/principal";
import {
  decodeBlock,
  eventInvolvesOwner,
  pointsLedger,
} from "@/lib/icp";
import type { BlockEvent } from "@/lib/icp";

type Point = { ts: number; balance: number };

// Compare two principal byte buffers for equality. Principal fromText
// produces a Uint8Array so === won't work.
function sameBytes(a: Uint8Array, b?: Uint8Array): boolean {
  if (!b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function deriveSeries(events: BlockEvent[], ownerBytes: Uint8Array): Point[] {
  // Events arrive newest-first from ActivityFeed semantics. Reverse
  // to walk chronologically.
  const oldest = events.slice().sort((a, b) => Number(a.txId - b.txId));
  let bal = 0n;
  const points: Point[] = [];
  for (const e of oldest) {
    const amount = e.amount;
    const fee = e.fee ?? 0n;
    switch (e.kind) {
      case "mint":
        if (sameBytes(ownerBytes, e.to?.ownerBytes)) bal += amount;
        break;
      case "burn":
        if (sameBytes(ownerBytes, e.from?.ownerBytes)) bal -= amount;
        break;
      case "transfer":
      case "transfer_from":
        if (sameBytes(ownerBytes, e.from?.ownerBytes)) bal -= amount + fee;
        if (sameBytes(ownerBytes, e.to?.ownerBytes)) bal += amount;
        break;
      case "approve":
      case "unknown":
        // Approvals don't move balance; skip the point.
        continue;
    }
    points.push({ ts: Number(e.tsNs / 1_000_000n), balance: Number(bal) / 1e8 });
  }
  return points;
}

export function BalanceSparkline({ principal }: { principal: string }) {
  const [points, setPoints] = useState<Point[] | null>(null);

  useEffect(() => {
    if (!principal) {
      setPoints(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const ownerBytes = Principal.fromText(principal).toUint8Array();
        const ledger = await pointsLedger();
        const len = await ledger.icrc3_log_length();
        const total = Number(len);
        if (!total) {
          if (!cancelled) setPoints([]);
          return;
        }
        const windowSize = Math.min(200, total);
        const start = BigInt(total - windowSize);
        const res = await ledger.icrc3_get_blocks([
          { start, length: BigInt(windowSize) },
        ]);
        const mine: BlockEvent[] = [];
        for (const b of res.blocks) {
          const e = decodeBlock(b);
          if (!e) continue;
          if (!eventInvolvesOwner(e, ownerBytes)) continue;
          mine.push(e);
        }
        if (cancelled) return;
        setPoints(deriveSeries(mine, ownerBytes));
      } catch {
        if (!cancelled) setPoints([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [principal]);

  if (!points || points.length < 2) return null;

  // Normalize to 0..1 against the series min/max so the curve fills
  // the box, with a small pad so flatlines still read.
  const ys = points.map((p) => p.balance);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const range = maxY - minY || 1;
  const W = 160;
  const H = 36;
  const d = points
    .map((p, i) => {
      const x = (i / Math.max(1, points.length - 1)) * W;
      const y = H - ((p.balance - minY) / range) * (H - 4) - 2;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  // Last-point dot and a subtle area fill for depth.
  const last = points[points.length - 1];
  const lastX = W;
  const lastY = H - ((last.balance - minY) / range) * (H - 4) - 2;
  const areaD = `${d} L ${W} ${H} L 0 ${H} Z`;

  const tone = last.balance >= points[0].balance ? "#22d3ee" : "#fda4af";

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      className="block"
      aria-label={`Balance trend across ${points.length} events`}
      role="img"
    >
      <defs>
        <linearGradient id="bal-spark-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={tone} stopOpacity={0.35} />
          <stop offset="100%" stopColor={tone} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaD} fill="url(#bal-spark-fill)" />
      <path
        d={d}
        fill="none"
        stroke={tone}
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lastX} cy={lastY} r={1.8} fill={tone} />
    </svg>
  );
}
