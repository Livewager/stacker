"use client";

/**
 * Command palette + keyboard shortcuts cheat sheet.
 *
 * Global hotkeys:
 *   Cmd/Ctrl+K  → open
 *   ?           → open (ignored when typing in an input)
 *   Esc         → close
 *
 * Lists every primary route plus the two game-surface shortcuts so a
 * first-time keyboard user can discover the surface without docs.
 *
 * Reuses the existing BottomSheet primitive so focus trap, scroll lock,
 * and mobile-friendly positioning all come for free.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ROUTES } from "@/lib/routes";
import { useWalletState } from "@/components/dunk/WalletContext";
import { writeRaw, PREF_KEYS, clearSessionState } from "@/lib/prefs";
import { useCopyable } from "@/lib/clipboard";
import { useToast } from "@/components/dunk/Toast";
import { formatLWP } from "@/lib/icp";
import { useReducedMotion } from "@/lib/hooks/useReducedMotion";

/**
 * Global event name other components can dispatch to open the palette
 * without importing the component (keeps the import graph clean).
 * Example: window.dispatchEvent(new Event(OPEN_PALETTE_EVENT)).
 */
export const OPEN_PALETTE_EVENT = "lw:open-palette";

/**
 * POLISH-360 — stable ids for the listbox + its options. Fixed
 * strings (not useId()) because there's only ever one palette
 * instance mounted at a time via AppShell, so collisions aren't
 * a concern and the stability keeps `aria-activedescendant` from
 * re-rendering with a new id every mount.
 */
const LISTBOX_ID = "lw-cmdp-listbox";
function optionId(commandId: string): string {
  return `lw-cmdp-option-${commandId}`;
}

/**
 * Rotating placeholder hints surfaced in the search input while the
 * palette is open + empty + unfocused. First entry is the canonical
 * prompt — it's also the only string shown to reduced-motion users
 * and to users who focused the input immediately. Subsequent entries
 * teach the palette's affordances (fuzzy match, Esc) without
 * requiring docs.
 */
const PALETTE_HINTS = [
  "Go to…",
  "Try: “wallet” or “leaderboard”",
  "Type to fuzzy-match",
  "Esc to close · ↵ to run",
] as const;

/**
 * Character-subsequence fuzzy match with a simple score. Returns
 * null if any needle char is missing. Lower score = better match
 * (fewer gaps, earlier first hit). Not a full Smith-Waterman — this
 * is a command palette, exactness isn't the point.
 */
function fuzzyScore(haystack: string, needle: string): number | null {
  if (!needle) return 0;
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  let hi = 0;
  let ni = 0;
  let gapPenalty = 0;
  let firstHit = -1;
  while (ni < n.length && hi < h.length) {
    if (h[hi] === n[ni]) {
      if (firstHit === -1) firstHit = hi;
      ni++;
    } else if (ni > 0) {
      gapPenalty++;
    }
    hi++;
  }
  if (ni < n.length) return null;
  return firstHit + gapPenalty;
}

type Command = {
  id: string;
  label: string;
  hint?: string;
  keys?: string[];
  run: () => void;
};

type Shortcut = {
  keys: string[];
  what: string;
};

const GLOBAL_SHORTCUTS: Shortcut[] = [
  { keys: ["⌘", "K"], what: "Open command palette" },
  { keys: ["?"], what: "Open command palette" },
  { keys: ["Esc"], what: "Close dialogs" },
  { keys: ["g", "p"], what: "Go to Play" },
  { keys: ["g", "d"], what: "Go to Tilt Pour" },
  { keys: ["g", "s"], what: "Go to Stacker" },
  { keys: ["g", "w"], what: "Go to Wallet" },
  { keys: ["g", "a"], what: "Go to Account" },
  { keys: ["g", "r"], what: "Go to Leaderboard (ranks)" },
  { keys: ["g", "n"], what: "Go to Send (next)" },
  { keys: ["g", "t"], what: "Go to Settings" },
];

const GAME_SHORTCUTS: Shortcut[] = [
  { keys: ["Space"], what: "Stacker: lock the slider" },
  { keys: ["Enter"], what: "Stacker: lock the slider" },
  { keys: ["←", "→"], what: "Tilt Pour: tilt (desktop fallback)" },
];

