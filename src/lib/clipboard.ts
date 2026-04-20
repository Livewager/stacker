"use client";

/**
 * Shared clipboard helper. Callers were independently duplicating
 * the same "try/catch navigator.clipboard.writeText + toast" pattern
 * across 9 files; this consolidates the shape.
 *
 * Surface:
 *   const copy = useCopyable();
 *   await copy("text", { label: "Principal" });
 *
 * On success → toast kind "success" title "<label> copied".
 * On failure (unsupported, denied, insecure context) → toast kind
 * "error" title "Clipboard blocked". Returns a boolean so callers can
 * short-circuit on failure without parsing errors.
 */

import { useCallback } from "react";
import { useToast } from "@/components/shared/Toast";

export interface CopyOptions {
  /** Noun used in the success toast — "Principal", "Canister id", etc. */
  label?: string;
  /** Suppress the success toast (errors still fire). */
  silent?: boolean;
  /** Override the failure message. Rarely needed. */
  errorTitle?: string;
}

export function useCopyable(): (value: string, opts?: CopyOptions) => Promise<boolean> {
  const toast = useToast();
  return useCallback(
    async (value, opts = {}) => {
      const { label = "Text", silent = false, errorTitle = "Clipboard blocked" } = opts;
      if (!value) {
        toast.push({ kind: "error", title: "Nothing to copy" });
        return false;
      }
      try {
        if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
          throw new Error("clipboard API unavailable");
        }
        await navigator.clipboard.writeText(value);
        if (!silent) {
          toast.push({ kind: "success", title: `${label} copied` });
        }
        return true;
      } catch {
        toast.push({ kind: "error", title: errorTitle });
        return false;
      }
    },
    [toast],
  );
}
