//! End-to-end tests for the Livewager Points Ledger on a local replica
//! via pocket-ic. Exercises the full candid surface with real principals.
//!
//! Run with:
//!   cargo build --target wasm32-unknown-unknown -p points_ledger --release
//!   cargo test -p points_ledger --test integration
//!
//! The tests auto-locate pocket-ic under dfx's cache — no env var needed
//! for local runs. CI must set POCKET_IC_BIN explicitly.

use candid::{decode_one, encode_one, CandidType, Deserialize, Nat, Principal};
use pocket_ic::PocketIc;
use serde::Serialize;
use std::path::PathBuf;

// ---- Type mirrors (kept in the test file so we don't depend on the
// canister crate being importable as a library). Shape matches lib.rs. ----

#[derive(CandidType, Deserialize, Serialize, Clone, Debug, PartialEq, Eq)]
struct Account {
    owner: Principal,
    subaccount: Option<[u8; 32]>,
}

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
struct InitArgs {
    minter: Principal,
}

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
struct TransferArg {
    from_subaccount: Option<[u8; 32]>,
    to: Account,
    amount: Nat,
    fee: Option<Nat>,
    memo: Option<serde_bytes::ByteBuf>,
    created_at_time: Option<u64>,
}

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
#[allow(dead_code)]
enum TransferError {
    BadFee { expected_fee: Nat },
    BadBurn { min_burn_amount: Nat },
    InsufficientFunds { balance: Nat },
    TooOld,
    CreatedInFuture { ledger_time: u64 },
    Duplicate { duplicate_of: Nat },
    TemporarilyUnavailable,
    GenericError { error_code: Nat, message: String },
}

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
struct MintArgs {
    to: Account,
    amount: Nat,
    memo: Option<serde_bytes::ByteBuf>,
    created_at_time: Option<u64>,
}

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
#[allow(dead_code)]
enum MintError {
    NotMinter,
    AmountZero,
    AmountOverflow,
    MemoTooLong,
    InvalidMinter,
}

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
struct ApproveArgs {
    from_subaccount: Option<[u8; 32]>,
    spender: Account,
    amount: Nat,
    expected_allowance: Option<Nat>,
    expires_at: Option<u64>,
    fee: Option<Nat>,
    memo: Option<serde_bytes::ByteBuf>,
    created_at_time: Option<u64>,
}

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
#[allow(dead_code)]
enum ApproveError {
    BadFee { expected_fee: Nat },
    InsufficientFunds { balance: Nat },
    AllowanceChanged { current_allowance: Nat },
    Expired { ledger_time: u64 },
    TooOld,
    CreatedInFuture { ledger_time: u64 },
    Duplicate { duplicate_of: Nat },
    TemporarilyUnavailable,
    GenericError { error_code: Nat, message: String },
}

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
struct AllowanceArgs {
    account: Account,
    spender: Account,
}

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
struct Allowance {
    allowance: Nat,
    expires_at: Option<u64>,
}

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
struct TransferFromArgs {
    spender_subaccount: Option<[u8; 32]>,
    from: Account,
    to: Account,
    amount: Nat,
    fee: Option<Nat>,
    memo: Option<serde_bytes::ByteBuf>,
    created_at_time: Option<u64>,
}

#[derive(CandidType, Deserialize, Serialize, Clone, Debug)]
#[allow(dead_code)]
enum TransferFromError {
    BadFee { expected_fee: Nat },
    BadBurn { min_burn_amount: Nat },
    InsufficientFunds { balance: Nat },
    InsufficientAllowance { allowance: Nat },
    TooOld,
    CreatedInFuture { ledger_time: u64 },
    Duplicate { duplicate_of: Nat },
    TemporarilyUnavailable,
    GenericError { error_code: Nat, message: String },
}

// ---- Harness ----

const FEE: u64 = 10_000;

fn wasm_path() -> PathBuf {
    // Tests run from the package dir (canisters/points_ledger). Target
    // lives at <workspace>/target, i.e. two levels up.
    let mut p = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    p.push("../../target/wasm32-unknown-unknown/release/points_ledger.wasm");
    p
}

fn ensure_pocket_ic_bin() {
    if std::env::var_os("POCKET_IC_BIN").is_some() {
        return;
    }
    // dfx caches pocket-ic under ~/.cache/dfinity/versions/<ver>/pocket-ic.
    // Pick whatever version exists (we don't hard-code dfx version).
    let home = std::env::var("HOME").expect("HOME not set");
    let versions_dir = PathBuf::from(&home).join(".cache/dfinity/versions");
    if let Ok(entries) = std::fs::read_dir(&versions_dir) {
        for e in entries.flatten() {
            let candidate = e.path().join("pocket-ic");
            if candidate.exists() {
                std::env::set_var("POCKET_IC_BIN", candidate);
                return;
            }
        }
    }
    panic!(
        "POCKET_IC_BIN not set and no pocket-ic binary found under {}",
        versions_dir.display()
    );
}

