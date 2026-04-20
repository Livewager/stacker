"use client";

/**
 * Tiny localStorage-backed ring of recently-used recipient
 * principals. No server, no dep — just a JSON array of entries
 * capped at RING_CAP, newest-first. Consumers use remember() after
 * a successful send and list() to render a quick-pick row under
 * the /send recipient input.
 */

const KEY = "livewager-pref:recentRecipients";
const RING_CAP = 5;

export interface RecentRecipient {
  /** The principal text, not validated here — callers should already
   *  have accepted it as a valid Principal. */
  principal: string;
  /** Epoch ms of the most recent time we saw this recipient. */
  ts: number;
  /** Optional short memo / label — future surface, stored as a
   *  hint so an explicit handle addition later can reuse the row. */
  label?: string;
}

export function listRecentRecipients(): RecentRecipient[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is RecentRecipient =>
        !!x &&
        typeof x === "object" &&
        typeof (x as RecentRecipient).principal === "string" &&
        typeof (x as RecentRecipient).ts === "number",
    );
  } catch {
    return [];
  }
}

export function rememberRecipient(principal: string, label?: string): void {
  if (typeof window === "undefined") return;
  const trimmed = principal.trim();
  if (!trimmed) return;
  try {
    const existing = listRecentRecipients();
    const deduped = existing.filter((e) => e.principal !== trimmed);
    const next: RecentRecipient[] = [
      { principal: trimmed, ts: Date.now(), label },
      ...deduped,
    ].slice(0, RING_CAP);
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore quota / private mode */
  }
}

export function forgetRecipient(principal: string): void {
  if (typeof window === "undefined") return;
  try {
    const existing = listRecentRecipients();
    const next = existing.filter((e) => e.principal !== principal);
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}
