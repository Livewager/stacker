/**
 * Typed route constants. Single source of truth for every first-party
 * path in the app.
 *
 * Use ROUTES.wallet instead of "/wallet". Renames flip at the type
 * level, typos surface at build time, and searching for callers of a
 * route becomes trivial (grep ROUTES.wallet vs. grep "/wallet").
 *
 * External URLs (II provider, docs) stay as raw strings at their call
 * site — mixing them in here muddies the purpose.
 */

export const ROUTES = {
  home: "/",
  stacker: "/stacker",
  play: "/play",
  wallet: "/wallet",
  account: "/account",
  deposit: "/deposit",
  send: "/send",
  withdraw: "/withdraw",
  leaderboard: "/leaderboard",
  settings: "/settings",
  fairPlay: "/fair-play",
} as const;

export type RouteKey = keyof typeof ROUTES;
export type RoutePath = (typeof ROUTES)[RouteKey];

/** Deposit deep-link helper. Narrows to the three supported tabs. */
export type DepositVia = "ltc" | "card" | "bank";
export function depositHref(via?: DepositVia): string {
  return via ? `${ROUTES.deposit}?via=${via}` : ROUTES.deposit;
}

/** Anchors that pages scroll to. Used by top-nav Deposit CTA. */
export const ANCHORS = {
  dropWallet: "#drop-wallet",
  content: "#content",
} as const;
