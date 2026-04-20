# Bundle baseline

Snapshot taken as part of POLISH-100. Re-run with `npm run analyze` and
diff against this doc before shipping anything that touches a dependency
or a route-level import graph.

## Route First-Load JS (uncompressed, from `next build`)

| Route          | Route-only | First Load JS |
|----------------|-----------:|--------------:|
| `/_not-found`  |     208 B  |      102 kB   |
| `/account`     |    17.7 kB |      237 kB   |
| `/deposit`     |    10.8 kB |      227 kB   |
| `/dunk`        |    49.7 kB |      293 kB   |
| `/leaderboard` |    11.6 kB |      227 kB   |
| `/play`        |     9.9 kB |      266 kB   |
| `/send`        |     5.4 kB |      228 kB   |
| `/settings`    |     9.1 kB |      225 kB   |
| `/stacker`     |    13.3 kB |      266 kB   |
| `/wallet`      |     4.6 kB |      231 kB   |
| `/withdraw`    |     4.6 kB |      227 kB   |
| shared baseline |          |      102 kB   |

All First Load JS values are uncompressed. With typical Brotli/gzip
ratios (~3×), the largest route (`/dunk`) ships roughly **95 kB**
over the wire. None are above the 200 kB-gzipped budget the ticket
named, so POLISH-100 closed without carving anything up.

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

The 296 K @dfinity chunk is **not** in any route's First Load JS —
it's split cleanly and only pulled on routes that instantiate an
agent (wallet-adjacent). If that ever lands in the baseline, the
split point in `src/lib/icp/*` has regressed; check the import
graph before adding another top-level import.

## When to re-run

- Before any release where a dependency was added
- When a new route ships
- After refactors that move code between client components and
  server components (this can accidentally bundle server-only
  paths into the client build)
