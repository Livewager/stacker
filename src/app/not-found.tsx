"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ErrorScaffold } from "@/components/ErrorScaffold";
import { ROUTES } from "@/lib/routes";

/**
 * 404 page. POLISH-85 made /play the primary CTA. POLISH-352 adds a
 * single "did you mean …" hint when the typo'd URL is within edit
 * distance 2 of a real route. Typos like /walet → /wallet or
 * /depposit → /deposit get the nudge; /random-nonsense doesn't
 * (distance is too big to be a typo guess).
 *
 * Converted to a client component so we can read the typo'd path
 * from window.location after mount. The hint is a suggestion, not
 * an auto-redirect — the user still lands on the 404 and sees the
 * games-hub CTA. This matters because:
 *   1. Auto-redirect on 404 hides bad links from crawlers + analytics.
 *   2. A single wrong character at distance 1 (/sebnd → /send) is not
 *      certain enough to act on — we show the option, they decide.
 *
 * Server component was fine before; making it a client component
 * adds no real cost because the page is below the fold of the
 * ErrorScaffold primary CTA.
 */

// Classic Levenshtein (Wagner–Fischer). Two-row rolling DP — O(a*b)
// time, O(min(a,b)) space. Typical URL pathname here is ≤ 16 chars
// and we compare against ~12 ROUTES values, so worst-case ~2300
// char comparisons on the 404 page once per mount. No memoization
// needed. Exported implicitly via module; not used elsewhere.
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const [s, t] = a.length < b.length ? [a, b] : [b, a];
  const prev = new Array<number>(s.length + 1);
  const curr = new Array<number>(s.length + 1);
  for (let i = 0; i <= s.length; i++) prev[i] = i;
  for (let j = 1; j <= t.length; j++) {
    curr[0] = j;
    for (let i = 1; i <= s.length; i++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      curr[i] = Math.min(
        curr[i - 1] + 1, // insert
        prev[i] + 1, // delete
        prev[i - 1] + cost, // substitute
      );
    }
    for (let i = 0; i <= s.length; i++) prev[i] = curr[i];
  }
  return prev[s.length];
}

// Narrow hard cap — any more and we're guessing, not suggesting.
// Tuned from examples: /walet→/wallet = 1, /depposit→/deposit = 1,
// /fairplay→/fair-play = 1. Distance 3 would start matching things
// like /xyz against /play (no shared chars), which is worse than
// silence.
const MAX_DISTANCE = 2;

function nearestRoute(pathname: string): { href: string; distance: number } | null {
  // Skip the 404 itself if Next.js somehow routed here; skip "/"
  // which the redirect handles.
  if (!pathname || pathname === "/" || pathname === "/404") return null;
  let best: { href: string; distance: number } | null = null;
  for (const href of Object.values(ROUTES)) {
    if (href === "/") continue; // root isn't a "did you mean" target
    const d = editDistance(pathname.toLowerCase(), href.toLowerCase());
    if (d <= MAX_DISTANCE && (best === null || d < best.distance)) {
      best = { href, distance: d };
    }
  }
  return best;
}

function toLabel(href: string): string {
  // "/fair-play" → "Fair play", "/wallet" → "Wallet".
  const raw = href.replace(/^\//, "").replace(/-/g, " ");
  if (!raw) return href;
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export default function NotFound() {
  const [suggestion, setSuggestion] = useState<{
    href: string;
    label: string;
  } | null>(null);

  useEffect(() => {
    // window is available here because this is a client component.
    // Guard anyway — some test environments run client components
    // with no `window` shim.
    if (typeof window === "undefined") return;
    const match = nearestRoute(window.location.pathname);
    if (match) setSuggestion({ href: match.href, label: toLabel(match.href) });
  }, []);

  return (
    <ErrorScaffold
      tone="muted"
      eyebrow="404 · Off the grid"
      title="Nothing stacked at this address."
      body={
        <>
          The page you were after doesn&apos;t exist or moved. Jump into
          Stacker, or head to your wallet.
          {suggestion && (
            <>
              {" "}
              <span className="block mt-3 text-sm text-cyan-300">
                Did you mean{" "}
                <Link
                  href={suggestion.href}
                  className="underline underline-offset-2 hover:text-cyan-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60 rounded-sm"
                >
                  {suggestion.label}
                </Link>
                ?
              </span>
            </>
          )}
        </>
      }
      primary={{ href: ROUTES.stacker, label: "Play Stacker" }}
      secondary={{ href: ROUTES.wallet, label: "Open wallet" }}
    />
  );
}
