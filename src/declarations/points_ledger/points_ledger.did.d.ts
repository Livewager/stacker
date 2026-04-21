import type { Principal } from '@dfinity/principal';
import type { ActorMethod } from '@dfinity/agent';
import type { IDL } from '@dfinity/candid';

export interface Account {
  'owner' : Principal,
  'subaccount' : [] | [Subaccount],
}
export type AccountError = {
    'PrincipalAlreadyMemberElsewhere' : { 'account_id' : bigint }
  } |
  { 'AccountNotFound' : null } |
  { 'NotMember' : null } |
  { 'WouldOrphanAccount' : null } |
  { 'DuplicateMember' : null } |
  { 'AnonymousPrincipal' : null } |
  { 'TooManyMembers' : { 'max' : number } } |
  { 'AlreadyMember' : { 'account_id' : bigint } } |
  { 'AnonymousCaller' : null };
/**
 * -------- Account (multi-key) types --------
 */
export interface AccountInfo {
  'account_id' : bigint,
  'members' : Array<Principal>,
  'aggregate_balance' : bigint,
}
export interface Allowance {
  'allowance' : bigint,
  'expires_at' : [] | [Timestamp],
}
/**
 * ICRC-2 allowance query
 */
export interface AllowanceArgs { 'account' : Account, 'spender' : Account }
/**
 * ICRC-2 approve
 */
export interface ApproveArgs {
  'fee' : [] | [bigint],
  'memo' : [] | [Memo],
  'from_subaccount' : [] | [Subaccount],
  'created_at_time' : [] | [Timestamp],
  'amount' : bigint,
  'expected_allowance' : [] | [bigint],
  'expires_at' : [] | [Timestamp],
  'spender' : Account,
}
export type ApproveError = {
    'GenericError' : { 'message' : string, 'error_code' : bigint }
  } |
  { 'TemporarilyUnavailable' : null } |
  { 'Duplicate' : { 'duplicate_of' : bigint } } |
  { 'BadFee' : { 'expected_fee' : bigint } } |
  { 'AllowanceChanged' : { 'current_allowance' : bigint } } |
  { 'CreatedInFuture' : { 'ledger_time' : bigint } } |
  { 'TooOld' : null } |
  { 'Expired' : { 'ledger_time' : bigint } } |
  { 'InsufficientFunds' : { 'balance' : bigint } };
/**
 * ICRC-3 archive pointer (empty in ICP-12a — no archive canister yet).
 */
export interface ArchivedBlocks {
  'args' : Array<{ 'start' : bigint, 'length' : bigint }>,
  'callback' : [Principal, string],
}
export interface BurnArgs {
  'memo' : [] | [Memo],
  'from_subaccount' : [] | [Subaccount],
  'created_at_time' : [] | [Timestamp],
  'amount' : bigint,
}
export type BurnError = { 'MemoTooLong' : null } |
  { 'AmountZero' : null } |
  { 'AmountOverflow' : null } |
  { 'InsufficientFunds' : { 'balance' : bigint } };
export interface FaucetClaimOk {
  'tx_id' : bigint,
  'new_balance' : bigint,
  'amount' : bigint,
}
export interface FaucetConfigView {
  'ring_size' : number,
  'global_claims_today' : bigint,
  'drip_amount' : bigint,
  'global_tokens_today' : bigint,
  'windows' : Array<FaucetWindowView>,
  'global_daily_cap' : bigint,
  'max_balance' : bigint,
}
export type FaucetError = {
    'BalanceTooHigh' : { 'balance' : bigint, 'threshold' : bigint }
  } |
  {
    'GlobalCapReached' : {
      'cap' : bigint,
      'seconds_until_reset' : bigint,
      'tokens_today' : bigint,
    }
  } |
  {
    'RateLimited' : {
      'max' : number,
      'seconds_until_next' : bigint,
      'window_label' : string,
    }
  } |
  { 'AnonymousCaller' : null };
