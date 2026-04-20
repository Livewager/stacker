"use client";

/**
 * Reusable recent-activity feed. Pulls the ICRC-3 block log from the
 * points_ledger canister, filters to events that involve `principal`
 * (as sender / recipient / spender), and renders them newest-first.
 *
 * Designed to work on the /account and /wallet pages. When
 * `principal` is empty (signed-out), falls back to showing the last
 * N ledger events regardless — useful as a "network activity" strip.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  decodeBlock,
  eventInvolvesOwner,
  formatLWP,
  pointsLedger,
  relTimeFromNs,
  type BlockEvent,
  type BlockEventKind,
} from "@/lib/icp";
import { Principal } from "@dfinity/principal";

export interface ActivityFeedProps {
  principal?: string;
  /** Max events to show. */
  limit?: number;
  /** Poll the chain every N ms. 0 disables polling. Default 8000. */
  pollMs?: number;
  /** Compact mode for narrow sidebar layouts. */
  compact?: boolean;
  /** Title override. */
  title?: string;
}

export default function ActivityFeed({
  principal,
  limit = 12,
  pollMs = 8000,
  compact = false,
  title,
}: ActivityFeedProps) {
  const [events, setEvents] = useState<BlockEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);

  const ownerBytes = useMemo<Uint8Array | null>(() => {
    if (!principal) return null;
    try {
      return Principal.fromText(principal).toUint8Array();
    } catch {
      return null;
    }
  }, [principal]);

  const load = useCallback(async () => {
    try {
      const ledger = await pointsLedger();
      const len = await ledger.icrc3_log_length();
      const total = Number(len);
      if (!total) {
        if (mounted.current) setEvents([]);
        return;
      }
      // Fetch the last 100 blocks (hard cap — canister also caps at 1000).
      const windowSize = Math.min(100, total);
      const start = BigInt(total - windowSize);
      const res = await ledger.icrc3_get_blocks([
        { start, length: BigInt(windowSize) },
      ]);
      const decoded: BlockEvent[] = [];
      for (const b of res.blocks) {
        const e = decodeBlock(b);
        if (!e) continue;
        if (ownerBytes && !eventInvolvesOwner(e, ownerBytes)) continue;
        decoded.push(e);
      }
      decoded.sort((a, b) => Number(b.txId - a.txId));
      if (mounted.current) setEvents(decoded.slice(0, limit));
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    }
  }, [limit, ownerBytes]);

  // Click-driven refresh: shows the spinner for the full request duration
  // (but never less than 450ms so a fast local replica still registers
  // as "something happened"). Poll-driven load() calls don't trigger the
  // spinner — they'd flash it constantly.
  const manualRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    const minDurationMs = 450;
    const started = Date.now();
    try {
      await load();
    } finally {
      const elapsed = Date.now() - started;
      const remaining = Math.max(0, minDurationMs - elapsed);
      window.setTimeout(() => {
        if (mounted.current) setRefreshing(false);
      }, remaining);
    }
  }, [load, refreshing]);

  useEffect(() => {
    mounted.current = true;
    load();
    if (pollMs <= 0) return () => { mounted.current = false; };
    const id = window.setInterval(load, pollMs);
    return () => {
      mounted.current = false;
      window.clearInterval(id);
    };
  }, [load, pollMs]);

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <div className="text-[10px] uppercase tracking-widest text-cyan-300">
          {title ?? (principal ? "Your Activity" : "Recent Ledger Activity")}
        </div>
        <button
          onClick={manualRefresh}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-gray-400 hover:text-cyan-300 transition disabled:opacity-60 disabled:cursor-wait"
          aria-label="Refresh activity"
          aria-busy={refreshing}
        >
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`}
            aria-hidden
          >
            <path d="M4 4a1 1 0 0 1 1 1v1.6A7 7 0 1 1 3 10a1 1 0 1 1 2 0 5 5 0 1 0 1.6-3.67L5.7 7H8a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
          </svg>
          {refreshing ? "Refreshing" : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="px-4 py-3 text-xs text-red-300 bg-red-500/5 border-t border-red-500/20">
          Couldn&apos;t read the ledger: {error}. Is the local replica running?
        </div>
      )}

      {events === null ? (
        <ActivitySkeleton rows={4} compact={compact} />
      ) : events.length === 0 ? (
        <EmptyState principal={!!principal} />
      ) : (
        <ul className={compact ? "divide-y divide-white/5" : "divide-y divide-white/5"}>
          {events.map((e) => (
            <li key={`${e.txId}-${e.kind}`} className="px-4 py-3">
              <ActivityRow event={e} compact={compact} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ------------------------------------------------------------------
// Row
// ------------------------------------------------------------------

function ActivityRow({ event, compact }: { event: BlockEvent; compact: boolean }) {
  const icon = iconFor(event.kind);
  const tone = toneFor(event.kind);
  return (
    <div className="flex items-start gap-3">
      <div
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
        style={{ background: tone.bg, color: tone.fg }}
        aria-hidden
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <div className={`font-semibold ${compact ? "text-sm" : "text-sm md:text-base"} text-white`}>
            {titleFor(event)}
          </div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-gray-500 shrink-0">
            #{event.txId.toString()}
          </div>
        </div>
        <div className="flex items-baseline justify-between gap-2 mt-0.5">
          <div className="text-[11px] text-gray-400">{relTimeFromNs(event.tsNs)}</div>
          <div className="font-mono tabular-nums text-sm" style={{ color: tone.fg }}>
            {signFor(event)}
            {formatLWP(event.amount, 4)} <span className="text-gray-500 text-[10px]">LWP</span>
          </div>
        </div>
        {event.memo && (
          <div
            className="mt-1 text-[11px] text-gray-400 font-mono truncate"
            title={event.memo}
          >
            “{event.memo}”
          </div>
        )}
      </div>
    </div>
  );
}

function titleFor(e: BlockEvent): string {
  switch (e.kind) {
    case "mint":
      return "Credit received";
    case "burn":
      return "Burned";
    case "transfer":
      return "Transfer";
    case "transfer_from":
      return "Allowance transfer";
    case "approve":
      return "Approval set";
    default:
      return "Ledger event";
  }
}

function signFor(e: BlockEvent): string {
  if (e.kind === "mint") return "+";
  if (e.kind === "burn") return "−";
  // Transfers: sign depends on whether you're the sender or recipient.
  // Without principal context here, leave neutral.
  return "";
}

function toneFor(kind: BlockEventKind): { bg: string; fg: string } {
  switch (kind) {
    case "mint":
      return { bg: "rgba(34,211,238,0.12)", fg: "#22d3ee" };
    case "burn":
      return { bg: "rgba(249,115,22,0.12)", fg: "#f97316" };
    case "transfer":
    case "transfer_from":
      return { bg: "rgba(139,92,246,0.12)", fg: "#a78bfa" };
    case "approve":
      return { bg: "rgba(250,204,21,0.12)", fg: "#facc15" };
    default:
      return { bg: "rgba(255,255,255,0.08)", fg: "#e5e7eb" };
  }
}

function iconFor(kind: BlockEventKind): React.ReactNode {
  // Inline SVGs keep the component dep-free.
  switch (kind) {
    case "mint":
      return (
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
          <path d="M10 3a1 1 0 0 1 1 1v5h5a1 1 0 1 1 0 2h-5v5a1 1 0 1 1-2 0v-5H4a1 1 0 1 1 0-2h5V4a1 1 0 0 1 1-1Z" />
        </svg>
      );
    case "burn":
      return (
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
          <path d="M4 10a1 1 0 0 1 1-1h10a1 1 0 1 1 0 2H5a1 1 0 0 1-1-1Z" />
        </svg>
      );
    case "transfer":
    case "transfer_from":
      return (
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
          <path d="M3 10a1 1 0 0 1 1-1h9.586L10.293 5.707a1 1 0 1 1 1.414-1.414l5 5a1 1 0 0 1 0 1.414l-5 5a1 1 0 1 1-1.414-1.414L13.586 11H4a1 1 0 0 1-1-1Z" />
        </svg>
      );
    case "approve":
      return (
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
          <path d="M16.707 5.293a1 1 0 0 1 0 1.414l-7.5 7.5a1 1 0 0 1-1.414 0l-3.5-3.5a1 1 0 1 1 1.414-1.414L8.5 12.086l6.793-6.793a1 1 0 0 1 1.414 0Z" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
          <circle cx="10" cy="10" r="3" />
        </svg>
      );
  }
}

// ------------------------------------------------------------------
// States
// ------------------------------------------------------------------

function ActivitySkeleton({ rows = 4, compact }: { rows?: number; compact: boolean }) {
  return (
    <ul className="divide-y divide-white/5" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-white/5 animate-pulse" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-3 w-1/3 rounded bg-white/5 animate-pulse" />
              <div className="h-3 w-1/4 rounded bg-white/5 animate-pulse" />
            </div>
            {!compact && <div className="h-4 w-16 rounded bg-white/5 animate-pulse" />}
          </div>
        </li>
      ))}
    </ul>
  );
}

function EmptyState({ principal }: { principal: boolean }) {
  return (
    <div className="px-6 py-10 text-center">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-cyan-300">
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
          <path d="M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm1 4a1 1 0 1 0-2 0v5a1 1 0 0 0 .293.707l3 3a1 1 0 0 0 1.414-1.414L11 10.586V6Z" />
        </svg>
      </div>
      <div className="text-sm text-white font-semibold mb-1">
        {principal ? "No activity yet" : "Ledger is idle"}
      </div>
      <div className="text-xs text-gray-400 max-w-xs mx-auto leading-snug">
        {principal
          ? "Your buys, deposits, and transfers will show up here."
          : "Once a wallet starts transacting, events will appear here."}
      </div>
    </div>
  );
}
