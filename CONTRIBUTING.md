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

Coverage today (all 107 tests pass in ~55ms):

- `prefs.contract` — useLocalPref storage round-trips
- `clipboard.contract` — useCopyable happy path + fallback
- `ltc.contract` — LTC address validator + kind discriminator
- `activityFilter.contract` — ActivityFeed kind filter
- `principal.contract` — shortenPrincipal edge cases
- `txIdDisplay.contract` — bigint → string shortening (tx id column)
- `formatLWP.contract` — base-unit bigint → display string
- `parseLWP.contract` — display string → base-unit bigint

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

The golden rule: every tick should be reviewable in isolation. If a
diff spans three unrelated areas, you've bundled three tickets into
one PR and any reviewer needs to hold three contexts at once. Cut.

### The recurring rules

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

### Worked examples

Real cuts from the polish wave, so future-you has a reference when
the same shape shows up. If a tick looks like one of these, cut it.

**POLISH-232 — tickets can be wrong about the axis.**
Ticket: "Mobile: Toast stack vertical offset from safe-area-inset-
bottom." Turned out toasts already stacked from the bottom correctly;
the actual clipping was on the top-right edge under iOS Safari's
status bar and the rotated-landscape notch. Cut: fix the real axis
(`max(1rem, env(safe-area-inset-top|right))`), pin the reason in an
inline comment, close the ticket. Don't invent a second ticket to
"address bottom" because the ticket title said bottom.

**POLISH-242 — "perf" tickets that have already been fixed.**
Ticket: "Perf: eager Principal.fromText on every ActivityFeed poll."
The code already memoized via `useMemo([ownerBytes])`. Measured with
`performance.now()` anyway (0.95 μs/call, 1,000-row page) so the
close isn't handwavy. Cut: add a one-line audit comment pinning the
real rationale (identity stability for the `useEffect` dep array,
not per-call cost) so the next reader doesn't retry the "fix."

**POLISH-247 — empty-state tickets that the code already handles.**
Ticket: "Empty state: /send compose when signed out → clearer sign-
in CTA." `SignInGate` was already wrapping the page. Cut: add a
three-way consistency note at the top of `/send/page.tsx` pointing
to the identical shape on `/withdraw` and `/wallet`, so the next
person diffing the three routes doesn't propose consolidating them
(they have different copy / tone on purpose).

**POLISH-243 — consolidation that would have flattened distinctions.**
Ticket: "Visual consistency: /deposit rose/cyan/orange tabs match
other tab strips." Three tab strips existed (/deposit, /leaderboard,
ActivityFeed). Each used a different accent for a reason — deposit
tabs map to rails (LTC/card/bank), leaderboard tabs to game kind,
ActivityFeed filters to tx kind. Cut: add a focus ring to /deposit
(the only real gap) and leave the accent divergence alone. Resist
the refactor that would produce one shared `<TabStrip>` with six
props to re-encode the three semantics.

**POLISH-248 — don't add a new pref when an existing one works.**
Ticket: "/stacker in-game settings gear." Tempting to add a new
`stackerAudio`/`stackerHaptics` pair to avoid the game sharing
prefs with the rest of the app. Cut: reuse the existing
`PREF_KEYS.sound` and `PREF_KEYS.haptics` — the sfx + haptics libs
re-read localStorage per call, so flipping a shared pref mid-round
still lands on the next SFX invocation. Zero new storage keys, zero
migration surface, same UX.

### Design tokens already in use (don't re-audit)

A few Tailwind-class patterns look duplicative at first glance but
encode real tiers. Before "consolidating" one of these, check here:

- **`border-white/10` vs `border-white/15`** — both default borders,
  but different surface tiers. `/10` (~140 hits) is the passive
  panel tier: cards, dividers, inactive containers. `/15` (~50 hits)
  is the interactive-default tier: buttons, inputs, chips — surfaces
  where a slightly more present default helps discoverability.
  Hover/focus states escalate to `/20`, `/25`, or `/30` (audited
  POLISH-271). Don't consolidate to one value — you'd either mute
  every button or over-present every panel.
- **Card `density`** — `sm` = `p-3`, `md` = `p-5 md:p-6`, `lg` =
  `p-6 md:p-10`. Aligned to the audited distribution of ad-hoc card
  divs (POLISH-265). When porting an inline card, pick the nearest
  rung; don't invent a fourth.
- **Pill `status="live"`** — `emerald-400/.08 + emerald-300 +
  emerald-400/.40` is the shared live/operational palette across
  six surfaces (Pill, Footer network dot, Toast success, Card
  emerald accent, /account session dot, /wallet token badge).
  Reach for `<Pill status="live">` before rolling a new green
  (POLISH-259).
- **Button `variant="danger"`** — the red/translucent-red destructive
  treatment, distinct from `tone="rose"` (gradient-fill rose CTA
  like /withdraw "Send"). Don't merge them; they read as different
  affordances (POLISH-253).

### The anti-patterns to watch for

- Writing a `<Foo2>` because `<Foo>` doesn't quite fit. Either
  extend `<Foo>` with a prop, or accept the two-component cost —
  rewriting callers to migrate later is cheaper than the wrong
  abstraction today.
- Adding a fallback branch for "what if the user is offline during
  X." If we don't have a signal, the `online`/`offline` events are
  the boundary — trust them (see POLISH-212 for the real pattern).
- Catching an error "just in case." Only catch when you have
  different UI for the failure vs the success. Bare `try/catch` that
  logs and re-throws is noise.
- Adding a `useLayoutEffect` when `useEffect` would work. LE blocks
  paint; use it only when you're measuring layout before the user
  sees a frame.
- Naming something `utils.ts`. Name the module by what it does
  (`ltc.ts`, `icp/format.ts`, `prefs.ts`). `utils.ts` becomes a
  junk drawer in four commits.

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
