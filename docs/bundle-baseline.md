# Bundle baseline

Snapshot refreshed for STACKER-22 (post-rebrand re-baseline). Re-run
with `npm run analyze` (or `npm run build:check`) and diff the
`Route` table and `Largest chunks` table against this doc before
shipping anything that touches a dependency or a route-level import
graph.

All values below are **uncompressed**. With typical Brotli/gzip
ratios (~3×), the largest First-Load-JS (`/play` at 272 kB
uncompressed) lands around **90 kB over the wire**. That's inside
the ~200 kB gzipped budget POLISH-100 set, so no routes are carved
up today.

## Route First-Load JS

Measured from `next build` output (Next.js 15.5.15, Node 20).
Captured 2026-04-20 after the Stacker rebrand sweep — replaces the
prior POLISH-204 / POLISH-376 snapshot which still listed the
deleted `/dunk` route.

| Route          | Route-only | First Load JS |
|----------------|-----------:|--------------:|
| `/_not-found`  |     201 B  |      102 kB   |
| `/account`     |    6.96 kB |      249 kB   |
| `/deposit`     |    7.35 kB |      243 kB   |
| `/fair-play`   |    2.85 kB |      228 kB   |
| `/leaderboard` |    9.84 kB |      235 kB   |
| `/play`        |    7.64 kB |      272 kB   |
| `/send`        |    12.0 kB |      237 kB   |
| `/settings`    |    9.51 kB |      234 kB   |
| `/stacker`     |   11.1 kB  |      266 kB   |
| `/wallet`      |    9.61 kB |      240 kB   |
| `/withdraw`    |    9.23 kB |      234 kB   |
| shared baseline |         — |      102 kB   |

API route handlers (`/api/wallet/*`, `/api/waitlist`) sit at the
102 kB shared baseline since they're server-only and ship no
client JS.

Notable shape changes from the rebrand sweep:

- `/play` shrunk 8.35 → 7.64 kB after the Dunk card + PourPreview
  SVG were removed (single-card hub).
- `/leaderboard` shrunk 10.2 → 9.84 kB after the three-tab strip
  was rewritten to a Stacker-only board.
- `/stacker` was 13.2 kB pre-rebrand; the in-page hero treatment
  is unchanged so the small drop (11.1 kB) is mostly attributable
  to the dropped Tilt-Pour cross-link in the wager primer.
- The deleted `/dunk` route was 49.4 kB / 295 kB at its largest;
  removing it took the heaviest single page out of the table.

Every route still sits well under the 200-kB-gzipped budget.

## Largest chunks (uncompressed)

| Size  | Chunk                   | Contents (inferred)                      |
|------:|-------------------------|------------------------------------------|
| 296 K | `1032-*.js`             | @dfinity/agent + candid + identity bloc  |
| 188 K | `framework-*.js`        | React + scheduler                        |
| 172 K | `4bd1b696-*.js`         | Next framework chunk                     |
| 172 K | `1255-*.js`             | Next/webpack runtime                     |
| 128 K | `main-*.js`             | App entry                                |
| 124 K | `5996-*.js`             | Likely framer-motion                     |
| 112 K | `polyfills-*.js`        | Core-js polyfills (Next default)         |

**Unchanged since POLISH-100.** The 296 K `@dfinity` chunk is still
*not* in any route's First Load JS — it's split cleanly and only
pulled on routes that instantiate an agent. If that 296 K number ever
lands in the baseline total, a top-level import has regressed the
split-point in `src/lib/icp/*`.

## When to re-run

- Before any release where a dependency was added (bumps `package.json`).
- When a new route ships.
- After refactors that move code between client components and server
  components (can accidentally bundle server-only paths into the client).
- **POLISH-204 convention**: bump this doc when median drift exceeds
  +10 kB, or when any single route jumps more than +20 kB, whichever
  comes first.
- **Livestream POOL is route-scoped** (audited POLISH-383, re-pinned
  STACKER-22). The 12-message chat pool in
  `src/components/stacker/Livestream.tsx` is a module-level const.
  Only `/stacker` imports Livestream, so webpack dedupes POOL into
  the /stacker route chunk and it never lands on other routes. If
  Livestream ever ships on a second route (e.g. /play), lift POOL
  into `src/lib/livestream-pool.ts` so both routes hit the same
  shared chunk rather than duplicating bytes. Today: 11.1 kB
  /stacker route, 266 kB first-load — under the prior 13.2 kB / 267
  kB baseline by a hair after the rebrand cleanup.
- **useSearchParams does NOT force dynamic rendering** (audited
  POLISH-376). Adding `useSearchParams()` to `/send` in POLISH-371
  kept the route at `○` (static) in the build output — the page
  still prerenders an empty-query skeleton, then hydration reads
  the actual URL params client-side. This is the intended Next 15
  behavior. What *would* force `ƒ` (dynamic): a top-level
  `export const dynamic = 'force-dynamic'`, a `cookies()` /
  `headers()` read, or an uncached `fetch()` at the RSC level —
  none of which `/send` does. Drift since POLISH-204: `/send`
  10.4 kB → 11.9 kB (+1.5 kB route / +5 kB first-load),
  attributable to POLISH-224/235/247/268/292/296/328/371/372/374/
  375 shipping between the baselines. No single jump exceeds the
  +20 kB gate, so no doc refresh required yet.

## How to re-run

```bash
npm run build:check   # runs next build + warning gate
npm run analyze       # runs next build + largest-chunks table
```

The `build:check` script (POLISH-202) fails the process if unexpected
warnings appear, so a dep upgrade that introduces a new warning will
trip the gate before this baseline needs updating.
