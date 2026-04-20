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

**POLISH-294 — rule-of-three before extracting a primitive.**
Ticket: "consolidate Field a11y wiring across /send and /withdraw."
Tempting to build a `<FieldA11y>` or `useFieldIds()` primitive that
threads `useId`-backed error/hint ids into every input via a
render-prop or cloneElement. Cut: the real consumer count is
three (send recipient, send memo, withdraw address), the shapes
differ per call site (different input types, different supplementary
slots like the memo byte counter), and a primitive with three
consumers usually encodes more flexibility than it saves. Did the
explicit hand-wiring (POLISH-288 + POLISH-294) three times and
pinned a rule-of-four trigger: when the fourth unique Field shape
needs a11y wiring, extract the primitive then. Duplication of three
stable-shape things beats a wrong abstraction that 40% of the
consumers have to bend around.

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
- **`text-gray-300/400/500/600`** — a 4-rung secondary-text ramp, not
  drift (audited POLISH-277). Picks by role and usual font size:
  - `text-gray-300` (~80 hits) — primary explanatory copy that's
    still below the white-on-dark heading tier. Used at `text-sm`
    and up.
  - `text-gray-400` (~135) — secondary body text. Full size range
    (`text-xs`/`text-sm`/`text-[10–11px]`). Default for info-dense
    rows, secondary labels, supporting prose.
  - `text-gray-500` (~140) — captions, hints, meta. Nearly always
    paired with the tiny sizes (`text-[9–11px]`). De-emphasized so
    tight type doesn't shout.
  - `text-gray-600` (~6) — decorative / faint-only. Separators, the
    hair-thin slash in the mobile breadcrumb, etc.
  Writing new secondary text? Match by role: prose → /300 or /400,
  captions/timestamps → /500. Don't collapse these — the ramp is
  what keeps info-dense rows legible without over-emphasizing
  every supporting line.
- **`rounded-*` radius tiers** — a 6-rung surface-shape ramp, not
  drift (audited POLISH-289). Pick by surface kind, not size:
  - `rounded-full` (~125) — pills, chips, dots, avatars, circular
    badges. Anything that's "always circular."
  - `rounded-3xl` (~4) — BottomSheet top corners only. Oversize
    to read as sheet-lifting-from-bottom rather than card.
  - `rounded-2xl` (~75) — primary surface cards + panels. 94%
    co-occur with `border-white/10 + bg-white/[0.02-0.035]` (the
    canonical card treatment). The "this is a section" tier.
  - `rounded-xl` (~85) — secondary surfaces: small cards,
    ActionTiles, InfoTiles, inline chip-boxes with more presence
    than a pill.
  - `rounded-lg` (~55) — primary controls (Button primitive
    default). Visually distinct from cards so a button on a card
    doesn't fight for the same corner-radius attention.
  - `rounded-md` (~90) — inputs (often paired with `h-11`),
    tight controls, small chips with internal padding.
  - `rounded-sm` (~5) — decorative / focus-ring targets only.
  Writing a new surface? Match by kind: card → /2xl, tile → /xl,
  button → /lg, input → /md, pill → /full. Don't mix tiers on
  the same hierarchy level (e.g. a card with /xl buttons inside
  /2xl container — the button reads as a mini-card).
- **Route-accent eyebrow colors** — each primary route has a
  canonical accent (audited POLISH-301, all 10 routes clean):
  - /wallet, /leaderboard, /account, /stacker, /settings →
    `text-cyan-300`
  - /send → `text-violet-300`
  - /withdraw → `text-rose-300`
  - /deposit → `text-orange-300`
  - /dunk → `text-cyan-300` (plus in-game accents on specific
    states — warm-up amber, pour-feedback greens)
  Two intentional exceptions, NOT drift:
  1. Generic `InfoTile` eyebrows app-wide use `text-cyan-300`
     for neutral-informational content (trust strips,
     explanatory tiles). Cyan reads as "just-info" rather than
     a route accent here; don't swap to match the host route.
  2. Cross-route reference chips use the *destination* route's
     accent, not the host's — e.g. the "Recent recipients" chip
     on /account uses `text-violet-300` because tapping it goes
     to /send. This is deliberate visual grammar: "this tile
     will take you somewhere violet."
  Adding a new section to an existing route? Use that route's
  accent. Adding an InfoTile? cyan. Cross-linking to another
  route's action? Use the destination's accent.
- **`font-mono`** — data-first tier (audited POLISH-295). Use only
  where the content is:
  - cryptographic strings (principals, canister ids, tx ids,
    SHAs, LTC addresses, signatures)
  - numeric values that benefit from tabular-nums (balances,
    amounts, countdowns, HUD meters)
  - keyboard hints (⌘K, ^K)
  - debug / HUD overlays showing numeric state
  Eyebrows (`uppercase tracking-widest`) already carry their
  own weight — don't stack `font-mono` on top unless the eyebrow
  itself contains a token or number (e.g. "Last played · 3h",
  "Build abc1234"). Plain-text eyebrows like "Sign out" or
  "Share run" stay proportional; mono there reads as cargo-cult
  drift. Pair `font-mono` with `tabular-nums` when the content is
  numeric and will re-render (keeps digits from jumping width).
- **Error-boundary copy contract** (audited POLISH-304). Every
  `error.tsx` should answer three questions in its body, in this
  order:
  1. *What happened?* ("Something threw while rendering.")
  2. *What didn't happen?* — the reassurance. On any route that
     touches money (wallet, send, withdraw, deposit, account), say
     "Nothing on the ledger moved — balance, principal, and
     pending tx are untouched." On game routes, the equivalent is
     "No round state survives a reload, so this is safe."
  3. *What to do next?* — one verb, pointing at the primary CTA.
  Primary action: always `reset()` (never an href) unless the
  boundary is non-recoverable. Secondary action: the **nearest
  sibling the user was likely heading to**, NOT the marketing
  landing. Generic catch-all → `/wallet` (most-visited authed
  surface). `/wallet` → `/dunk` (closest out if wallet itself
  crashes). `/account` → `/wallet`. `/stacker` → `/play`.
  Eyebrow tone: `tone="danger"` only when the error implicates a
  money-touching surface (generic catch-all + /wallet);
  `tone="muted"` for read-only surfaces (/account, /stacker, 404).
  Auto-retry: `autoRetrySeconds={5}` everywhere *except* 404 (no
  retry for missing URLs).

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