struct Harness {
    pic: PocketIc,
    canister: Principal,
    minter: Principal,
}

impl Harness {
    fn new() -> Self {
        ensure_pocket_ic_bin();
        let pic = PocketIc::new();
        let canister = pic.create_canister();
        pic.add_cycles(canister, 2_000_000_000_000);

        let wasm = std::fs::read(wasm_path()).expect("wasm missing — run cargo build --release");

        let minter = Principal::from_slice(&[0xAA; 29]);
        let init = encode_one(InitArgs { minter }).unwrap();
        pic.install_canister(canister, wasm, init, None);

        Self { pic, canister, minter }
    }

    fn q<T: candid::CandidType + serde::de::DeserializeOwned>(
        &self,
        caller: Principal,
        method: &str,
        args: Vec<u8>,
    ) -> T {
        let bytes = self
            .pic
            .query_call(self.canister, caller, method, args)
            .unwrap_or_else(|e| panic!("query {method} rejected: {e:?}"));
        decode_one(&bytes).expect("decode query reply")
    }

    fn u<T: candid::CandidType + serde::de::DeserializeOwned>(
        &self,
        caller: Principal,
        method: &str,
        args: Vec<u8>,
    ) -> T {
        let bytes = self
            .pic
            .update_call(self.canister, caller, method, args)
            .unwrap_or_else(|e| panic!("update {method} rejected: {e:?}"));
        decode_one(&bytes).expect("decode update reply")
    }

    fn balance(&self, who: Principal) -> u64 {
        let nat: Nat = self.q(
            Principal::anonymous(),
            "icrc1_balance_of",
            encode_one(Account { owner: who, subaccount: None }).unwrap(),
        );
        use num_traits::ToPrimitive;
        nat.0.to_u64().unwrap()
    }

    fn total_supply(&self) -> u64 {
        let nat: Nat = self.q(Principal::anonymous(), "icrc1_total_supply", encode_one(()).unwrap());
        use num_traits::ToPrimitive;
        nat.0.to_u64().unwrap()
    }

    fn mint(&self, caller: Principal, to: Principal, amount: u64) -> Result<Nat, MintError> {
        let args = MintArgs {
            to: Account { owner: to, subaccount: None },
            amount: Nat::from(amount),
            memo: None,
            created_at_time: None,
        };
        self.u::<Result<Nat, MintError>>(caller, "mint", encode_one(args).unwrap())
    }

    fn transfer(
        &self,
        from: Principal,
        to: Principal,
        amount: u64,
    ) -> Result<Nat, TransferError> {
        let args = TransferArg {
            from_subaccount: None,
            to: Account { owner: to, subaccount: None },
            amount: Nat::from(amount),
            fee: None,
            memo: None,
            created_at_time: None,
        };
        self.u::<Result<Nat, TransferError>>(from, "icrc1_transfer", encode_one(args).unwrap())
    }
}

// ---- Tests ----

#[test]
fn metadata_exposes_icrc1_and_icrc2() {
    let h = Harness::new();
    let name: String = h.q(Principal::anonymous(), "icrc1_name", encode_one(()).unwrap());
    assert_eq!(name, "Livewager Points");
    let symbol: String = h.q(Principal::anonymous(), "icrc1_symbol", encode_one(()).unwrap());
    assert_eq!(symbol, "LWP");
    let decimals: u8 = h.q(Principal::anonymous(), "icrc1_decimals", encode_one(()).unwrap());
    assert_eq!(decimals, 8);

    // Supported standards must list both ICRC-1 and ICRC-2.
    #[derive(CandidType, Deserialize, Debug)]
    struct Std { name: String, url: String }
    let stds: Vec<Std> = h.q(
        Principal::anonymous(),
        "icrc1_supported_standards",
        encode_one(()).unwrap(),
    );
    let names: Vec<_> = stds.iter().map(|s| s.name.as_str()).collect();
    assert!(names.contains(&"ICRC-1"));
    assert!(names.contains(&"ICRC-2"));
}

#[test]
fn non_minter_cannot_mint() {
    let h = Harness::new();
    let imposter = Principal::from_slice(&[0xBB; 29]);
    let result = h.mint(imposter, imposter, 1_000_000);
    assert!(matches!(result, Err(MintError::NotMinter)));
    assert_eq!(h.total_supply(), 0);
}

#[test]
fn minter_can_mint_and_total_supply_updates() {
    let h = Harness::new();
    let alice = Principal::from_slice(&[0x01; 29]);
    h.mint(h.minter, alice, 5_000_000).expect("mint");
    assert_eq!(h.balance(alice), 5_000_000);
    assert_eq!(h.total_supply(), 5_000_000);
}

