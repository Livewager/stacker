"use client";

/**
 * Tiny drop-in replacement for framer-motion's useReducedMotion hook
 * so routes that want to gate animations can do so without pulling
 * the entire framer-motion package into their chunk.
 *
 * Returns null on the server and during the first paint so SSR +
 * hydrate match; flips to true/false after mount based on the OS
 * prefers-reduced-motion query. Listens for runtime changes too.
 */

import { useEffect, useState } from "react";

export function useReducedMotion(): boolean | null {
  const [reduced, setReduced] = useState<boolean | null>(null);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      setReduced(false);
      return;
    }
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    // Safari < 14 uses addListener; newer browsers use addEventListener.
    if (mq.addEventListener) {
      mq.addEventListener("change", update);
      return () => mq.removeEventListener("change", update);
    }
    const legacy = mq as unknown as {
      addListener?: (cb: () => void) => void;
      removeListener?: (cb: () => void) => void;
    };
    legacy.addListener?.(update);
    return () => legacy.removeListener?.(update);
  }, []);
  return reduced;
}
