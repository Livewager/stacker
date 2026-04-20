# DUNK build tick — session handoff

**Paused:** 2026-04-20
**Last commit:** `b01ecd4` (POLISH-329)
**Branch:** `master` (local only; never pushed)

## State at pause

- **Test suite:** 221 passing (`npm test`), no failures
- **Routes:** 10/10 return 200 on `localhost:3002`
- **Working tree:** clean after POLISH-329 commit
- **Typecheck:** clean (`npx tsc --noEmit`)

## Last 12 ticks shipped (this session)

| # | Ticket | Type | Commit |
|---|---|---|---|
| POLISH-318 | WalletNav balance live-region delta-aware | a11y | `f7d8e5e` |
| POLISH-319 | hover-bg opacity audit — pin +2–5% rule | consistency (audit-close) | `3c0f7e7` |
| POLISH-320 | BottomSheet max-h-[85dvh] + internal scroll | mobile | `531b8db` |
| POLISH-321 | ErrorScaffold no lw-reveal entrance | motion (audit-close) | `e3cc88a` |
| POLISH-322 | /leaderboard canister timeout — no fetch exists | error (audit-close) | `3640cfd` |
| POLISH-323 | ErrorScaffold auto-retry contract tests (29) | test coverage | `f822e9f` |
| POLISH-324 | Toast action + dismiss aria-label scope suffix | a11y | `7d477b4` |
| POLISH-325 | Button tone-aware pulse via `--lw-pulse-rgb` | consistency | `d24bbfa` |
| POLISH-326 | /dunk hero CTA whitespace-nowrap + premise-cut | mobile | `710e205` |
| POLISH-327 | lw-balance-flash suppressed while pending | motion | `2b5d543` |
| POLISH-328 | /send self-principal guard — already blocked | error (audit-close) | `c78251e` |
| POLISH-329 | WalletNav formatLWP perf — pin measurement | perf (audit-close) | `b01ecd4` |

## What we still need to complete

Six tickets are queued and pending. Work order: lowest ID first.

### Pending (queued this session, not yet claimed)

- **POLISH-330** — a11y: CommandPalette active-route marker announcement
  Audit whether `aria-current="page"` (already wired from POLISH-165) is
  sufficient for SR announcement of the current-route row, or if the
  POLISH-50 "here" badge should add an sr-only "(current page)" suffix
  to the accessible name. Depends on how NVDA/VoiceOver/JAWS treat
  aria-current on `<button>` elements inside a non-list container.

- **POLISH-331** — Visual consistency: input placeholder opacity across field primitives
  Catalogue placeholder treatment across AmountField, /send recipient,
  /withdraw LTC address, CommandPalette search. Pin the contract or
  unify drift. Likely an audit-close similar to POLISH-319's +2–5%
  finding (base-relative opacity rather than fixed tier).

- **POLISH-332** — Mobile: /deposit LTC confirmation rail horizontal scroll on 320px
  The POLISH-49 stage labels ("Watching" → "1 of 2 confirmations" →
  "Minting" → "Done") can exceed 320px when laid out inline. Decide
  scroll-x (POLISH-260 pattern) vs vertical stack vs abbreviate labels.
  Likely scroll-x to match the stat-chip strip convention.

- **POLISH-333** — Motion quality: route-transition loader flash suppression
  POLISH-136 loader flashes on sub-100ms cached navigations. Add a
  ~120ms "show after" delay gate so fast transitions don't surface the
  loader at all while slow ones still do. Small useEffect with a
  setTimeout that cancels on route-change-complete.

- **POLISH-334** — Empty state: /play hub when no games have been played yet
  First-visit /play shows "Best: 0" / "Best: —" on every card.
  Evaluate first-visit banner ("First round on the house") vs per-card
  "New · play first round" framing. Could go either way; tune with
  route-intent (this is a discovery surface, so a louder banner fits).

- **POLISH-335** — Test coverage: Toast reducer contract
  Behavioral tests for push/dismiss/auto-TTL/repeatCount merge /
  undo-via-action. Same mirror-the-contract pattern as the 6 existing
  contract test files. Probably 20–30 tests, suite would grow 221 →
  ~245.

### Older-but-still-open (deprioritized or out-of-scope)

- **POLISH-199** — /dunk gamepad button hint (deprioritized from session start — low value vs game-already-keyboard-capable)
- **ANTICHEAT-T1 / T2 / T3** (7 tickets) — canister-side work, not dunk-app UI scope
- **ICP-19** — Commit + push of old prep-work. Dunk-app is local-only; this is a different repo concern.

## Where context lives

- **Design token catalogue:** `CONTRIBUTING.md` under "Design tokens
  already in use (don't re-audit)" — 14 entries pinned this session
  alone, prevents re-audit loops.
- **Per-call-site pinned decisions:** grep for `POLISH-3` comments in
  `src/` to find audit-close reasoning inline next to the code that
  carries the contract.
- **Contract test suite:** `test/*.contract.test.mjs` — 7 files, 221
  tests. Mirror-the-contract pattern (no jsdom, no framework).

## Cadence

- Each tick is ~270s wakeup → ScheduleWakeup with `<<autonomous-loop-dynamic>>`.
- Every tick: claim lowest pending, 1 focused unit of work, typecheck +
  10-route smoke, local commit with `Co-Authored-By: Claude Opus 4.7`
  trailer, mark complete, schedule next.
- When backlog empties, queue 6 new tickets spanning the spread: a11y,
  visual consistency, mobile, motion quality, empty/error, perf,
  test coverage (one per axis).

## Resume by

Send any DUNK build tick prompt. The loop picks up from POLISH-330.
