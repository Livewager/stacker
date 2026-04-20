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

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Principal } from "@dfinity/principal";
import {
  decodeBlock,
  eventInvolvesOwner,
  pointsLedger,
} from "@/lib/icp";
import type { BlockEvent } from "@/lib/icp";
import { useReducedMotion } from "@/lib/hooks/useReducedMotion";
import { usePrefs } from "@/lib/prefs";

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

  return <SparklineSvg points={points} />;
}

// Split the render into a subcomponent so hover state + refs don't
// churn when the ledger effect is still resolving. The subcomponent
// only mounts once there are points to draw, so its hooks can safely
// assume `points.length >= 2`.
function SparklineSvg({ points }: { points: Point[] | null }) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const tooltipId = useId();
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  // Tracks whether the current tip is pinned by a touch gesture.
  // When true, a tap outside the svg (document-level listener below)
  // dismisses it. Mouse pointers never set this — their dismissal
  // path is pointerleave on the svg itself.
  const [touchPinned, setTouchPinned] = useState(false);

  useEffect(() => {
    if (!touchPinned) return;
    const onDocDown = (e: PointerEvent) => {
      const el = svgRef.current;
      if (!el) return;
      if (e.target instanceof Node && el.contains(e.target)) return;
      setHoverIdx(null);
      setTouchPinned(false);
    };
    document.addEventListener("pointerdown", onDocDown);
    return () => document.removeEventListener("pointerdown", onDocDown);
  }, [touchPinned]);

  const ys = useMemo(() => (points ?? []).map((p) => p.balance), [points]);
  const minY = ys.length ? Math.min(...ys) : 0;
  const maxY = ys.length ? Math.max(...ys) : 1;
  const range = maxY - minY || 1;
  const W = 160;
  const H = 36;

  // Draw-on entrance (POLISH-255 — mirrors /leaderboard RowSparkline).
  // Stroke-dasharray/pathLength animates the outline on first paint,
  // and the area fill fades in on the same curve. Reduced-motion jumps
  // to the final state: systemReduced OR userReduced freezes the
  // animation (transition: none) and renders the final rendered state
  // from the first frame. Per-row stagger isn't needed here — this is
  // a single sparkline, not a board.
  const systemReduced = useReducedMotion();
  const { reducedMotion: userReduced } = usePrefs();
  const reduced = systemReduced || userReduced;
  const [drawn, setDrawn] = useState(reduced);
  useEffect(() => {
    if (reduced) {
      setDrawn(true);
      return;
    }
    // rAF ensures the "undrawn" frame paints first so the browser has
    // a before-state to animate from; without it the path can ship
    // fully drawn on initial mount in some Safari/Firefox paths.
    const id = window.requestAnimationFrame(() => setDrawn(true));
    return () => window.cancelAnimationFrame(id);
  }, [reduced, points]);

  // Pre-computed x/y per point — both for the polyline path and the
  // hover-snap math. One pass, no recompute on hover.
  const plotted = useMemo(() => {
    if (!points) return [] as Array<{ x: number; y: number; p: Point }>;
    return points.map((p, i) => ({
      x: (i / Math.max(1, points.length - 1)) * W,
      y: H - ((p.balance - minY) / range) * (H - 4) - 2,
      p,
    }));
  }, [points, minY, range]);

  if (!points || points.length < 2) return null;

  const d = plotted
    .map((pt, i) => `${i === 0 ? "M" : "L"} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
    .join(" ");
  const last = plotted[plotted.length - 1];
  const areaD = `${d} L ${W} ${H} L 0 ${H} Z`;
  const tone = last.p.balance >= plotted[0].p.balance ? "#22d3ee" : "#fda4af";

  // Convert a client x into the nearest plotted index. We use the svg
  // bounding box rather than viewBox-transformed pointer coords because
  // the svg renders at fixed 160×36 CSS size, making the ratio direct.
  function indexFromClientX(clientX: number): number {
    const el = svgRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0) return 0;
    const ratio = (clientX - rect.left) / rect.width;
    const clamped = Math.min(1, Math.max(0, ratio));
    const idx = Math.round(clamped * (plotted.length - 1));
    return Math.max(0, Math.min(plotted.length - 1, idx));
  }

  const hovered = hoverIdx !== null ? plotted[hoverIdx] : null;
  // Anchor the tooltip to the hovered point; keep it inside the svg
  // box horizontally (small chance the left/right edge clips otherwise).
  const tipW = 86;
  const rawTipX = hovered ? hovered.x - tipW / 2 : 0;
  const tipX = hovered
    ? Math.max(0, Math.min(W - tipW, rawTipX))
    : 0;
  const tipAbove = hovered ? hovered.y > H / 2 : true;
  const tipY = hovered ? (tipAbove ? hovered.y - 20 : hovered.y + 6) : 0;

  const tipText = hovered
    ? `${hovered.p.balance.toFixed(2)} LWP · ${new Date(hovered.p.ts).toLocaleDateString(
        undefined,
        { month: "short", day: "numeric" },
      )}`
    : "";

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/40 rounded"
      aria-label={`Balance trend across ${points.length} events. Arrow keys to inspect points.`}
      aria-describedby={hovered ? tooltipId : undefined}
      role="img"
      tabIndex={0}
      // touch-action: none lets a finger drag along the svg produce
      // pointermove events (otherwise the browser claims the gesture
      // for page scroll on first y-axis drift and no further moves
      // fire). The svg is 36px tall and sits in a card, so
      // sacrificing vertical scroll *while the finger is on the svg*
      // is fine — the user can still scroll the page by starting
      // the gesture outside it.
      style={{ touchAction: "none" }}
      onPointerDown={(e) => {
        // Touch UX: tap-to-pin. On release (pointerup) we keep the
        // pin; pointerleave is ignored for touch so releasing doesn't
        // immediately dismiss. Mouse UX is unchanged — hover-follow.
        // Capture the pointer so the svg keeps receiving moves even
        // if the finger drags slightly outside the 160×36 box.
        if (e.pointerType === "touch") {
          try {
            (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
          } catch {
            /* older Safari may throw; the capture is best-effort */
          }
          setHoverIdx(indexFromClientX(e.clientX));
          setTouchPinned(true);
        }
      }}
      onPointerMove={(e) => setHoverIdx(indexFromClientX(e.clientX))}
      onPointerLeave={(e) => {
        // Mouse-leave dismisses; touch-release does not (the pin
        // survives until the user taps outside or presses Escape
        // via the keyboard fallback). Matches the common mobile-
        // chart pattern used by Robinhood / Google Finance.
        if (e.pointerType !== "touch") setHoverIdx(null);
      }}
      onFocus={() => setHoverIdx(plotted.length - 1)}
      onBlur={() => setHoverIdx(null)}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          const step = e.key === "ArrowLeft" ? -1 : 1;
          setHoverIdx((i) => {
            const base = i ?? plotted.length - 1;
            return Math.max(0, Math.min(plotted.length - 1, base + step));
          });
        } else if (e.key === "Home") {
          e.preventDefault();
          setHoverIdx(0);
        } else if (e.key === "End") {
          e.preventDefault();
          setHoverIdx(plotted.length - 1);
        } else if (e.key === "Escape") {
          setHoverIdx(null);
          setTouchPinned(false);
          (e.currentTarget as SVGSVGElement).blur();
        }
      }}
    >
      <defs>
        <linearGradient id="bal-spark-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={tone} stopOpacity={0.35} />
          <stop offset="100%" stopColor={tone} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path
        d={areaD}
        fill="url(#bal-spark-fill)"
        opacity={drawn ? 1 : 0}
        style={{
          transition: reduced ? "none" : "opacity 620ms ease-out 80ms",
        }}
      />
      <path
        d={d}
        fill="none"
        stroke={tone}
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={drawn ? 0 : 1}
        style={{
          transition: reduced ? "none" : "stroke-dashoffset 620ms ease-out",
        }}
      />
      <circle cx={last.x} cy={last.y} r={1.8} fill={tone} />
      {hovered && (
        <g aria-hidden>
          <line
            x1={hovered.x}
            x2={hovered.x}
            y1={0}
            y2={H}
            stroke={tone}
            strokeOpacity={0.25}
            strokeWidth={1}
          />
          <circle
            cx={hovered.x}
            cy={hovered.y}
            r={2.6}
            fill="#0a0a0a"
            stroke={tone}
            strokeWidth={1.2}
          />
          <g transform={`translate(${tipX} ${tipY})`}>
            <rect
              width={tipW}
              height={14}
              rx={3}
              fill="#0a0a0a"
              stroke={tone}
              strokeOpacity={0.4}
              strokeWidth={0.8}
            />
            <text
              x={tipW / 2}
              y={10}
              textAnchor="middle"
              fontSize={9}
              fill="#f4f4f5"
              fontFamily="ui-sans-serif, system-ui"
            >
              {tipText}
            </text>
          </g>
        </g>
      )}
      {hovered && (
        <desc id={tooltipId}>{tipText}</desc>
      )}
    </svg>
  );
}
