//! Livewager Points Ledger — ICRC-1 compliant.
//!
//! Non-custodial: users hold their own principals; canister only executes
//! signed calls. Balances live in stable memory so upgrades don't wipe state.
//!
//! ICRC-1 spec: https://github.com/dfinity/ICRC-1/tree/main/standards/ICRC-1
//! ICRC-2 spec: https://github.com/dfinity/ICRC-1/tree/main/standards/ICRC-2
//! ICP-02: ICRC-1 core.
//! ICP-03: ICRC-2 approve / transfer_from / allowance.

use candid::{CandidType, Nat, Principal};
use ic_cdk::{init, query, update};
use ic_stable_structures::memory_manager::{MemoryId, MemoryManager, VirtualMemory};
use ic_stable_structures::{DefaultMemoryImpl, StableBTreeMap, StableCell, StableLog, Storable};
use icrc_ledger_types::icrc1::account::Account;
use icrc_ledger_types::icrc1::transfer::{Memo, TransferArg, TransferError};
use icrc_ledger_types::icrc2::allowance::{Allowance, AllowanceArgs};
use icrc_ledger_types::icrc2::approve::{ApproveArgs, ApproveError};
use icrc_ledger_types::icrc2::transfer_from::{TransferFromArgs, TransferFromError};
use icrc_ledger_types::icrc::generic_metadata_value::MetadataValue;
use icrc_ledger_types::icrc::generic_value::ICRC3Value;
use icrc_ledger_types::icrc3::blocks::{
    BlockWithId, GetBlocksRequest, GetBlocksResult, ICRC3DataCertificate, SupportedBlockType,
};
use serde::{Deserialize, Serialize};
use std::borrow::Cow;
use std::cell::RefCell;

/// Token identity — stable across upgrades.
const TOKEN_NAME: &str = "Livewager Points";
const TOKEN_SYMBOL: &str = "LWP";
const TOKEN_DECIMALS: u8 = 8;
/// Transfer fee in base units. 10_000 = 0.0001 LWP (with 8 decimals).
const TRANSFER_FEE: u128 = 10_000;
/// Maximum length of the optional `memo` field on every mutating call.
/// ICRC-1 recommends <= 32 bytes; we enforce and advertise it.
const MAX_MEMO_LEN: usize = 32;

type Memory = VirtualMemory<DefaultMemoryImpl>;

/// Storable balance key — fixed-length principal + subaccount bytes for
/// efficient stable-map lookups.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
struct AccountKey([u8; 61]);

impl AccountKey {
    fn from_account(a: &Account) -> Self {
        let mut bytes = [0u8; 61];
        let p = a.owner.as_slice();
        // Principal is up to 29 bytes — prefix with length byte.
        bytes[0] = p.len() as u8;
        bytes[1..=p.len()].copy_from_slice(p);
        // Subaccount: 32 bytes fixed, zero-padded when absent.
        if let Some(sub) = a.subaccount {
            bytes[29..61].copy_from_slice(&sub);
        }
        AccountKey(bytes)
    }
}

impl Storable for AccountKey {
    fn to_bytes(&self) -> Cow<'_, [u8]> {
        Cow::Borrowed(&self.0)
    }
    fn from_bytes(bytes: Cow<[u8]>) -> Self {
        let mut arr = [0u8; 61];
        arr.copy_from_slice(&bytes[..61]);
        AccountKey(arr)
    }
    const BOUND: ic_stable_structures::storable::Bound =
        ic_stable_structures::storable::Bound::Bounded {
            max_size: 61,
            is_fixed_size: true,
        };
}

/// Balances are u128 in base units. u128 covers ~3.4 * 10^38 — plenty
/// of headroom even with 8 decimals.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct BalanceVal(u128);

impl Storable for BalanceVal {
    fn to_bytes(&self) -> Cow<'_, [u8]> {
        Cow::Owned(self.0.to_le_bytes().to_vec())
    }
    fn from_bytes(bytes: Cow<[u8]>) -> Self {
        let mut arr = [0u8; 16];
        arr.copy_from_slice(&bytes[..16]);
        BalanceVal(u128::from_le_bytes(arr))
    }
    const BOUND: ic_stable_structures::storable::Bound =
        ic_stable_structures::storable::Bound::Bounded {
            max_size: 16,
            is_fixed_size: true,
        };
}

/// Canister init args — set minter principal at deploy time.
#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub struct InitArgs {
    pub minter: Principal,
}

impl Storable for InitArgs {
    fn to_bytes(&self) -> Cow<'_, [u8]> {
        Cow::Owned(candid::encode_one(self).unwrap())
    }
    fn from_bytes(bytes: Cow<[u8]>) -> Self {
        candid::decode_one(&bytes).unwrap()
    }
    const BOUND: ic_stable_structures::storable::Bound =
        ic_stable_structures::storable::Bound::Unbounded;
}

const BALANCES_MEM: MemoryId = MemoryId::new(0);
const CONFIG_MEM: MemoryId = MemoryId::new(1);
const TOTAL_SUPPLY_MEM: MemoryId = MemoryId::new(2);
const ALLOWANCES_MEM: MemoryId = MemoryId::new(3);
const TX_COUNTER_MEM: MemoryId = MemoryId::new(4);
// ICRC-3 block log uses two stable-memory regions: one for the index
// (fixed-size entries pointing at data offsets) and one for the
// variable-length encoded blocks themselves.
const LOG_INDEX_MEM: MemoryId = MemoryId::new(5);
const LOG_DATA_MEM: MemoryId = MemoryId::new(6);
/// Dedup cache — stores (tx hash → (tx_id, created_at_ns)) for a bounded
/// sliding window so retried requests return Duplicate instead of
/// double-executing.
const DEDUP_MEM: MemoryId = MemoryId::new(7);

/// How far back `created_at_time` may be before we return TooOld.
/// 24 hours, in IC nanoseconds.
const TX_WINDOW_NS: u64 = 24 * 60 * 60 * 1_000_000_000;
/// How far ahead of `now` a client may set `created_at_time`. 2 minutes
/// covers clock skew between the caller and the replica.
const PERMITTED_DRIFT_NS: u64 = 2 * 60 * 1_000_000_000;

/// Stable-cell memory ID for the most recent block's hash — the parent
/// hash for the next block we append.
const TIP_HASH_MEM: MemoryId = MemoryId::new(8);

/// (owner, spender) pair — 2× AccountKey side-by-side = 122 bytes fixed.
/// Lets us range-query allowances by owner if we ever need to list them.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
struct AllowanceKey {
    from: AccountKey,
    spender: AccountKey,
}

impl Storable for AllowanceKey {
    fn to_bytes(&self) -> Cow<'_, [u8]> {
        let mut v = Vec::with_capacity(122);
        v.extend_from_slice(&self.from.0);
        v.extend_from_slice(&self.spender.0);
        Cow::Owned(v)
    }
    fn from_bytes(bytes: Cow<[u8]>) -> Self {
        let mut from = [0u8; 61];
        let mut spender = [0u8; 61];
        from.copy_from_slice(&bytes[..61]);
        spender.copy_from_slice(&bytes[61..122]);
        AllowanceKey {
            from: AccountKey(from),
            spender: AccountKey(spender),
        }
    }
    const BOUND: ic_stable_structures::storable::Bound =
        ic_stable_structures::storable::Bound::Bounded {
            max_size: 122,
            is_fixed_size: true,
        };
}

/// Allowance value: 16-byte u128 amount + 8-byte u64 nanoseconds expiry
/// (0 means "no expiry"). Total fixed 24 bytes.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct AllowanceVal {
    amount: u128,
    /// Expires-at in IC nanoseconds. 0 = never expires.
    expires_at_ns: u64,
}

