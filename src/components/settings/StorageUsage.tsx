"use client";

/**
 * Compact readout of how much browser storage this app is using —
 * lives at the top of the Settings "Device data" section so users
 * can see what the two Clear buttons below would actually be
 * releasing.
 *
 * Two numbers shown:
 *   - **App bytes**: sum of UTF-16 byte length of every
 *     `livewager-*` key + value in localStorage. This is *our*
 *     footprint specifically (precise, synchronous).
 *   - **Browser usage / quota**: from `navigator.storage.estimate()`
 *     which covers everything the origin has stored
 *     (IndexedDB, Cache API, service workers). Only shown if the API
 *     is available; the quota number is what the browser advertises
 *     as the cap.
 *
 * Refresh button re-reads both so users can watch the app number
 * drop to zero after clicking Clear below.
 */

import { useCallback, useEffect, useState } from "react";

type Snapshot = {
  appBytes: number;
  appKeys: number;
  usage: number | null;
  quota: number | null;
};

function readLocalAppBytes(): { bytes: number; keys: number } {
  if (typeof window === "undefined") return { bytes: 0, keys: 0 };
  let bytes = 0;
  let keys = 0;
  try {
    const ls = window.localStorage;
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (!k) continue;
      // Match both our pref namespace and the bare livewager- keys
      // written by the older code paths (recent recipients, stacker
      // best). Covers everything clearAllLocalData would wipe.
      if (!k.startsWith("livewager-")) continue;
      const v = ls.getItem(k) ?? "";
      // String length is UTF-16 code units × 2 bytes. Close enough
      // for a footprint readout — the browser's own accounting may
      // differ slightly but the user-facing "~12 KB" shape holds.
      bytes += (k.length + v.length) * 2;
      keys += 1;
    }
  } catch {
    /* quota / private-mode */
  }
  return { bytes, keys };
}

function formatBytes(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function StorageUsage() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const read = useCallback(async () => {
    const { bytes, keys } = readLocalAppBytes();
    let usage: number | null = null;
    let quota: number | null = null;
    try {
      if (
        typeof navigator !== "undefined" &&
        "storage" in navigator &&
        navigator.storage &&
        typeof navigator.storage.estimate === "function"
      ) {
        const est = await navigator.storage.estimate();
        usage = typeof est.usage === "number" ? est.usage : null;
        quota = typeof est.quota === "number" ? est.quota : null;
      }
    } catch {
      /* permission or Safari private-mode — leave null */
    }
    setSnap({ appBytes: bytes, appKeys: keys, usage, quota });
  }, []);

  useEffect(() => {
    read();
  }, [read]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await read();
    } finally {
      // Brief visible beat so users see the click registered even if
      // the numbers didn't change.
      setTimeout(() => setRefreshing(false), 220);
    }
  };

  const pct =
    snap && snap.usage !== null && snap.quota && snap.quota > 0
      ? (snap.usage / snap.quota) * 100
      : null;

  return (
    <div className="mb-3 pb-3 border-b border-white/5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-gray-400 mb-1">
            Storage footprint
          </div>
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px] text-gray-300 font-mono tabular-nums">
            <span className="text-gray-500">App</span>
            <span>
              {snap ? formatBytes(snap.appBytes) : "…"}
              {snap && (
                <span className="ml-1.5 text-[10px] text-gray-500">
                  · {snap.appKeys} key{snap.appKeys === 1 ? "" : "s"}
                </span>
              )}
            </span>
            {snap && snap.usage !== null && (
              <>
                <span className="text-gray-500">Origin</span>
                <span>
                  {formatBytes(snap.usage)}
                  {snap.quota !== null && (
                    <span className="ml-1.5 text-[10px] text-gray-500">
                      / {formatBytes(snap.quota)}
                      {pct !== null && pct < 0.01
                        ? " (< 0.01%)"
                        : pct !== null
                          ? ` (${pct.toFixed(2)}%)`
                          : ""}
                    </span>
                  )}
                </span>
              </>
            )}
          </div>
          <div className="text-[10px] text-gray-500 mt-1 leading-snug">
            App footprint is the{" "}
            <code className="text-gray-400">livewager-*</code> prefix in
            localStorage. Origin usage covers everything the browser
            tracks (cache, service workers) for this site.
          </div>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          aria-label="Refresh storage usage"
          className={`shrink-0 rounded-md border border-white/15 px-2.5 py-1 text-[10px] uppercase tracking-widest text-gray-300 hover:text-white hover:border-white/30 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60 ${refreshing ? "opacity-60" : ""}`}
        >
          {refreshing ? "…" : "Refresh"}
        </button>
      </div>
    </div>
  );
}
