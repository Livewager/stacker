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
/stacker  /stacker  /play  /wallet  /send
/withdraw  /deposit  /account  /leaderboard  /settings
```

One-liner:

```bash
for r in /stacker /stacker /play /wallet /send /withdraw /deposit /account /leaderboard /settings; do
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

Use `ANTICHEAT-T<n>`, `ICP-<n>`, or `STACKER-<n>` prefixes
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
- **Primary text = `text-white`** — the top of the text-color
  ladder. Headings (`h1`/`h2`/`h3`), row labels inside Toggle-shaped
  settings/config rows, balance values, leaderboard handles, CTA
  text — all `text-white`. 270+ hits; the Toggle primitive's
  internal label is `text-sm font-semibold text-white`, and any
  hand-rolled settings row should match (audited POLISH-355).
  Don't use `text-gray-100` — it's almost identical to white but
  reads visibly dimmer next to the Toggle rows on the same surface;
  two strays got caught in the POLISH-355 sweep and were
  normalized.
- **`text-gray-200` has three legitimate roles — not a primary-text
  alias** (audited POLISH-355). Reach for it only when you're in
  one of these:
  1. **Ghost-button rest state** — `border-white/15 text-gray-200
     hover:text-white`. The "gray-at-rest, white-on-hover" is a
     deliberate affordance cue; gray-200 is chosen because it's
     dim enough to read as "not the primary CTA" but bright enough
     to stay legible on dark surfaces. The majority of the ~44
     hits are this pattern.
  2. **Mono / code / kbd text on `bg-black/40` wells** — pure
     `text-white` at 10–11px on a pure-black well is too harsh;
     gray-200 softens it while preserving legibility. See the kbd
     pills in CommandPalette and the address-copy code blocks in
     LtcDepositPanel.
  3. **Panel-prose on saturated marketing surfaces** — GamesHub
     card descriptions, /stacker quote blockquote, /stacker tier
     body. These sit on gradient or tinted backgrounds where
     `text-gray-300` (the standard prose rung) would wash out.
     Use judiciously; if you're on the default `bg-background` or
     a neutral card, reach for `text-gray-300` instead.
  Rule of thumb: if the text is on a plain card and you're
  reaching for gray-200 to "soften" it, the right answer is
  probably gray-300. gray-200 is elevated-prose-only or
  affordance-only.
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
  Hero-CTA exception (audited POLISH-349). The /stacker landing's
  "Play Pour" / "Play Stacker" and the TryGame buttons use
  `rounded-xl` rather than `/lg`. That's deliberate: they're
  marketing-surface CTAs sitting against a full-bleed hero, not
  form controls, and matching the surrounding 2xl cards one rung
  smaller reads as "major action" rather than "submit form."
  Stays an exception — don't escalate form-control buttons to /xl,
  and don't demote these to /lg just because the Button primitive
  uses that rung. Inner cards (tier cards in /fair-play, stat
  chips on /stacker) at /xl are the tile rung working correctly.
- **`bg-white/[...]` surface-tint ladder** — a 5-rung elevation
  ramp, not drift (audited POLISH-367). Pick by role, not by
  "this one feels right":
  - `bg-white/[0.02]` (~42 hits) — default card rest. Card
    primitive default, skeletons, utility-route panels.
  - `bg-white/[0.03]` (~58 hits) — elevated card rest. /stacker
    hero panels, GamesHub tiles, TryGame surfaces, /play cards,
    DropWallet, any "pop this card a touch against a dark hero."
    Card primitive's `elevated=true` now emits this token too
    (was 0.035 pre-POLISH-367, a lonely outlier while 58 sites
    used 0.03 — the primitive is back aligned with call sites).
  - `bg-white/[0.04]` (~7 hits) — chrome-active rest. Pill
    primitive default, CommandPalette kbd wells, StackerGame HUD
    active tab, Settings active-tab segment, GamesHub active
    state. Reads as "a small surface that's semi-active" — not
    a card, not hovered, but currently selected.
  - `bg-white/[0.05]` (~10 hits) — hover tint on clickable cards.
    CommandPalette active row, /stacker + /play card hover, /deposit
    hover tab. Pair with a 0.02/0.03 rest.
  - `bg-white/[0.06]` (1 site, POLISH-367 ceiling) — hottest
    marketing-hero hover only. /stacker hero-card hover is the one
    legitimate use; anything else reaching for 0.06 should step
    back to 0.05. If a new hot-hover wants this rung, justify it
    or demote.
  Writing a new surface? Card rest → /02, elevated-card rest →
  /03, Pill/kbd/active-tab → /04, card hover → /05. Don't invent
  new stops (0.025, 0.045) — the 5-rung spread is enough
  elevation resolution for dark-mode contrast and adding between
  rungs makes the ladder read as arbitrary, not intentional.
  Power-user drawer panels (WalletAdvanced, /deposit watch-
  address card) both land on `/02` — they're card-rest, not
  elevated, because the collapsible-drawer role is "show raw
  values on demand", not "pop this card." Audited POLISH-385:
  both shapes already match the ladder, and the disclaimer chip
  below the LTC panel uses `rounded-lg border border-white/5 /02`
  — lighter border is the correct inline-disclaimer variant, not
  a surface-tier change.