impl Storable for AllowanceVal {
    fn to_bytes(&self) -> Cow<'_, [u8]> {
        let mut v = Vec::with_capacity(24);
        v.extend_from_slice(&self.amount.to_le_bytes());
        v.extend_from_slice(&self.expires_at_ns.to_le_bytes());
        Cow::Owned(v)
    }
    fn from_bytes(bytes: Cow<[u8]>) -> Self {
        let mut a = [0u8; 16];
        let mut e = [0u8; 8];
        a.copy_from_slice(&bytes[..16]);
        e.copy_from_slice(&bytes[16..24]);
        AllowanceVal {
            amount: u128::from_le_bytes(a),
            expires_at_ns: u64::from_le_bytes(e),
        }
    }
    const BOUND: ic_stable_structures::storable::Bound =
        ic_stable_structures::storable::Bound::Bounded {
            max_size: 24,
            is_fixed_size: true,
        };
}

/// Dedup cache entry: (tx_id emitted by the original call, created_at_ns
/// of that call). Fixed 16 bytes so StableBTreeMap can store it bounded.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct DedupVal {
    tx_id: u64,
    created_at_ns: u64,
}

impl Storable for DedupVal {
    fn to_bytes(&self) -> Cow<'_, [u8]> {
        let mut v = Vec::with_capacity(16);
        v.extend_from_slice(&self.tx_id.to_le_bytes());
        v.extend_from_slice(&self.created_at_ns.to_le_bytes());
        Cow::Owned(v)
    }
    fn from_bytes(bytes: Cow<[u8]>) -> Self {
        let mut id = [0u8; 8];
        let mut at = [0u8; 8];
        id.copy_from_slice(&bytes[..8]);
        at.copy_from_slice(&bytes[8..16]);
        DedupVal {
            tx_id: u64::from_le_bytes(id),
            created_at_ns: u64::from_le_bytes(at),
        }
    }
    const BOUND: ic_stable_structures::storable::Bound =
        ic_stable_structures::storable::Bound::Bounded {
            max_size: 16,
            is_fixed_size: true,
        };
}

/// Fixed 32-byte block-hash wrapper. Newtype exists only so it can
/// implement Storable for the StableCell — the hash itself is just
/// an ICRC-3 Hash = [u8; 32].
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct TipHashVal([u8; 32]);

impl Storable for TipHashVal {
    fn to_bytes(&self) -> Cow<'_, [u8]> {
        Cow::Borrowed(&self.0)
    }
    fn from_bytes(bytes: Cow<[u8]>) -> Self {
        let mut arr = [0u8; 32];
        arr.copy_from_slice(&bytes[..32]);
        TipHashVal(arr)
    }
    const BOUND: ic_stable_structures::storable::Bound =
        ic_stable_structures::storable::Bound::Bounded {
            max_size: 32,
            is_fixed_size: true,
        };
}

/// Storable wrapper around an ICRC-3 `ICRC3Value` block. Blocks are
/// candid-encoded to bytes for durable persistence; round-trip is via
/// `candid::encode_one` / `decode_one`. Unbounded because block payloads
/// vary in size (e.g. long memos).
#[derive(Clone, Debug)]
struct StoredBlock(ICRC3Value);

impl Storable for StoredBlock {
    fn to_bytes(&self) -> Cow<'_, [u8]> {
        Cow::Owned(candid::encode_one(&self.0).expect("encode block"))
    }
    fn from_bytes(bytes: Cow<[u8]>) -> Self {
        StoredBlock(candid::decode_one(&bytes).expect("decode block"))
    }
    const BOUND: ic_stable_structures::storable::Bound =
        ic_stable_structures::storable::Bound::Unbounded;
}

thread_local! {
    static MEMORY_MANAGER: RefCell<MemoryManager<DefaultMemoryImpl>> =
        RefCell::new(MemoryManager::init(DefaultMemoryImpl::default()));

    static BALANCES: RefCell<StableBTreeMap<AccountKey, BalanceVal, Memory>> =
        RefCell::new(StableBTreeMap::init(
            MEMORY_MANAGER.with(|m| m.borrow().get(BALANCES_MEM)),
        ));

    static CONFIG: RefCell<StableCell<InitArgs, Memory>> = RefCell::new({
        let mem = MEMORY_MANAGER.with(|m| m.borrow().get(CONFIG_MEM));
        StableCell::init(mem, InitArgs { minter: Principal::anonymous() })
            .expect("init config cell")
    });

    static TOTAL_SUPPLY: RefCell<StableCell<BalanceVal, Memory>> = RefCell::new({
        let mem = MEMORY_MANAGER.with(|m| m.borrow().get(TOTAL_SUPPLY_MEM));
        StableCell::init(mem, BalanceVal(0)).expect("init total supply cell")
    });

    static ALLOWANCES: RefCell<StableBTreeMap<AllowanceKey, AllowanceVal, Memory>> =
        RefCell::new(StableBTreeMap::init(
            MEMORY_MANAGER.with(|m| m.borrow().get(ALLOWANCES_MEM)),
        ));

    /// Monotonically increasing transaction index. Every successful
    /// state-mutating call (transfer / approve / transfer_from / mint /
    /// burn) bumps this and returns the new value. Foundation for the
    /// ICRC-3 transaction log landing in ICP-12.
    static TX_COUNTER: RefCell<StableCell<u64, Memory>> = RefCell::new({
        let mem = MEMORY_MANAGER.with(|m| m.borrow().get(TX_COUNTER_MEM));
        StableCell::init(mem, 0u64).expect("init tx counter cell")
    });

    /// Append-only ICRC-3 block log. Readers paginate via icrc3_get_blocks.
    static BLOCK_LOG: RefCell<StableLog<StoredBlock, Memory, Memory>> = RefCell::new({
        let idx = MEMORY_MANAGER.with(|m| m.borrow().get(LOG_INDEX_MEM));
        let data = MEMORY_MANAGER.with(|m| m.borrow().get(LOG_DATA_MEM));
        StableLog::init(idx, data).expect("init block log")
    });

    /// Sliding-window dedup cache keyed by sha256 of the canonical
    /// (caller, op, amount, ...) tuple. See compute_dedup_hash.
    static DEDUP: RefCell<StableBTreeMap<[u8; 32], DedupVal, Memory>> =
        RefCell::new(StableBTreeMap::init(
            MEMORY_MANAGER.with(|m| m.borrow().get(DEDUP_MEM)),
        ));

    /// Hash of the most recent block in the log — the parent hash the
    /// next append will embed. Zero-initialized for the genesis state
    /// (index 0 of the chain has no parent).
    static TIP_HASH: RefCell<StableCell<TipHashVal, Memory>> = RefCell::new({
        let mem = MEMORY_MANAGER.with(|m| m.borrow().get(TIP_HASH_MEM));
        StableCell::init(mem, TipHashVal([0u8; 32])).expect("init tip hash cell")
    });
}

/// Reserve the next tx index and return it. Bump happens eagerly so even
/// if a caller later rejects (post-state-mutation), no two successful
/// calls ever share an index. Gaps are tolerated by the ICRC-3 spec.
fn next_tx_index() -> u64 {
    TX_COUNTER.with(|c| {
        let mut cell = c.borrow_mut();
        let cur = *cell.get();
        let next = cur + 1;
        cell.set(next).expect("bump tx counter");
        next
    })
}

#[query]
fn tx_counter() -> Nat {
    TX_COUNTER.with(|c| Nat::from(*c.borrow().get()))
}

// -------------------------------------------------------------------------
// Dedup / replay protection (ICP-13)
//
// Flow per ICRC-1 spec:
//   1. If created_at_time is absent → skip dedup entirely.
//   2. If created_at_time < now - TX_WINDOW_NS → return TooOld.
//   3. If created_at_time > now + PERMITTED_DRIFT_NS → return CreatedInFuture.
//   4. Compute sha256 of the canonical tuple.
//   5. If hash is already in DEDUP → return Duplicate { duplicate_of }.
//   6. Otherwise, caller proceeds; on success insert (hash → DedupVal).
//
// Entries self-expire: any lookup that returns an expired entry (older
// than now - TX_WINDOW_NS) deletes it in place.
// -------------------------------------------------------------------------