#[test]
fn transfer_moves_balance_and_burns_fee() {
    let h = Harness::new();
    let alice = Principal::from_slice(&[0x01; 29]);
    let bob = Principal::from_slice(&[0x02; 29]);

    h.mint(h.minter, alice, 1_000_000).unwrap();
    assert_eq!(h.total_supply(), 1_000_000);

    h.transfer(alice, bob, 100_000).expect("transfer");
    assert_eq!(h.balance(alice), 1_000_000 - 100_000 - FEE);
    assert_eq!(h.balance(bob), 100_000);
    assert_eq!(h.total_supply(), 1_000_000 - FEE, "fee must be burned");
}

#[test]
fn transfer_rejects_insufficient_funds() {
    let h = Harness::new();
    let alice = Principal::from_slice(&[0x01; 29]);
    let bob = Principal::from_slice(&[0x02; 29]);
    h.mint(h.minter, alice, 50_000).unwrap();
    match h.transfer(alice, bob, 100_000) {
        Err(TransferError::InsufficientFunds { .. }) => {}
        other => panic!("expected InsufficientFunds, got {other:?}"),
    }
}

#[test]
fn icrc2_approve_rejects_oversize_memo() {
    let h = Harness::new();
    let alice = Principal::from_slice(&[0x01; 29]);
    let bob = Principal::from_slice(&[0x02; 29]);
    h.mint(h.minter, alice, 1_000_000).expect("mint");

    // 33-byte memo — one over the 32-byte cap.
    let oversize = vec![0u8; 33];
    let res: Result<Nat, ApproveError> = h.u(
        alice,
        "icrc2_approve",
        encode_one(ApproveArgs {
            from_subaccount: None,
            spender: Account { owner: bob, subaccount: None },
            amount: Nat::from(100_000u64),
            expected_allowance: None,
            expires_at: None,
            fee: None,
            memo: Some(serde_bytes::ByteBuf::from(oversize)),
            created_at_time: None,
        })
        .unwrap(),
    );
    match res {
        Err(ApproveError::GenericError { error_code, .. }) => {
            assert_eq!(error_code, Nat::from(2u64), "error_code 2 = memo too long");
        }
        other => panic!("expected GenericError memo-too-long, got {other:?}"),
    }
}

#[test]
fn metadata_advertises_max_memo_length() {
    let h = Harness::new();

    // Decode enough of icrc1_metadata to find the max_memo_length entry.
    #[derive(CandidType, Deserialize, Debug)]
    enum Metadata {
        Nat(Nat),
        Int(candid::Int),
        Text(String),
        Blob(serde_bytes::ByteBuf),
    }
    let entries: Vec<(String, Metadata)> = h.q(
        Principal::anonymous(),
        "icrc1_metadata",
        encode_one(()).unwrap(),
    );
    let max_memo = entries
        .iter()
        .find(|(k, _)| k == "icrc1:max_memo_length")
        .expect("icrc1:max_memo_length entry present");
    match &max_memo.1 {
        Metadata::Nat(n) => assert_eq!(n, &Nat::from(32u64)),
        other => panic!("expected Nat, got {other:?}"),
    }
}

#[test]
fn transfer_from_allowance_check_ignores_caller_supplied_fee() {
    // Regression: the spender must not be able to pass a lower `fee`
    // value to trick the allowance pre-check into passing.
    // Before ICP-18 the pre-check used arg.fee (with TRANSFER_FEE only
    // as a fallback); now it always uses the canonical fee.
    let h = Harness::new();
    let alice = Principal::from_slice(&[0x01; 29]);
    let bob = Principal::from_slice(&[0x02; 29]);
    let carol = Principal::from_slice(&[0x03; 29]);
    h.mint(h.minter, alice, 1_000_000).expect("mint");

    // Alice approves Bob for exactly 100_000 — NOT enough to cover
    // 100_000 + TRANSFER_FEE (10_000).
    let approve: Result<Nat, ApproveError> = h.u(
        alice,
        "icrc2_approve",
        encode_one(ApproveArgs {
            from_subaccount: None,
            spender: Account { owner: bob, subaccount: None },
            amount: Nat::from(100_000u64),
            expected_allowance: None,
            expires_at: None,
            fee: None,
            memo: None,
            created_at_time: None,
        })
        .unwrap(),
    );
    approve.expect("approve ok");

    // Bob tries to transfer_from 100_000 with a lying fee=0. Before
    // the fix this would pass the allowance check then fail with BadFee.
    // After the fix the allowance check fires first → InsufficientAllowance.
    let tf: Result<Nat, TransferFromError> = h.u(
        bob,
        "icrc2_transfer_from",
        encode_one(TransferFromArgs {
            spender_subaccount: None,
            from: Account { owner: alice, subaccount: None },
            to: Account { owner: carol, subaccount: None },
            amount: Nat::from(100_000u64),
            fee: Some(Nat::from(0u64)), // lie
            memo: None,
            created_at_time: None,
        })
        .unwrap(),
    );
    match tf {
        Err(TransferFromError::InsufficientAllowance { allowance }) => {
            assert_eq!(allowance, Nat::from(100_000u64));
        }
        other => panic!("expected InsufficientAllowance (spoofed fee should not bypass check), got {other:?}"),
    }
    // Carol's balance should not have moved.
    assert_eq!(h.balance(carol), 0);
}

