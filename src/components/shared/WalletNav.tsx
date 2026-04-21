"use client";

/**
 * Compact wallet widget for the top nav. Two modes:
 *   - Signed out: "Connect" button (mobile: opens bottom-sheet; desktop:
 *                 kicks off Internet Identity directly).
 *   - Signed in:  balance pill ("◎ 1.2345 LWP") + "Deposit" anchor
 *                 that smooth-scrolls to the Buy/Deposit card.
 */

import { useEffect, useRef, useState } from "react";
import { formatLWP } from "@/lib/icp";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { ANCHORS } from "@/lib/routes";
import { useWalletState } from "./WalletContext";

export function WalletNav() {
  const { identity, balance, status, login } = useWalletState();
  const [sheetOpen, setSheetOpen] = useState(false);

  // Balance-changed flash. bumps on every real change — first non-null
  // read (initial load) doesn't animate, subsequent changes do. Each
  // bump becomes the React key on the pill, which remounts the node
  // and restarts the CSS animation. Plain integer so successive
  // identical changes (e.g., burn to 0 then mint back to the same
  // amount) still trigger.
  const [flashId, setFlashId] = useState(0);
  const lastBalanceRef = useRef<bigint | null | undefined>(undefined);
  // POLISH-318 — delta-aware balance announcement for AT users.
  // Previous shape stuffed `Balance X LWP` into the aria-live span
  // every render, which means:
  //   - first mount announces the current balance (noise on route
  //     load, triggers on every navigation)
  //   - deltas announce the new total, not the change, forcing
  //     mental math ("was 1.2345, is now 2.3456, so I got 1.1111?")
  // Fix: track the announcement text in state, gate updates to the
  // same conditions the flash effect uses (real bigint→bigint
  // deltas only), and phrase the announcement as a delta with a
  // running total for context: "Received 1.1111 LWP. New balance
  // 2.3456 LWP." Pending-state announcements stay unchanged — those
  // already add actionable context ("buying in progress") and
  // don't need a delta.
  const [announcement, setAnnouncement] = useState("");
  useEffect(() => {
    const prev = lastBalanceRef.current;
    lastBalanceRef.current = balance;
    // Skip the very first observation (prev=undefined → initial load).
    if (prev === undefined) return;
    // Only animate on a genuine bigint delta. null→value and
    // value→null are session transitions (sign-in / sign-out) that
    // would look like spurious flashes on page reload.
    if (typeof prev !== "bigint" || typeof balance !== "bigint") return;
    if (prev === balance) return;
    setFlashId((i) => i + 1);
    // Phrase as a delta. Received/sent framing + new-total tail
    // means AT users hear the change as the primary information
    // and the standing balance as context.
    const delta = balance - prev;
    const deltaAbs = delta < 0n ? -delta : delta;
    const verb = delta > 0n ? "Received" : "Sent";
    setAnnouncement(
      `${verb} ${formatLWP(deltaAbs, 4)} LWP. New balance ${formatLWP(balance, 4)} LWP.`,
    );
  }, [balance]);

  // Pending-state debounce — MUST be declared here, above the
  // `if (!identity) return …` early return below, so hook count
  // stays constant across renders regardless of auth state. The
  // previous shape had useState(rawPending) + useEffect placed
  // *after* the signed-out early return, which works when the user
  // stays signed-in but throws React error #310
  // ("rendered more hooks than during the previous render") the
  // first time a user signs in (signed-out path skipped these
  // hooks, signed-in path adds them — hook order diverges).
  //
  // Mid-flight transitions shift the pill tone to amber + swap the
  // glyph for a slow spinning ring. Matches the pending chip on
  // /wallet so the "balance is about to change" cue lives in the
  // header too — important because users might be on any route when
  // a tx lands.
  //
  // Debounce the trailing edge: a transaction that resolves quickly
  // (optimistic "buying" → "idle" in <120ms) would flash the ring
  // on and straight back off, reading as a UI glitch. We hold the
  // pending state true for 180ms after the raw status clears. The
  // leading edge is immediate (no debounce) so users still see
  // feedback on the first tap.
  const rawPending =
    status === "buying" ||
    status === "depositing" ||
    status === "sending" ||
    status === "withdrawing";
  const [pending, setPending] = useState(rawPending);
  useEffect(() => {
    if (rawPending) {
      setPending(true);
      return;
    }
    const t = setTimeout(() => setPending(false), 180);
    return () => clearTimeout(t);
  }, [rawPending]);

  const isMobile =
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 767px)").matches;

  const handleConnect = () => {
    if (isMobile) {
      setSheetOpen(true);
    } else {
      login();
    }
  };

  const confirmConnect = async () => {
    setSheetOpen(false);
    await login();
  };

  if (!identity) {
    return (
      <>
        <Button
          onClick={handleConnect}
          loading={status === "loading"}
          tone="cyan"
          size="sm"
        >
          {status === "loading" ? "Connecting…" : "Connect"}
        </Button>

        <BottomSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          title="Connect with Internet Identity"
          description="Non-custodial sign-in. No email, no password, no seed phrase. Your anchor stays on the Internet Computer."
        >
          <ul className="space-y-2 text-sm text-gray-300">
            <li className="flex gap-2">
              <span className="text-cyan-300">•</span>
              <span>No app owns your keys. Only you do.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-cyan-300">•</span>
              <span>LWP balance lives on an ICRC-1 ledger, not our server.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-cyan-300">•</span>
              <span>You can disconnect any time from Settings.</span>
            </li>
          </ul>

          <Button
            data-autofocus
            onClick={confirmConnect}
            loading={status === "loading"}
            tone="cyan"
            size="lg"
            fullWidth
            className="mt-6"
          >
            {status === "loading" ? "Opening II…" : "Sign in with Internet Identity"}
          </Button>
          <Button
            onClick={() => setSheetOpen(false)}
            variant="ghost"
            fullWidth
            className="mt-2"
          >
            Not now
          </Button>
        </BottomSheet>
      </>
    );
  }

  return (
    <div className="flex items-center gap-1.5 md:gap-2 min-w-0">
      {/* Balance pill. On small screens we drop the "LWP" label and
          show fewer decimals so the header never overflows.
          Visuals are aria-hidden; an sr-only sibling carries the
          phrased announcement so a screen reader never gets a stray
          "◎" or responsive-swap double-read. */}
      <div
        key={flashId}
        // POLISH-327 — suppress lw-balance-flash while pending. The
        // flash is a cyan halo (rgba(34,211,238,0.22)) and the
        // pending pill is amber border+bg; stacking a cyan ring
        // around an amber surface reads as an unintentional color
        // clash rather than a signal. Pending's own amber spinning
        // ring is already the "something's in flight" cue, and
        // balance deltas that arrive during pending are by-
        // definition the expected settlement of that mutation —
        // the flash would be announcing what the pending state
        // already announced. Keep the flash class off until pending
        // clears; then genuine background deltas (incoming
        // transfers arriving while the user sits on a static pill)
        // get the full halo effect they're designed for.
        //
        // Tone-aware amber variant considered and cut: the
        // post-settlement flash is a "notice me" moment; amber on
        // amber defeats the purpose, and a separate rgba would
        // need a per-tone keyframe extraction (POLISH-325 pattern)
        // for the sole benefit of firing during pending — when the
        // flash shouldn't fire at all. Scope cut.
        className={`flex items-center gap-1.5 px-2.5 md:px-3 py-1.5 rounded-full border text-xs md:text-sm font-mono tabular-nums min-w-0 transition-colors ${
          flashId > 0 && !pending ? "lw-balance-flash" : ""
        } ${
          pending
            ? "border-amber-400/50 bg-amber-400/[0.08]"
            : "border-cyan-300/40 bg-cyan-300/[0.08]"
        }`}
        aria-hidden
      >
        {pending ? (
          // Decorative spinner — an open-arc amber ring rotating at
          // animate-spin's default 1s cadence. Reads as "something
          // is in flight" at a glance and is louder than the old
          // pulsing dot without being distracting. The sr-only
          // sibling below carries the accessible announcement;
          // no title attr because the container is aria-hidden and
          // keyboard users don't hover an info-only glyph.
          // Reduced-motion: the global CSS clamp collapses the
          // rotation to 0.001ms → renders as a static partial ring,
          // which still reads as "in progress" via the color change.
          <span
            aria-hidden
            className="inline-block h-3 w-3 rounded-full border-[1.5px] border-amber-300/30 border-t-amber-300 animate-spin"
          />
        ) : (
          <span className="text-cyan-300">◎</span>
        )}
        {/* POLISH-329 — perf audit: 3 formatLWP calls per render
            here (mobile pill, desktop pill, sr-only span below) +
            2 conditional calls inside the POLISH-318 delta effect.
            At the POLISH-226 measured cost of ~0.014ms per call,
            that's ~0.042ms per render. WalletNav re-renders on
            balance change + pending flips — ~10×/hour peak in
            realistic use. Total cost ~0.5ms/hour, unmeasurable.
            Considered (a) useMemo per format, (b) picking one
            decimals variant via responsive JS instead of dual
            DOM nodes, (c) caching by (balance, decimals). All
            cost more overhead than they save, and (b) would
            force WalletNav to read window.innerWidth in a hook
            — layout coupling that every previous perf audit
            (POLISH-242/269/287/299) has rightly refused. Audit-
            close. If this ever shows on a flame graph in real
            use, the cache path is already sketched in the
            formatLWP JSDoc; until then, pure function wins. */}
        <span className="text-white truncate max-w-[96px] md:max-w-none">
          <span className="md:hidden">
            {balance !== null ? formatLWP(balance, 2) : "—"}
          </span>
          <span className="hidden md:inline">
            {balance !== null ? formatLWP(balance, 4) : "—"}
          </span>
        </span>
        <span className="hidden md:inline text-gray-400 text-[11px] uppercase tracking-widest">
          LWP
        </span>
      </div>
      {/* POLISH-318 — polite live-region scoped to actionable
          moments only. `announcement` is seeded empty on mount and
          only populated by the delta effect above (first-mount
          silent, sign-in/out transitions silent, genuine
          mutations announced as "Received/Sent N LWP. New balance
          M LWP."). Pending announcements render unconditionally
          when pending — that's a user-initiated action, not
          chatter. aria-atomic="true" so the full phrase is
          re-announced on update rather than just the changed
          delta-word. */}
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {pending
          ? `${status} in progress${balance !== null ? `, balance ${formatLWP(balance, 4)} LWP` : ""}`
          : announcement}
      </span>
      {/* Deposit CTA — scrolls to the wallet card. */}
      <a
        href={ANCHORS.dropWallet}
        className="text-xs md:text-sm px-3 md:px-4 py-2 md:py-2 h-9 md:h-auto inline-flex items-center rounded-lg text-black font-bold transition hover:brightness-110 shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        style={{ background: "linear-gradient(90deg,#fdba74,#f97316)" }}
      >
        Deposit
      </a>
    </div>
  );
}