/// Outcome of the pre-mutation dedup check. Generic over the caller's
/// error type so transfer / approve / transfer_from can each map to their
/// own variant without duplicating the check logic.
enum DedupCheck {
    /// Proceed; on success call `dedup_record(hash, tx_id, created_at)`.
    Fresh { hash: [u8; 32], created_at_ns: u64 },
    /// The same request was already executed — return this tx id.
    Duplicate(u64),
    /// created_at_time was outside the accepted window.
    TooOld,
    /// created_at_time was further ahead than allowed drift.
    CreatedInFuture(u64),
    /// No created_at_time supplied — skip dedup.
    NoWindow,
}

/// Canonical byte representation of the tuple we hash. Fields that
/// aren't relevant to a particular operation (e.g. `spender` on a plain
/// transfer) pass empty slices so their contribution to the hash is
/// deterministic but distinct from "the field was set to zero bytes".
fn compute_dedup_hash(
    caller: &Principal,
    op: &str,
    from_sub: Option<&[u8]>,
    to_owner: Option<&Principal>,
    to_sub: Option<&[u8]>,
    amount: u128,
    fee: u128,
    memo: Option<&[u8]>,
    created_at_ns: u64,
    spender_owner: Option<&Principal>,
    spender_sub: Option<&[u8]>,
) -> [u8; 32] {
    use sha2::{Digest, Sha256};
    let mut h = Sha256::new();
    // Include op tag so replaying a transfer as an approve can't collide.
    h.update(op.as_bytes());
    h.update(b"|");
    h.update(caller.as_slice());
    h.update(b"|from_sub|");
    if let Some(s) = from_sub { h.update(s); }
    h.update(b"|to_owner|");
    if let Some(p) = to_owner { h.update(p.as_slice()); }
    h.update(b"|to_sub|");
    if let Some(s) = to_sub { h.update(s); }
    h.update(b"|amt|");
    h.update(&amount.to_le_bytes());
    h.update(b"|fee|");
    h.update(&fee.to_le_bytes());
    h.update(b"|memo|");
    if let Some(m) = memo { h.update(m); }
    h.update(b"|cat|");
    h.update(&created_at_ns.to_le_bytes());
    h.update(b"|spo|");
    if let Some(p) = spender_owner { h.update(p.as_slice()); }
    h.update(b"|sps|");
    if let Some(s) = spender_sub { h.update(s); }
    h.finalize().into()
}

/// Performs the validate-and-lookup half of the dedup protocol. Call
/// BEFORE mutating state. On `Fresh`, mutate, then call `dedup_record`.
#[allow(clippy::too_many_arguments)]
fn dedup_precheck(
    caller: &Principal,
    op: &str,
    from_sub: Option<&[u8]>,
    to_owner: Option<&Principal>,
    to_sub: Option<&[u8]>,
    amount: u128,
    fee: u128,
    memo: Option<&[u8]>,
    created_at_time: Option<u64>,
    spender_owner: Option<&Principal>,
    spender_sub: Option<&[u8]>,
) -> DedupCheck {
    let Some(created_at_ns) = created_at_time else {
        return DedupCheck::NoWindow;
    };
    let now = ic_cdk::api::time();
    if now > created_at_ns && now - created_at_ns > TX_WINDOW_NS {
        return DedupCheck::TooOld;
    }
    if created_at_ns > now && created_at_ns - now > PERMITTED_DRIFT_NS {
        return DedupCheck::CreatedInFuture(now);
    }
    let hash = compute_dedup_hash(
        caller, op, from_sub, to_owner, to_sub, amount, fee, memo,
        created_at_ns, spender_owner, spender_sub,
    );

    // Expiry-aware lookup: if the stored entry is stale, evict it and
    // treat as fresh. Keeps memory bounded without a separate GC pass.
    let hit = DEDUP.with(|d| d.borrow().get(&hash));
    if let Some(val) = hit {
        if now > val.created_at_ns && now - val.created_at_ns > TX_WINDOW_NS {
            DEDUP.with(|d| { d.borrow_mut().remove(&hash); });
            return DedupCheck::Fresh { hash, created_at_ns };
        }
        return DedupCheck::Duplicate(val.tx_id);
    }
    DedupCheck::Fresh { hash, created_at_ns }
}

/// Call after a successful mutation to remember this tx for replay
/// protection. `dedup_precheck` must have returned `Fresh { .. }`.
fn dedup_record(hash: [u8; 32], tx_id: u64, created_at_ns: u64) {
    DEDUP.with(|d| {
        d.borrow_mut().insert(hash, DedupVal { tx_id, created_at_ns });
    });
}

// -------------------------------------------------------------------------
// ICRC-3 block log helpers.
// Blocks are an ICRC3Value::Map with the following keys:
//   "btype" : Text   — block type, e.g. "1xfer", "2approve"
//   "ts"    : Nat    — append timestamp in IC nanoseconds
//   "tx"    : Map    — the transaction payload
// See https://github.com/dfinity/ICRC-1/tree/main/standards/ICRC-3
// -------------------------------------------------------------------------

/// Convert an Account to an ICRC3Value::Array [principal-bytes, subaccount?]
/// exactly as the ICRC-3 recommended block schema specifies.
fn account_to_value(a: &Account) -> ICRC3Value {
    let mut arr: Vec<ICRC3Value> = Vec::with_capacity(2);
    arr.push(ICRC3Value::Blob(serde_bytes::ByteBuf::from(a.owner.as_slice().to_vec())));
    if let Some(sub) = a.subaccount {
        arr.push(ICRC3Value::Blob(serde_bytes::ByteBuf::from(sub.to_vec())));
    }
    ICRC3Value::Array(arr)
}

fn icrc_map(entries: Vec<(&str, ICRC3Value)>) -> ICRC3Value {
    let mut m = std::collections::BTreeMap::new();
    for (k, v) in entries {
        m.insert(k.to_string(), v);
    }
    ICRC3Value::Map(m)
}

/// Append an ICRC-3 block to the log. `tx` is the inner transaction map;
/// this helper stamps btype, ts, and (for every block except genesis)
/// phash = hash of the previous block's canonical representation.
///
/// After append we recompute the tip hash and persist it, so the *next*
/// append has O(1) access to its parent hash. Certified-data wiring for
/// icrc3_get_tip_certificate comes in ICP-12b-ii.
fn append_block(btype: &str, tx: ICRC3Value) {
    let ts = ic_cdk::api::time();
    let prev_tip = TIP_HASH.with(|t| t.borrow().get().0);
    let is_genesis = prev_tip == [0u8; 32]
        && BLOCK_LOG.with(|log| log.borrow().len() == 0);

    // Build the block. Fresh BTreeMap so field order is deterministic.
    let mut entries = std::collections::BTreeMap::new();
    entries.insert("btype".to_string(), ICRC3Value::Text(btype.to_string()));
    entries.insert("ts".to_string(), ICRC3Value::Nat(Nat::from(ts)));
    entries.insert("tx".to_string(), tx);
    if !is_genesis {
        entries.insert(
            "phash".to_string(),
            ICRC3Value::Blob(serde_bytes::ByteBuf::from(prev_tip.to_vec())),
        );
    }
    let block = ICRC3Value::Map(entries);

    // Compute this block's hash BEFORE moving it into storage so we can
    // update the tip cell without re-reading + re-decoding.
    let new_tip: [u8; 32] = block.clone().hash();

    BLOCK_LOG.with(|log| {
        log.borrow_mut()
            .append(&StoredBlock(block))
            .expect("append block to log");
    });
    TIP_HASH.with(|t| {
        t.borrow_mut().set(TipHashVal(new_tip)).expect("update tip hash");
    });
    // Make the new tip available to certified-data queries.
    refresh_certified_data();
}

fn build_transfer_tx(
    from: &Account,
    to: &Account,
    amount: u128,
    fee: u128,
    memo: Option<&Memo>,
    spender: Option<&Account>,
) -> ICRC3Value {
    let mut entries: Vec<(&str, ICRC3Value)> = vec![
        ("amt", ICRC3Value::Nat(Nat::from(amount))),
        ("from", account_to_value(from)),
        ("to", account_to_value(to)),
        ("fee", ICRC3Value::Nat(Nat::from(fee))),
    ];
    if let Some(s) = spender {
        entries.push(("spender", account_to_value(s)));
    }
    if let Some(Memo(m)) = memo {
        entries.push(("memo", ICRC3Value::Blob(m.clone())));
    }
    icrc_map(entries)
}