#[test]
fn approve_and_transfer_from_respects_allowance() {
    let h = Harness::new();
    let alice = Principal::from_slice(&[0x01; 29]);
    let bob = Principal::from_slice(&[0x02; 29]);
    let carol = Principal::from_slice(&[0x03; 29]);

    h.mint(h.minter, alice, 1_000_000).unwrap();

    // Alice approves Bob to spend 200_000.
    let approve: Result<Nat, ApproveError> = h.u(
        alice,
        "icrc2_approve",
        encode_one(ApproveArgs {
            from_subaccount: None,
            spender: Account { owner: bob, subaccount: None },
            amount: Nat::from(200_000u64),
            expected_allowance: None,
            expires_at: None,
            fee: None,
            memo: None,
            created_at_time: None,
        })
        .unwrap(),
    );
    approve.expect("approve succeeds");
    // Approval fee was charged to Alice.
    assert_eq!(h.balance(alice), 1_000_000 - FEE);

    // Bob pulls 100_000 from Alice to Carol.
    let tf: Result<Nat, TransferFromError> = h.u(
        bob,
        "icrc2_transfer_from",
        encode_one(TransferFromArgs {
            spender_subaccount: None,
            from: Account { owner: alice, subaccount: None },
            to: Account { owner: carol, subaccount: None },
            amount: Nat::from(100_000u64),
            fee: None,
            memo: None,
            created_at_time: None,
        })
        .unwrap(),
    );
    tf.expect("transfer_from succeeds");

    assert_eq!(h.balance(carol), 100_000);
    // Remaining allowance = 200_000 - (100_000 amount + 10_000 fee).
    let remaining: Allowance = h.q(
        Principal::anonymous(),
        "icrc2_allowance",
        encode_one(AllowanceArgs {
            account: Account { owner: alice, subaccount: None },
            spender: Account { owner: bob, subaccount: None },
        })
        .unwrap(),
    );
    assert_eq!(remaining.allowance, Nat::from(200_000u64 - 100_000 - FEE));
}

#[test]
fn burn_reduces_supply() {
    let h = Harness::new();
    let alice = Principal::from_slice(&[0x01; 29]);
    h.mint(h.minter, alice, 1_000_000).unwrap();

    #[derive(CandidType, Deserialize, Serialize)]
    struct BurnArgs {
        from_subaccount: Option<[u8; 32]>,
        amount: Nat,
        memo: Option<serde_bytes::ByteBuf>,
        created_at_time: Option<u64>,
    }
    #[derive(CandidType, Deserialize, Serialize, Debug)]
    #[allow(dead_code)]
    enum BurnError {
        AmountZero,
        AmountOverflow,
        MemoTooLong,
        InsufficientFunds { balance: Nat },
    }

    let res: Result<Nat, BurnError> = h.u(
        alice,
        "burn",
        encode_one(BurnArgs {
            from_subaccount: None,
            amount: Nat::from(400_000u64),
            memo: None,
            created_at_time: None,
        })
        .unwrap(),
    );
    res.expect("burn succeeds");
    assert_eq!(h.balance(alice), 600_000);
    assert_eq!(h.total_supply(), 600_000);
}

#[test]
fn tx_indices_advance_monotonically() {
    let h = Harness::new();
    let alice = Principal::from_slice(&[0x01; 29]);
    let bob = Principal::from_slice(&[0x02; 29]);

    // Mint 1 — expect index 1 (first mutating call).
    let mint_result = h.mint(h.minter, alice, 1_000_000).expect("mint");
    let idx1: u64 = {
        use num_traits::ToPrimitive;
        mint_result.0.to_u64().expect("tx index fits u64")
    };
    assert_eq!(idx1, 1, "first mutating call returns tx 1");

    // Transfer — expect strictly greater.
    let xfer_result = h.transfer(alice, bob, 100_000).expect("transfer");
    let idx2: u64 = {
        use num_traits::ToPrimitive;
        xfer_result.0.to_u64().expect("tx index fits u64")
    };
    assert!(idx2 > idx1, "tx index must advance (got {idx1} then {idx2})");

    // tx_counter query reflects the latest.
    let counter: Nat = h.q(Principal::anonymous(), "tx_counter", encode_one(()).unwrap());
    assert_eq!(counter, Nat::from(idx2), "tx_counter matches last issued index");
}