export interface FaucetStatusView {
  'balance' : bigint,
  'total_claims' : bigint,
  'eligible' : boolean,
  'windows' : Array<FaucetWindowStatus>,
  'reason' : [] | [string],
}
export interface FaucetWindowStatus {
  'max' : number,
  'count' : number,
  'label' : string,
  'seconds_until_next' : bigint,
}
/**
 * -------- Faucet types --------
 */
export interface FaucetWindowView {
  'max_claims' : number,
  'label' : string,
  'window_seconds' : bigint,
}
/**
 * ICRC-3 generic value type. Mirrors icrc_ledger_types::ICRC3Value.
 */
export type ICRC3Value = { 'Int' : bigint } |
  { 'Map' : Array<[string, ICRC3Value]> } |
  { 'Nat' : bigint } |
  { 'Blob' : Uint8Array | number[] } |
  { 'Text' : string } |
  { 'Array' : Array<ICRC3Value> };
export interface InitArgs { 'minter' : Principal }
export type Memo = Uint8Array | number[];
export type MetadataValue = { 'Int' : bigint } |
  { 'Nat' : bigint } |
  { 'Blob' : Uint8Array | number[] } |
  { 'Text' : string };
/**
 * Mint / burn (ICP-04)
 */
export interface MintArgs {
  'to' : Account,
  'memo' : [] | [Memo],
  'created_at_time' : [] | [Timestamp],
  'amount' : bigint,
}
export type MintError = { 'MemoTooLong' : null } |
  { 'NotMinter' : null } |
  { 'AmountZero' : null } |
  { 'InvalidMinter' : null } |
  { 'AmountOverflow' : null };
/**
 * Livewager Points Ledger — ICRC-1 + ICRC-2 compliant candid interface.
 * ICP-02: core ICRC-1 surface.
 * ICP-03: ICRC-2 approve / transfer_from / allowance.
 */
export type Subaccount = Uint8Array | number[];
export interface SupportedStandard { 'url' : string, 'name' : string }
export type Timestamp = bigint;
/**
 * ICRC-1 transfer
 */
export interface TransferArg {
  'to' : Account,
  'fee' : [] | [bigint],
  'memo' : [] | [Memo],
  'from_subaccount' : [] | [Subaccount],
  'created_at_time' : [] | [Timestamp],
  'amount' : bigint,
}
export type TransferError = {
    'GenericError' : { 'message' : string, 'error_code' : bigint }
  } |
  { 'TemporarilyUnavailable' : null } |
  { 'BadBurn' : { 'min_burn_amount' : bigint } } |
  { 'Duplicate' : { 'duplicate_of' : bigint } } |
  { 'BadFee' : { 'expected_fee' : bigint } } |
  { 'CreatedInFuture' : { 'ledger_time' : bigint } } |
  { 'TooOld' : null } |
  { 'InsufficientFunds' : { 'balance' : bigint } };
/**
 * ICRC-2 transfer_from
 */
export interface TransferFromArgs {
  'to' : Account,
  'fee' : [] | [bigint],
  'spender_subaccount' : [] | [Subaccount],
  'from' : Account,
  'memo' : [] | [Memo],
  'created_at_time' : [] | [Timestamp],
  'amount' : bigint,
}
export type TransferFromError = {
    'GenericError' : { 'message' : string, 'error_code' : bigint }
  } |
  { 'TemporarilyUnavailable' : null } |
  { 'InsufficientAllowance' : { 'allowance' : bigint } } |
  { 'BadBurn' : { 'min_burn_amount' : bigint } } |
  { 'Duplicate' : { 'duplicate_of' : bigint } } |
  { 'BadFee' : { 'expected_fee' : bigint } } |
  { 'CreatedInFuture' : { 'ledger_time' : bigint } } |
  { 'TooOld' : null } |
  { 'InsufficientFunds' : { 'balance' : bigint } };