fn build_approve_tx(
    from: &Account,
    spender: &Account,
    amount: u128,
    expected: Option<u128>,
    expires_at_ns: Option<u64>,
    fee: u128,
    memo: Option<&Memo>,
) -> ICRC3Value {
    let mut entries: Vec<(&str, ICRC3Value)> = vec![
        ("amt", ICRC3Value::Nat(Nat::from(amount))),
        ("from", account_to_value(from)),
        ("spender", account_to_value(spender)),
        ("fee", ICRC3Value::Nat(Nat::from(fee))),
    ];
    if let Some(e) = expected {
        entries.push(("expected_allowance", ICRC3Value::Nat(Nat::from(e))));
    }
    if let Some(t) = expires_at_ns {
        entries.push(("expires_at", ICRC3Value::Nat(Nat::from(t))));
    }
    if let Some(Memo(m)) = memo {
        entries.push(("memo", ICRC3Value::Blob(m.clone())));
    }
    icrc_map(entries)
}

fn build_mint_tx(to: &Account, amount: u128, memo: Option<&Memo>) -> ICRC3Value {
    let mut entries: Vec<(&str, ICRC3Value)> = vec![
        ("amt", ICRC3Value::Nat(Nat::from(amount))),
        ("to", account_to_value(to)),
    ];
    if let Some(Memo(m)) = memo {
        entries.push(("memo", ICRC3Value::Blob(m.clone())));
    }
    icrc_map(entries)
}

fn build_burn_tx(from: &Account, amount: u128, memo: Option<&Memo>) -> ICRC3Value {
    let mut entries: Vec<(&str, ICRC3Value)> = vec![
        ("amt", ICRC3Value::Nat(Nat::from(amount))),
        ("from", account_to_value(from)),
    ];
    if let Some(Memo(m)) = memo {
        entries.push(("memo", ICRC3Value::Blob(m.clone())));
    }
    icrc_map(entries)
}

/// Validates that a proposed minter principal is a real user / canister
/// principal — not anonymous (every unauthenticated caller) and not the
/// management canister. Misconfiguring either would make minting
/// effectively permissionless.
///
/// Returns Err with a short message so `init` / `set_minter` can trap
/// or surface a typed error respectively.
fn validate_minter(p: &Principal) -> Result<(), &'static str> {
    if *p == Principal::anonymous() {
        return Err("minter must not be the anonymous principal");
    }
    if *p == Principal::management_canister() {
        return Err("minter must not be the management canister");
    }
    Ok(())
}

#[init]
fn init(args: InitArgs) {
    // Trap on bad args so deploying with a dangerous minter principal
    // is impossible — dfx / deploy scripts will see the trap and fail
    // before state is written.
    if let Err(reason) = validate_minter(&args.minter) {
        ic_cdk::trap(reason);
    }
    CONFIG.with(|c| {
        c.borrow_mut().set(args).expect("set config");
    });
    // Even with zero blocks the certified-data witness must be set so
    // icrc3_get_tip_certificate can return a valid cert over the zero tip.
    refresh_certified_data();
}

/// Post-upgrade: stable structures survive automatically but the
/// certified-data witness is volatile (it's part of subnet state, not
/// canister memory). Re-publish the tip hash so the next query that
/// asks for a cert gets a fresh one.
#[ic_cdk::post_upgrade]
fn post_upgrade() {
    refresh_certified_data();
}

// -------------------------------------------------------------------------
// ICRC-1 queries
// -------------------------------------------------------------------------

#[query]
fn icrc1_name() -> String {
    TOKEN_NAME.to_string()
}

#[query]
fn icrc1_symbol() -> String {
    TOKEN_SYMBOL.to_string()
}

#[query]
fn icrc1_decimals() -> u8 {
    TOKEN_DECIMALS
}

#[query]
fn icrc1_fee() -> Nat {
    Nat::from(TRANSFER_FEE)
}

#[query]
fn icrc1_total_supply() -> Nat {
    TOTAL_SUPPLY.with(|t| Nat::from(t.borrow().get().0))
}

#[query]
fn icrc1_minting_account() -> Option<Account> {
    let minter = CONFIG.with(|c| c.borrow().get().minter);
    Some(Account { owner: minter, subaccount: None })
}

#[query]
fn icrc1_metadata() -> Vec<(String, MetadataValue)> {
    vec![
        ("icrc1:name".to_string(), MetadataValue::Text(TOKEN_NAME.to_string())),
        ("icrc1:symbol".to_string(), MetadataValue::Text(TOKEN_SYMBOL.to_string())),
        ("icrc1:decimals".to_string(), MetadataValue::Nat(Nat::from(TOKEN_DECIMALS))),
        ("icrc1:fee".to_string(), MetadataValue::Nat(Nat::from(TRANSFER_FEE))),
        (
            "icrc1:max_memo_length".to_string(),
            MetadataValue::Nat(Nat::from(MAX_MEMO_LEN as u64)),
        ),
    ]
}

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub struct SupportedStandard {
    pub name: String,
    pub url: String,
}

#[query]
fn icrc1_supported_standards() -> Vec<SupportedStandard> {
    vec![
        SupportedStandard {
            name: "ICRC-1".to_string(),
            url: "https://github.com/dfinity/ICRC-1".to_string(),
        },
        SupportedStandard {
            name: "ICRC-2".to_string(),
            url: "https://github.com/dfinity/ICRC-1/tree/main/standards/ICRC-2".to_string(),
        },
        SupportedStandard {
            name: "ICRC-3".to_string(),
            url: "https://github.com/dfinity/ICRC-1/tree/main/standards/ICRC-3".to_string(),
        },
    ]
}

// -------------------------------------------------------------------------
// ICRC-3 endpoints (ICP-12a)
// - icrc3_get_blocks: paginated, anyone can read.
// - icrc3_supported_block_types: advertises our 5 btypes.
// (hash chain + tip certificate land in ICP-12b)
// -------------------------------------------------------------------------

#[query]
fn icrc3_get_blocks(requests: Vec<GetBlocksRequest>) -> GetBlocksResult {
    let log_len = BLOCK_LOG.with(|log| log.borrow().len());
    let mut blocks: Vec<BlockWithId> = Vec::new();

    for req in requests.iter() {
        // Saturating conversion: start / length are both `Nat`, clamp to u64.
        let start: u64 = nat_to_u128(&req.start).and_then(|x| u64::try_from(x).ok()).unwrap_or(u64::MAX);
        let length: u64 = nat_to_u128(&req.length).and_then(|x| u64::try_from(x).ok()).unwrap_or(0);
        // Cap each request to 1000 blocks per ICRC-3 guidance; callers must paginate.
        let capped = length.min(1000);
        let end = start.saturating_add(capped).min(log_len);
        for idx in start..end {
            if let Some(StoredBlock(val)) = BLOCK_LOG.with(|log| log.borrow().get(idx)) {
                blocks.push(BlockWithId { id: Nat::from(idx), block: val });
            }
        }
    }

    GetBlocksResult {
        log_length: Nat::from(log_len),
        blocks,
        // Archiving is not implemented; all blocks live on this canister.
        archived_blocks: Vec::new(),
    }
}

#[query]
fn icrc3_supported_block_types() -> Vec<SupportedBlockType> {
    let url = "https://github.com/dfinity/ICRC-1/tree/main/standards/ICRC-3".to_string();
    vec![
        SupportedBlockType { block_type: "1xfer".to_string(), url: url.clone() },
        SupportedBlockType { block_type: "2xfer".to_string(), url: url.clone() },
        SupportedBlockType { block_type: "2approve".to_string(), url: url.clone() },
        SupportedBlockType { block_type: "1mint".to_string(), url: url.clone() },
        SupportedBlockType { block_type: "1burn".to_string(), url },
    ]
}

/// Total number of blocks in the log — cheap helper used by UIs to
/// know how far to paginate.
#[query]
fn icrc3_log_length() -> Nat {
    Nat::from(BLOCK_LOG.with(|log| log.borrow().len()))
}

