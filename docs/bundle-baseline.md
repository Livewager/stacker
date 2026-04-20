# Bundle baseline

Snapshot refreshed for POLISH-204. Re-run with `npm run analyze` (or
`npm run build:check`) and diff the `Route` table and `Largest chunks`
table against this doc before shipping anything that touches a
dependency or a route-level import graph.

All values below are **uncompressed**. With typical Brotli/gzip
ratios (~3×), the largest First-Load-JS (`/dunk` at 295 kB uncompressed)
lands around **100 kB over the wire**. That's inside the ~200 kB
gzipped budget POLISH-100 set, so no routes are carved up today.

## Route First-Load JS

Measured from `next build` output (Next.js 15.1.7, Node 20).

| Route          | Route-only | First Load JS | vs prior baseline |
|----------------|-----------:|--------------:|------------------:|
| `/_not-found`  |     208 B  |      102 kB   |                 — |
| `/account`     |    6.35 kB |      244 kB   |            +7 kB  |
| `/deposit`     |    7.18 kB |      240 kB   |           +13 kB  |
| `/dunk`        |    49.4 kB |      295 kB   |            +2 kB  |
| `/leaderboard` |    10.2 kB |      232 kB   |            +5 kB  |
| `/play`        |    8.35 kB |      271 kB   |            +5 kB  |
| `/send`        |    10.4 kB |      232 kB   |            +4 kB  |
| `/settings`    |    9.37 kB |      231 kB   |            +6 kB  |
| `/stacker`     |    13.2 kB |      267 kB   |            +1 kB  |
| `/wallet`      |    9.27 kB |      235 kB   |            +4 kB  |
| `/withdraw`    |    8.44 kB |      230 kB   |            +3 kB  |
| shared baseline |         — |      102 kB   |                 — |

Drift since the POLISH-100 snapshot is modest — **median +4 kB per
route**, all attributable to features shipped between then and
POLISH-204:

- `/account` +7 kB: POLISH-200 sparkline tooltip, POLISH-197 recent-tip
  chips, POLISH-91 II anchor last-used chip.
- `/deposit` +13 kB: POLISH-140 watch-address QR (qrcode dep loaded on
  this route for the first time), POLISH-164 LTC amount field.
- `/play` +5 kB: POLISH-66 parallax tilt, POLISH-157 empty-state
  launcher, POLISH-97 "new" badge.
- `/settings` +6 kB: POLISH-146 StorageUsage + POLISH-193 diagnostics.
- `/wallet` +4 kB: POLISH-142 Advanced section + POLISH-126 pending
  pill + POLISH-183 buy cap.

None of these are unexpected — the new features shipped explicitly,
and each route still sits well under the 200-kB-gzipped budget.

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
- **Livestream POOL is route-scoped** (audited POLISH-383). The
  12-message chat pool in `src/components/stacker/Livestream.tsx`
  is a module-level const. Only `/stacker` imports Livestream, so
  webpack dedupes POOL into the /stacker route chunk and it never
  lands on other routes. If the Livestream ever ships on /play or
  /dunk, lift POOL into `src/lib/livestream-pool.ts` so both
  routes hit the same chunk rather than duplicating bytes. Today:
  11.1 kB /stacker route (under the 13.2 kB POLISH-204 baseline),
  267 kB first-load unchanged — the chat-row entrance keyframe +
  breakpoint tweaks came in under budget.
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
