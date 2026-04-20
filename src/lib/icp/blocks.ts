/**
 * Helpers for turning raw ICRC-3 blocks into renderable activity items.
 * The canister emits blocks shaped as:
 *   Map { btype: Text, ts: Nat, tx: Map { … } }
 * with btype ∈ {"1xfer","2xfer","2approve","1mint","1burn"}.
 */

import type { BlockWithId, ICRC3Value } from "./types";

export type BlockEventKind = "mint" | "transfer" | "transfer_from" | "approve" | "burn" | "unknown";

export interface BlockEvent {
  txId: bigint;
  kind: BlockEventKind;
  tsNs: bigint;
  amount: bigint;
  fee?: bigint;
  from?: Principalish;
  to?: Principalish;
  spender?: Principalish;
  memo?: string;
  raw: BlockWithId;
}

/** Lightweight principal representation recovered from block bytes. */
export interface Principalish {
  ownerBytes: Uint8Array;
  subaccountBytes?: Uint8Array;
}

// ---------- value walkers ----------

function mapEntries(v: ICRC3Value): Array<[string, ICRC3Value]> | null {
  if (v && typeof v === "object" && "Map" in v) return v.Map;
  return null;
}
function asText(v: ICRC3Value | undefined): string | null {
  if (v && typeof v === "object" && "Text" in v) return v.Text;
  return null;
}
function asNat(v: ICRC3Value | undefined): bigint | null {
  if (v && typeof v === "object" && "Nat" in v) return BigInt(v.Nat);
  return null;
}
function asBlob(v: ICRC3Value | undefined): Uint8Array | null {
  if (v && typeof v === "object" && "Blob" in v) {
    const b = v.Blob;
    return b instanceof Uint8Array ? b : new Uint8Array(b);
  }
  return null;
}
function asArray(v: ICRC3Value | undefined): ICRC3Value[] | null {
  if (v && typeof v === "object" && "Array" in v) return v.Array;
  return null;
}
function lookup(entries: Array<[string, ICRC3Value]>, key: string): ICRC3Value | undefined {
  for (const [k, v] of entries) if (k === key) return v;
  return undefined;
}

// Account is encoded as [principal-blob, subaccount-blob?] (see canister).
function readAccount(v: ICRC3Value | undefined): Principalish | undefined {
  if (!v) return undefined;
  const arr = asArray(v);
  if (!arr || arr.length === 0) return undefined;
  const owner = asBlob(arr[0]);
  if (!owner) return undefined;
  const subaccount = arr.length > 1 ? asBlob(arr[1]) ?? undefined : undefined;
  return { ownerBytes: owner, subaccountBytes: subaccount };
}

function btypeToKind(btype: string): BlockEventKind {
  switch (btype) {
    case "1mint":
      return "mint";
    case "1burn":
      return "burn";
    case "1xfer":
      return "transfer";
    case "2xfer":
      return "transfer_from";
    case "2approve":
      return "approve";
    default:
      return "unknown";
  }
}

/** Decode one block. Returns null when the shape doesn't match what we emit. */
export function decodeBlock(b: BlockWithId): BlockEvent | null {
  const top = mapEntries(b.block);
  if (!top) return null;
  const btype = asText(lookup(top, "btype"));
  const ts = asNat(lookup(top, "ts"));
  if (btype === null || ts === null) return null;
  const tx = lookup(top, "tx");
  const txEntries = tx ? mapEntries(tx) : null;

  const amount = txEntries ? asNat(lookup(txEntries, "amt")) ?? 0n : 0n;
  const fee = txEntries ? asNat(lookup(txEntries, "fee")) ?? undefined : undefined;
  const from = txEntries ? readAccount(lookup(txEntries, "from")) : undefined;
  const to = txEntries ? readAccount(lookup(txEntries, "to")) : undefined;
  const spender = txEntries ? readAccount(lookup(txEntries, "spender")) : undefined;
  const memoBytes = txEntries ? asBlob(lookup(txEntries, "memo")) : null;
  let memo: string | undefined;
  if (memoBytes) {
    try {
      memo = new TextDecoder("utf-8", { fatal: false }).decode(memoBytes);
      // Strip trailing NULs / non-printable tail.
      memo = memo.replace(/\u0000+$/, "");
    } catch {
      memo = undefined;
    }
  }

  return {
    txId: b.id,
    kind: btypeToKind(btype),
    tsNs: ts,
    amount,
    fee,
    from,
    to,
    spender,
    memo,
    raw: b,
  };
}

/**
 * Filter: events that touch this principal's owner bytes (either as
 * sender, recipient, or spender). Subaccount ignored.
 */
export function eventInvolvesOwner(e: BlockEvent, ownerBytes: Uint8Array): boolean {
  const match = (p?: Principalish) =>
    !!p && p.ownerBytes.length === ownerBytes.length &&
    p.ownerBytes.every((v, i) => v === ownerBytes[i]);
  return match(e.from) || match(e.to) || match(e.spender);
}

/** nanoseconds → "5 min ago" / "2 d ago" / locale timestamp fallback. */
export function relTimeFromNs(tsNs: bigint, nowMs = Date.now()): string {
  const ms = Number(tsNs / 1_000_000n);
  const diff = nowMs - ms;
  if (!Number.isFinite(diff) || diff < 0) return "just now";
  const s = Math.floor(diff / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(ms).toLocaleDateString();
}