/// Hash of the most recent block, or the 32 zero bytes if the log is
/// empty. Uncertified — intended for debugging / indexer tailing.
/// `icrc3_get_tip_certificate` returns the same hash wrapped in a
/// replica-signed certificate.
#[query]
fn icrc3_tip_hash() -> serde_bytes::ByteBuf {
    let h = TIP_HASH.with(|t| t.borrow().get().0);
    serde_bytes::ByteBuf::from(h.to_vec())
}

// -------------------------------------------------------------------------
// Certified data (ICP-12b-ii)
//
// The ledger certifies a minimal hash tree of the form
//   Labeled("last_block_hash", Leaf(<32-byte tip hash>))
// with the root hash computed per IC's ic-hashtree domain separators.
// Clients receive (certificate, hash_tree) from icrc3_get_tip_certificate
// and can verify the tip hash was signed by the subnet without trusting
// the canister.
// -------------------------------------------------------------------------

/// IC hash-tree domain separator: `<len>` followed by the ASCII label.
fn ht_domain(label: &str) -> Vec<u8> {
    let mut v = Vec::with_capacity(1 + label.len());
    v.push(label.len() as u8);
    v.extend_from_slice(label.as_bytes());
    v
}

/// sha256(domain_sep("ic-hashtree-leaf") || value).
fn leaf_hash(value: &[u8]) -> [u8; 32] {
    use sha2::{Digest, Sha256};
    let mut h = Sha256::new();
    h.update(ht_domain("ic-hashtree-leaf"));
    h.update(value);
    h.finalize().into()
}

/// sha256(domain_sep("ic-hashtree-labeled") || label || sub_hash).
fn labeled_hash(label: &[u8], sub_hash: &[u8; 32]) -> [u8; 32] {
    use sha2::{Digest, Sha256};
    let mut h = Sha256::new();
    h.update(ht_domain("ic-hashtree-labeled"));
    h.update(label);
    h.update(sub_hash);
    h.finalize().into()
}

/// Root hash of the single-leaf tree this canister publishes.
fn tip_root_hash(tip: &[u8; 32]) -> [u8; 32] {
    let leaf = leaf_hash(tip);
    labeled_hash(b"last_block_hash", &leaf)
}

/// CBOR-encode the pruned hash tree we expose to clients:
///   Labeled("last_block_hash", Leaf(<tip>))
/// Per the IC spec this is a CBOR array where the first element is a
/// small integer tag (2 = labeled, 3 = leaf, 0 = empty, 4 = pruned, 1 = fork).
fn encode_hash_tree(tip: &[u8; 32]) -> Vec<u8> {
    // Hand-roll the tiny CBOR. Layout:
    //   82 02              array(2) — labeled
    //   4f                 byte string length 15
    //   "last_block_hash"
    //   82 03              array(2) — leaf
    //   58 20              byte string length 32
    //   <32 tip bytes>
    let mut out = Vec::with_capacity(2 + 1 + 15 + 2 + 2 + 32);
    // labeled node
    out.push(0x82); // array(2)
    out.push(0x02); // tag = 2 (labeled)
    // label bytes
    let label = b"last_block_hash";
    assert!(label.len() < 24, "short-form byte string only covers lengths < 24");
    // Actually 15 fits in short-form major-type-2 (0x40 + len).
    out.push(0x40 | (label.len() as u8));
    out.extend_from_slice(label);
    // leaf node
    out.push(0x82); // array(2)
    out.push(0x03); // tag = 3 (leaf)
    // byte string of 32 bytes — needs 1-byte length prefix 0x58 0x20.
    out.push(0x58);
    out.push(0x20);
    out.extend_from_slice(tip);
    out
}

/// Updates the certified-data witness. Must be called from an update or
/// init — the replica rejects `set_certified_data` from queries.
fn refresh_certified_data() {
    let tip = TIP_HASH.with(|t| t.borrow().get().0);
    let root = tip_root_hash(&tip);
    ic_cdk::api::set_certified_data(&root);
}

#[query]
fn icrc3_get_tip_certificate() -> Option<ICRC3DataCertificate> {
    // `data_certificate` is Some(..) only when this query is served via
    // replicated-state read (i.e. `?certified=true`). Queries that take
    // fast-path non-certified reads return None; callers should retry
    // in certified mode for verification.
    let cert = ic_cdk::api::data_certificate()?;
    let tip = TIP_HASH.with(|t| t.borrow().get().0);
    let hash_tree = encode_hash_tree(&tip);
    Some(ICRC3DataCertificate {
        certificate: serde_bytes::ByteBuf::from(cert),
        hash_tree: serde_bytes::ByteBuf::from(hash_tree),
    })
}

#[query]
fn icrc1_balance_of(account: Account) -> Nat {
    let key = AccountKey::from_account(&account);
    BALANCES.with(|b| Nat::from(b.borrow().get(&key).map(|v| v.0).unwrap_or(0)))
}

/// Returns this canister's own principal — useful for dapp wiring.
#[query]
fn canister_principal() -> Principal {
    ic_cdk::api::id()
}

#[query]
fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

// -------------------------------------------------------------------------
// ICRC-1 updates
// -------------------------------------------------------------------------

#[update]
fn icrc1_transfer(arg: TransferArg) -> Result<Nat, TransferError> {
    let caller = ic_cdk::api::caller();
    let from = Account { owner: caller, subaccount: arg.from_subaccount };
    execute_transfer(
        &from,
        &arg.to,
        &arg.amount,
        arg.fee.as_ref(),
        arg.memo.as_ref(),
        None,
        arg.created_at_time,
    )
}

/// Shared balance-mutation logic for ICRC-1 transfer and ICRC-2
/// transfer_from. Validates amount, fee, memo, deducts (amount + fee)
/// from `from`, credits `amount` to `to`, and burns the fee. `spender`
/// is Some(_) only on the ICRC-2 path and ends up in the emitted block.
/// `created_at_time` enables ICRC-1 dedup / replay-protection.
fn execute_transfer(
    from: &Account,
    to: &Account,
    amount_nat: &Nat,
    fee_nat: Option<&Nat>,
    memo: Option<&Memo>,
    spender: Option<&Account>,
    created_at_time: Option<u64>,
) -> Result<Nat, TransferError> {
    // Self-transfer is a no-op per ICRC-1 convention — no state change,
    // no tx counter bump, no log entry (index 0 is reserved for the
    // no-op / never-happened case).
    if from == to {
        return Ok(Nat::from(0u64));
    }

    let amount = nat_to_u128(amount_nat).ok_or_else(|| TransferError::GenericError {
        error_code: Nat::from(1u64),
        message: "amount exceeds u128".to_string(),
    })?;

    let fee = match fee_nat {
        Some(supplied) => {
            let f = nat_to_u128(supplied).ok_or_else(|| TransferError::BadFee {
                expected_fee: Nat::from(TRANSFER_FEE),
            })?;
            if f != TRANSFER_FEE {
                return Err(TransferError::BadFee { expected_fee: Nat::from(TRANSFER_FEE) });
            }
            f
        }
        None => TRANSFER_FEE,
    };

    if let Some(Memo(m)) = memo {
        if m.len() > MAX_MEMO_LEN {
            return Err(TransferError::GenericError {
                error_code: Nat::from(2u64),
                message: format!("memo exceeds {MAX_MEMO_LEN} bytes"),
            });
        }
    }

    let total_debit = amount.checked_add(fee).ok_or_else(|| TransferError::GenericError {
        error_code: Nat::from(3u64),
        message: "amount + fee overflow".to_string(),
    })?;

    // Dedup pre-check — if this exact tuple was already executed within
    // the window, return Duplicate instead of double-processing.
    let op_tag = if spender.is_some() { "2xfer" } else { "1xfer" };
    let memo_bytes = memo.map(|m| m.0.as_ref());
    let dedup = dedup_precheck(
        &from.owner,
        op_tag,
        from.subaccount.as_ref().map(|s| s.as_slice()),
        Some(&to.owner),
        to.subaccount.as_ref().map(|s| s.as_slice()),
        amount,
        fee,
        memo_bytes,
        created_at_time,
        spender.map(|s| &s.owner),
        spender.and_then(|s| s.subaccount.as_ref().map(|b| b.as_slice())),
    );
    match dedup {
        DedupCheck::Duplicate(id) => {
            return Err(TransferError::Duplicate { duplicate_of: Nat::from(id) });
        }
        DedupCheck::TooOld => return Err(TransferError::TooOld),
        DedupCheck::CreatedInFuture(ledger_time) => {
            return Err(TransferError::CreatedInFuture { ledger_time });
        }
        DedupCheck::Fresh { .. } | DedupCheck::NoWindow => {}
    }

    let from_key = AccountKey::from_account(from);
    let to_key = AccountKey::from_account(to);

    BALANCES.with(|b| {
        let mut balances = b.borrow_mut();
        let from_bal = balances.get(&from_key).map(|v| v.0).unwrap_or(0);
        if from_bal < total_debit {
            return Err(TransferError::InsufficientFunds { balance: Nat::from(from_bal) });
        }
        let to_bal = balances.get(&to_key).map(|v| v.0).unwrap_or(0);
        balances.insert(from_key, BalanceVal(from_bal - total_debit));
        balances.insert(to_key, BalanceVal(to_bal + amount));
        Ok::<(), TransferError>(())
    })?;

    TOTAL_SUPPLY.with(|t| {
        let mut cell = t.borrow_mut();
        let cur = cell.get().0;
        cell.set(BalanceVal(cur.saturating_sub(fee))).expect("set total supply");
    });

    let btype = if spender.is_some() { "2xfer" } else { "1xfer" };
    append_block(btype, build_transfer_tx(from, to, amount, fee, memo, spender));
    let tx_id = next_tx_index();
    if let DedupCheck::Fresh { hash, created_at_ns } = dedup {
        dedup_record(hash, tx_id, created_at_ns);
    }
    Ok(Nat::from(tx_id))
}

