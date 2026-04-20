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
  }, [balance]);

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

  return (
    <div className="flex items-center gap-1.5 md:gap-2 min-w-0">
      {/* Balance pill. On small screens we drop the "LWP" label and
          show fewer decimals so the header never overflows.
          Visuals are aria-hidden; an sr-only sibling carries the
          phrased announcement so a screen reader never gets a stray
          "◎" or responsive-swap double-read. */}
      <div
        key={flashId}
        className={`flex items-center gap-1.5 px-2.5 md:px-3 py-1.5 rounded-full border text-xs md:text-sm font-mono tabular-nums min-w-0 transition-colors ${
          flashId > 0 ? "lw-balance-flash" : ""
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
      <span className="sr-only" aria-live="polite">
        {pending
          ? `${status} in progress, balance ${balance !== null ? formatLWP(balance, 4) + " LWP" : "unavailable"}`
          : balance !== null
            ? `Balance ${formatLWP(balance, 4)} LWP`
            : "Balance unavailable"}
      </span>
      {/* Deposit CTA — scrolls to the wallet card. */}
      <a
        href={ANCHORS.dropWallet}
        className="text-xs md:text-sm px-3 md:px-4 py-2 md:py-2 h-9 md:h-auto inline-flex items-center rounded-lg text-black font-bold transition hover:brightness-110 shrink-0"
        style={{ background: "linear-gradient(90deg,#fdba74,#f97316)" }}
      >
        Deposit
      </a>
    </div>
  );
}
