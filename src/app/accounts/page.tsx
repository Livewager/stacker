"use client";

/**
 * /accounts — Account manager.
 *
 * An account is a canister-level group of principals that all act
 * as "the same user." Balances sum across members; faucet rate
 * limits attach to the account so linking 5 devices can't multiply
 * the drip allowance.
 *
 * This page lets the signed-in user:
 *   - Create an account (first member = themselves)
 *   - See all current members with their live individual balances
 *   - Link another key — two flows:
 *       1. Paste a principal directly (fast, but requires you to
 *          already know the principal text from the other device)
 *       2. Generate a seed-phrase-backed recovery key, write down
 *          the 12 words, and add that derived principal to the
 *          account in one round-trip. The user can then recover
 *          that key on any device by typing the phrase back in.
 *   - Remove a member (with an orphan guard — can't remove the last)
 *   - View recovery phrase history on the current device
 *
 * Access is gated by the active session: whoever holds the active
 * key (from the roster) signs the RPCs. Non-members can read
 * `get_account` but not mutate.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Principal } from "@dfinity/principal";
import {
  getLedgerActor,
  loadActiveIdentity,
  loadRoster,
  loginFromSeedPhrase,
  accountOf,
  formatLwp,
  pointsLedgerCanisterId,
} from "@/lib/ic/agent";
import {
  generateSeedPhrase,
  isValidSeedPhrase,
  seedPhraseToIdentity,
} from "@/lib/ic/seed";
import type {
  _SERVICE,
  AccountInfo,
  AccountError,
} from "@/declarations/points_ledger/points_ledger.did";
import { ROUTES } from "@/lib/routes";
import { Button } from "@/components/ui/Button";
import { BottomSheet } from "@/components/ui/BottomSheet";

export default function AccountsPage() {
  const [identity, setIdentity] = useState(loadActiveIdentity());
  const [actor, setActor] = useState<_SERVICE | null>(null);
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [memberBalances, setMemberBalances] = useState<Map<string, bigint>>(
    new Map(),
  );
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const principal = identity?.getPrincipal().toText() ?? null;

  useEffect(() => {
    setIdentity(loadActiveIdentity());
  }, []);

  useEffect(() => {
    (async () => {
      const a = await getLedgerActor(identity ?? undefined);
      setActor(a);
    })();
  }, [identity]);

  const refresh = useCallback(async () => {
    if (!actor) return;
    setLoading(true);
    setErr(null);
    try {
      const info = await actor.my_account();
      const a = info[0] ?? null;
      setAccount(a);
      if (a) {
        const entries = await Promise.all(
          a.members.map(async (p) => {
            const b = await actor.icrc1_balance_of(accountOf(p.toText()));
            return [p.toText(), b] as const;
          }),
        );
        setMemberBalances(new Map(entries));
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [actor]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Listen for mutation events from other pages so this tab stays fresh.
  useEffect(() => {
    const handler = () => refresh();
    window.addEventListener("lw-ledger-mutated", handler);
    return () => window.removeEventListener("lw-ledger-mutated", handler);
  }, [refresh]);

  return (
    <div className="min-h-screen bg-background text-white">
      <div className="max-w-4xl mx-auto px-5 md:px-8 py-8 md:py-12">
        <nav className="mb-6 text-[11px] uppercase tracking-widest text-gray-500 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link
            href={ROUTES.play}
            className="hover:text-white transition focus:outline-none focus-visible:text-white focus-visible:ring-2 focus-visible:ring-cyan-300/40 rounded-sm"
          >
            ← Games
          </Link>
          <span className="text-gray-700">·</span>
          <Link
            href={ROUTES.icrc}
            className="hover:text-white transition focus:outline-none focus-visible:text-white focus-visible:ring-2 focus-visible:ring-cyan-300/40 rounded-sm"
          >
            /icrc
          </Link>
        </nav>

        <header className="mb-8">
          <div className="text-[10px] uppercase tracking-widest text-cyan-300 mb-2">
            Account manager
          </div>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight leading-[0.95] mb-3">
            Your{" "}
            <span
              className="bg-clip-text text-transparent"
              style={{
                backgroundImage:
                  "linear-gradient(90deg,#22d3ee,#fdba74 50%,#facc15)",
              }}
            >
              keys
            </span>
            .
          </h1>
          <p className="text-gray-400 max-w-2xl leading-snug">
            An account lets multiple keys control the same balance. Link
            another device by pasting its principal, or generate a
            seed-phrase recovery key you can restore anywhere.
          </p>
        </header>

        {!principal ? (
          <SignedOutBlurb />
        ) : loading ? (
          <div className="text-sm text-gray-500">Loading…</div>
        ) : !account ? (
          <NoAccountView
            actor={actor}
            principal={principal}
            onCreated={refresh}
          />
        ) : (
          <AccountDashboard
            account={account}
            balances={memberBalances}
            activePrincipal={principal}
            actor={actor}
            onMutated={refresh}
          />
        )}

        {err && (
          <div className="mt-6 rounded-md border border-red-400/40 bg-red-500/10 p-3 text-sm text-red-200">
            {err}
          </div>
        )}

        <footer className="mt-10 text-[11px] text-gray-500 leading-snug max-w-2xl">
          Canister:{" "}
          <code className="font-mono text-gray-400">
            {pointsLedgerCanisterId()}
          </code>
          . Accounts are enforced server-side — anyone linking a key
          they control can sign as the account. Backups (seed phrases)
          are optional but the only way to recover a cleared browser.
        </footer>
      </div>
    </div>
  );
}

// ---------- signed-out state ----------

function SignedOutBlurb() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-sm text-gray-300 leading-snug">
      <div className="text-[10px] uppercase tracking-widest text-gray-400 mb-2">
        Sign in first
      </div>
      <p>
        Account management is signed-in only. Head over to{" "}
        <Link
          href={ROUTES.icrc}
          className="text-cyan-300 underline underline-offset-2 hover:text-cyan-200"
        >
          /icrc
        </Link>{" "}
        to log in with a key, then come back here.
      </p>
    </div>
  );
}

// ---------- no account yet ----------

function NoAccountView({
  actor,
  principal,
  onCreated,
}: {
  actor: _SERVICE | null;
  principal: string;
  onCreated: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const create = async () => {
    if (!actor) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await actor.create_account();
      if ("Ok" in res) {
        onCreated();
      } else {
        setErr(describeAccountError(res.Err));
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      aria-label="Create account"
      className="rounded-2xl border border-cyan-300/30 bg-gradient-to-br from-cyan-300/[0.06] to-cyan-300/[0.02] p-6 md:p-8"
    >
      <div className="text-[10px] uppercase tracking-widest text-cyan-300 mb-2">
        No account yet
      </div>
      <h2 className="text-2xl md:text-3xl font-black tracking-tight mb-2">
        Create your account.
      </h2>
      <p className="text-sm text-gray-300 leading-snug mb-5 max-w-xl">
        Right now{" "}
        <code className="text-cyan-300 font-mono">{short(principal)}</code>{" "}
        is a standalone key with its own balance. Creating an account
        makes it the first member of a group you can later link more
        keys and a seed-phrase backup to.
      </p>
      <Button tone="cyan" size="lg" onClick={create} loading={busy}>
        Create account
      </Button>
      {err && (
        <div className="mt-3 text-sm text-red-300 font-mono">{err}</div>
      )}
    </section>
  );
}

// ---------- account dashboard ----------

function AccountDashboard({
  account,
  balances,
  activePrincipal,
  actor,
  onMutated,
}: {
  account: AccountInfo;
  balances: Map<string, bigint>;
  activePrincipal: string;
  actor: _SERVICE | null;
  onMutated: () => void;
}) {
  const [showAddPrincipal, setShowAddPrincipal] = useState(false);
  const [showSeedFlow, setShowSeedFlow] = useState(false);

  return (
    <>
      {/* Summary */}
      <section
        aria-label="Account summary"
        className="mb-6 rounded-2xl border border-emerald-300/30 bg-emerald-300/[0.04] p-5 md:p-6"
      >
        <div className="flex items-start justify-between gap-3 mb-2">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-emerald-300 mb-1">
              Account #{account.account_id.toString()}
            </div>
            <div className="text-4xl md:text-5xl font-black tabular-nums">
              {formatLwp(account.aggregate_balance, 4)}
            </div>
            <div className="text-xs font-mono text-gray-400 mt-1">
              LWP · aggregate across {account.members.length} member
              {account.members.length === 1 ? "" : "s"}
            </div>
          </div>
        </div>
      </section>

      {/* Members */}
      <section
        aria-label="Members"
        className="mb-6 rounded-2xl border border-white/10 bg-white/[0.02] p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="text-[10px] uppercase tracking-widest text-gray-400">
            Members · {account.members.length}/16
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowAddPrincipal(true)}
            >
              Add principal
            </Button>
            <Button
              size="sm"
              tone="cyan"
              onClick={() => setShowSeedFlow(true)}
            >
              + Seed backup
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          {account.members.map((p) => {
            const pt = p.toText();
            const isMe = pt === activePrincipal;
            return (
              <MemberRow
                key={pt}
                principal={pt}
                isMe={isMe}
                balance={balances.get(pt) ?? null}
                canRemove={account.members.length > 1}
                actor={actor}
                onRemoved={onMutated}
              />
            );
          })}
        </div>
      </section>

      <AddPrincipalModal
        open={showAddPrincipal}
        onClose={() => setShowAddPrincipal(false)}
        actor={actor}
        onAdded={() => {
          setShowAddPrincipal(false);
          onMutated();
        }}
      />
      <SeedBackupModal
        open={showSeedFlow}
        onClose={() => setShowSeedFlow(false)}
        actor={actor}
        onAdded={() => {
          setShowSeedFlow(false);
          onMutated();
        }}
      />
    </>
  );
}