// -------------------------------------------------------------------------
// ICRC-2
// -------------------------------------------------------------------------

/// Current expiry-aware view of an allowance: returns 0/0 if expired or
/// missing so callers can treat "no allowance" uniformly.
fn read_allowance(from: &Account, spender: &Account) -> AllowanceVal {
    let key = AllowanceKey {
        from: AccountKey::from_account(from),
        spender: AccountKey::from_account(spender),
    };
    let now = ic_cdk::api::time();
    ALLOWANCES.with(|a| {
        a.borrow()
            .get(&key)
            .filter(|v| v.expires_at_ns == 0 || v.expires_at_ns > now)
            .unwrap_or(AllowanceVal { amount: 0, expires_at_ns: 0 })
    })
}

#[query]
fn icrc2_allowance(args: AllowanceArgs) -> Allowance {
    let v = read_allowance(&args.account, &args.spender);
    Allowance {
        allowance: Nat::from(v.amount),
        expires_at: if v.expires_at_ns == 0 { None } else { Some(v.expires_at_ns) },
    }
}

#[update]
fn icrc2_approve(arg: ApproveArgs) -> Result<Nat, ApproveError> {
    let caller = ic_cdk::api::caller();
    let from = Account { owner: caller, subaccount: arg.from_subaccount };
    let spender = arg.spender;

    // Self-approve is meaningless — ICRC-2 explicitly rejects.
    if from == spender {
        return Err(ApproveError::GenericError {
            error_code: Nat::from(10u64),
            message: "cannot approve self".to_string(),
        });
    }

    // Memo size — mirror the transfer / mint / burn policy.
    if let Some(Memo(m)) = &arg.memo {
        if m.len() > MAX_MEMO_LEN {
            return Err(ApproveError::GenericError {
                error_code: Nat::from(2u64),
                message: format!("memo exceeds {MAX_MEMO_LEN} bytes"),
            });
        }
    }

    let new_amount = nat_to_u128(&arg.amount).ok_or_else(|| ApproveError::GenericError {
        error_code: Nat::from(1u64),
        message: "amount exceeds u128".to_string(),
    })?;

    // Fee validation mirrors icrc1_transfer.
    let fee = match &arg.fee {
        Some(supplied) => {
            let f = nat_to_u128(supplied).ok_or_else(|| ApproveError::BadFee {
                expected_fee: Nat::from(TRANSFER_FEE),
            })?;
            if f != TRANSFER_FEE {
                return Err(ApproveError::BadFee { expected_fee: Nat::from(TRANSFER_FEE) });
            }
            f
        }
        None => TRANSFER_FEE,
    };

    // expected_allowance: if the caller provided this, it MUST equal the
    // current effective allowance. Race-safe update pattern.
    let current = read_allowance(&from, &spender);
    if let Some(expected) = &arg.expected_allowance {
        let exp = nat_to_u128(expected).unwrap_or(u128::MAX);
        if exp != current.amount {
            return Err(ApproveError::AllowanceChanged {
                current_allowance: Nat::from(current.amount),
            });
        }
    }

    // Expiry cannot already be in the past.
    let now = ic_cdk::api::time();
    if let Some(expiry) = arg.expires_at {
        if expiry <= now {
            return Err(ApproveError::Expired { ledger_time: now });
        }
    }

    // Dedup pre-check — same shape as transfer, different op tag.
    let approve_memo = arg.memo.as_ref().map(|m| m.0.as_ref());
    let dedup = dedup_precheck(
        &from.owner,
        "2approve",
        from.subaccount.as_ref().map(|s| s.as_slice()),
        Some(&spender.owner),
        spender.subaccount.as_ref().map(|s| s.as_slice()),
        new_amount,
        fee,
        approve_memo,
        arg.created_at_time,
        None,
        None,
    );
    match dedup {
        DedupCheck::Duplicate(id) => {
            return Err(ApproveError::Duplicate { duplicate_of: Nat::from(id) });
        }
        DedupCheck::TooOld => return Err(ApproveError::TooOld),
        DedupCheck::CreatedInFuture(ledger_time) => {
            return Err(ApproveError::CreatedInFuture { ledger_time });
        }
        DedupCheck::Fresh { .. } | DedupCheck::NoWindow => {}
    }

    // Charge the approval fee (burns from `from`).
    let from_key = AccountKey::from_account(&from);
    BALANCES.with(|b| {
        let mut balances = b.borrow_mut();
        let from_bal = balances.get(&from_key).map(|v| v.0).unwrap_or(0);
        if from_bal < fee {
            return Err(ApproveError::InsufficientFunds { balance: Nat::from(from_bal) });
        }
        balances.insert(from_key.clone(), BalanceVal(from_bal - fee));
        Ok::<(), ApproveError>(())
    })?;
    TOTAL_SUPPLY.with(|t| {
        let mut cell = t.borrow_mut();
        let cur = cell.get().0;
        cell.set(BalanceVal(cur.saturating_sub(fee))).expect("set total supply");
    });

    // Write new allowance.
    let allowance_key = AllowanceKey {
        from: AccountKey::from_account(&from),
        spender: AccountKey::from_account(&spender),
    };
    let new_val = AllowanceVal {
        amount: new_amount,
        expires_at_ns: arg.expires_at.unwrap_or(0),
    };
    ALLOWANCES.with(|a| {
        let mut m = a.borrow_mut();
        if new_amount == 0 {
            // Zero-amount approve revokes; keep map sparse.
            m.remove(&allowance_key);
        } else {
            m.insert(allowance_key, new_val);
        }
    });

    append_block(
        "2approve",
        build_approve_tx(
            &from,
            &spender,
            new_amount,
            arg.expected_allowance.as_ref().and_then(nat_to_u128),
            arg.expires_at,
            fee,
            arg.memo.as_ref(),
        ),
    );
    let tx_id = next_tx_index();
    if let DedupCheck::Fresh { hash, created_at_ns } = dedup {
        dedup_record(hash, tx_id, created_at_ns);
    }
    Ok(Nat::from(tx_id))
}

