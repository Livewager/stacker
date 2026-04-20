/**
 * Client-side Litecoin address sanity checks.
 *
 * This is a structural check, not a cryptographic one — we don't
 * verify the base58 checksum or bech32 polymod, which requires a
 * dependency we don't want in the client bundle. The goal is to
 * catch the 99% of typos (wrong network, missing character, pasted
 * from the wrong app) before the user hits a server-side rejection.
 *
 * The production oracle validates strictly before broadcasting.
 */

/** Three buckets of LTC address format we recognise. */
export type LtcAddressKind = "legacy" | "p2sh" | "bech32";

export interface LtcAddressValidation {
  ok: boolean;
  kind?: LtcAddressKind;
  /** Short, user-facing message. Omitted when ok=true. */
  reason?: string;
}

// base58 alphabet (Bitcoin/Litecoin): no 0, O, I, l
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]+$/;
// bech32 charset lowercase (after the "ltc1" prefix).
const BECH32_DATA_RE = /^[02-9ac-hj-np-z]+$/;

export function validateLtcAddress(input: string): LtcAddressValidation {
  const raw = input.trim();
  if (!raw) return { ok: false, reason: "Required" };

  // Quick "wrong coin" catches — bc1 is BTC bech32, 0x is EVM, etc.
  if (/^bc1/i.test(raw)) {
    return { ok: false, reason: "That's a Bitcoin (bc1…) address, not Litecoin" };
  }
  if (/^0x[0-9a-f]+$/i.test(raw)) {
    return { ok: false, reason: "That's an EVM address, not Litecoin" };
  }

  // Bech32 path: must be lowercase and start with ltc1.
  if (/^[A-Z]/.test(raw) && /^ltc1/i.test(raw)) {
    return { ok: false, reason: "Bech32 addresses must be lowercase" };
  }
  if (raw.startsWith("ltc1")) {
    if (raw.length < 26) return { ok: false, reason: "Bech32 address is too short" };
    if (raw.length > 90) return { ok: false, reason: "Bech32 address is too long" };
    const data = raw.slice(4);
    if (!BECH32_DATA_RE.test(data)) {
      return {
        ok: false,
        reason: "Contains characters bech32 doesn't allow (1, b, i, o)",
      };
    }
    return { ok: true, kind: "bech32" };
  }

  // Legacy / P2SH. Litecoin legacy starts with L, P2SH with M or 3
  // (3 is historical, shared with BTC P2SH). Length 26-34 in practice.
  const first = raw[0];
  if (first !== "L" && first !== "M" && first !== "3") {
    return {
      ok: false,
      reason:
        "Legacy LTC addresses start with L or M. Bech32 starts with ltc1.",
    };
  }
  if (raw.length < 26) return { ok: false, reason: "Address is too short" };
  if (raw.length > 34) return { ok: false, reason: "Legacy address is too long" };
  if (!BASE58_RE.test(raw)) {
    return {
      ok: false,
      reason:
        "Contains base58-invalid characters (0, O, I, or l). Double-check the paste.",
    };
  }
  const kind: LtcAddressKind = first === "L" ? "legacy" : "p2sh";
  return { ok: true, kind };
}