function MemberRow({
  principal,
  isMe,
  balance,
  canRemove,
  actor,
  onRemoved,
}: {
  principal: string;
  isMe: boolean;
  balance: bigint | null;
  canRemove: boolean;
  actor: _SERVICE | null;
  onRemoved: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const roster = loadRoster();
  const rosterEntry = roster.entries.find((e) => e.principal === principal);

  const remove = async () => {
    if (!actor) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await actor.remove_account_member(
        Principal.fromText(principal),
      );
      if ("Ok" in res) {
        onRemoved();
      } else {
        setErr(describeAccountError(res.Err));
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`rounded-lg border p-3 ${
        isMe
          ? "border-cyan-300/40 bg-cyan-300/[0.05]"
          : "border-white/10 bg-white/[0.02]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-sm font-semibold text-white truncate">
              {rosterEntry?.label || "Unnamed key"}
            </span>
            {isMe && (
              <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[9px] uppercase tracking-widest border border-cyan-300/40 bg-cyan-300/[0.08] text-cyan-200 font-mono">
                this device
              </span>
            )}
            {rosterEntry?.source && (
              <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[9px] uppercase tracking-widest border border-white/20 bg-white/5 text-gray-400 font-mono">
                {rosterEntry.source}
              </span>
            )}
          </div>
          <div className="font-mono text-[11px] text-gray-400 break-all">
            {principal}
          </div>
          <div className="mt-1 text-[11px] font-mono">
            <span className="text-gray-500">Balance:</span>{" "}
            <span className="text-white tabular-nums">
              {balance === null ? "—" : `${formatLwp(balance, 4)} LWP`}
            </span>
          </div>
        </div>
        <div className="shrink-0">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setConfirm(true)}
            disabled={!canRemove || busy}
            title={
              !canRemove
                ? "Can't remove the last member — would orphan the account"
                : undefined
            }
          >
            Remove
          </Button>
        </div>
      </div>
      {err && (
        <div className="mt-2 text-[11px] font-mono text-red-300">{err}</div>
      )}
      <ConfirmModal
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={remove}
        title={`Remove ${rosterEntry?.label || "this member"}?`}
        description={`The principal ${short(principal)} will lose account membership. Its individual LWP balance stays with it but stops being aggregated. You can add it back any time.`}
        confirmLabel="Remove"
        destructive
      />
    </div>
  );
}

// ---------- add principal modal ----------

function AddPrincipalModal({
  open,
  onClose,
  actor,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  actor: _SERVICE | null;
  onAdded: () => void;
}) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!actor) return;
    setBusy(true);
    setErr(null);
    try {
      const p = Principal.fromText(input.trim());
      const res = await actor.add_account_member(p);
      if ("Ok" in res) {
        setInput("");
        onAdded();
      } else {
        setErr(describeAccountError(res.Err));
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Add a principal"
      description="Paste the principal text from the device or key you want to link. The target principal will be able to sign as this account."
    >
      <label className="block text-[11px] uppercase tracking-widest text-gray-400 mb-2">
        Principal
      </label>
      <input
        value={input}
        onChange={(e) => setInput(e.target.value.trim())}
        spellCheck={false}
        autoFocus
        placeholder="xxxxx-xxxxx-xxxxx-xxxxx-xxxxx-xxxxx-xxxxx-xxxxx-xxxxx-xxxxx-xxx"
        className="w-full font-mono text-xs bg-black/40 border border-white/10 rounded-md px-3 py-2 text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60 mb-3"
      />
      {err && (
        <div className="text-xs text-red-300 font-mono mb-3">{err}</div>
      )}
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          tone="cyan"
          onClick={submit}
          loading={busy}
          disabled={!input.trim()}
        >
          Add
        </Button>
      </div>
    </BottomSheet>
  );
}

// ---------- seed backup modal ----------
//
// Three-step flow:
//   1. Display a freshly generated 12-word phrase + confirmation
//      checkbox that the user wrote it down.
//   2. Derive the principal locally, show it, and ask for final
//      confirmation before sending add_account_member RPC.
//   3. On success, save the seed key to the roster (source=seed)
//      so the user can log into it from this browser too without
//      re-typing the phrase.

function SeedBackupModal({
  open,
  onClose,
  actor,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  actor: _SERVICE | null;
  onAdded: () => void;
}) {
  const [phrase, setPhrase] = useState<string>("");
  const [written, setWritten] = useState(false);
  const [phase, setPhase] = useState<"show" | "confirm" | "done">("show");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPhrase(generateSeedPhrase());
      setWritten(false);
      setPhase("show");
      setErr(null);
    }
  }, [open]);

  const derivedPrincipal = useMemo(() => {
    if (!phrase) return null;
    try {
      return seedPhraseToIdentity(phrase).getPrincipal().toText();
    } catch {
      return null;
    }
  }, [phrase]);

  const commit = async () => {
    if (!actor || !derivedPrincipal) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await actor.add_account_member(
        Principal.fromText(derivedPrincipal),
      );
      if ("Ok" in res) {
        // Add the seed key to the local roster (source=seed) so the
        // user can log into it later on this device without retyping.
        // Don't activate — user stays on current key.
        const { loginFromSeedPhrase, logoutActiveRosterEntry, setActiveRosterEntry } =
          await import("@/lib/ic/agent");
        // Preserve active key: we temporarily login then switch back.
        // Easier path: just add via the existing roster helper.
        const roster = (await import("@/lib/ic/agent")).loadRoster();
        const currentActive = roster.activePrincipal;
        loginFromSeedPhrase(phrase, "Seed backup");
        if (currentActive) setActiveRosterEntry(currentActive);
        else logoutActiveRosterEntry();

        setPhase("done");
      } else {
        setErr(describeAccountError(res.Err));
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const words = phrase.split(" ");

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={
        phase === "show"
          ? "Your seed phrase"
          : phase === "confirm"
            ? "Confirm backup"
            : "Backup added"
      }
      description={
        phase === "show"
          ? "Write these 12 words down somewhere safe. Anyone with the phrase can log in to this account. Lose it and you can't recover a cleared browser."
          : phase === "confirm"
            ? "About to add the seed-derived principal to your account. This is what you'd log in with from another device."
            : "Seed-backed principal is now a member of your account."
      }
    >
      {phase === "show" && (
        <>
          <div className="rounded-lg border border-amber-400/30 bg-amber-400/[0.06] p-4 mb-4">
            <div className="grid grid-cols-3 gap-2">
              {words.map((w, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded-md bg-black/40 px-2 py-1.5 border border-white/10"
                >
                  <span className="text-[10px] font-mono text-gray-500 w-5 text-right">
                    {i + 1}
                  </span>
                  <span className="font-mono text-sm text-white">{w}</span>
                </div>
              ))}
            </div>
          </div>
          <label className="flex items-start gap-2 text-sm text-gray-300 mb-4 cursor-pointer">
            <input
              type="checkbox"
              checked={written}
              onChange={(e) => setWritten(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-white/20 bg-black/40 text-cyan-400 focus:ring-cyan-400/40"
            />
            <span>
              I wrote these 12 words down. I understand losing them means
              losing this backup forever.
            </span>
          </label>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              tone="cyan"
              disabled={!written}
              onClick={() => setPhase("confirm")}
            >
              Next
            </Button>
          </div>
        </>
      )}

      {phase === "confirm" && derivedPrincipal && (
        <>
          <div className="rounded-lg border border-white/10 bg-black/40 p-3 mb-4">
            <div className="text-[10px] uppercase tracking-widest text-gray-400 mb-1">
              Derived principal
            </div>
            <div className="font-mono text-xs text-white break-all">
              {derivedPrincipal}
            </div>
          </div>
          {err && (
            <div className="text-xs text-red-300 font-mono mb-3">{err}</div>
          )}
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setPhase("show")}>
              Back
            </Button>
            <Button tone="cyan" onClick={commit} loading={busy}>
              Add to account
            </Button>
          </div>
        </>
      )}

      {phase === "done" && (
        <>
          <div className="rounded-lg border border-emerald-400/30 bg-emerald-400/[0.06] p-3 mb-4 text-sm text-emerald-200">
            Done. You can now log in to this account from any device by
            typing those 12 words on the sign-in screen.
          </div>
          <div className="flex gap-2 justify-end">
            <Button tone="cyan" onClick={onAdded}>
              Got it
            </Button>
          </div>
        </>
      )}
    </BottomSheet>
  );
}

// ---------- shared confirm modal ----------

function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Continue",
  confirmTone = "cyan",
  destructive = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  confirmTone?: "cyan" | "orange" | "rose" | "violet";
  destructive?: boolean;
}) {
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={title}
      description={description}
    >
      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-2">
        <Button variant="ghost" onClick={onClose} fullWidth className="sm:w-auto">
          Cancel
        </Button>
        <Button
          tone={destructive ? "rose" : confirmTone}
          variant={destructive ? "danger" : "primary"}
          onClick={() => {
            onConfirm();
            onClose();
          }}
          fullWidth
          className="sm:w-auto"
          data-autofocus
        >
          {confirmLabel}
        </Button>
      </div>
    </BottomSheet>
  );
}

// ---------- helpers ----------

function describeAccountError(e: AccountError): string {
  if ("AnonymousCaller" in e) return "Anonymous caller";
  if ("AnonymousPrincipal" in e) return "Anonymous principal can't be added";
  if ("AlreadyMember" in e)
    return `Already in account #${e.AlreadyMember.account_id.toString()}`;
  if ("PrincipalAlreadyMemberElsewhere" in e)
    return `That principal is already in account #${e.PrincipalAlreadyMemberElsewhere.account_id.toString()}`;
  if ("DuplicateMember" in e) return "Already a member of this account";
  if ("NotMember" in e) return "You're not a member of any account";
  if ("AccountNotFound" in e) return "Account not found";
  if ("WouldOrphanAccount" in e)
    return "Can't remove the last member — account would be orphaned";
  if ("TooManyMembers" in e)
    return `Too many members (max ${e.TooManyMembers.max})`;
  return "Unknown account error";
}

function short(p: string): string {
  if (p.length <= 14) return p;
  return `${p.slice(0, 8)}…${p.slice(-5)}`;
}