#[update]
fn icrc2_transfer_from(arg: TransferFromArgs) -> Result<Nat, TransferFromError> {
    let caller = ic_cdk::api::caller();
    let spender = Account { owner: caller, subaccount: arg.spender_subaccount };
    let from = arg.from;
    let to = arg.to;

    let amount = nat_to_u128(&arg.amount).ok_or_else(|| TransferFromError::GenericError {
        error_code: Nat::from(1u64),
        message: "amount exceeds u128".to_string(),
    })?;

    // If caller IS the owner, skip the allowance check — an owner can always
    // move their own funds, which is identical to icrc1_transfer semantics.
    //
    // Otherwise, the allowance must cover amount + fee. We use the canister's
    // canonical TRANSFER_FEE (not arg.fee, which might be wrong) so the
    // allowance check's verdict doesn't depend on caller-supplied data.
    // If arg.fee is a BadFee, execute_transfer will surface that error
    // after — but we want the allowance check itself to be authoritative.
    if spender != from {
        let current = read_allowance(&from, &spender);
        let required = amount.checked_add(TRANSFER_FEE).ok_or_else(|| {
            TransferFromError::GenericError {
                error_code: Nat::from(3u64),
                message: "amount + fee overflow".to_string(),
            }
        })?;
        if current.amount < required {
            return Err(TransferFromError::InsufficientAllowance {
                allowance: Nat::from(current.amount),
            });
        }
    }

    // Delegate the actual balance movement to the shared helper. Pass
    // the spender so the emitted block is btype "2xfer".
    let tx = execute_transfer(
        &from,
        &to,
        &arg.amount,
        arg.fee.as_ref(),
        arg.memo.as_ref(),
        Some(&spender),
        arg.created_at_time,
    )
    .map_err(transfer_err_to_transfer_from_err)?;

    // Decrement the allowance on success. Owner-as-spender path skipped.
    // execute_transfer has already validated the fee equals TRANSFER_FEE,
    // so that's what the allowance was debited for — use it directly.
    if spender != from {
        let total_debited = amount + TRANSFER_FEE;
        let allowance_key = AllowanceKey {
            from: AccountKey::from_account(&from),
            spender: AccountKey::from_account(&spender),
        };
        ALLOWANCES.with(|a| {
            let mut m = a.borrow_mut();
            if let Some(cur) = m.get(&allowance_key) {
                let remaining = cur.amount.saturating_sub(total_debited);
                if remaining == 0 {
                    m.remove(&allowance_key);
                } else {
                    m.insert(
                        allowance_key,
                        AllowanceVal { amount: remaining, expires_at_ns: cur.expires_at_ns },
                    );
                }
            }
        });
    }

    Ok(tx)
}

/// Lift an ICRC-1 TransferError into an ICRC-2 TransferFromError.
fn transfer_err_to_transfer_from_err(e: TransferError) -> TransferFromError {
    match e {
        TransferError::BadFee { expected_fee } => TransferFromError::BadFee { expected_fee },
        TransferError::BadBurn { min_burn_amount } => TransferFromError::BadBurn { min_burn_amount },
        TransferError::InsufficientFunds { balance } => TransferFromError::InsufficientFunds { balance },
        TransferError::TooOld => TransferFromError::TooOld,
        TransferError::CreatedInFuture { ledger_time } => TransferFromError::CreatedInFuture { ledger_time },
        TransferError::Duplicate { duplicate_of } => TransferFromError::Duplicate { duplicate_of },
        TransferError::TemporarilyUnavailable => TransferFromError::TemporarilyUnavailable,
        TransferError::GenericError { error_code, message } => TransferFromError::GenericError { error_code, message },
    }
}

// -------------------------------------------------------------------------
// Mint / Burn — minter-gated and self-serve burn.
// The LTC deposit oracle (ICP-09+) calls `mint` after N-confirmation
// LTC deposits. Users can always burn their own tokens directly.
// -------------------------------------------------------------------------

/// Arguments to the minter-gated `mint` entrypoint. Mirrors ICRC-1 transfer
/// shape so indexers can treat it as a transfer-from-minting-account.
#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub struct MintArgs {
    pub to: Account,
    pub amount: Nat,
    pub memo: Option<Memo>,
    pub created_at_time: Option<u64>,
}

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub enum MintError {
    NotMinter,
    AmountZero,
    AmountOverflow,
    MemoTooLong,
    /// set_minter: the proposed principal is anonymous or the
    /// management canister, which would make mint permissionless.
    InvalidMinter,
}

/// Minter-only. Credits `amount` to `to` and increments total_supply.
/// No fee — ICRC-1 convention: the minting account does not pay fees.
#[update]
fn mint(args: MintArgs) -> Result<Nat, MintError> {
    let caller = ic_cdk::api::caller();
    let minter = CONFIG.with(|c| c.borrow().get().minter);
    if caller != minter {
        return Err(MintError::NotMinter);
    }

    let amount = nat_to_u128(&args.amount).ok_or(MintError::AmountOverflow)?;
    if amount == 0 {
        return Err(MintError::AmountZero);
    }
    if let Some(Memo(m)) = &args.memo {
        if m.len() > MAX_MEMO_LEN {
            return Err(MintError::MemoTooLong);
        }
    }

    mint_to(&args.to, amount);
    append_block("1mint", build_mint_tx(&args.to, amount, args.memo.as_ref()));
    Ok(Nat::from(next_tx_index()))
}

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub struct BurnArgs {
    /// Optional subaccount to burn from; defaults to the caller's default.
    pub from_subaccount: Option<[u8; 32]>,
    pub amount: Nat,
    pub memo: Option<Memo>,
    pub created_at_time: Option<u64>,
}

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
pub enum BurnError {
    AmountZero,
    AmountOverflow,
    MemoTooLong,
    InsufficientFunds { balance: Nat },
}

/// Self-serve burn: caller destroys `amount` from their own balance.
/// No fee — burning already removes supply; charging fee is punitive.
#[update]
fn burn(args: BurnArgs) -> Result<Nat, BurnError> {
    let caller = ic_cdk::api::caller();
    let from = Account { owner: caller, subaccount: args.from_subaccount };

    let amount = nat_to_u128(&args.amount).ok_or(BurnError::AmountOverflow)?;
    if amount == 0 {
        return Err(BurnError::AmountZero);
    }
    if let Some(Memo(m)) = &args.memo {
        if m.len() > MAX_MEMO_LEN {
            return Err(BurnError::MemoTooLong);
        }
    }

    let key = AccountKey::from_account(&from);
    BALANCES.with(|b| {
        let mut bal = b.borrow_mut();
        let cur = bal.get(&key).map(|v| v.0).unwrap_or(0);
        if cur < amount {
            return Err(BurnError::InsufficientFunds { balance: Nat::from(cur) });
        }
        let remaining = cur - amount;
        if remaining == 0 {
            bal.remove(&key);
        } else {
            bal.insert(key.clone(), BalanceVal(remaining));
        }
        Ok::<(), BurnError>(())
    })?;

    TOTAL_SUPPLY.with(|t| {
        let mut cell = t.borrow_mut();
        let cur = cell.get().0;
        cell.set(BalanceVal(cur.saturating_sub(amount))).expect("set supply");
    });

    append_block("1burn", build_burn_tx(&from, amount, args.memo.as_ref()));
    Ok(Nat::from(next_tx_index()))
}

/// Current minter principal — useful for dapps that want to display
/// "deposits handled by" trust info.
#[query]
fn get_minter() -> Principal {
    CONFIG.with(|c| c.borrow().get().minter)
}

/// Current minter rotates control to a new principal (multisig, DAO, etc.).
/// Only the current minter may call; there is no super-admin.
#[update]
fn set_minter(new_minter: Principal) -> Result<(), MintError> {
    let caller = ic_cdk::api::caller();
    let current = CONFIG.with(|c| c.borrow().get().minter);
    if caller != current {
        return Err(MintError::NotMinter);
    }
    // Apply the same validation init uses — can't rotate to a principal
    // that would make mint permissionless.
    if validate_minter(&new_minter).is_err() {
        return Err(MintError::InvalidMinter);
    }
    CONFIG.with(|c| {
        c.borrow_mut()
            .set(InitArgs { minter: new_minter })
            .expect("rotate minter");
    });
    Ok(())
}

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

