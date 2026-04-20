"use client";

/**
 * Site footer. Thin, data-rich, honest.
 *
 * Renders:
 *   - Network badge (local vs ic) with colored dot.
 *   - ICRC-1 ledger canister id, shortened + copy-on-click.
 *   - LWP demo rate (fixed constant) so the wallet UI's "≈ $X" is
 *     never opaque.
 *   - Build SHA if provided via NEXT_PUBLIC_BUILD_SHA.
 *   - "Non-custodial" disclosure + routes.
 *
 * Mobile collapses to one line with just network + short canister id.
 * Hidden on game routes (/dunk, /stacker) because the footer's 44px
 * vertical stripe distracts from the play surface, and the bottom-nav
 * spacer already occupies that real estate.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { resolveCanisterId, resolveHost } from "@/lib/icp/actor";
import { useCopyable } from "@/lib/clipboard";
import { ROUTES } from "@/lib/routes";

const HIDDEN_ON: readonly string[] = [ROUTES.dunk, ROUTES.stacker];

function shortCanister(id: string, h = 5, t = 3): string {
  if (id.length <= h + t + 1) return id;
  return `${id.slice(0, h)}…${id.slice(-t)}`;
}

export default function AppFooter() {
  const pathname = usePathname() || "";
  const copy = useCopyable();
  const [info, setInfo] = useState<{
    canister: string;
    host: string;
    network: "local" | "ic";
  } | null>(null);

  useEffect(() => {
    try {
      const canister = resolveCanisterId().toString();
      const host = resolveHost();
      const network: "local" | "ic" = host.includes("127.0.0.1") ? "local" : "ic";
      setInfo({ canister, host, network });
    } catch {
      /* resolver can throw if the env var is malformed — stay blank */
    }
  }, []);

  if (HIDDEN_ON.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return null;
  }

  const sha = process.env.NEXT_PUBLIC_BUILD_SHA;

  return (
    <footer
      role="contentinfo"
      className="mt-8 border-t border-white/10 bg-background/60 backdrop-blur-sm"
    >
      <div className="mx-auto max-w-7xl px-4 md:px-8 py-4 md:py-5">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-[11px] text-gray-400">
          {/* Network */}
          {info && (
            <div className="flex items-center gap-2" aria-live="polite">
              <span
                aria-hidden
                className={`inline-block h-2 w-2 rounded-full ${
                  info.network === "local"
                    ? "bg-amber-400 animate-pulse"
                    : "bg-emerald-400"
                }`}
              />
              <span className="uppercase tracking-widest">
                {info.network === "local" ? "Local replica" : "Internet Computer"}
              </span>
            </div>
          )}

          {/* Canister id */}
          {info && (
            <button
              onClick={() => copy(info.canister, { label: "Canister id" })}
              className="font-mono text-gray-300 hover:text-white transition inline-flex items-center gap-1.5"
              title={`Click to copy · ${info.canister}`}
              aria-label={`Copy ledger canister id ${info.canister}`}
            >
              <span className="hidden md:inline text-gray-500">Ledger</span>
              <span>{shortCanister(info.canister)}</span>
            </button>
          )}

          {/* LWP demo rate */}
          <span className="font-mono hidden sm:inline">
            <span className="text-gray-500">LWP</span> 10M / 1 LTC (demo)
          </span>

          {/* Build sha — copyable so support requests can include the
              deployed build without screenshotting. Clicking copies the
              full sha (not the truncated display). Still desktop-only
              since mobile's footer is tight and this is a power-user
              affordance. */}
          {sha && (
            <button
              type="button"
              onClick={() => copy(sha, { label: "Build SHA" })}
              className="font-mono hidden md:inline-flex items-center gap-1.5 text-gray-500 hover:text-gray-200 transition focus:outline-none focus-visible:text-gray-200 focus-visible:ring-2 focus-visible:ring-cyan-300/40 rounded-sm"
              title={`Click to copy · ${sha}`}
              aria-label={`Copy build SHA ${sha}`}
            >
              <span>build</span>
              <span className="text-gray-300">{sha.slice(0, 7)}</span>
            </button>
          )}

          {/* Routes */}
          <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-2">
            <Link
              href={ROUTES.settings}
              className="hover:text-white transition"
            >
              Settings
            </Link>
            <Link
              href={ROUTES.leaderboard}
              className="hover:text-white transition"
            >
              Leaderboard
            </Link>
            <span className="uppercase tracking-widest text-gray-500">
              Non-custodial ·{" "}
              <Link
                href={ROUTES.settings}
                className="text-gray-400 underline-offset-2 hover:text-white hover:underline transition"
                title="Device prefs + data reset"
              >
                demo
              </Link>
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