export default function CommandPalette() {
  const router = useRouter();
  const pathname = usePathname() || "";
  const { identity, principal, balance, login, logout } = useWalletState();
  const copy = useCopyable();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  // Track login/logout in-flight so the palette can show "…" and
  // prevent double-fire if the user hammers Enter.
  const [authBusy, setAuthBusy] = useState(false);
  // Rotating placeholder hints — cycles every 4s when the palette
  // is open and the input is empty + unfocused. First-time users
  // discover fuzzy matching + Esc without needing to read the help
  // strip below. Reduced-motion + focused users see the first
  // hint only; no movement beyond that.
  const reducedMotion = useReducedMotion();
  const [hintIndex, setHintIndex] = useState(0);
  const [inputFocused, setInputFocused] = useState(false);
  // POLISH-357 — keyboard navigation across the result list.
  // activeIdx is the currently-highlighted row; it tracks the user's
  // ArrowDown/Up / j/k steps without moving DOM focus off the input
  // (so typing keeps working). The active row scrolls into view via
  // the rowRefs map on every idx change. Reset to 0 whenever the
  // filtered list shape changes so a stale idx never points past the
  // end of a now-smaller list. Enter fires the *active* row, not
  // filtered[0] — previously Enter ran the top result regardless of
  // whether the user had paged down to a lower match.
  const [activeIdx, setActiveIdx] = useState(0);
  const rowRefs = useRef(new Map<string, HTMLLIElement>());

  // Track in-session route history: every pathname change bumps the
  // current route to the head of the recent list, deduped, capped at 3.
  useEffect(() => {
    if (!pathname) return;
    setRecent((prev) => {
      const next = [pathname, ...prev.filter((p) => p !== pathname)];
      return next.slice(0, 3);
    });
  }, [pathname]);

  // -------- hotkeys --------
  // Vim-style leader key: press `g` then a letter within 1.5s to
  // navigate. Mapped against the primary routes; inert while typing.
  useEffect(() => {
    let leaderExpires = 0;
    const LEADER_MS = 1500;
    const LEADER_MAP: Record<string, string> = {
      p: ROUTES.play,
      d: ROUTES.dunk,
      s: ROUTES.stacker,
      w: ROUTES.wallet,
      a: ROUTES.account,
      r: ROUTES.leaderboard, // r for "ranks"
      n: ROUTES.send, // n for "send next"
      t: ROUTES.settings, // t for "settings"
    };

    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      const typing =
        tag === "input" || tag === "textarea" || tag === "select" ||
        (e.target as HTMLElement | null)?.isContentEditable;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === "?" && !typing) {
        e.preventDefault();
        setOpen(true);
        return;
      }

      if (typing) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // Leader activation
      if (e.key === "g") {
        leaderExpires = performance.now() + LEADER_MS;
        return;
      }
      // Leader follow-through within window
      if (performance.now() < leaderExpires) {
        const target = LEADER_MAP[e.key.toLowerCase()];
        if (target) {
          e.preventDefault();
          leaderExpires = 0;
          router.push(target);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  // Imperative open hook: any component can dispatch OPEN_PALETTE_EVENT
  // to surface the palette. Used by the header's ⌘K discovery hint so
  // mouse-first users can still try the feature without memorising a
  // keyboard shortcut.
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_PALETTE_EVENT, onOpen);
  }, []);

  // Stamp "user has discovered the palette" once it opens for the
  // first time. Written through the shared prefs pipeline so the
  // header's hint pill can react immediately across tabs.
  useEffect(() => {
    if (open) writeRaw<boolean>(PREF_KEYS.hasOpenedPalette, true);
  }, [open]);

  const go = useCallback(
    (path: string) => {
      setOpen(false);
      router.push(path);
    },
    [router],
  );

  const authCommand: Command = useMemo(() => {
    // Single slot toggles based on current II session. Close the
    // palette first so the II popup isn't rendered behind the sheet;
    // then fire the async action with a busy flag to dedupe repeats.
    if (identity) {
      return {
        id: "auth-signout",
        label: authBusy ? "Signing out…" : "Sign out",
        hint: "End this Internet Identity session",
        run: async () => {
          if (authBusy) return;
          setOpen(false);
          setAuthBusy(true);
          try {
            await logout();
          } finally {
            setAuthBusy(false);
          }
        },
      };
    }
    return {
      id: "auth-signin",
      label: authBusy ? "Opening Internet Identity…" : "Sign in with Internet Identity",
      hint: "Authenticate to unlock wallet + ranked play",
      run: async () => {
        if (authBusy) return;
        setOpen(false);
        setAuthBusy(true);
        try {
          await login();
        } finally {
          setAuthBusy(false);
        }
      },
    };
  }, [identity, login, logout, authBusy]);

  // In-place verb commands. Distinct from the navigation entries
  // below: these act on the current session instead of routing. Each
  // one closes the palette before running so the toast lands on the
  // actual page context, not behind the sheet.
  const actionCommands: Command[] = useMemo(() => {
    const out: Command[] = [];
    if (identity && principal) {
      out.push({
        id: "action-copy-principal",
        label: "Copy principal",
        hint: "Clipboard · your II principal",
        run: () => {
          setOpen(false);
          copy(principal, { label: "Principal" });
        },
      });
    }
    if (identity && balance !== null) {
      out.push({
        id: "action-copy-balance",
        label: "Copy balance",
        hint: `Clipboard · ${formatLWP(balance, 4)} LWP`,
        run: () => {
          setOpen(false);
          copy(`${formatLWP(balance, 4)} LWP`, { label: "Balance" });
        },
      });
    }
    out.push({
      id: "action-clear-session",
      label: "Clear session state",
      hint: "Reset cap, recent recipients, calibration · preferences kept",
      run: () => {
        setOpen(false);
        clearSessionState();
        toast.push({
          kind: "success",
          title: "Session cleared",
          description:
            "Session cap, recent recipients, last-played, and calibration reset. Preferences kept.",
        });
      },
    });
    return out;
  }, [identity, principal, balance, copy, toast]);

  const commands: Command[] = useMemo(
    () => [
      authCommand,
      ...actionCommands,
      { id: "play", label: "Games hub", hint: ROUTES.play, run: () => go(ROUTES.play) },
      { id: "dunk", label: "Tilt Pour", hint: ROUTES.dunk, run: () => go(ROUTES.dunk) },
      { id: "stacker", label: "Stacker", hint: ROUTES.stacker, run: () => go(ROUTES.stacker) },
      { id: "wallet", label: "Wallet", hint: ROUTES.wallet, run: () => go(ROUTES.wallet) },
      { id: "account", label: "Account", hint: ROUTES.account, run: () => go(ROUTES.account) },
      { id: "deposit", label: "Deposit", hint: ROUTES.deposit, run: () => go(ROUTES.deposit) },
      { id: "send", label: "Send", hint: ROUTES.send, run: () => go(ROUTES.send) },
      { id: "withdraw", label: "Withdraw", hint: ROUTES.withdraw, run: () => go(ROUTES.withdraw) },
      { id: "leaderboard", label: "Leaderboard", hint: ROUTES.leaderboard, run: () => go(ROUTES.leaderboard) },
      { id: "settings", label: "Settings", hint: ROUTES.settings, run: () => go(ROUTES.settings) },
      { id: "settings-display", label: "Settings · Display & motion", hint: `${ROUTES.settings}#display`, run: () => go(`${ROUTES.settings}#display`) },
      { id: "settings-audio", label: "Settings · Audio & feedback", hint: `${ROUTES.settings}#audio`, run: () => go(`${ROUTES.settings}#audio`) },
      { id: "settings-cap", label: "Settings · Session cap", hint: `${ROUTES.settings}#cap`, run: () => go(`${ROUTES.settings}#cap`) },
      { id: "settings-account", label: "Settings · Account", hint: `${ROUTES.settings}#account`, run: () => go(`${ROUTES.settings}#account`) },
      { id: "settings-diagnostics", label: "Settings · Diagnostics", hint: `${ROUTES.settings}#diagnostics`, run: () => go(`${ROUTES.settings}#diagnostics`) },
      { id: "settings-data", label: "Settings · Device data", hint: `${ROUTES.settings}#data`, run: () => go(`${ROUTES.settings}#data`) },
    ],
    [go, authCommand, actionCommands],
  );

  // Authoritative "is this path still a thing we route to?" set,
  // derived from the commands list's hints. A recent-route entry
  // whose path isn't in here is stale (route renamed / removed /
  // typoed pushState). Strip the #hash before comparison so
  // /settings#data in recent still matches the /settings command.
  const knownPaths = useMemo(
    () =>
      new Set(
        commands
          .map((c) => (c.hint ? c.hint.split("#")[0] : null))
          .filter((p): p is string => Boolean(p)),
      ),
    [commands],
  );

  // Pre-computed live-recent list shared by the header + the feed,
  // so the "Recent · this session" label never renders without rows
  // beneath it.
  const liveRecent = useMemo(
    () => recent.filter((p) => p !== pathname && knownPaths.has(p)),
    [recent, pathname, knownPaths],
  );

  // Two branches, split into separate memos so a keystroke in the
  // search box (which only mutates `q`) doesn't invalidate the
  // recent-first list's computation, and a change in `liveRecent`
  // (e.g. another tab navigating, via the recent-routes sync) doesn't
  // re-run the fuzzy scorer mid-search.
  //
  // Empty-query view: recent routes at the top, rest in declaration
  // order, current pathname filtered out. Reruns only when commands /
  // liveRecent / pathname change.
  const emptyQueryList = useMemo(() => {
    const recentCommands = liveRecent
      .map((p) => commands.find((c) => c.hint === p))
      .filter((c): c is Command => Boolean(c));
    const recentIds = new Set(recentCommands.map((c) => c.id));
    return [
      ...recentCommands,
      ...commands.filter((c) => !recentIds.has(c.id) && c.hint !== pathname),
    ];
  }, [commands, liveRecent, pathname]);

  // Search view: fuzzy-scored list. Reruns when the query (or the
  // authoritative commands list) changes; `liveRecent` and `pathname`
  // are intentionally NOT in deps — they aren't read on this path.
  const searchList = useMemo(() => {
    const needle = q.trim();
    if (!needle) return null;
    const scored = commands
      .map((c) => {
        const labelScore = fuzzyScore(c.label, needle);
        const hintScore = c.hint ? fuzzyScore(c.hint, needle) : null;
        let score: number | null = null;
        if (labelScore !== null) score = labelScore;
        if (hintScore !== null && (score === null || hintScore < score)) {
          score = hintScore;
        }
        return { c, score };
      })
      .filter((x) => x.score !== null)
      .sort((a, b) => (a.score as number) - (b.score as number));
    return scored.map((x) => x.c);
  }, [q, commands]);

  const filtered = searchList ?? emptyQueryList;

  // POLISH-357 — clamp activeIdx whenever the filtered list shrinks
  // or changes shape. Without this, typing to narrow results could
  // leave activeIdx pointing past the end (Enter would no-op and
  // the highlight would disappear). Reset to 0 on every filter
  // change: the new top match is almost always what the user wants
  // after a keystroke, and returning to the top feels right.
  useEffect(() => {
    setActiveIdx(0);
  }, [filtered.length, q]);

  // Scroll the active row into view whenever activeIdx changes.
  // block: "nearest" means we only scroll when the row is actually
  // off-screen — won't jitter when the user is navigating within
  // the already-visible window. Respects reduced motion: the
  // global `html.lw-reduce-motion` clamp zeroes scroll-behavior
  // anyway, but we also pass behavior: "auto" (default) rather
  // than "smooth" so even non-reduced-motion callers get a snap
  // — a result-list scroll is navigation, not decoration.
  useEffect(() => {
    if (!open) return;
    const id = filtered[activeIdx]?.id;
    if (!id) return;
    const el = rowRefs.current.get(id);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIdx, filtered, open]);

  // Close resets the search.
  useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  // Rotating placeholder hint scheduler. Runs only when the palette
  // is open, the input is empty, the input isn't focused, and the
  // user hasn't opted out of motion. `reducedMotion === null` during
  // the first render (pre-hydrate); treat that as "don't rotate yet"
  // to keep SSR + hydrate identical.
  useEffect(() => {
    if (!open) return;
    if (q.trim() !== "") return;
    if (inputFocused) return;
    if (reducedMotion !== false) return;
    const id = window.setInterval(() => {
      setHintIndex((i) => (i + 1) % PALETTE_HINTS.length);
    }, 4000);
    return () => window.clearInterval(id);
  }, [open, q, inputFocused, reducedMotion]);

  // Reset to hint 0 whenever the palette closes so a returning user
  // always sees the canonical prompt first.
  useEffect(() => {
    if (!open) setHintIndex(0);
  }, [open]);

  // Entrance animation is inherited from BottomSheet — slideUp 180ms
  // cubic-bezier(0.2,0.8,0.2,1) + scrim fadeIn 120ms. POLISH-267
  // audit: considered switching the palette to a fade-only entrance
  // (palette is a power-user utility and the 40–60ms of perceived
  // weight from the slide is mild friction), but cut it. Reasons
  // against: (1) BottomSheet is shared across 9 call sites
  // (Connect sheet, Settings modals, OnboardingNudge, StackerGame
  // settings, …) and a fade-vs-slide per-caller prop is more
  // surface area than the tweak's perceived benefit; (2) the
  // global prefers-reduced-motion / html.lw-reduce-motion clamp
  // already collapses animation-duration to 0.001ms, so the
  // "special-case gate" the ticket worried about isn't a real
  // cost — it's handled globally; (3) 180ms is well within the
  // "doesn't feel slow" threshold and the palette's input is
  // autofocused so the user is typing by the time the slide
  // completes. If the palette ever grows a faster-entry variant
  // (e.g. a ⌘K-twice accelerator), that's the right time to
  // revisit. For now: pinned audit, no change.
  return (
    <BottomSheet
      open={open}
      onClose={() => setOpen(false)}
      ariaLabel="Command palette"
      title="Jump anywhere"
      description="Start typing to filter. Enter to open."
    >
      {/* POLISH-360 — listbox semantics for SR users. The visible
          affordances (bg-white/[0.05] highlight, ring, scroll-into-
          view) already communicate the active row to sighted users.
          The aria-activedescendant pattern wires the same info to
          AT without moving DOM focus off the input (which would
          break typing). Per the APG combobox-list pattern:
            input  → role=combobox, aria-controls=LISTBOX_ID,
                     aria-expanded=(has results),
                     aria-activedescendant=(active option id)
            ul     → role=listbox, id=LISTBOX_ID
            button → role=option, id=OPTION_ID(c.id),
                     aria-selected={isActive}
          Option ids are derived from c.id so the mapping is stable
          across rerenders; no useId needed. */}
      <input
        data-autofocus
        role="combobox"
        aria-controls={LISTBOX_ID}
        aria-expanded={filtered.length > 0}
        aria-autocomplete="list"
        aria-activedescendant={
          filtered.length > 0 && filtered[activeIdx]
            ? optionId(filtered[activeIdx].id)
            : undefined
        }
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          // POLISH-357 — arrow/vim/Enter navigation against the
          // result list. Focus stays on the input the whole time
          // (typing continues to work); activeIdx is the cursor.
          // j/k mirror ArrowDown/ArrowUp to match the /leaderboard
          // keyboard contract (POLISH-130). Wrap at both ends so
          // a long list can cycle without reset. Home/End for
          // quick jumps. Enter fires the active row, not
          // filtered[0] — the old behavior ignored where the user
          // had paged to.
          if (filtered.length === 0) return;
          switch (e.key) {
            case "ArrowDown":
            case "j": {
              // j is an identifier char; guard against triggering
              // while the user is actually typing the letter "j"
              // in a fuzzy query. Only intercept when the input is
              // empty — every other keystroke gets through to the
              // onChange filter.
              if (e.key === "j" && q.length > 0) return;
              e.preventDefault();
              setActiveIdx((i) => (i + 1) % filtered.length);
              break;
            }
            case "ArrowUp":
            case "k": {
              if (e.key === "k" && q.length > 0) return;
              e.preventDefault();
              setActiveIdx((i) => (i - 1 + filtered.length) % filtered.length);
              break;
            }
            case "Home": {
              e.preventDefault();
              setActiveIdx(0);
              break;
            }
            case "End": {
              e.preventDefault();
              setActiveIdx(filtered.length - 1);
              break;
            }
            case "Enter": {
              e.preventDefault();
              const target = filtered[activeIdx] ?? filtered[0];
              target?.run();
              break;
            }
          }
        }}
        onFocus={() => setInputFocused(true)}
        onBlur={() => setInputFocused(false)}
        // Rotating hint when empty + unfocused + motion allowed.
        // reducedMotion === null (pre-hydrate) falls through to the
        // canonical first hint so SSR + first paint match.
        placeholder={PALETTE_HINTS[hintIndex] ?? PALETTE_HINTS[0]}
        className="w-full rounded-lg border border-white/10 bg-black/40 px-3 h-11 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-cyan-300/60 focus-visible:ring-2 focus-visible:ring-cyan-300/50"
        aria-label="Search commands"
      />

      {q.trim() === "" && liveRecent.length > 0 && (
        <div className="mt-3 text-[10px] uppercase tracking-widest text-cyan-300">
          Recent · this session
        </div>
      )}
      <ul
        id={LISTBOX_ID}
        role="listbox"
        aria-label="Commands"
        className="mt-2 max-h-60 overflow-y-auto divide-y divide-white/5 rounded-lg border border-white/10 bg-black/20"
      >
        {filtered.length === 0 ? (
          <li className="px-3 py-3 text-xs text-gray-500">No matches.</li>
        ) : (
          filtered.map((c, i) => {
            const isCurrent = c.hint === pathname;
            const isActive = i === activeIdx;
            return (
              <li
                key={c.id}
                ref={(el) => {
                  if (el) rowRefs.current.set(c.id, el);
                  else rowRefs.current.delete(c.id);
                }}
              >
                <button
                  id={optionId(c.id)}
                  role="option"
                  aria-selected={isActive}
                  // tabIndex=-1 keeps the row out of the Tab order —
                  // the combobox pattern wants keyboard focus to
                  // stay on the input and move the *active
                  // descendant* instead. Click still works for
                  // mouse users.
                  tabIndex={-1}
                  onClick={c.run}
                  onMouseEnter={() => setActiveIdx(i)}
                  aria-current={isCurrent ? "page" : undefined}
                  // POLISH-309 — hover + focus-visible bg tints were
                  // diverged (3% vs 5%) so a user moving between mouse
                  // and keyboard saw two different "this is the row"
                  // treatments. Unified on 5% — the brighter bg reads
                  // as confident selection for both input modes. The
                  // focus-visible ring stays keyboard-only: a mouse
                  // user doesn't need it (the cursor is already the
                  // pointer), but a keyboard user needs an unmissable
                  // second signal beyond bg. Using the same bg opacity
                  // plus an additive ring for keyboard is the standard
                  // "command-k" menu pattern (Linear, Raycast, GitHub).
                  //
                  // POLISH-357 — isActive adds the same bg-white/[0.05]
                  // treatment for arrow/j/k navigation so the active
                  // row always reads without requiring hover or focus
                  // movement. Mouse-enter also syncs activeIdx so
                  // alternating mouse+keyboard doesn't desync the
                  // highlight.
                  className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-300/50 ${
                    isCurrent
                      ? "bg-cyan-300/[0.04] cursor-default"
                      : isActive
                        ? "bg-white/[0.05]"
                        : "hover:bg-white/[0.05] focus-visible:bg-white/[0.05]"
                  }`}
                >
                  <span
                    className={`text-sm flex items-center gap-2 ${
                      isCurrent ? "text-gray-400" : "text-white"
                    }`}
                  >
                    {c.label}
                    {isCurrent && (
                      <>
                        {/* POLISH-330 — aria-current="page" is set on
                            the button above, but AT support on <button>
                            elements outside a <nav> varies (VoiceOver
                            announces it for <a> more reliably than
                            <button>, NVDA+browser combos differ, JAWS
                            is config-dependent). The visible "here"
                            pill is aria-hidden because AT already
                            reads the surrounding text; an sr-only
                            suffix carries the announcement in a form
                            every AT reliably reads. Appears as
                            "Wallet, current page" in the row's
                            accessible name, which is the same shape
                            Linear / Raycast / GitHub use for their
                            cmd-k palettes. */}
                        <span
                          aria-hidden
                          className="text-[9px] uppercase tracking-widest text-cyan-300 border border-cyan-300/40 rounded-full px-1.5 py-[1px]"
                        >
                          here
                        </span>
                        <span className="sr-only">, current page</span>
                      </>
                    )}
                  </span>
                  {c.hint && (
                    <span
                      className={`text-[10px] font-mono uppercase tracking-widest ${
                        isCurrent ? "text-cyan-300/70" : "text-gray-500"
                      }`}
                    >
                      {c.hint}
                    </span>
                  )}
                </button>
              </li>
            );
          })
        )}
      </ul>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <ShortcutGroup title="Global" rows={GLOBAL_SHORTCUTS} />
        <ShortcutGroup title="Games" rows={GAME_SHORTCUTS} />
      </div>

      {/* Persistent help strip. Lives at the bottom of every palette
          open so first-time users discover the arrow-key + Enter +
          Esc loop without needing to read docs. Compact by design —
          not a substitute for the full shortcut grid above, just a
          contextual refresher for the in-palette keystrokes. */}
      <div
        className="mt-4 pt-3 border-t border-white/10 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10px] uppercase tracking-widest text-gray-500"
        role="note"
        aria-label="Palette keystrokes"
      >
        <HelpKey keys={["↑", "↓"]} label="navigate" />
        <HelpKey keys={["↵"]} label="run" />
        <HelpKey keys={["esc"]} label="close" />
        <span className="flex items-center gap-1.5">
          <kbd className="inline-flex items-center justify-center min-w-[1.25rem] h-4 rounded border border-white/15 bg-black/40 px-1 text-[10px] font-mono text-gray-200 normal-case">
            <PlatformModKey />
          </kbd>
          <kbd className="inline-flex items-center justify-center min-w-[1.25rem] h-4 rounded border border-white/15 bg-black/40 px-1 text-[10px] font-mono text-gray-200 normal-case">
            K
          </kbd>
          <span className="text-gray-500">reopen</span>
        </span>
      </div>
    </BottomSheet>
  );
}

function ShortcutGroup({ title, rows }: { title: string; rows: Shortcut[] }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-cyan-300 mb-2">
        {title}
      </div>
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.keys.join("+") + r.what} className="flex items-center justify-between gap-3 text-xs">
            <span className="text-gray-300">{r.what}</span>
            <span className="flex gap-1 shrink-0">
              {r.keys.map((k, i) => (
                <kbd
                  key={`${k}-${i}`}
                  className="rounded border border-white/15 bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-gray-200"
                >
                  {k}
                </kbd>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Single-row help chip for the palette's persistent keystroke strip.
 * Renders a <kbd> glyph per key plus a lowercase label. Intentionally
 * separate from ShortcutGroup above — that one is a scannable table,
 * this is a compact at-a-glance reminder.
 */
function HelpKey({ keys, label }: { keys: string[]; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      {keys.map((k, i) => (
        <kbd
          key={i}
          className="inline-flex items-center justify-center min-w-[1.25rem] h-4 rounded border border-white/15 bg-black/40 px-1 text-[10px] font-mono text-gray-200 normal-case"
        >
          {k}
        </kbd>
      ))}
      <span className="text-gray-500">{label}</span>
    </span>
  );
}

/**
 * Inline copy of the header's PlatformModKey. Mac + iOS/iPadOS show ⌘,
 * everything else falls back to ^ (Ctrl). Self-contained here so the
 * palette doesn't pull from AppHeader — AppHeader is client-hydrated
 * later and could briefly show the wrong glyph during SSR.
 */
function PlatformModKey() {
  const [glyph, setGlyph] = useState<"⌘" | "^">("⌘");
  useEffect(() => {
    const platform = navigator.platform || navigator.userAgent || "";
    if (!/mac|iphone|ipad|ipod/i.test(platform)) setGlyph("^");
  }, []);
  return <>{glyph}</>;
}
