"use client";

/**
 * First-visit onboarding overlay.
 *
 * Renders once per device on /play. Uses the shared useLocalPref so
 * the dismissal flag syncs across tabs + rehydrates across refreshes.
 * Three bullets, two actions (Let's play / Learn more). Skippable via
 * Esc, backdrop click, or the X.
 *
 * Non-blocking: waits until the pref has hydrated before considering
 * showing — avoids a flash of the modal on second visits. When the
 * user lands signed-out they also see this; once they sign in with
 * II the useEffect below auto-dismisses it (no point showing the
 * explainer to someone who already did the thing).
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { useLocalPref, PREF_KEYS } from "@/lib/prefs";
import { useWalletState } from "@/components/dunk/WalletContext";
import { ROUTES } from "@/lib/routes";

export default function OnboardingNudge() {
  const [seen, setSeen] = useLocalPref<boolean>(PREF_KEYS.hasSeenOnboarding, false);
  const [mounted, setMounted] = useState(false);
  const { identity } = useWalletState();

  // Two-render pattern: avoid popping the modal during hydration.
  useEffect(() => {
    setMounted(true);
  }, []);

  // If the user signs in they clearly don't need the explainer — flip
  // the flag silently so they don't see it on a future signed-out visit.
  useEffect(() => {
    if (identity && !seen) setSeen(true);
  }, [identity, seen, setSeen]);

  const open = mounted && !seen && !identity;

  return (
    <BottomSheet
      open={open}
      onClose={() => setSeen(true)}
      title="Welcome to Dunk."
      description="Two skill games, one non-custodial wallet. Thirty-second rounds. Real ledger, demo prizes."
    >
      <ul className="space-y-3 mb-6">
        <Bullet
          icon={
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M10 2a1 1 0 0 1 .894.553l1.934 3.87 4.272.62a1 1 0 0 1 .554 1.706l-3.091 3.013.73 4.254a1 1 0 0 1-1.451 1.054L10 15.077l-3.842 2.019a1 1 0 0 1-1.451-1.054l.73-4.254L2.346 8.75a1 1 0 0 1 .554-1.706l4.272-.62 1.934-3.87A1 1 0 0 1 10 2Z" />
            </svg>
          }
          title="You hold the keys"
          body="Sign in with Internet Identity — no password, no seed phrase, no app holding your balance."
        />
        <Bullet
          icon={
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M6.3 3.7a1 1 0 0 1 1.5-.87l8 5.3a1 1 0 0 1 0 1.74l-8 5.3A1 1 0 0 1 6.3 14.3v-10.6Z" />
            </svg>
          }
          title="Two games, one wallet"
          body="Tilt Pour is gyroscope. Stacker is arcade. Both pay out from the same LWP balance."
        />
        <Bullet
          icon={
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm1 4a1 1 0 1 0-2 0v5a1 1 0 0 0 .293.707l3 3a1 1 0 0 0 1.414-1.414L11 10.586V6Z" />
            </svg>
          }
          title="Demo mode, honest labels"
          body="Every stubbed flow is tagged demo. No real money moves until the production rails ship."
        />
      </ul>

      <div className="mb-5 flex items-center gap-2 text-[11px] text-gray-500">
        <Pill status="demo">demo</Pill>
        <span>Everything here runs against a local replica.</span>
      </div>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
        <Link href={ROUTES.account} className="inline-flex">
          <Button
            variant="outline"
            onClick={() => setSeen(true)}
            fullWidth
            className="sm:w-auto"
          >
            Learn more
          </Button>
        </Link>
        <Button
          data-autofocus
          onClick={() => setSeen(true)}
          tone="cyan"
          fullWidth
          className="sm:w-auto"
        >
          Let&apos;s play
        </Button>
      </div>
    </BottomSheet>
  );
}

function Bullet({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <li className="flex items-start gap-3">
      <span
        aria-hidden
        className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-cyan-300/[0.08] text-cyan-300 border border-cyan-300/30"
      >
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-white">{title}</div>
        <div className="text-xs text-gray-400 leading-snug">{body}</div>
      </div>
    </li>
  );
}
