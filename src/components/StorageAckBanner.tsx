"use client";

/**
 * First-visit disclosure banner.
 *
 * The app doesn't use cookies, tracking pixels, or analytics — but it
 * DOES use localStorage for prefs (theme, sound, reduced motion),
 * leaderboard cache, and game best scores. Regulators increasingly
 * treat localStorage the same as cookies for disclosure purposes
 * (ePrivacy etc.), so we surface a one-shot, low-friction banner the
 * first time a device visits. No consent gate — if the user declines,
 * the app still works; we just can't remember their prefs. That
 * tradeoff is spelled out in Settings rather than here to keep the
 * banner scannable.
 *
 * Design:
 *  - Anchored above the bottom-nav on mobile, right-aligned on desktop
 *    so it never covers primary content.
 *  - Auto-hides once the user clicks OK or "learn more" (which deep-
 *    links to the Settings data section).
 *  - Waits a frame after mount before rendering so the first-paint
 *    hero isn't pushed by a late-arriving chip.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocalPref, PREF_KEYS } from "@/lib/prefs";
import { Button } from "@/components/ui/Button";

export function StorageAckBanner() {
  const [ack, setAck] = useLocalPref<boolean>(PREF_KEYS.storageAck, false);
  const [mounted, setMounted] = useState(false);

  // Delay a tick so SSR + first paint don't jostle; the hero gets the
  // user's attention first, then the banner slides in.
  useEffect(() => {
    if (ack) return;
    const t = window.setTimeout(() => setMounted(true), 500);
    return () => window.clearTimeout(t);
  }, [ack]);

  if (ack || !mounted) return null;

  return (
    <div
      role="region"
      aria-label="Storage disclosure"
      className="fixed inset-x-3 bottom-[calc(64px+env(safe-area-inset-bottom))] md:inset-x-auto md:right-4 md:bottom-4 md:max-w-sm z-[60] lw-reveal"
    >
      <div className="rounded-xl border border-cyan-300/30 bg-[#030a15]/95 backdrop-blur-md shadow-[0_8px_30px_rgba(0,0,0,0.5)] p-3.5">
        <div className="text-[10px] uppercase tracking-widest text-cyan-300 mb-1">
          No cookies · local storage only
        </div>
        <p className="text-xs text-gray-300 leading-snug">
          We don&apos;t use cookies, analytics, or trackers. This site stores
          preferences (theme, sound, best scores) in your browser&apos;s
          <span className="whitespace-nowrap"> localStorage </span>
          on this device. Clearing site data wipes them.
        </p>
        <div className="mt-3 flex items-center justify-end gap-2">
          <Link
            href="/settings#data"
            className="text-[11px] text-cyan-300/80 hover:text-cyan-200 underline underline-offset-2"
            onClick={() => setAck(true)}
          >
            Learn more
          </Link>
          <Button
            size="sm"
            tone="cyan"
            onClick={() => setAck(true)}
            aria-label="Dismiss storage disclosure"
          >
            OK
          </Button>
        </div>
      </div>
    </div>
  );
}
