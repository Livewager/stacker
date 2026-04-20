# Contributing

Quickstart for anyone picking up a ticket in this repo. If you only
read one file before editing code, read this one — the rest of the
tooling (`scripts/`, `docs/bundle-baseline.md`, `test/`) exists to
back up the workflow below.

## Local setup

```bash
npm install --legacy-peer-deps
npm run dev            # dev server on http://localhost:3002
```

`--legacy-peer-deps` is required because React 19 RC is pinned and a
couple of `@types/*` pins lag behind. No other flags are needed.

Optional — local ICP replica for the points ledger:

```bash
dfx start --background --clean
dfx deploy points_ledger \
  --argument "(record { minter = principal \"$(dfx identity get-principal)\" })"
```

Without `dfx`, the wallet and ledger calls fall back to a demo stub
(look for `demo` labeling in the UI) — the app still runs end-to-end.

## The ten-route smoke test

Every tick that changes code hits these ten routes and confirms 200
before committing:

```
/dunk  /stacker  /play  /wallet  /send
/withdraw  /deposit  /account  /leaderboard  /settings
```

One-liner:

```bash
for r in /dunk /stacker /play /wallet /send /withdraw /deposit /account /leaderboard /settings; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3002$r")
  echo "$code $r"
done
```

If a route 500s right after a production build, that's the
`next build` vs `npm run dev` `.next/` collision — see the caveat in
`scripts/prod-build-check.mjs`. Touching the offending route's source
file forces an HMR rebuild and fixes it.

## Checks to run before committing

```bash
npx tsc --noEmit       # typecheck
npm test               # node:test suite, ~50ms, 61 tests today
npm run build:check    # production build with warning allow-list
```

`build:check` will fail on any `next build` warning that isn't on the
allow-list in `scripts/prod-build-check.mjs`. If you add a dep or a
config that introduces a new warning, either fix the warning or add
a substring to the allow-list with a one-line justification.

## Tests

The suite is intentionally lean — pure-JS `node:test` files in
`test/*.contract.test.mjs`, no jsdom / RTL / Vitest. Each test file
mirrors the contract under test inline at the top, so a refactor has
to update the mirror in lockstep with the source.

Coverage today (all 61 tests pass in ~50ms):

- `prefs.contract` — useLocalPref storage round-trips
- `clipboard.contract` — useCopyable happy path + fallback
- `ltc.contract` — LTC address validator
- `activityFilter.contract` — ActivityFeed kind filter
- `principal.contract` — shortenPrincipal edge cases

Add new coverage when you find a pure helper worth pinning. Skip it
for component-heavy surfaces — the 10-route smoke plus manual QA is
the gate there.

## Commit style

One ticket per commit. Format:

```
POLISH-<N> <area>: <one-line summary>

<Why-this / what-changed body, 2–5 short paragraphs.>
<Mention any fixtures, allow-list entries, or follow-up tickets.>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

Use `ANTICHEAT-T<n>`, `ICP-<n>`, `DUNK-<n>`, or `STACKER-<n>` prefixes
for non-polish work. When a tick discovers new follow-ups, queue them
as fresh tickets rather than expanding the one you're shipping —
keeps each commit reviewable in isolation.

## Scope cuts that keep ticking fast

- **One focused unit per tick.** If a finding spans multiple areas
  (accessibility audits tend to), pick the top 3–4 and queue the rest.
- **Don't swap libraries.** The stack (Next 15, React 19 RC, Tailwind,
  framer-motion, node:test) is fixed for the duration of the polish
  wave.
- **No mocks for pure helpers.** Mirror the contract in the test file.
- **Respect reduced-motion.** Every new animation needs
  `useReducedMotion()` (OS) **and** `usePrefs().reducedMotion` (in-app)
  gates, or — better — a `transition: none` fallback when either is
  set. See `src/app/leaderboard/page.tsx` `RowSparkline` for the
  canonical pattern.
- **Demo labeling stays.** Every stubbed money flow (LTC deposits,
  withdrawals, buy LWP) must still read "demo" to the user.

## Useful scripts

```bash
npm run dev            # dev server on 3002
npm run build          # production build
npm run build:check    # build + warning gate (POLISH-202)
npm run analyze        # build + largest-chunks table (POLISH-100)
npm run typecheck      # tsc --noEmit
npm test               # node:test contract suite
```

## Files you'll want to know about

- `docs/bundle-baseline.md` — route First-Load-JS budget; update when
  median drift exceeds +10 kB.
- `src/lib/prefs.ts` — the `useLocalPref` hook + typed PREF_KEYS.
  Every new persisted user preference goes through here.
- `src/lib/hooks/useReducedMotion.ts` — OS-level motion preference.
  Combine with `usePrefs().reducedMotion` for the in-app toggle.
- `src/components/ui/*` — the primitive layer (Button, AmountField,
  BottomSheet, Toast). Prefer these to hand-rolled equivalents.
- `scripts/prod-build-check.mjs` — the `build:check` gate; read the
  header comment before adding allow-list entries.
