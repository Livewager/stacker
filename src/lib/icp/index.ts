/**
 * Public surface of the ICP client. Import from "@/lib/icp".
 *
 * High-level mental model:
 *   const identity = await loginWithII();
 *   const ledger   = await pointsLedger({ identity });
 *   const balance  = await ledger.icrc1_balance_of({
 *     owner: identity.getPrincipal(),
 *     subaccount: [],
 *   });
 *
 * Use `pointsLedger()` with no identity for read-only queries from an
 * anonymous principal (balance_of, total_supply, metadata, etc.).
 */

export { pointsLedger, resolveCanisterId, resolveHost } from "./actor";
export type { PointsLedgerOpts } from "./actor";
export { getAuthClient, currentIdentity, loginWithII, logout } from "./auth";
export { formatLWP, parseLWP, LWP_DECIMALS } from "./format";
export { idlFactory } from "./idl";
export type {
  Account,
  Allowance,
  AllowanceArgs,
  ApproveArgs,
  ApproveError,
  BurnArgs,
  BurnError,
  Memo,
  MetadataValue,
  MintArgs,
  MintError,
  PointsLedgerService,
  SupportedStandard,
  TransferArg,
  TransferError,
  TransferFromArgs,
  TransferFromError,
} from "./types";