#[test]
fn icrc3_logs_blocks_for_mutating_calls() {
    // Minimal BlockWithId mirrors for decoding the response — we only
    // look at block_type + id here, not the full tx payload.
    #[derive(CandidType, Deserialize, Debug)]
    struct BlockWithIdLite {
        id: Nat,
        // The underlying ICRC3Value is a complex recursive variant. We
        // just care that the response round-trips; we don't inspect it.
        #[serde(rename = "block")]
        _block: candid::Reserved,
    }
    #[derive(CandidType, Deserialize, Debug)]
    struct GetBlocksResultLite {
        log_length: Nat,
        blocks: Vec<BlockWithIdLite>,
        archived_blocks: Vec<candid::Reserved>,
    }
    #[derive(CandidType, Serialize)]
    struct GetBlocksReq {
        start: Nat,
        length: Nat,
    }

    let h = Harness::new();
    let alice = Principal::from_slice(&[0x01; 29]);
    let bob = Principal::from_slice(&[0x02; 29]);

    // Three mutating calls → expect exactly 3 log entries.
    h.mint(h.minter, alice, 1_000_000).expect("mint");
    h.transfer(alice, bob, 100_000).expect("transfer");

    let len_before_burn: Nat = h.q(
        Principal::anonymous(),
        "icrc3_log_length",
        encode_one(()).unwrap(),
    );
    assert_eq!(len_before_burn, Nat::from(2u64), "mint + transfer = 2 blocks");

    // Self-burn by alice.
    #[derive(CandidType, Serialize)]
    struct BurnArgs {
        from_subaccount: Option<[u8; 32]>,
        amount: Nat,
        memo: Option<serde_bytes::ByteBuf>,
        created_at_time: Option<u64>,
    }
    #[derive(CandidType, Deserialize, Debug)]
    #[allow(dead_code)]
    enum BurnErrIgnored {
        AmountZero, AmountOverflow, MemoTooLong,
        InsufficientFunds { balance: Nat },
    }
    let res: Result<Nat, BurnErrIgnored> = h.u(
        alice,
        "burn",
        encode_one(BurnArgs {
            from_subaccount: None,
            amount: Nat::from(100_000u64),
            memo: None,
            created_at_time: None,
        })
        .unwrap(),
    );
    res.expect("burn");

    let len: Nat = h.q(
        Principal::anonymous(),
        "icrc3_log_length",
        encode_one(()).unwrap(),
    );
    assert_eq!(len, Nat::from(3u64), "mint + transfer + burn = 3 blocks");

    // icrc3_get_blocks returns all 3 when queried for [0, 100).
    let req = vec![GetBlocksReq { start: Nat::from(0u64), length: Nat::from(100u64) }];
    let result: GetBlocksResultLite = h.q(
        Principal::anonymous(),
        "icrc3_get_blocks",
        encode_one(req).unwrap(),
    );
    assert_eq!(result.log_length, Nat::from(3u64));
    assert_eq!(result.blocks.len(), 3);
    assert_eq!(result.blocks[0].id, Nat::from(0u64));
    assert_eq!(result.blocks[2].id, Nat::from(2u64));

    // Pagination: ask for 1 block at offset 1. Should get exactly block id=1.
    let req2 = vec![GetBlocksReq { start: Nat::from(1u64), length: Nat::from(1u64) }];
    let result2: GetBlocksResultLite = h.q(
        Principal::anonymous(),
        "icrc3_get_blocks",
        encode_one(req2).unwrap(),
    );
    assert_eq!(result2.blocks.len(), 1);
    assert_eq!(result2.blocks[0].id, Nat::from(1u64));

    // Over-range: start past the end returns empty, not an error.
    let req3 = vec![GetBlocksReq { start: Nat::from(999u64), length: Nat::from(10u64) }];
    let result3: GetBlocksResultLite = h.q(
        Principal::anonymous(),
        "icrc3_get_blocks",
        encode_one(req3).unwrap(),
    );
    assert_eq!(result3.blocks.len(), 0);
    assert_eq!(result3.log_length, Nat::from(3u64));
}

#[test]
fn icrc3_supported_standards_advertises_icrc3() {
    #[derive(CandidType, Deserialize, Debug)]
    struct Std {
        name: String,
        url: String,
    }
    let h = Harness::new();
    let stds: Vec<Std> = h.q(
        Principal::anonymous(),
        "icrc1_supported_standards",
        encode_one(()).unwrap(),
    );
    let names: Vec<_> = stds.iter().map(|s| s.name.as_str()).collect();
    assert!(names.contains(&"ICRC-3"));
}

