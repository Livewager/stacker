"use client";

/**
 * Power-user disclosure panel for /wallet.
 *
 * Collapsed by default; expands to show:
 *   - Raw balance (base units, integer — no decimal shift).
 *   - Token decimals, symbol (static — ICRC-1 metadata mirrors).
 *   - Ledger canister id + IC gateway host.
 *
 * Everything is copyable. This is the "I want the primitive values"
 * affordance the formatted 4-decimal display hides — useful for
 * scripting against Candid, debugging fee math, or verifying what
 * the ledger returned against what the UI rendered.
 *
 * No network calls — all values come from the already-loaded balance
 * + static constants / env resolution.
 */

import { useMemo, useState } from "react";
import { useWalletState } from "@/components/shared/WalletContext";
import { useCopyable } from "@/lib/clipboard";
import { LWP_DECIMALS } from "@/lib/icp";
import { resolveCanisterId, resolveHost } from "@/lib/icp/actor";

const LWP_SYMBOL = "LWP";

export function WalletAdvanced() {
  const { balance } = useWalletState();
  const [open, setOpen] = useState(false);
  const copy = useCopyable();

  // Resolve once on mount — these don't change during a session.
  const canisterId = useMemo(() => {
    try {
      return resolveCanisterId().toText();
    } catch {
      return "—";
    }
  }, []);
  const host = useMemo(() => {
    try {
      return resolveHost();
    } catch {
      return "—";
    }
  }, []);

  const rawBalance = balance !== null ? balance.toString() : "—";

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="wallet-advanced-panel"
        className="w-full flex items-center justify-between px-5 py-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60 rounded-2xl"
      >
        <div className="text-[10px] uppercase tracking-widest text-cyan-300">
          Advanced
        </div>
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-gray-500">
          <span>{open ? "hide" : "show"}</span>
          <svg
            viewBox="0 0 20 20"
            className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
            fill="currentColor"
            aria-hidden
          >
            <path d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4Z" />
          </svg>
        </div>
      </button>
      {open && (
        <div
          id="wallet-advanced-panel"
          className="border-t border-white/5 px-5 py-4 space-y-3 lw-reveal"
        >
          {/* Copy-all shortcut: dumps every row as a YAML-ish block
              so a power user can paste "balance + canister + host"
              into a support thread in one action, instead of a
              five-tap tour through the individual copy buttons. Mirrors
              the "Copy diagnostics" button pattern from /settings.
              POLISH-230 audit 2026-04-20: the `lines` array below is
              a literal with hardcoded order — so successive support
              pastes diff cleanly. If a future refactor switches to
              Object.entries()/.map(), preserve the key order
              explicitly (declare an ORDER tuple and index into it)
              so JS engine insertion-order quirks can't drift the
              output between calls. */}
          <div className="flex items-center justify-between -mt-1 mb-1">
            <span className="text-[10px] uppercase tracking-widest text-gray-500">
              Raw values
            </span>
            <button
              type="button"
              onClick={() => {
                const lines = [
                  `raw_balance: ${rawBalance}`,
                  `decimals: ${LWP_DECIMALS}`,
                  `symbol: ${LWP_SYMBOL}`,
                  `ledger_canister: ${canisterId}`,
                  `gateway_host: ${host}`,
                ];
                copy(lines.join("\n"), { label: "Advanced values" });
              }}
              className="rounded-md border border-white/15 px-2.5 py-1 text-[10px] uppercase tracking-widest text-gray-300 hover:text-white hover:border-white/30 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60"
              aria-label="Copy all advanced values as a YAML-ish block"
            >
              Copy all
            </button>
          </div>
          <AdvancedRow
            label="Raw balance"
            value={rawBalance}
            hint={`base units · shift by 10^${LWP_DECIMALS}`}
            copyValue={balance !== null ? balance.toString() : null}
            copy={copy}
            copyLabel="Raw balance"
          />
          <AdvancedRow
            label="Decimals"
            value={String(LWP_DECIMALS)}
            hint="ICRC-1 `decimals`"
            copyValue={String(LWP_DECIMALS)}
            copy={copy}
            copyLabel="Decimals"
          />
          <AdvancedRow
            label="Symbol"
            value={LWP_SYMBOL}
            hint="ICRC-1 `symbol`"
            copyValue={LWP_SYMBOL}
            copy={copy}
            copyLabel="Symbol"
          />
          <AdvancedRow
            label="Ledger canister"
            value={canisterId}
            hint="points_ledger · ICRC-1/2/3"
            copyValue={canisterId !== "—" ? canisterId : null}
            copy={copy}
            copyLabel="Canister id"
            mono
          />
          <AdvancedRow
            label="Gateway host"
            value={host}
            hint="IC HTTP gateway"
            copyValue={host !== "—" ? host : null}
            copy={copy}
            copyLabel="Host"
            mono
          />
          <p className="text-[10px] text-gray-500 leading-snug pt-1">
            Primitive values the formatted display hides. Useful for
            Candid scripting, fee math, or verifying the UI against the
            ledger.
          </p>
        </div>
      )}
    </section>
  );
}

function AdvancedRow({
  label,
  value,
  hint,
  copyValue,
  copy,
  copyLabel,
  mono,
}: {
  label: string;
  value: string;
  hint: string;
  copyValue: string | null;
  copy: ReturnType<typeof useCopyable>;
  copyLabel: string;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-3">
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-widest text-gray-400 mb-0.5">
          {label}
        </div>
        <div
          className={`truncate text-sm text-white ${mono ? "font-mono text-xs tabular-nums" : "font-mono tabular-nums"}`}
          title={value}
        >
          {value}
        </div>
        <div className="text-[10px] text-gray-500">{hint}</div>
      </div>
      <button
        type="button"
        onClick={() => copyValue && copy(copyValue, { label: copyLabel })}
        disabled={!copyValue}
        className="rounded-md border border-white/15 px-2.5 py-1 text-[10px] uppercase tracking-widest text-gray-200 hover:text-white hover:border-white/30 transition disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label={`Copy ${label}`}
      >
        Copy
      </button>
    </div>
  );
}
