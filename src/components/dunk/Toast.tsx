"use client";

/**
 * Tiny custom toast system — no dependency on react-toastify, no portal
 * gymnastics. Toasts are rendered in a fixed-position list by <ToastHost />
 * which must appear once at the top of the layout.
 *
 * Fire toasts anywhere via useToast().push({ ... }).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type ToastKind = "success" | "error" | "info";

export interface ToastInput {
  kind?: ToastKind;
  title: string;
  description?: string;
  /** Milliseconds before auto-dismiss. 0 = sticky. Default 4500. */
  ttlMs?: number;
  /** Optional action button. */
  action?: { label: string; onClick: () => void };
}

interface ToastEntry extends Required<Pick<ToastInput, "title">> {
  id: string;
  kind: ToastKind;
  description?: string;
  ttlMs: number;
  action?: ToastInput["action"];
  createdAt: number;
}

interface ToastApi {
  push: (t: ToastInput) => string;
  dismiss: (id: string) => void;
}

const ToastCtx = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast requires <ToastHost /> in the tree");
  return ctx;
}

export function ToastHost({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    setToasts((xs) => xs.filter((t) => t.id !== id));
    const h = timers.current.get(id);
    if (h) {
      clearTimeout(h);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (input: ToastInput) => {
      const id =
        (typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : String(Math.random())) + "";
      const entry: ToastEntry = {
        id,
        kind: input.kind ?? "info",
        title: input.title,
        description: input.description,
        ttlMs: input.ttlMs ?? 4500,
        action: input.action,
        createdAt: Date.now(),
      };
      setToasts((xs) => [...xs, entry]);
      if (entry.ttlMs > 0) {
        const h = setTimeout(() => dismiss(id), entry.ttlMs);
        timers.current.set(id, h);
      }
      return id;
    },
    [dismiss],
  );

  // Cleanup lingering timers on unmount.
  useEffect(() => {
    const t = timers.current;
    return () => {
      t.forEach((h) => clearTimeout(h));
      t.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(() => ({ push, dismiss }), [push, dismiss]);

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div
        role="region"
        aria-label="Notifications"
        aria-live="polite"
        className="pointer-events-none fixed top-4 right-4 z-[1000] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2"
      >
        {toasts.map((t) => (
          <ToastCard key={t.id} t={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

function ToastCard({ t, onDismiss }: { t: ToastEntry; onDismiss: () => void }) {
  const accent =
    t.kind === "success"
      ? "border-emerald-400/40 bg-emerald-400/[0.07]"
      : t.kind === "error"
        ? "border-red-400/40 bg-red-400/[0.07]"
        : "border-cyan-300/40 bg-cyan-300/[0.07]";
  const dot =
    t.kind === "success" ? "bg-emerald-400" : t.kind === "error" ? "bg-red-400" : "bg-cyan-300";

  return (
    <div
      role="status"
      className={`pointer-events-auto rounded-xl border backdrop-blur-md px-4 py-3 shadow-xl ${accent}`}
    >
      <div className="flex items-start gap-3">
        <span className={`mt-1 inline-block h-2 w-2 flex-shrink-0 rounded-full ${dot}`} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-white leading-snug">{t.title}</div>
          {t.description && (
            <div className="mt-0.5 text-xs text-gray-300 leading-snug break-words">
              {t.description}
            </div>
          )}
          {t.action && (
            <button
              onClick={t.action.onClick}
              className="mt-2 text-[11px] uppercase tracking-widest text-cyan-300 hover:text-cyan-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/50 rounded"
            >
              {t.action.label}
            </button>
          )}
        </div>
        <button
          onClick={onDismiss}
          className="flex-shrink-0 -mt-1 -mr-1 rounded p-1 text-gray-400 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
          aria-label="Dismiss notification"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