export interface _SERVICE {
  'add_account_member' : ActorMethod<
    [Principal],
    { 'Ok' : AccountInfo } |
      { 'Err' : AccountError }
  >,
  'burn' : ActorMethod<[BurnArgs], { 'Ok' : bigint } | { 'Err' : BurnError }>,
  /**
   * Canister meta
   */
  'canister_principal' : ActorMethod<[], Principal>,
  /**
   * Multi-key accounts (ICP-05). One account can have many member
   * principals; faucet rate-limits + balance gates become account-
   * scoped when the caller is a member.
   */
  'create_account' : ActorMethod<
    [],
    { 'Ok' : AccountInfo } |
      { 'Err' : AccountError }
  >,
  'faucet_claim' : ActorMethod<
    [],
    { 'Ok' : FaucetClaimOk } |
      { 'Err' : FaucetError }
  >,
  /**
   * Faucet — rate-limited public "Get freebies" mint.
   */
  'faucet_config' : ActorMethod<[], FaucetConfigView>,
  'faucet_status' : ActorMethod<[Principal], FaucetStatusView>,
  'get_account' : ActorMethod<[bigint], [] | [AccountInfo]>,
  'get_minter' : ActorMethod<[], Principal>,
  'icrc1_balance_of' : ActorMethod<[Account], bigint>,
  'icrc1_decimals' : ActorMethod<[], number>,
  'icrc1_fee' : ActorMethod<[], bigint>,
  'icrc1_metadata' : ActorMethod<[], Array<[string, MetadataValue]>>,
  'icrc1_minting_account' : ActorMethod<[], [] | [Account]>,
  /**
   * ICRC-1 queries
   */
  'icrc1_name' : ActorMethod<[], string>,
  'icrc1_supported_standards' : ActorMethod<[], Array<SupportedStandard>>,
  'icrc1_symbol' : ActorMethod<[], string>,
  'icrc1_total_supply' : ActorMethod<[], bigint>,
  /**
   * ICRC-1 update
   */
  'icrc1_transfer' : ActorMethod<
    [TransferArg],
    { 'Ok' : bigint } |
      { 'Err' : TransferError }
  >,
  /**
   * ICRC-2
   */
  'icrc2_allowance' : ActorMethod<[AllowanceArgs], Allowance>,
  'icrc2_approve' : ActorMethod<
    [ApproveArgs],
    { 'Ok' : bigint } |
      { 'Err' : ApproveError }
  >,
  'icrc2_transfer_from' : ActorMethod<
    [TransferFromArgs],
    { 'Ok' : bigint } |
      { 'Err' : TransferFromError }
  >,
  /**
   * ICRC-3 (block log, ICP-12a)
   */
  'icrc3_get_blocks' : ActorMethod<
    [Array<{ 'start' : bigint, 'length' : bigint }>],
    {
      'log_length' : bigint,
      'blocks' : Array<{ 'id' : bigint, 'block' : ICRC3Value }>,
      'archived_blocks' : Array<ArchivedBlocks>,
    }
  >,
  'icrc3_get_tip_certificate' : ActorMethod<
    [],
    [] | [
      {
        'certificate' : Uint8Array | number[],
        'hash_tree' : Uint8Array | number[],
      }
    ]
  >,
  'icrc3_log_length' : ActorMethod<[], bigint>,
  'icrc3_supported_block_types' : ActorMethod<
    [],
    Array<{ 'url' : string, 'block_type' : string }>
  >,
  'icrc3_tip_hash' : ActorMethod<[], Uint8Array | number[]>,
  /**
   * Mint / burn (ICP-04) — non-ICRC but indexer-friendly
   */
  'mint' : ActorMethod<[MintArgs], { 'Ok' : bigint } | { 'Err' : MintError }>,
  'my_account' : ActorMethod<[], [] | [AccountInfo]>,
  'remove_account_member' : ActorMethod<
    [Principal],
    { 'Ok' : AccountInfo } |
      { 'Err' : AccountError }
  >,
  'set_minter' : ActorMethod<
    [Principal],
    { 'Ok' : null } |
      { 'Err' : MintError }
  >,
  /**
   * / Monotonic transaction counter. Incremented on every successful
   * / state-mutating call. Returned as the Ok nat from those calls.
   */
  'tx_counter' : ActorMethod<[], bigint>,
  'version' : ActorMethod<[], string>,
}
export declare const idlFactory: IDL.InterfaceFactory;
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[];