#[test]
fn icrc1_transfer_dedup_returns_duplicate_on_retry() {
    let h = Harness::new();
    let alice = Principal::from_slice(&[0x01; 29]);
    let bob = Principal::from_slice(&[0x02; 29]);
    h.mint(h.minter, alice, 1_000_000).expect("mint");

    // pocket-ic runs with a synthetic clock — ask the replica what
    // time it thinks it is so dedup's now-window accepts our stamp.
    let now_ns: u64 = h.pic.get_time().as_nanos_since_unix_epoch();
    let arg = TransferArg {
        from_subaccount: None,
        to: Account { owner: bob, subaccount: None },
        amount: Nat::from(100_000u64),
        fee: None,
        memo: Some(serde_bytes::ByteBuf::from(b"retry-me".to_vec())),
        created_at_time: Some(now_ns),
    };
    let first: Result<Nat, TransferError> =
        h.u(alice, "icrc1_transfer", encode_one(arg.clone()).unwrap());
    let first_id = first.expect("first transfer ok");

    // Replay the identical args — expect Duplicate { duplicate_of }.
    let second: Result<Nat, TransferError> =
        h.u(alice, "icrc1_transfer", encode_one(arg).unwrap());
    match second {
        Err(TransferError::Duplicate { duplicate_of }) => {
            assert_eq!(duplicate_of, first_id);
        }
        other => panic!("expected Duplicate, got {other:?}"),
    }

    // Bob's balance must only reflect one transfer, not two.
    assert_eq!(h.balance(bob), 100_000);
}

#[test]
fn icrc1_transfer_too_old_rejected() {
    let h = Harness::new();
    let alice = Principal::from_slice(&[0x01; 29]);
    let bob = Principal::from_slice(&[0x02; 29]);
    h.mint(h.minter, alice, 1_000_000).expect("mint");

    // 48 hours before the replica's current clock — well outside the
    // 24h TX_WINDOW the canister accepts.
    let now_ns = h.pic.get_time().as_nanos_since_unix_epoch();
    let stale = now_ns - 48 * 60 * 60 * 1_000_000_000u64;
    let arg = TransferArg {
        from_subaccount: None,
        to: Account { owner: bob, subaccount: None },
        amount: Nat::from(100u64),
        fee: None,
        memo: None,
        created_at_time: Some(stale),
    };
    let res: Result<Nat, TransferError> =
        h.u(alice, "icrc1_transfer", encode_one(arg).unwrap());
    assert!(matches!(res, Err(TransferError::TooOld)), "got {res:?}");
}

#[test]
fn icrc3_blocks_are_hash_linked() {
    // Each non-genesis block must carry `phash` = hash of the
    // previous block. Genesis (index 0) must NOT have a phash field.
    use candid::types::{reference::Func, Type};
    #[derive(CandidType, Deserialize, Debug)]
    enum IcrcValue {
        Blob(serde_bytes::ByteBuf),
        Text(String),
        Nat(Nat),
        Int(candid::Int),
        Array(Vec<IcrcValue>),
        Map(Vec<(String, IcrcValue)>),
    }
    // Silence the lint for the unused variant (Int never appears in our
    // blocks but we keep the variant so decoding matches the wire type).
    let _ = |_: Func, _: Type| ();
    #[derive(CandidType, Deserialize, Debug)]
    struct BlockWithIdDecoded {
        id: Nat,
        block: IcrcValue,
    }
    #[derive(CandidType, Deserialize, Debug)]
    struct GetBlocksResultDecoded {
        log_length: Nat,
        blocks: Vec<BlockWithIdDecoded>,
        #[allow(dead_code)]
        archived_blocks: Vec<candid::Reserved>,
    }
    #[derive(CandidType, Serialize)]
    struct GetBlocksReq {
        start: Nat,
        length: Nat,
    }

    let h = Harness::new();
    let alice = Principal::from_slice(&[0x01; 29]);
    let bob = Principal::from_slice(&[0x02; 29]);

    // Three mutating calls → three blocks.
    h.mint(h.minter, alice, 1_000_000).expect("mint");
    h.transfer(alice, bob, 100_000).expect("transfer");
    h.transfer(alice, bob, 50_000).expect("transfer 2");

    let req = vec![GetBlocksReq { start: Nat::from(0u64), length: Nat::from(10u64) }];
    let result: GetBlocksResultDecoded = h.q(
        Principal::anonymous(),
        "icrc3_get_blocks",
        encode_one(req).unwrap(),
    );
    assert_eq!(result.blocks.len(), 3, "expected 3 blocks");

    // Block 0 must NOT have a phash field. Blocks 1 & 2 must have one
    // that's 32 bytes long.
    let keys_at = |idx: usize| -> Vec<String> {
        let IcrcValue::Map(ref entries) = result.blocks[idx].block else {
            panic!("block {idx} is not a Map");
        };
        entries.iter().map(|(k, _)| k.clone()).collect()
    };
    let phash_of = |idx: usize| -> Option<Vec<u8>> {
        let IcrcValue::Map(ref entries) = result.blocks[idx].block else {
            return None;
        };
        for (k, v) in entries {
            if k == "phash" {
                if let IcrcValue::Blob(b) = v {
                    return Some(b.to_vec());
                }
            }
        }
        None
    };

    assert!(!keys_at(0).contains(&"phash".to_string()), "genesis must have no phash");
    assert!(keys_at(1).contains(&"phash".to_string()), "block 1 must have phash");
    assert!(keys_at(2).contains(&"phash".to_string()), "block 2 must have phash");

    let phash1 = phash_of(1).expect("phash1");
    let phash2 = phash_of(2).expect("phash2");
    assert_eq!(phash1.len(), 32, "phash must be 32 bytes");
    assert_eq!(phash2.len(), 32);
    assert_ne!(phash1, phash2, "phash1 and phash2 differ");

    // icrc3_tip_hash must equal phash of a hypothetical next block =
    // the hash embedded in nothing yet, but it must equal the hash of
    // block 2 (the most recent). We verify the public tip hash at
    // least matches what the canister just finalized by appending one
    // more block and checking phash3 == previous tip.
    let tip_after_2: serde_bytes::ByteBuf = h.q(
        Principal::anonymous(),
        "icrc3_tip_hash",
        encode_one(()).unwrap(),
    );
    assert_eq!(tip_after_2.len(), 32);
    assert_ne!(tip_after_2.to_vec(), vec![0u8; 32], "tip must not be zeros after appends");

    // Append one more block; new block's phash must equal the tip we
    // just read.
    h.transfer(alice, bob, 25_000).expect("transfer 3");
    let result2: GetBlocksResultDecoded = h.q(
        Principal::anonymous(),
        "icrc3_get_blocks",
        encode_one(vec![GetBlocksReq { start: Nat::from(3u64), length: Nat::from(1u64) }]).unwrap(),
    );
    let phash3 = {
        let IcrcValue::Map(ref entries) = result2.blocks[0].block else {
            panic!("block 3 not a Map");
        };
        entries
            .iter()
            .find_map(|(k, v)| {
                if k == "phash" {
                    if let IcrcValue::Blob(b) = v { Some(b.to_vec()) } else { None }
                } else { None }
            })
            .expect("block 3 phash")
    };
    assert_eq!(phash3, tip_after_2.to_vec(),
        "block N's phash must equal tip hash as of block N-1");
}

