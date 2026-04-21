"use client";

/**
 * BIP-39 seed phrase → Ed25519 identity (deterministic).
 *
 * The mnemonic is 12 English words (128 bits of entropy from the
 * standard BIP-39 wordlist). `mnemonicToSeedSync(phrase)` runs
 * PBKDF2-HMAC-SHA512 to stretch the phrase into a 64-byte seed;
 * we take the first 32 bytes as an Ed25519 secret key. This matches
 * the "take secret = seed[0..32]" convention ICRC / II-style
 * browsers use for mnemonic-derived dev identities.
 *
 * Same phrase always yields the same principal — recovery works
 * across browsers, devices, incognito, everything.
 *
 * The phrase is what the user backs up. Lose it = lose the key.
 */

import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { Ed25519KeyIdentity } from "@dfinity/identity";

/** Generate a fresh 12-word (128-bit) mnemonic. */
export function generateSeedPhrase(): string {
  return generateMnemonic(wordlist, 128);
}

/** Is this a valid BIP-39 English mnemonic? */
export function isValidSeedPhrase(phrase: string): boolean {
  return validateMnemonic(phrase.trim().toLowerCase(), wordlist);
}

/**
 * Derive the canonical Ed25519 identity from a seed phrase.
 * Same phrase always yields the same principal, regardless of
 * device or browser.
 *
 * Implementation: BIP-39 PBKDF2-stretched seed (64 bytes), take
 * the first 32 as Ed25519 secret key. No BIP-32 derivation path
 * needed — one phrase is one key, matching the "one account per
 * seed phrase" UX we want.
 */
export function seedPhraseToIdentity(phrase: string): Ed25519KeyIdentity {
  const trimmed = phrase.trim().toLowerCase();
  if (!validateMnemonic(trimmed, wordlist)) {
    throw new Error("Invalid seed phrase — check spelling and word count");
  }
  const seed = mnemonicToSeedSync(trimmed);
  // Ed25519KeyIdentity.generate() takes a 32-byte seed as its first arg.
  return Ed25519KeyIdentity.generate(seed.slice(0, 32));
}