- **Route-accent eyebrow colors** — each primary route has a
  canonical accent (audited POLISH-301, all 10 routes clean):
  - /wallet, /leaderboard, /account, /stacker, /settings →
    `text-cyan-300`
  - /send → `text-violet-300`
  - /withdraw → `text-rose-300`
  - /deposit → `text-orange-300`
  - /stacker → `text-cyan-300` (plus in-game accents on specific
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
- **Route-transition loader: we don't have one** (audited POLISH-333).
  The task log has POLISH-136 ("Global loading indicator during
  route transitions") marked complete, but grep finds no route-
  transition loader component in `src/` — POLISH-136 must have
  audit-closed back to "Next's per-segment loading.tsx is enough"
  without committing a new component. That's still the right call:
  Next App Router only mounts `loading.tsx` when a segment's data
  is actually suspended, so fast same-origin cached navigations
  don't flash a spinner in the first place. The POLISH-333
  "sub-100ms flash" concern is moot — there's nothing firing to
  flash. If we ever add a top-bar progress indicator (à la nprogress),
  then the POLISH-333 120ms delay gate becomes relevant. Until
  then, no-op.
- **Toast button accessible names** (audited POLISH-324). In a
  stack of N live toasts, VoiceOver rotor / quick-nav lists every
  button in the "Notifications" region. Bare labels ("Undo",
  "Dismiss notification") make them indistinguishable — user
  can't tell which toast they're about to act on. The rule: every
  per-toast button (action slot + dismiss ×) gets an aria-label
  that includes the toast's title as a scope suffix:
    action:  `${t.action.label} — ${t.title}`
              → "Undo — Recipient forgotten"
    dismiss: `Dismiss — ${t.title}`
              → "Dismiss — Withdraw queued"
  Visible text stays short for sighted users; only the AT
  announcement changes. If Toast ever gains more per-card
  buttons (copy tx id, report issue), follow the same suffix
  pattern. Don't rely on positional context — rotor is
  non-spatial.
- **Entrance motion by surface type** (audited POLISH-321). Use
  `lw-reveal` on surfaces where arrival is **expected and
  voluntary** — the user navigated to a route, opened a drawer,
  clicked Review. There, a 220ms fade + 6px translateY
  subtly confirms "here's what you asked for" without
  demanding attention.
  Skip entrance motion on surfaces where arrival is
  **involuntary or adversarial** — error boundaries,
  crash-reset screens, timeout recoveries. Reasons:
    1. Motion frames the state as presentation ("ta-da, here's
       your error") rather than recovery context ("you're
       already here, fix it").
    2. If the primary CTA is focused on mount (our error
       pattern — POLISH-274), a 220ms fade lands Enter presses
       on a mid-fade element — looks janky.
    3. aria-live countdowns / announcements paired with
       entrance motion read as too busy for a recovery surface.
    4. Reduced-motion users chose calm exactly to avoid the
       worst-case surfaces — don't override where it matters
       most.
  The broader test: ask "did the user choose to arrive here?"
  Yes → motion is a reward. No → motion is noise.
  Corollary for documentation surfaces (audited POLISH-339):
  even voluntary arrivals skip entrance motion on pages that are
  *reference*, not *action*. /fair-play has 7 cards of prose +
  schematics; cascading them in on every visit reads as marketing
  affect and wears out after the first read. /wallet cards do use
  lw-reveal because each is a transactional stage (compose /
  review / queued) with a confirmation moment. Doc pages should
  feel like they've been here.
- **Hover-bg opacity contract** (audited POLISH-319). The
  implicit rule across the app: hover adds **+2 to +5 percentage
  points** to whatever the base bg opacity is, not a fixed tier.
  Observed (and correct) pairings:
    transparent base → `hover:bg-white/[0.02]` … `hover:bg-white/5`
    `bg-white/[0.02]` or `bg-white/[0.03]` → `hover:bg-white/[0.05]`
    `bg-white/5` → `hover:bg-white/10`
    `bg-white/10` → `hover:bg-white/15`
  Two deliberate exceptions, NOT drift:
    1. Small tap targets (leaderboard HoF dots at
       `bg-white/15` → `hover:bg-white/25`, +10%) need more delta
       to register hover because the hit area is tiny.
    2. Clear-field buttons on busy inputs (/send, /withdraw × at
       `hover:bg-white/[0.06]` on transparent) need a slightly
       higher delta to read against typed content.
  POLISH-309 exception: CommandPalette rows unify hover AND
  focus-visible bg at 5% (both modes get the same "this is the
  row" tint, keyboard adds an additive ring). That's a different
  concern (mode parity, not opacity tier) and doesn't violate the
  +2–5% rule here.
  If a new surface wants a hover bg: measure the base and step up
  within that range. Don't invent new values like `hover:bg-white/8`
  or cargo-cult `hover:bg-white/5` onto a `bg-white/[0.02]`
  surface (delta would be too small to read).
- **Motion curves: single-stage vs two-stage** (audited POLISH-315).
  The POLISH-261 two-stage shape applied to `lw-press-pulse`
  (ripple: ring expansion + opacity fall, two independent axes
  that want different timing) does NOT generalize to every decay
  animation. For motions where the composed axes *reinforce* each
  other on a single coordinated arc (e.g. `lw-dismiss`: opacity
  fades AND translateY slides down — both saying "leaving"), a
  single-stage cubic-bezier(0.4, 0, 0.2, 1) over 220ms is correct
  — desyncing them with a two-stage curve reads as a hiccup, not
  a polished exit. The test: can you describe the motion with
  one sentence ("the card leaves")? Stay single-stage. Two
  sentences ("the ring snaps out, then the opacity fades")? Go
  two-stage.
- **Settings-row layout contract** (audited POLISH-314). Any row
  in /settings with [label + description + right-side control]
  must follow the `Toggle` primitive's shape, regardless of
  whether the control is a switch or a button:
    outer:   `flex items-start justify-between gap-4`
    text:    `min-w-0 flex-1`  (both are load-bearing — `min-w-0`
             alone doesn't grow, `flex-1` alone can't shrink below
             word-boundary min-content)
    control: `shrink-0`
  `items-start` (not `items-center`) so a two-line description
  doesn't vertical-center the control against the middle of the
  wrap — the control aligns with the title, which reads
  "anchored" rather than "floating." This is the pattern that
  keeps 320px viewports from pushing the control off-edge or
  forcing mid-word wraps in the description when the row has
  non-trivial helper copy. Toggle.tsx enforces this internally;
  hand-rolled rows (Replay onboarding, Test haptic) should mirror
  it rather than diverge.
- **Skeleton shimmer layering** (audited POLISH-313). The
  `animate-pulse` utility modulates opacity — and that's the
  footgun. If a parent *and* its children both animate-pulse, the
  two opacity tweens compose multiplicatively and produce a
  double-time flicker (child opacity × parent opacity, each at
  2s cubic-bezier). The rule: `animate-pulse` goes on either the
  **single-element placeholder** (dynamic-import fallbacks like
  /stacker's DropWallet loading slot, /stacker's game canvas slot —
  filled cards with no children) OR on the **individual
  SkeletonBlock children inside a static card container** — never
  both. The Skeleton primitive in `src/components/ui/Skeleton.tsx`
  follows this: `SkeletonCard` is a plain static border+bg, only
  the inner `SkeletonBlock` shimmers. If you're building a new
  loading.tsx, reach for the primitive and don't layer a pulse on
  the outer wrapper. When you need a single-element "something
  heavy is loading here" block (dynamic-import fallback), the
  single animate-pulse on the outer div is correct because there
  are no children to compound against.
- **Tab-strip primitives** (audited POLISH-307). The app has
  *three* tab-strip shapes and they are intentionally different —
  each encodes a different semantic, so a future audit should
  resist unifying them:
  1. **Nav tabs** (`rounded-xl` + accent border): "pick a
     destination" — /deposit payment-method tabs. One-of-N where
     each option is a separate flow.
  2. **Segmented control** (`rounded-md` inside a `rounded-lg`
     container): "pick one of a small N" — /leaderboard game
     tabs. Tight compound control; the outer radius groups them.
  3. **Filter pills** (`rounded-full` with accent-outline fill):
     "apply/remove a filter" — ActivityFeed kind filters. Filter
     semantics are pill-shaped across the industry and the
     fully-round shape signals "removable tag," not "destination."
  Two other `role="tablist"` attachments exist for a11y reasons but
  are not tab strips visually: /wallet quick-action rail is a
  4-tile grid (W3C tablist pattern for arrow-key shuffling only,
  POLISH-252), GamesHub is a large-card grid. Don't migrate either
  toward one of the three shapes above.
  Focus-visible ring tokens: all five attachments use
  `focus-visible:ring-2 focus-visible:ring-cyan-300/60` — this IS
  a consistency contract, pin it. /leaderboard was missing this
  token until the POLISH-307 audit; if a new tab strip lands,
  verify the ring token is present before closing the ticket.
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
  surface). `/wallet` → `/stacker` (closest out if wallet itself
  crashes). `/account` → `/wallet`. `/stacker` → `/play`.
  Eyebrow tone: `tone="danger"` only when the error implicates a
  money-touching surface (generic catch-all + /wallet);
  `tone="muted"` for read-only surfaces (/account, /stacker, 404).
  Auto-retry: `autoRetrySeconds={5}` everywhere *except* 404 (no
  retry for missing URLs). Auto-retry is **disabled entirely under
  reduced-motion** (OS `prefers-reduced-motion` OR in-app
  `usePrefs().reducedMotion`, loose OR) — audited POLISH-306. The
  rationale: a ticking countdown is visual motion *and* the
  `aria-live="polite"` announcement fires every second (chattery for
  screen readers). The retry button stays focused on mount
  (POLISH-274), so a keyboard user can hit Enter and still get an
  instant retry. The flag is read dual-gate (both sources). If the
  pref flips mid-countdown, the timer cancels; it does not re-arm
  if the pref flips back. Don't "be clever" and just multiply the
  countdown duration — the motion + chatter concerns don't scale
  away with a longer fuse.
- **Heading landmark contract** (audited POLISH-342). Every route
  has exactly one `<h1>`, nested `<h2>`/`<h3>` below it. Audited
  via curl of `view-source` on all 11 routes. Nine returned the
  expected heading tree in initial HTML. Two (`/deposit`,
  `/stacker`) returned **false negatives** — their h1 is rendered
  inside a `<Suspense>` boundary (DepositSkeleton fallback) or
  triggers `BAILOUT_TO_CLIENT_SIDE_RENDERING`, so the server HTML
  ships the fallback template, not the hydrated page. Source
  inspection confirms both define h1s (deposit/page.tsx:52,
  stacker/page.tsx:229). If a future audit script greps
  server-rendered HTML for headings, it must either (a) hydrate
  first, or (b) walk source files for `<h1`/`<motion.h1`. Don't
  "fix" the false negatives by hoisting the h1 above the Suspense
  boundary — the fallback is intentional and the lazy boundary
  exists to keep initial JS small.
- **Page-level eyebrow shape contract** (audited POLISH-343).
  Two shapes, picked by surface type — do not blend.
  1. **Flat text eyebrow** (utility routes): `text-xs uppercase
     tracking-widest text-{tone}-300 mb-2`, tone = the route
     accent (cyan for neutral/info, orange for deposit, rose for
     withdraw, violet for send). No border, no background, no
     dot. Used by /wallet, /send, /withdraw, /deposit, /account,
     /settings, /leaderboard, /play. If the route is
     money-touching (/send, /account, etc.) pair the eyebrow with
     an inline `<Pill size="xs" mono>demo</Pill>` — do NOT encode
     "demo" inside a pill-with-dot eyebrow, keep the demo
     disclosure as its own token beside the flat text.
  2. **Pill-with-dot eyebrow** (marketing/landing routes):
     `inline-flex rounded-full border border-{tone}-300/30
     bg-{tone}-300/[0.05] px-3 py-1` with a leading
     `h-1.5 w-1.5 rounded-full bg-{tone}-300` dot (animate-pulse
     if "live"). Used by /stacker (live pulse), /fair-play (static),
     /stacker (Pill primitive variant). These routes want heavier
     hierarchy because the hero is longer and the eyebrow reads
     as a signpost, not a section header.
  ErrorScaffold's eyebrow is deliberately flat text (no pill) —
  matches Shape 1 so error boundaries don't accidentally compete
  with landing eyebrows for visual weight. If a new route needs
  an eyebrow: pick utility vs landing from the surface type, not
  from the tone you want. Don't invent a third shape.
- **`.sr-only` has five legitimate roles** (audited POLISH-361).
  The app uses Tailwind's `.sr-only` utility only — zero
  hand-rolled `visually-hidden` / `clip: rect(...)` strays across
  31 uses. Reach for sr-only when one of these applies; otherwise
  prefer `aria-label` (simpler, no DOM node):
  1. **Input `<label>` when the visible affordance replaces the
     label text** — e.g. DropWallet `<label htmlFor="buy-amt"
     className="sr-only">Amount</label>` when the input already
     has a visible numeric label adjacent. Keeps `htmlFor` →
     `id` wiring correct for AT without duplicating text.
  2. **aria-live announcement region** — `<span className="sr-only"
     aria-live="polite" aria-atomic="true">`. Used for ephemeral
     updates that need SR attention without a visible toast or
     banner: wallet balance change (POLISH-318), deposit stage
     (POLISH-228), memo-counter approaching cap (POLISH-89),
     BottomNav route-change announcement (POLISH-354). Always
     paired with aria-atomic when the whole message should be
     re-read on update.
  3. **aria-describedby hint** — `<span id="field-hint"
     className="sr-only">...</span>` with a matching
     `aria-describedby="field-hint"` on the input. Used when the
     visible affordance doesn't carry enough context (validation
     rule, format expectation) and an aria-label on the input
     itself would be too long / would step on the visible label.
  4. **Supplemental text next to an aria-hidden visual** — e.g.
     CommandPalette's "here" pill is `aria-hidden` (redundant
     with aria-current) and an `sr-only ", current page"` sibling
     carries the AT message. Use when the visual element is
     decorative + the semantic message is a distinct phrase.
  5. **Hidden interactive form input** — Toggle primitive uses
     `peer sr-only` on the real `<input type="checkbox">` so
     the visible slider gets keyboard focus via the peer selector
     while the input stays out of the visual flow. Not a text
     pattern; included here so "sr-only on an input" reads as
     intentional not dead code.
  When NOT to use sr-only: a single-word accessible name on a
  button/link — use `aria-label="Copy principal"`, not an sr-only
  `<span>`. aria-label is simpler, doesn't emit an extra DOM
  node, and is easier to grep for. The sr-only span is for
  *phrase-length* content or when aria-label can't sit on the
  right element (e.g. label for an input).
  One pattern to avoid: conditional `sr-only` as a visibility
  toggle is fine when the element is a persistent live-region
  (/leaderboard's rank callout, POLISH-300) — but don't use it to
  "hide a link when the page doesn't need it." That's a
  `{condition && <Link/>}` conditional render, not an sr-only
  gate. The live-region exception works because the `<div
  role="status">` must stay mounted to collect announcements.

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

- **CommandPalette async quick-actions** (audited POLISH-384).
  Every `run: async () => {...}` in CommandPalette.tsx calls
  `setOpen(false)` synchronously FIRST, then fires the side
  effect. The palette unmounts before the await resolves, so
  the focus-trap concern (palette still open during an async
  action) doesn't apply — BottomSheet.tsx L147-154 restores
  focus to `previouslyFocused` on unmount, which lands on the
  original Cmd+K trigger. If a future action needs to stay
  open while awaiting (e.g. inline loading UI inside the
  palette), the action must skip the `setOpen(false)` call
  AND manage its own focus-trap + busy state — but today,
  nothing does that. Async actions also guard re-entry via
  `authBusy` refs so Cmd+K mid-action doesn't double-fire.
- **Money-flow compose-card shape** (audited POLISH-373).
  `/send` and `/withdraw` compose-stage and review-stage cards share
  exactly `rounded-2xl border border-white/10 bg-white/[0.02] p-5
  md:p-7 space-y-5` for compose, and `lw-reveal rounded-2xl border
  border-{accent}-300/30 bg-{accent}-300/[0.04] p-5 md:p-7 space-y-5`
  for review (accent = violet on /send, rose on /withdraw). The
  `space-y-5` ladder and `p-5 md:p-7` padding pair are load-bearing:
  any new money-flow card (tip, stake, batch-send) should match
  verbatim. If a surface genuinely needs tighter spacing (e.g. a
  collapsible advanced drawer), nest a second container with its
  own `space-y-*` instead of overriding on the outer card. Don't
  split the ladder mid-card — that reads as two cards when it's
  still one thought.

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