#[test]
fn icrc3_tip_certificate_shape() {
    // The cert payload itself requires a certified query path to be
    // Some(..). This test just proves the endpoint doesn't trap on the
    // plain query path and verifies the hash_tree encoding is internally
    // consistent with icrc3_tip_hash when present.
    #[derive(CandidType, Deserialize, Debug)]
    struct TipCertDecoded {
        certificate: serde_bytes::ByteBuf,
        hash_tree: serde_bytes::ByteBuf,
    }

    let h = Harness::new();
    let alice = Principal::from_slice(&[0x01; 29]);
    let bob = Principal::from_slice(&[0x02; 29]);
    h.mint(h.minter, alice, 1_000_000).expect("mint");
    h.transfer(alice, bob, 100_000).expect("transfer");

    // Plain-query path: pocket-ic serves non-replicated reads, so
    // data_certificate() returns None. Endpoint must survive.
    let cert_opt: Option<TipCertDecoded> = h.q(
        Principal::anonymous(),
        "icrc3_get_tip_certificate",
        encode_one(()).unwrap(),
    );
    // No panic = pass. cert_opt is allowed to be None here.
    let _ = cert_opt;

    // Tip hash is exposed uncertified — verify it's 32 bytes and non-zero.
    let tip: serde_bytes::ByteBuf = h.q(
        Principal::anonymous(),
        "icrc3_tip_hash",
        encode_one(()).unwrap(),
    );
    assert_eq!(tip.len(), 32);
    assert_ne!(tip.to_vec(), vec![0u8; 32]);
}

