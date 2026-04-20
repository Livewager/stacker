/**
 * Candid interface for the Livewager Points Ledger, hand-written to match
 * canisters/points_ledger/points_ledger.did exactly.
 *
 * Kept in sync manually (no didc codegen in the build graph yet). If you
 * change .did, update this file and re-run the pocket-ic integration tests
 * to confirm round-trip encoding still works.
 */

import { IDL } from "@dfinity/candid";
import type { InterfaceFactory } from "@dfinity/candid/lib/cjs/idl";

const Subaccount = IDL.Vec(IDL.Nat8);

const Account = IDL.Record({
  owner: IDL.Principal,
  subaccount: IDL.Opt(Subaccount),
});

const Memo = IDL.Vec(IDL.Nat8);
const Timestamp = IDL.Nat64;

const MetadataValue = IDL.Variant({
  Nat: IDL.Nat,
  Int: IDL.Int,
  Text: IDL.Text,
  Blob: IDL.Vec(IDL.Nat8),
});

const SupportedStandard = IDL.Record({
  name: IDL.Text,
  url: IDL.Text,
});

// ICRC-1 transfer
const TransferArg = IDL.Record({
  from_subaccount: IDL.Opt(Subaccount),
  to: Account,
  amount: IDL.Nat,
  fee: IDL.Opt(IDL.Nat),
  memo: IDL.Opt(Memo),
  created_at_time: IDL.Opt(Timestamp),
});

const TransferError = IDL.Variant({
  BadFee: IDL.Record({ expected_fee: IDL.Nat }),
  BadBurn: IDL.Record({ min_burn_amount: IDL.Nat }),
  InsufficientFunds: IDL.Record({ balance: IDL.Nat }),
  TooOld: IDL.Null,
  CreatedInFuture: IDL.Record({ ledger_time: IDL.Nat64 }),
  Duplicate: IDL.Record({ duplicate_of: IDL.Nat }),
  TemporarilyUnavailable: IDL.Null,
  GenericError: IDL.Record({ error_code: IDL.Nat, message: IDL.Text }),
});

// ICRC-2
const ApproveArgs = IDL.Record({
  from_subaccount: IDL.Opt(Subaccount),
  spender: Account,
  amount: IDL.Nat,
  expected_allowance: IDL.Opt(IDL.Nat),
  expires_at: IDL.Opt(Timestamp),
  fee: IDL.Opt(IDL.Nat),
  memo: IDL.Opt(Memo),
  created_at_time: IDL.Opt(Timestamp),
});

const ApproveError = IDL.Variant({
  BadFee: IDL.Record({ expected_fee: IDL.Nat }),
  InsufficientFunds: IDL.Record({ balance: IDL.Nat }),
  AllowanceChanged: IDL.Record({ current_allowance: IDL.Nat }),
  Expired: IDL.Record({ ledger_time: IDL.Nat64 }),
  TooOld: IDL.Null,
  CreatedInFuture: IDL.Record({ ledger_time: IDL.Nat64 }),
  Duplicate: IDL.Record({ duplicate_of: IDL.Nat }),
  TemporarilyUnavailable: IDL.Null,
  GenericError: IDL.Record({ error_code: IDL.Nat, message: IDL.Text }),
});

const TransferFromArgs = IDL.Record({
  spender_subaccount: IDL.Opt(Subaccount),
  from: Account,
  to: Account,
  amount: IDL.Nat,
  fee: IDL.Opt(IDL.Nat),
  memo: IDL.Opt(Memo),
  created_at_time: IDL.Opt(Timestamp),
});

const TransferFromError = IDL.Variant({
  BadFee: IDL.Record({ expected_fee: IDL.Nat }),
  BadBurn: IDL.Record({ min_burn_amount: IDL.Nat }),
  InsufficientFunds: IDL.Record({ balance: IDL.Nat }),
  InsufficientAllowance: IDL.Record({ allowance: IDL.Nat }),
  TooOld: IDL.Null,
  CreatedInFuture: IDL.Record({ ledger_time: IDL.Nat64 }),
  Duplicate: IDL.Record({ duplicate_of: IDL.Nat }),
  TemporarilyUnavailable: IDL.Null,
  GenericError: IDL.Record({ error_code: IDL.Nat, message: IDL.Text }),
});

const AllowanceArgs = IDL.Record({
  account: Account,
  spender: Account,
});

const Allowance = IDL.Record({
  allowance: IDL.Nat,
  expires_at: IDL.Opt(Timestamp),
});

// Mint / burn (ICP-04)
const MintArgs = IDL.Record({
  to: Account,
  amount: IDL.Nat,
  memo: IDL.Opt(Memo),
  created_at_time: IDL.Opt(Timestamp),
});

const MintError = IDL.Variant({
  NotMinter: IDL.Null,
  AmountZero: IDL.Null,
  AmountOverflow: IDL.Null,
  MemoTooLong: IDL.Null,
});

const BurnArgs = IDL.Record({
  from_subaccount: IDL.Opt(Subaccount),
  amount: IDL.Nat,
  memo: IDL.Opt(Memo),
  created_at_time: IDL.Opt(Timestamp),
});

