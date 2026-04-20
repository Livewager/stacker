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
import { useRouter } from "next/navigation";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ROUTES } from "@/lib/routes";

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
];

const GAME_SHORTCUTS: Shortcut[] = [
  { keys: ["Space"], what: "Stacker: lock the slider" },
  { keys: ["Enter"], what: "Stacker: lock the slider" },
  { keys: ["←", "→"], what: "Tilt Pour: tilt (desktop fallback)" },
];

export default function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  // -------- hotkeys --------
  useEffect(() => {
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
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
    ],
    [go],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return commands;
    return commands.filter(
      (c) =>
        c.label.toLowerCase().includes(needle) ||
        (c.hint?.toLowerCase().includes(needle) ?? false),
    );
  }, [q, commands]);

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

      <ul className="mt-3 max-h-60 overflow-y-auto divide-y divide-white/5 rounded-lg border border-white/10 bg-black/20">
        {filtered.length === 0 ? (
          <li className="px-3 py-3 text-xs text-gray-500">No matches.</li>
        ) : (
          filtered.map((c) => (
            <li key={c.id}>
              <button
                onClick={c.run}
                className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-white/[0.03] transition focus:outline-none focus-visible:bg-white/[0.05]"
              >
                <span className="text-sm text-white">{c.label}</span>
                {c.hint && (
                  <span className="text-[10px] font-mono uppercase tracking-widest text-gray-500">
                    {c.hint}
                  </span>
                )}
              </button>
            </li>
          ))
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