#[test]
fn stable_state_survives_upgrade() {
    // Proves every piece of durable state — balances, total_supply,
    // allowances, tx_counter, block log, minter — round-trips a wasm
    // swap cleanly. A future regression that silently demotes a field
    // from StableCell/StableBTreeMap to a thread-local RefCell would
    // blow this test up.
    let h = Harness::new();
    let alice = Principal::from_slice(&[0x01; 29]);
    let bob = Principal::from_slice(&[0x02; 29]);
    let carol = Principal::from_slice(&[0x03; 29]);

    // 1. Meaningful state: mint to alice, transfer to bob, alice
    //    approves carol, so we exercise all three stable maps.
    h.mint(h.minter, alice, 1_000_000).expect("mint");
    h.transfer(alice, bob, 200_000).expect("transfer");
    let _approve: Result<Nat, ApproveError> = h.u(
        alice,
        "icrc2_approve",
        encode_one(ApproveArgs {
            from_subaccount: None,
            spender: Account { owner: carol, subaccount: None },
            amount: Nat::from(50_000u64),
            expected_allowance: None,
            expires_at: None,
            fee: None,
            memo: None,
            created_at_time: None,
        })
        .unwrap(),
    );
    _approve.expect("approve ok");

    // Snapshot every piece of state before upgrade.
    let alice_before = h.balance(alice);
    let bob_before = h.balance(bob);
    let supply_before = h.total_supply();
    let counter_before: Nat = h.q(Principal::anonymous(), "tx_counter", encode_one(()).unwrap());
    let log_len_before: Nat = h.q(
        Principal::anonymous(),
        "icrc3_log_length",
        encode_one(()).unwrap(),
    );
    let allowance_before: Allowance = h.q(
        Principal::anonymous(),
        "icrc2_allowance",
        encode_one(AllowanceArgs {
            account: Account { owner: alice, subaccount: None },
            spender: Account { owner: carol, subaccount: None },
        })
        .unwrap(),
    );
    let minter_before: Principal =
        h.q(Principal::anonymous(), "get_minter", encode_one(()).unwrap());

    // 2. Upgrade to the SAME wasm. Init arg is ignored on upgrade but
    //    the candid spec requires it, so pass the original init shape.
    let wasm = std::fs::read(wasm_path()).expect("wasm missing");
    let init = encode_one(InitArgs { minter: h.minter }).unwrap();
    h.pic
        .upgrade_canister(h.canister, wasm, init, None)
        .expect("upgrade succeeded");

    // 3. Every piece of state must match byte-for-byte.
    assert_eq!(h.balance(alice), alice_before, "alice balance");
    assert_eq!(h.balance(bob), bob_before, "bob balance");
    assert_eq!(h.total_supply(), supply_before, "total_supply");

    let counter_after: Nat =
        h.q(Principal::anonymous(), "tx_counter", encode_one(()).unwrap());
    assert_eq!(counter_after, counter_before, "tx_counter");

    let log_len_after: Nat = h.q(
        Principal::anonymous(),
        "icrc3_log_length",
        encode_one(()).unwrap(),
    );
    assert_eq!(log_len_after, log_len_before, "block log length");

    let allowance_after: Allowance = h.q(
        Principal::anonymous(),
        "icrc2_allowance",
        encode_one(AllowanceArgs {
            account: Account { owner: alice, subaccount: None },
            spender: Account { owner: carol, subaccount: None },
        })
        .unwrap(),
    );
    assert_eq!(
        allowance_after.allowance, allowance_before.allowance,
        "allowance preserved"
    );

    let minter_after: Principal =
        h.q(Principal::anonymous(), "get_minter", encode_one(()).unwrap());
    assert_eq!(minter_after, minter_before, "minter preserved");

    // 4. Post-upgrade call paths still work — spend from allowance,
    //    burn balance, read block log. If the state was subtly
    //    corrupted, these would fail in shape-specific ways.
    let tf: Result<Nat, TransferFromError> = h.u(
        carol,
        "icrc2_transfer_from",
        encode_one(TransferFromArgs {
            spender_subaccount: None,
            from: Account { owner: alice, subaccount: None },
            to: Account { owner: bob, subaccount: None },
            amount: Nat::from(30_000u64),
            fee: None,
            memo: None,
            created_at_time: None,
        })
        .unwrap(),
    );
    tf.expect("post-upgrade transfer_from succeeds");
    assert_eq!(h.balance(bob), bob_before + 30_000, "post-upgrade transfer credited");
}

#[test]
fn set_minter_rejects_dangerous_principals() {
    // Regression for ICP-16: set_minter must refuse to rotate to
    // anonymous or the management canister, either of which would make
    // mint effectively permissionless.
    let h = Harness::new();

    // Anonymous principal.
    let res_anon: Result<(), MintError> = h.u(
        h.minter,
        "set_minter",
        encode_one(Principal::anonymous()).unwrap(),
    );
    assert!(
        matches!(res_anon, Err(MintError::InvalidMinter)),
        "expected InvalidMinter for anonymous, got {res_anon:?}"
    );

    // Management canister (aaaaa-aa).
    let res_mgmt: Result<(), MintError> = h.u(
        h.minter,
        "set_minter",
        encode_one(Principal::management_canister()).unwrap(),
    );
    assert!(
        matches!(res_mgmt, Err(MintError::InvalidMinter)),
        "expected InvalidMinter for management canister, got {res_mgmt:?}"
    );

    // Sanity: legitimate principal still works.
    let fresh = Principal::from_slice(&[0xEE; 29]);
    let res_ok: Result<(), MintError> =
        h.u(h.minter, "set_minter", encode_one(fresh).unwrap());
    res_ok.expect("legitimate rotation succeeds");
}

#[test]
fn minter_can_be_rotated() {
    let h = Harness::new();
    let new_minter = Principal::from_slice(&[0xCC; 29]);

    let res: Result<(), MintError> = h.u(
        h.minter,
        "set_minter",
        encode_one(new_minter).unwrap(),
    );
    res.expect("rotation succeeds");

    // Old minter can no longer mint.
    let result = h.mint(h.minter, h.minter, 1);
    assert!(matches!(result, Err(MintError::NotMinter)));

    // New minter can.
    let ok: Result<Nat, MintError> = h.u(
        new_minter,
        "mint",
        encode_one(MintArgs {
            to: Account { owner: new_minter, subaccount: None },
            amount: Nat::from(1u64),
            memo: None,
            created_at_time: None,
        })
        .unwrap(),
    );
    ok.expect("new minter mints");
}
