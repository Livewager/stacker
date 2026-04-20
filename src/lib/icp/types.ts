/**
 * TypeScript types mirroring the Livewager Points Ledger candid surface.
 * Keep in sync with canisters/points_ledger/src/lib.rs + idl.ts.
 */

import type { Principal } from "@dfinity/principal";

export interface Account {
  owner: Principal;
  subaccount: [] | [Uint8Array | number[]];
}

export type Memo = Uint8Array | number[];

export interface TransferArg {
  from_subaccount: [] | [Uint8Array | number[]];
  to: Account;
  amount: bigint;
  fee: [] | [bigint];
  memo: [] | [Memo];
  created_at_time: [] | [bigint];
}

export type TransferError =
  | { BadFee: { expected_fee: bigint } }
  | { BadBurn: { min_burn_amount: bigint } }
  | { InsufficientFunds: { balance: bigint } }
  | { TooOld: null }
  | { CreatedInFuture: { ledger_time: bigint } }
  | { Duplicate: { duplicate_of: bigint } }
  | { TemporarilyUnavailable: null }
  | { GenericError: { error_code: bigint; message: string } };

export interface ApproveArgs {
  from_subaccount: [] | [Uint8Array | number[]];
  spender: Account;
  amount: bigint;
  expected_allowance: [] | [bigint];
  expires_at: [] | [bigint];
  fee: [] | [bigint];
  memo: [] | [Memo];
  created_at_time: [] | [bigint];
}

export type ApproveError =
  | { BadFee: { expected_fee: bigint } }
  | { InsufficientFunds: { balance: bigint } }
  | { AllowanceChanged: { current_allowance: bigint } }
  | { Expired: { ledger_time: bigint } }
  | { TooOld: null }
  | { CreatedInFuture: { ledger_time: bigint } }
  | { Duplicate: { duplicate_of: bigint } }
  | { TemporarilyUnavailable: null }
  | { GenericError: { error_code: bigint; message: string } };

export interface TransferFromArgs {
  spender_subaccount: [] | [Uint8Array | number[]];
  from: Account;
  to: Account;
  amount: bigint;
  fee: [] | [bigint];
  memo: [] | [Memo];
  created_at_time: [] | [bigint];
}

export type TransferFromError =
  | { BadFee: { expected_fee: bigint } }
  | { BadBurn: { min_burn_amount: bigint } }
  | { InsufficientFunds: { balance: bigint } }
  | { InsufficientAllowance: { allowance: bigint } }
  | { TooOld: null }
  | { CreatedInFuture: { ledger_time: bigint } }
  | { Duplicate: { duplicate_of: bigint } }
  | { TemporarilyUnavailable: null }
  | { GenericError: { error_code: bigint; message: string } };

export interface AllowanceArgs {
  account: Account;
  spender: Account;
}

export interface Allowance {
  allowance: bigint;
  expires_at: [] | [bigint];
}

export interface MintArgs {
  to: Account;
  amount: bigint;
  memo: [] | [Memo];
  created_at_time: [] | [bigint];
}

export type MintError =
  | { NotMinter: null }
  | { AmountZero: null }
  | { AmountOverflow: null }
  | { MemoTooLong: null };

export interface BurnArgs {
  from_subaccount: [] | [Uint8Array | number[]];
  amount: bigint;
  memo: [] | [Memo];
  created_at_time: [] | [bigint];
}

export type BurnError =
  | { AmountZero: null }
  | { AmountOverflow: null }
  | { MemoTooLong: null }
  | { InsufficientFunds: { balance: bigint } };

export type MetadataValue =
  | { Nat: bigint }
  | { Int: bigint }
  | { Text: string }
  | { Blob: Uint8Array | number[] };

export interface SupportedStandard {
  name: string;
  url: string;
}

/** The full service surface. Matches idlFactory in idl.ts. */
export interface PointsLedgerService {
  // Metadata
  icrc1_name: () => Promise<string>;
  icrc1_symbol: () => Promise<string>;
  icrc1_decimals: () => Promise<number>;
  icrc1_fee: () => Promise<bigint>;
  icrc1_total_supply: () => Promise<bigint>;
  icrc1_minting_account: () => Promise<[] | [Account]>;
  icrc1_metadata: () => Promise<Array<[string, MetadataValue]>>;
  icrc1_supported_standards: () => Promise<SupportedStandard[]>;
  icrc1_balance_of: (a: Account) => Promise<bigint>;

  // ICRC-1 update
  icrc1_transfer: (arg: TransferArg) => Promise<{ Ok: bigint } | { Err: TransferError }>;

  // ICRC-2
  icrc2_allowance: (arg: AllowanceArgs) => Promise<Allowance>;
  icrc2_approve: (arg: ApproveArgs) => Promise<{ Ok: bigint } | { Err: ApproveError }>;
  icrc2_transfer_from: (
    arg: TransferFromArgs,
  ) => Promise<{ Ok: bigint } | { Err: TransferFromError }>;

  // Mint / burn / admin
  mint: (arg: MintArgs) => Promise<{ Ok: bigint } | { Err: MintError }>;
  burn: (arg: BurnArgs) => Promise<{ Ok: bigint } | { Err: BurnError }>;
  get_minter: () => Promise<Principal>;
  set_minter: (p: Principal) => Promise<{ Ok: null } | { Err: MintError }>;

  canister_principal: () => Promise<Principal>;
  version: () => Promise<string>;
  tx_counter: () => Promise<bigint>;

  // ICRC-3 block log
  icrc3_get_blocks: (reqs: GetBlocksRequest[]) => Promise<GetBlocksResult>;
  icrc3_supported_block_types: () => Promise<SupportedBlockType[]>;
  icrc3_log_length: () => Promise<bigint>;
  icrc3_tip_hash: () => Promise<Uint8Array | number[]>;
  icrc3_get_tip_certificate: () => Promise<[] | [DataCertificate]>;
}

// ICRC-3 block value is recursive.
export type ICRC3Value =
  | { Blob: Uint8Array | number[] }
  | { Text: string }
  | { Nat: bigint }
  | { Int: bigint }
  | { Array: ICRC3Value[] }
  | { Map: Array<[string, ICRC3Value]> };

export interface GetBlocksRequest {
  start: bigint;
  length: bigint;
}
export interface BlockWithId {
  id: bigint;
  block: ICRC3Value;
}
export interface ArchivedBlocks {
  args: GetBlocksRequest[];
  // Candid Func ref — agent-js decodes to a [Principal, string] tuple.
  // We don't invoke it from client code yet.
  callback: [Principal, string];
}
export interface GetBlocksResult {
  log_length: bigint;
  blocks: BlockWithId[];
  archived_blocks: ArchivedBlocks[];
}
export interface SupportedBlockType {
  block_type: string;
  url: string;
}
export interface DataCertificate {
  certificate: Uint8Array | number[];
  hash_tree: Uint8Array | number[];
}
