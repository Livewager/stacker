"use client";

/**
 * Shared principal-shortening helper. Every wallet/send/account
 * surface was rolling its own version with slightly different
 * defaults (head 8/10, tail 8/10). Consolidate here so the
 * presentation is uniform across the app.
 *
 * Call with (principal) to get the default compact form:
 *
 *   xkwrr-q77fr…-qaaaq-cai
 *
 * Pass explicit { head, tail } for a specific surface — the toast
 * pills want shorter (head 6 tail 4), the /account hero wants the
 * longer default.
 */

export interface ShortenOpts {
  head?: number;
  tail?: number;
  /** Ellipsis glyph, defaults to a typographically-correct horizontal ellipsis. */
  ellipsis?: string;
}

const DEFAULT_HEAD = 10;
const DEFAULT_TAIL = 8;

export function shortenPrincipal(
  principal: string | null | undefined,
  opts: ShortenOpts = {},
): string {
  if (!principal) return "";
  const head = opts.head ?? DEFAULT_HEAD;
  const tail = opts.tail ?? DEFAULT_TAIL;
  const ellipsis = opts.ellipsis ?? "…";
  if (principal.length <= head + tail + 1) return principal;
  return `${principal.slice(0, head)}${ellipsis}${principal.slice(-tail)}`;
}
