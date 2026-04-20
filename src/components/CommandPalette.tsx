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

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ROUTES } from "@/lib/routes";

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
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [recent, setRecent] = useState<string[]>([]);

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

  const go = useCallback(
    (path: string) => {
      setOpen(false);
      router.push(path);
    },
    [router],
  );

  const commands: Command[] = useMemo(
    () => [
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
      { id: "settings-data", label: "Settings · Device data", hint: `${ROUTES.settings}#data`, run: () => go(`${ROUTES.settings}#data`) },
    ],
    [go],
  );

  const filtered = useMemo(() => {
    const needle = q.trim();
    if (!needle) {
      // Empty query: surface the most-recently-visited routes at the
      // top, then the rest in declaration order. Current pathname
      // filtered out — no "jump to where I already am".
      const recentCommands = recent
        .map((p) => commands.find((c) => c.hint === p && p !== pathname))
        .filter((c): c is Command => Boolean(c));
      const recentIds = new Set(recentCommands.map((c) => c.id));
      return [
        ...recentCommands,
        ...commands.filter((c) => !recentIds.has(c.id) && c.hint !== pathname),
      ];
    }
    // Fuzzy score both label and hint, take the minimum (best) score.
    // Drop anything that failed to match either.
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
  }, [q, commands, recent, pathname]);

  // Close resets the search.
  useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  return (
    <BottomSheet
      open={open}
      onClose={() => setOpen(false)}
      ariaLabel="Command palette"
      title="Jump anywhere"
      description="Start typing to filter. Enter to open."
    >
      <input
        data-autofocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && filtered.length > 0) {
            e.preventDefault();
            filtered[0].run();
          }
        }}
        placeholder="Go to…"
        className="w-full rounded-lg border border-white/10 bg-black/40 px-3 h-11 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-cyan-300/60"
        aria-label="Search commands"
      />

      {q.trim() === "" && recent.filter((p) => p !== pathname).length > 0 && (
        <div className="mt-3 text-[10px] uppercase tracking-widest text-cyan-300">
          Recent · this session
        </div>
      )}
      <ul className="mt-2 max-h-60 overflow-y-auto divide-y divide-white/5 rounded-lg border border-white/10 bg-black/20">
        {filtered.length === 0 ? (
          <li className="px-3 py-3 text-xs text-gray-500">No matches.</li>
        ) : (
          filtered.map((c) => {
            const isCurrent = c.hint === pathname;
            return (
              <li key={c.id}>
                <button
                  onClick={c.run}
                  aria-current={isCurrent ? "page" : undefined}
                  className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left transition focus:outline-none ${
                    isCurrent
                      ? "bg-cyan-300/[0.04] cursor-default"
                      : "hover:bg-white/[0.03] focus-visible:bg-white/[0.05]"
                  }`}
                >
                  <span
                    className={`text-sm flex items-center gap-2 ${
                      isCurrent ? "text-gray-400" : "text-white"
                    }`}
                  >
                    {c.label}
                    {isCurrent && (
                      <span className="text-[9px] uppercase tracking-widest text-cyan-300 border border-cyan-300/40 rounded-full px-1.5 py-[1px]">
                        here
                      </span>
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