fn nat_to_u128(n: &Nat) -> Option<u128> {
    use num_traits::ToPrimitive;
    n.0.to_u128()
}

/// Internal mint helper — used by the `mint` entrypoint and by tests.
fn mint_to(account: &Account, amount: u128) {
    let key = AccountKey::from_account(account);
    BALANCES.with(|b| {
        let mut bal = b.borrow_mut();
        let cur = bal.get(&key).map(|v| v.0).unwrap_or(0);
        bal.insert(key, BalanceVal(cur + amount));
    });
    TOTAL_SUPPLY.with(|t| {
        let mut cell = t.borrow_mut();
        let cur = cell.get().0;
        cell.set(BalanceVal(cur + amount)).expect("bump supply");
    });
}

ic_cdk::export_candid!();

// -------------------------------------------------------------------------
// Unit tests (pure Rust; replica integration tests land in ICP-05)
// -------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn acct(p: Principal, sub: Option<[u8; 32]>) -> Account {
        Account { owner: p, subaccount: sub }
    }

    #[test]
    fn account_key_distinguishes_subaccounts() {
        let p = Principal::from_slice(&[0x01, 0x02, 0x03]);
        let k0 = AccountKey::from_account(&acct(p, None));
        let k1 = AccountKey::from_account(&acct(p, Some([1u8; 32])));
        assert_ne!(k0, k1);
    }

    #[test]
    fn account_key_round_trip() {
        let p = Principal::from_slice(&[0x0A, 0x0B, 0x0C, 0x0D]);
        let key = AccountKey::from_account(&acct(p, Some([7u8; 32])));
        let bytes = key.to_bytes();
        let decoded = AccountKey::from_bytes(bytes);
        assert_eq!(key, decoded);
    }

    #[test]
    fn balance_val_round_trip() {
        let v = BalanceVal(u128::MAX / 3);
        let bytes = v.to_bytes();
        let decoded = BalanceVal::from_bytes(bytes);
        assert_eq!(v, decoded);
    }

    #[test]
    fn allowance_key_round_trip() {
        let a = AccountKey::from_account(&acct(
            Principal::from_slice(&[1, 2, 3, 4, 5]),
            Some([9u8; 32]),
        ));
        let b = AccountKey::from_account(&acct(
            Principal::from_slice(&[10, 11, 12]),
            None,
        ));
        let k = AllowanceKey { from: a, spender: b };
        let bytes = k.to_bytes();
        let decoded = AllowanceKey::from_bytes(bytes);
        assert_eq!(k, decoded);
    }

    #[test]
    fn allowance_val_round_trip() {
        let v = AllowanceVal {
            amount: u128::MAX / 7,
            expires_at_ns: 1_700_000_000_000_000_000,
        };
        let bytes = v.to_bytes();
        let decoded = AllowanceVal::from_bytes(bytes);
        assert_eq!(v, decoded);
    }

    #[test]
    fn allowance_key_ordering_is_stable() {
        // Map iteration order matters for any future "list allowances" rpc.
        let low = AllowanceKey {
            from: AccountKey::from_account(&acct(Principal::from_slice(&[1]), None)),
            spender: AccountKey::from_account(&acct(Principal::from_slice(&[2]), None)),
        };
        let high = AllowanceKey {
            from: AccountKey::from_account(&acct(Principal::from_slice(&[3]), None)),
            spender: AccountKey::from_account(&acct(Principal::from_slice(&[4]), None)),
        };
        assert!(low < high);
    }

    #[test]
    fn mint_args_round_trips_through_candid() {
        use candid::{decode_one, encode_one};
        let args = MintArgs {
            to: acct(Principal::from_slice(&[0xAA, 0xBB]), None),
            amount: Nat::from(5_000_000u64),
            memo: Some(Memo(serde_bytes::ByteBuf::from(b"ltc-tx-abc".to_vec()))),
            created_at_time: Some(1_700_000_000_000_000_000),
        };
        let bytes = encode_one(&args).unwrap();
        let decoded: MintArgs = decode_one(&bytes).unwrap();
        assert_eq!(decoded.amount, args.amount);
        assert_eq!(decoded.to.owner, args.to.owner);
    }

    #[test]
    fn burn_args_round_trips_through_candid() {
        use candid::{decode_one, encode_one};
        let args = BurnArgs {
            from_subaccount: Some([3u8; 32]),
            amount: Nat::from(100u64),
            memo: None,
            created_at_time: None,
        };
        let bytes = encode_one(&args).unwrap();
        let decoded: BurnArgs = decode_one(&bytes).unwrap();
        assert_eq!(decoded.amount, args.amount);
        assert_eq!(decoded.from_subaccount, args.from_subaccount);
    }

    #[test]
    fn hash_tree_cbor_shape() {
        // 2 + 1 + 15 + 2 + 2 + 32 = 54 bytes for our single-leaf tree.
        let tip = [0xABu8; 32];
        let cbor = encode_hash_tree(&tip);
        assert_eq!(cbor.len(), 54);
        // First two bytes: 0x82 0x02 → array(2), tag 2 (labeled).
        assert_eq!(cbor[0], 0x82);
        assert_eq!(cbor[1], 0x02);
        // Byte 2: 0x4F = byte string length 15 (0x40 | 15).
        assert_eq!(cbor[2], 0x40 | 15);
        // Label "last_block_hash" (15 chars).
        assert_eq!(&cbor[3..3 + 15], b"last_block_hash");
        // Next: 0x82 0x03 → array(2), tag 3 (leaf).
        assert_eq!(cbor[18], 0x82);
        assert_eq!(cbor[19], 0x03);
        // Byte string length-32 header: 0x58 0x20.
        assert_eq!(cbor[20], 0x58);
        assert_eq!(cbor[21], 0x20);
        // Finally 32 bytes of tip.
        assert_eq!(&cbor[22..], &tip[..]);
    }

    #[test]
    fn tip_root_matches_labeled_leaf() {
        // Golden check: compute the root two ways and compare.
        let tip = [0xCDu8; 32];
        let via_helper = tip_root_hash(&tip);
        let direct = {
            use sha2::{Digest, Sha256};
            let leaf = {
                let mut h = Sha256::new();
                h.update([16]); // "ic-hashtree-leaf" = 16 chars
                h.update(b"ic-hashtree-leaf");
                h.update(tip);
                let out: [u8; 32] = h.finalize().into();
                out
            };
            let mut h = Sha256::new();
            h.update([19]); // "ic-hashtree-labeled" = 19 chars
            h.update(b"ic-hashtree-labeled");
            h.update(b"last_block_hash");
            h.update(leaf);
            let out: [u8; 32] = h.finalize().into();
            out
        };
        assert_eq!(via_helper, direct);
    }

    #[test]
    fn validate_minter_rejects_dangerous_principals() {
        // Anonymous is always rejected.
        assert!(validate_minter(&Principal::anonymous()).is_err());
        // Management canister (aaaaa-aa) is always rejected.
        assert!(validate_minter(&Principal::management_canister()).is_err());
        // Any other principal is fine.
        assert!(validate_minter(&Principal::from_slice(&[0x01; 29])).is_ok());
        assert!(validate_minter(&Principal::from_slice(&[0xAA; 10])).is_ok());
    }

    #[test]
    fn tx_counter_monotonic() {
        // Reset counter explicitly — other tests may have bumped it.
        TX_COUNTER.with(|c| c.borrow_mut().set(0u64).unwrap());
        let a = next_tx_index();
        let b = next_tx_index();
        let c = next_tx_index();
        assert_eq!(a, 1);
        assert_eq!(b, 2);
        assert_eq!(c, 3);
    }

    #[test]
    fn mint_error_variants_stable() {
        use candid::{decode_one, encode_one};
        for err in [
            MintError::NotMinter,
            MintError::AmountZero,
            MintError::AmountOverflow,
            MintError::MemoTooLong,
        ] {
            let bytes = encode_one(&err).unwrap();
            let _: MintError = decode_one(&bytes).unwrap();
        }
    }
}
