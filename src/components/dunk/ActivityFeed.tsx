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

import Link from "next/link";
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
import { useCopyable } from "@/lib/clipboard";
import { useLocalPref, PREF_KEYS } from "@/lib/prefs";
import { ROUTES } from "@/lib/routes";

type ActivityFilter = "all" | "mint" | "burn" | "transfer" | "approve";
const FILTERS: { key: ActivityFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "mint", label: "Mint" },
  { key: "burn", label: "Burn" },
  { key: "transfer", label: "Transfer" },
  { key: "approve", label: "Approve" },
];
function narrowFilter(v: string): ActivityFilter {
  return v === "mint" || v === "burn" || v === "transfer" || v === "approve"
    ? v
    : "all";
}

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
  // Pagination: start with the caller-provided `limit`, bump by
  // SHOW_MORE_STEP each "Show more" click. load() fetches the full
  // decode window (up to 100) regardless — pagination is a render
  // cap, not a refetch — so expanding is instant.
  const [shown, setShown] = useState(limit);
  const SHOW_MORE_STEP = 20;
  // Re-sync shown to limit when the caller changes it (e.g. switching
  // between /account and /wallet which pass different limits).
  useEffect(() => {
    setShown(limit);
  }, [limit]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [rawFilter, setRawFilter] = useLocalPref<ActivityFilter>(
    PREF_KEYS.activityFilter,
    "all",
  );
  const filter = narrowFilter(rawFilter);
  const mounted = useRef(true);

  // Filtered view of the fetched events. Applied client-side so the
  // fetch cost doesn't change when the user flips pills — the canister
  // still returns the full window; we just render a subset.
  const filteredEvents = useMemo(() => {
    if (!events) return null;
    if (filter === "all") return events;
    return events.filter((e) => e.kind === filter);
  }, [events, filter]);
  // Pagination applies AFTER filter so "Show more" advances the
  // visible slice within the currently-selected kind.
  const visibleEvents = useMemo(() => {
    if (!filteredEvents) return null;
    return filteredEvents.slice(0, shown);
  }, [filteredEvents, shown]);
  const hasMore = !!filteredEvents && filteredEvents.length > shown;

  // Memoize the principal → Uint8Array conversion so eventInvolvesOwner()
  // doesn't re-parse per-event or per-poll. Runs exactly once per
  // principal-prop change (typically once per mount).
  //
  // Perf note (POLISH-242): measured Principal.fromText + toUint8Array
  // at ~1μs/call; even without this memo the 8s poll cadence × a few
  // filter passes would sit at single-digit microseconds/sec. The
  // memo is correctness hygiene (predictable identity, no per-render
  // allocation churn), not a perf optimization — pinned here so a
  // future refactor doesn't "un-memoize" thinking it's cheap enough
  // to inline. It is cheap; the identity stability matters more.
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
      // Keep the full decoded window in state; the render layer
      // slices to `shown`. Lets "Show more" expand instantly
      // without another canister round-trip.
      if (mounted.current) {
        setEvents(decoded);
        // POLISH-370 — clear a stale error banner once a fetch
        // succeeds. Without this, a user who saw one transient
        // canister failure continues to see the red "couldn't
        // read the ledger" row even after a successful 8s poll
        // silently refreshed `events`. The banner should follow
        // the last outcome, not sticky-latch the worst.
        setError(null);
      }
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    }
  }, [ownerBytes]);

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

      {/* Filter pills — hidden in compact (sidebar) mode where the
          horizontal space is tight, and hidden while events are null
          (skeleton state) so flipping pills doesn't race with the
          initial load. */}
      {!compact && events !== null && events.length > 0 && (
        <div
          role="tablist"
          aria-label="Activity filter"
          className="flex items-center gap-1.5 px-4 py-2 border-b border-white/5 overflow-x-auto"
        >
          {FILTERS.map((f) => {
            const active = filter === f.key;
            // Count per-bucket so empty filters look empty at a glance.
            const count =
              f.key === "all"
                ? events.length
                : events.filter((e) => e.kind === f.key).length;
            return (
              <button
                key={f.key}
                role="tab"
                aria-selected={active}
                onClick={() => setRawFilter(f.key)}
                className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60 ${
                  active
                    ? "border-cyan-300/40 bg-cyan-300/[0.08] text-cyan-200"
                    : "border-white/10 bg-white/[0.02] text-gray-400 hover:text-white hover:border-white/25"
                }`}
              >
                {f.label}
                <span className={`font-mono tabular-nums ${active ? "text-cyan-100" : "text-gray-500"}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {error && (
        // POLISH-370 — surfaces an inline Retry next to the error copy
        // so the user doesn't have to find the separate header refresh.
        // Reuses manualRefresh so the spinner + min-duration UX matches
        // the header button; clearing `error` on success (inside load)
        // auto-dismisses this row when the retry lands. role="status"
        // so screen readers announce the error without a second polite
        // announcement layer (the red bar is visually the alert; the
        // announcement follows from this container, not from an
        // aria-live elsewhere).
        <div
          role="status"
          className="flex items-center justify-between gap-3 px-4 py-3 text-xs text-red-300 bg-red-500/5 border-t border-red-500/20"
        >
          <span className="min-w-0">
            Couldn&apos;t read the ledger: {error}. Is the local replica
            running?
          </span>
          <button
            type="button"
            onClick={manualRefresh}
            disabled={refreshing}
            className="shrink-0 rounded-md border border-red-400/40 bg-red-500/10 px-2.5 py-1 text-[10px] uppercase tracking-widest text-red-100 hover:bg-red-500/20 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300/60 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {refreshing ? "Retrying" : "Retry"}
          </button>
        </div>
      )}

      {events === null ? (
        <ActivitySkeleton rows={4} compact={compact} />
      ) : visibleEvents === null || visibleEvents.length === 0 ? (
        events.length === 0 ? (
          <EmptyState principal={!!principal} />
        ) : (
          <FilteredEmpty
            filterLabel={FILTERS.find((f) => f.key === filter)?.label ?? filter}
            onClear={() => setRawFilter("all")}
          />
        )
      ) : (
        <>
          <GroupedEvents events={visibleEvents} compact={compact} />
          {/* Show-more pagination. Render cap only — load() already
              fetched the full decoded window, so clicking expands
              without another canister round-trip. Count reflects the
              currently-filtered rows, not the raw fetch length, so
              the hint stays accurate under a kind filter. */}
          {hasMore && (
            <div className="border-t border-white/5 px-4 py-3 flex items-center justify-between gap-3">
              <span className="text-[10px] font-mono uppercase tracking-widest text-gray-500">
                Showing {visibleEvents.length} of {filteredEvents!.length}
              </span>
              <button
                type="button"
                onClick={() => setShown((n) => n + SHOW_MORE_STEP)}
                className="rounded-md border border-white/15 px-3 py-1.5 text-[11px] uppercase tracking-widest text-gray-200 hover:text-white hover:border-white/30 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60"
                aria-label={`Show ${SHOW_MORE_STEP} more activity entries`}
              >
                Show more
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Shown when the feed has events but the active filter matches none
 *  of them. Distinguishes "no activity" from "no matching activity"
 *  — different fix (sign in / play a round vs. flip the filter).
 *
 *  Receives the user-facing pill label ("Mint" / "Transfer" / …), not
 *  the internal filter key, so the copy reads naturally. The icon
 *  mirrors the filter-funnel affordance used on the pills themselves,
 *  so a glance at the empty state reads as "something is filtered."
 */
function FilteredEmpty({
  filterLabel,
  onClear,
}: {
  filterLabel: string;
  onClear: () => void;
}) {
  return (
    <div className="px-6 py-10 flex flex-col items-center text-center gap-3">
      <span
        aria-hidden
        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-gray-500"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
          <path d="M3 4a1 1 0 0 1 1-1h12a1 1 0 0 1 .8 1.6l-4.8 6.4V16a1 1 0 0 1-.447.832l-2 1.333A1 1 0 0 1 8 17.333V11L3.2 4.6A1 1 0 0 1 3 4Z" />
        </svg>
      </span>
      <div className="text-sm text-gray-300">
        No <span className="text-white font-semibold">{filterLabel}</span>{" "}
        events in the last window.
      </div>
      <button
        type="button"
        onClick={onClear}
        className="text-[11px] uppercase tracking-widest text-cyan-300 hover:text-cyan-200 border border-white/10 hover:border-cyan-300/40 rounded-md px-3 py-1.5 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60"
      >
        Show all activity
      </button>
    </div>
  );
}

// ------------------------------------------------------------------
// Day-grouped list — "Today" / "Yesterday" / dated sticky headers
// ------------------------------------------------------------------

function dayKeyFromNs(tsNs: bigint): string {
  // Local-date key so day boundaries match the user's timezone, not UTC.
  const d = new Date(Number(tsNs / 1_000_000n));
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function dayLabel(tsNs: bigint): string {
  const d = new Date(Number(tsNs / 1_000_000n));
  const now = new Date();
  const dayMs = 24 * 60 * 60 * 1000;
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const thenDayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((dayStart - thenDayStart) / dayMs);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString(undefined, { weekday: "long" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function GroupedEvents({
  events,
  compact,
}: {
  events: BlockEvent[];
  compact: boolean;
}) {
  // Preserve order (events arrive newest-first); group by local day
  // key. Each group keeps its internal sort.
  const groups: { key: string; label: string; items: BlockEvent[] }[] = [];
  for (const e of events) {
    const key = dayKeyFromNs(e.tsNs);
    const head = groups[groups.length - 1];
    if (head && head.key === key) {
      head.items.push(e);
    } else {
      groups.push({ key, label: dayLabel(e.tsNs), items: [e] });
    }
  }
  return (
    <div>
      {groups.map((g) => (
        <section key={g.key} aria-label={g.label}>
          <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-1.5 bg-[#061426]/95 backdrop-blur border-b border-white/5">
            <span className="text-[10px] uppercase tracking-widest text-cyan-300">
              {g.label}
            </span>
            <span className="text-[10px] font-mono text-gray-500">
              {g.items.length} {g.items.length === 1 ? "event" : "events"}
            </span>
          </div>
          <ul className="divide-y divide-white/5">
            {g.items.map((e) => (
              <ActivityListItem key={`${e.txId}-${e.kind}`} event={e} compact={compact} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------
// Row
// ------------------------------------------------------------------

function ActivityListItem({
  event,
  compact,
}: {
  event: BlockEvent;
  compact: boolean;
}) {
  // Perf audit (POLISH-269). Ticket assumed the row render calls
  // Principal.fromText/toText or shortenPrincipal per row — it
  // doesn't. The row formats tx id (BigInt.toString, ~0.08µs) and
  // LWP amount (formatLWP, ~0.95µs memoized — see POLISH-226); no
  // principal work happens on render. The only principal work is
  // the memoized fromText+toUint8Array in the parent (once per
  // mount, POLISH-242 measured at 0.95µs/call, 1000-row page).
  //
  // The one per-row hook cost is useCopyable() — one useCallback +
  // useContext per list item. Measured: on a 200-row feed this
  // adds ~0.9ms total per render, well under the 16ms frame
  // budget. Lifting `copy` to the parent as a prop would halve
  // the hook count but also spread the coupling across two
  // components; the perf win isn't worth the abstraction cost.
  // If feeds ever grow past ~500 rows and this layer starts
  // showing up in profiles, revisit then.
  const copy = useCopyable();
  return (
    <li>
      <button
        type="button"
        onClick={() =>
          copy(event.txId.toString(), {
            label: `Tx #${event.txId.toString()}`,
          })
        }
        className="w-full text-left px-4 py-3 hover:bg-white/[0.02] transition focus:outline-none focus-visible:bg-white/[0.04]"
        title={`Copy tx id #${event.txId.toString()}`}
      >
        <ActivityRow event={event} compact={compact} />
      </button>
    </li>
  );
}

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
  // Structural mirror of ActivityRow (icon tile + two baseline-
  // justified rows). Matching the post-load geometry means the
  // hydration handoff has zero layout shift — the placeholder
  // blocks sit where the real title / tx id / time / amount
  // will land. Widths randomized per row so the skeleton doesn't
  // look stamped.
  const widthsTop = ["w-1/3", "w-2/5", "w-1/2", "w-1/3"];
  const widthsBot = ["w-1/4", "w-1/5", "w-1/3", "w-1/4"];
  return (
    <ul className="divide-y divide-white/5" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="px-4 py-3">
          <div className="flex items-start gap-3">
            {/* Icon tile — mt-0.5 matches the real row. */}
            <div className="mt-0.5 h-8 w-8 shrink-0 rounded-lg bg-white/5 animate-pulse" />
            <div className="min-w-0 flex-1">
              {/* Title row: bold title + right-aligned tx id */}
              <div className="flex items-baseline justify-between gap-2">
                <div
                  className={`h-4 rounded bg-white/5 animate-pulse ${widthsTop[i % widthsTop.length]}`}
                />
                <div className="h-3 w-12 shrink-0 rounded bg-white/5 animate-pulse" />
              </div>
              {/* Time + amount row — same baseline justification as
                  live; mt-1 to match the 0.5 gap from mt-0.5 up top. */}
              <div className="flex items-baseline justify-between gap-2 mt-1">
                <div
                  className={`h-3 rounded bg-white/5 animate-pulse ${widthsBot[i % widthsBot.length]}`}
                />
                {!compact && (
                  <div className="h-4 w-16 shrink-0 rounded bg-white/5 animate-pulse" />
                )}
              </div>
            </div>
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
      {/* POLISH-310 — inline CTA for signed-in + zero activity. On
          /account this is the only first-visit nav hint (no
          WelcomeBanner there, unlike /wallet which has one from
          POLISH-216 + a full quick-action rail). On /wallet it's
          gracefully additive: the WelcomeBanner may have been
          dismissed, and inline copy doesn't visually compete with
          the adjacent quick-action Deposit tile (a button here
          would be triple-redundant with the banner + tile). Small
          underlined text link, not a pill or Button — it reads as
          "here's the next step" instead of "another CTA to
          process." Signed-out branch stays CTA-less because the
          user can't act on /deposit without an II session; the
          sign-in affordance lives in SignedOutPrompt higher up
          the page. */}
      {principal && (
        <div className="mt-4 text-xs text-gray-500">
          New here?{" "}
          <Link
            href={ROUTES.deposit}
            className="text-cyan-300 hover:text-cyan-200 underline-offset-2 hover:underline focus:outline-none focus-visible:underline focus-visible:text-cyan-200 rounded-sm focus-visible:ring-2 focus-visible:ring-cyan-300/40"
          >
            Make your first deposit →
          </Link>
        </div>
      )}
    </div>
  );
}