const BurnError = IDL.Variant({
  AmountZero: IDL.Null,
  AmountOverflow: IDL.Null,
  MemoTooLong: IDL.Null,
  InsufficientFunds: IDL.Record({ balance: IDL.Nat }),
});

// ICRC-3 block value. Recursive: a block can contain arrays / maps of
// more values. IDL.Rec lets us forward-declare the self-reference.
const ICRC3Value = IDL.Rec();
ICRC3Value.fill(
  IDL.Variant({
    Blob: IDL.Vec(IDL.Nat8),
    Text: IDL.Text,
    Nat: IDL.Nat,
    Int: IDL.Int,
    Array: IDL.Vec(ICRC3Value),
    Map: IDL.Vec(IDL.Tuple(IDL.Text, ICRC3Value)),
  }),
);

const GetBlocksRequest = IDL.Record({
  start: IDL.Nat,
  length: IDL.Nat,
});

const BlockWithId = IDL.Record({
  id: IDL.Nat,
  block: ICRC3Value,
});

// Archived blocks — empty in our current canister but the candid shape
// must still match. We mirror the canonical ICRC-3 reference.
const ArchivedBlocks = IDL.Record({
  args: IDL.Vec(GetBlocksRequest),
  callback: IDL.Func(
    [IDL.Vec(GetBlocksRequest)],
    [IDL.Record({ blocks: IDL.Vec(BlockWithId) })],
    ["query"],
  ),
});

const GetBlocksResult = IDL.Record({
  log_length: IDL.Nat,
  blocks: IDL.Vec(BlockWithId),
  archived_blocks: IDL.Vec(ArchivedBlocks),
});

const SupportedBlockType = IDL.Record({
  block_type: IDL.Text,
  url: IDL.Text,
});

const DataCertificate = IDL.Record({
  certificate: IDL.Vec(IDL.Nat8),
  hash_tree: IDL.Vec(IDL.Nat8),
});

export const idlFactory: InterfaceFactory = () =>
  IDL.Service({
    // Metadata queries
    icrc1_name: IDL.Func([], [IDL.Text], ["query"]),
    icrc1_symbol: IDL.Func([], [IDL.Text], ["query"]),
    icrc1_decimals: IDL.Func([], [IDL.Nat8], ["query"]),
    icrc1_fee: IDL.Func([], [IDL.Nat], ["query"]),
    icrc1_total_supply: IDL.Func([], [IDL.Nat], ["query"]),
    icrc1_minting_account: IDL.Func([], [IDL.Opt(Account)], ["query"]),
    icrc1_metadata: IDL.Func(
      [],
      [IDL.Vec(IDL.Tuple(IDL.Text, MetadataValue))],
      ["query"],
    ),
    icrc1_supported_standards: IDL.Func([], [IDL.Vec(SupportedStandard)], ["query"]),
    icrc1_balance_of: IDL.Func([Account], [IDL.Nat], ["query"]),

    // ICRC-1 update
    icrc1_transfer: IDL.Func(
      [TransferArg],
      [IDL.Variant({ Ok: IDL.Nat, Err: TransferError })],
      [],
    ),

    // ICRC-2
    icrc2_allowance: IDL.Func([AllowanceArgs], [Allowance], ["query"]),
    icrc2_approve: IDL.Func(
      [ApproveArgs],
      [IDL.Variant({ Ok: IDL.Nat, Err: ApproveError })],
      [],
    ),
    icrc2_transfer_from: IDL.Func(
      [TransferFromArgs],
      [IDL.Variant({ Ok: IDL.Nat, Err: TransferFromError })],
      [],
    ),

    // Mint / burn
    mint: IDL.Func([MintArgs], [IDL.Variant({ Ok: IDL.Nat, Err: MintError })], []),
    burn: IDL.Func([BurnArgs], [IDL.Variant({ Ok: IDL.Nat, Err: BurnError })], []),
    get_minter: IDL.Func([], [IDL.Principal], ["query"]),
    set_minter: IDL.Func(
      [IDL.Principal],
      [IDL.Variant({ Ok: IDL.Null, Err: MintError })],
      [],
    ),

    // ICRC-3 block log
    icrc3_get_blocks: IDL.Func([IDL.Vec(GetBlocksRequest)], [GetBlocksResult], ["query"]),
    icrc3_supported_block_types: IDL.Func([], [IDL.Vec(SupportedBlockType)], ["query"]),
    icrc3_log_length: IDL.Func([], [IDL.Nat], ["query"]),
    icrc3_tip_hash: IDL.Func([], [IDL.Vec(IDL.Nat8)], ["query"]),
    icrc3_get_tip_certificate: IDL.Func([], [IDL.Opt(DataCertificate)], ["query"]),

    // Canister meta
    canister_principal: IDL.Func([], [IDL.Principal], ["query"]),
    version: IDL.Func([], [IDL.Text], ["query"]),
    tx_counter: IDL.Func([], [IDL.Nat], ["query"]),
  });

export type { InterfaceFactory } from "@dfinity/candid/lib/cjs/idl";
