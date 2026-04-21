"use client";

/**
 * /withdraw — LWP → LTC placeholder.
 *
 * LTC withdrawals used to be wired to a mock oracle that signed
 * fake payouts. That mock is gone now that the app is ICRC-native;
 * the deposit side is the only LTC touchpoint. This page stays as
 * a placeholder so links from the main nav don't 404, and so
 * future work has a known landing spot.
 *
 * The real withdrawal path will need (a) t-ECDSA signing in the
 * canister or (b) a relayer principal that watches ICRC-3 burn
 * blocks and triggers the LTC payout. Both are big. Until then:
 * this page just tells the user "coming soon" and sends them to
 * /send for intra-ICRC transfers.
 */

import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import { ROUTES } from "@/lib/routes";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";

export default function WithdrawPage() {
  return (
    <>
      <AppHeader />
      <div className="min-h-screen bg-background text-white">
        <div className="max-w-3xl mx-auto px-5 md:px-8 py-8 md:py-12">
          <header className="mb-8">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] uppercase tracking-widest text-orange-300">
                Withdraw
              </span>
              <Pill status="soon" size="xs" mono>
                soon
              </Pill>
            </div>
            <h1 className="text-4xl md:text-5xl font-black tracking-tight leading-[0.95] mb-3">
              LWP →{" "}
              <span
                className="bg-clip-text text-transparent"
                style={{
                  backgroundImage:
                    "linear-gradient(90deg,#fdba74,#f97316 50%,#facc15)",
                }}
              >
                LTC
              </span>
              .
            </h1>
            <p className="text-gray-400 max-w-2xl leading-snug">
              LTC payouts aren&apos;t wired in this build. The{" "}
              <Link
                href={ROUTES.deposit}
                className="text-orange-300 underline underline-offset-2 hover:text-orange-200"
              >
                deposit
              </Link>{" "}
              side stays LTC-backed for on-boarding, but in-app value
              flows are all ICRC-1 for now — send LWP to any principal
              via{" "}
              <Link
                href={ROUTES.send}
                className="text-cyan-300 underline underline-offset-2 hover:text-cyan-200"
              >
                /send
              </Link>
              .
            </p>
          </header>

          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 md:p-8 mb-6">
            <div className="text-[10px] uppercase tracking-widest text-gray-400 mb-2">
              What&apos;s coming
            </div>
            <ul className="space-y-2 text-sm text-gray-300 leading-snug">
              <li className="flex gap-2">
                <span className="text-cyan-300">◎</span>
                <span>
                  Burn LWP on the ledger. Canister watches the ICRC-3
                  block log for burn entries tagged with an LTC address.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-cyan-300">◎</span>
                <span>
                  A relayer (eventually t-ECDSA in-canister) signs the
                  LTC payout. Non-custodial except during the signing
                  window.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-cyan-300">◎</span>
                <span>Track the payout status back in this page.</span>
              </li>
            </ul>
          </section>

          <div className="flex flex-wrap gap-3">
            <Link
              href={ROUTES.send}
              className="inline-flex rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <Button tone="cyan" size="lg" tabIndex={-1}>
                Send LWP instead
              </Button>
            </Link>
            <Link
              href={ROUTES.icrc}
              className="inline-flex rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <Button variant="outline" size="lg" tabIndex={-1}>
                Manage keys
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
