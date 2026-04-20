"use client";

import { useEffect, useState } from "react";

export const ENTRY_USD = 3;
export const POT_SPLIT_PCT = 20; // 10 hourly + 10 weekly
const BALANCE_KEY = "livewager-dunk-balance-usd";
const SPEND_KEY = "livewager-dunk-lifetime-spend";
const ROUNDS_KEY = "livewager-dunk-lifetime-rounds";
const BUS = "livewager-dunk-wallet-updated";
const STARTING_BALANCE = 15; // 5 free rounds for first-time visitors

const readNum = (key: string, fallback: number) => {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
};
const writeNum = (key: string, v: number) => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, String(v));
    window.dispatchEvent(new CustomEvent(BUS));
  } catch {
    /* ignore */
  }
};

export const getBalance = () => {
  if (typeof window === "undefined") return STARTING_BALANCE;
  const raw = localStorage.getItem(BALANCE_KEY);
  if (raw === null) {
    writeNum(BALANCE_KEY, STARTING_BALANCE);
    return STARTING_BALANCE;
  }
  const n = Number(raw);
  return Number.isFinite(n) ? n : STARTING_BALANCE;
};

export const getLifetimeSpend = () => readNum(SPEND_KEY, 0);
export const getLifetimeRounds = () => readNum(ROUNDS_KEY, 0);

/** Returns true if the charge succeeded (sufficient balance), false otherwise. */
export const chargeForRound = (): boolean => {
  const bal = getBalance();
  if (bal < ENTRY_USD) return false;
  writeNum(BALANCE_KEY, Number((bal - ENTRY_USD).toFixed(2)));
  writeNum(SPEND_KEY, Number((getLifetimeSpend() + ENTRY_USD).toFixed(2)));
  writeNum(ROUNDS_KEY, getLifetimeRounds() + 1);
  return true;
};

export const addCredits = (usd: number) => {
  writeNum(BALANCE_KEY, Number((getBalance() + usd).toFixed(2)));
};

export const useWallet = () => {
  const [balance, setBalance] = useState(() => getBalance());
  const [rounds, setRounds] = useState(() => getLifetimeRounds());
  const [spend, setSpend] = useState(() => getLifetimeSpend());

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => {
      setBalance(getBalance());
      setRounds(getLifetimeRounds());
      setSpend(getLifetimeSpend());
    };
    sync();
    window.addEventListener(BUS, sync);
    window.addEventListener("storage", (e) => {
      if (e.key === BALANCE_KEY || e.key === SPEND_KEY || e.key === ROUNDS_KEY) sync();
    });
    return () => {
      window.removeEventListener(BUS, sync);
    };
  }, []);

  return { balance, rounds, spend };
};
