"use client";

/**
 * Tiny custom toast system — no dependency on react-toastify, no portal
 * gymnastics. Toasts are rendered in a fixed-position list by <ToastHost />
 * which must appear once at the top of the layout.
 *
 * Fire toasts anywhere via useToast().push({ ... }).
 *
 * Variants: success | error | warning | info. Each has a tinted border,
 * matching background, and a dedicated icon so the signal survives a
 * glance without reading.
 *
 * The stack is capped to VISIBLE_CAP; overflow collapses into a
 * "+N more" pill that clears everything on click. Keeps the screen
 * readable on mobile during a burst of events.
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

export type ToastKind = "success" | "error" | "warning" | "info";

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

const VISIBLE_CAP = 5;

export function useToast(): ToastApi {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast requires <ToastHost /> in the tree");
  return ctx;
}

interface TimerState {
  handle: ReturnType<typeof setTimeout>;
  startedAt: number;
  remainingMs: number;
}

export function ToastHost({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const timers = useRef(new Map<string, TimerState>());

  const dismiss = useCallback((id: string) => {
    setToasts((xs) => xs.filter((t) => t.id !== id));
    const st = timers.current.get(id);
    if (st) {
      clearTimeout(st.handle);
      timers.current.delete(id);
    }
  }, []);

  const dismissAll = useCallback(() => {
    setToasts([]);
    timers.current.forEach((st) => clearTimeout(st.handle));
    timers.current.clear();
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
        const handle = setTimeout(() => dismiss(id), entry.ttlMs);
        timers.current.set(id, {
          handle,
          startedAt: performance.now(),
          remainingMs: entry.ttlMs,
        });
      }
      return id;
    },
    [dismiss],
  );

  // Pause the auto-dismiss timer for a toast and keep track of how
  // much TTL is still owed. Called from ToastCard on mouse enter /
  // keyboard focus.
  const pause = useCallback((id: string) => {
    const st = timers.current.get(id);
    if (!st) return;
    clearTimeout(st.handle);
    const elapsed = performance.now() - st.startedAt;
    const remaining = Math.max(0, st.remainingMs - elapsed);
    timers.current.set(id, {
      // handle is replaced below on resume; stash the current noop
      // reference here so the shape stays valid.
      handle: st.handle,
      startedAt: 0,
      remainingMs: remaining,
    });
  }, []);

  const resume = useCallback(
    (id: string) => {
      const st = timers.current.get(id);
      if (!st || st.startedAt !== 0) return; // already running
      if (st.remainingMs <= 0) {
        dismiss(id);
        return;
      }
      const handle = setTimeout(() => dismiss(id), st.remainingMs);
      timers.current.set(id, {
        handle,
        startedAt: performance.now(),
        remainingMs: st.remainingMs,
      });
    },
    [dismiss],
  );

  // Cleanup lingering timers on unmount.
  useEffect(() => {
    const t = timers.current;
    return () => {
      t.forEach((st) => clearTimeout(st.handle));
      t.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(() => ({ push, dismiss }), [push, dismiss]);

  // Show the newest VISIBLE_CAP toasts; older ones are hidden but kept
  // in state so their auto-dismiss timer still runs. Prevents the stack
  // from eating the whole viewport on mobile during a burst of events.
  const visible = toasts.slice(-VISIBLE_CAP);
  const hiddenCount = Math.max(0, toasts.length - VISIBLE_CAP);

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div
        role="region"
        aria-label="Notifications"
        aria-live="polite"
        className="pointer-events-none fixed top-4 right-4 z-[1000] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2 max-h-[calc(100vh-2rem)] overflow-y-auto"
        style={{ scrollbarWidth: "none" }}
      >
        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={dismissAll}
            className="pointer-events-auto self-end text-[10px] uppercase tracking-widest px-2.5 py-1 rounded-full border border-white/15 bg-black/60 text-gray-300 hover:text-white hover:border-white/30 transition backdrop-blur"
          >
            +{hiddenCount} more · clear all
          </button>
        )}
        {visible.map((t) => (
          <ToastCard
            key={t.id}
            t={t}
            onDismiss={() => dismiss(t.id)}
            onPause={() => pause(t.id)}
            onResume={() => resume(t.id)}
          />
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

const KIND_STYLES: Record<
  ToastKind,
  { shell: string; icon: string; iconColor: string }
> = {
  success: {
    shell: "border-emerald-400/40 bg-emerald-400/[0.07]",
    icon: "M16.707 5.293a1 1 0 0 1 0 1.414l-7.5 7.5a1 1 0 0 1-1.414 0l-3.5-3.5a1 1 0 1 1 1.414-1.414L8.5 12.086l6.793-6.793a1 1 0 0 1 1.414 0Z",
    iconColor: "text-emerald-300",
  },
  error: {
    shell: "border-red-400/40 bg-red-400/[0.07]",
    icon: "M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z",
    iconColor: "text-red-300",
  },
  warning: {
    shell: "border-yellow-400/40 bg-yellow-400/[0.07]",
    icon: "M10 2a1 1 0 0 1 .894.553l7.5 15A1 1 0 0 1 17.5 19h-15a1 1 0 0 1-.894-1.447l7.5-15A1 1 0 0 1 10 2Zm0 6a1 1 0 0 0-1 1v3a1 1 0 1 0 2 0V9a1 1 0 0 0-1-1Zm0 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z",
    iconColor: "text-yellow-300",
  },
  info: {
    shell: "border-cyan-300/40 bg-cyan-300/[0.07]",
    icon: "M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm1 11a1 1 0 1 1-2 0V9a1 1 0 1 1 2 0v4Zm-1-8a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z",
    iconColor: "text-cyan-300",
  },
};

function ToastCard({
  t,
  onDismiss,
  onPause,
  onResume,
}: {
  t: ToastEntry;
  onDismiss: () => void;
  onPause: () => void;
  onResume: () => void;
}) {
  const s = KIND_STYLES[t.kind];

  return (
    <div
      role="status"
      onMouseEnter={onPause}
      onMouseLeave={onResume}
      onFocusCapture={onPause}
      onBlurCapture={onResume}
      className={`lw-reveal pointer-events-auto rounded-xl border backdrop-blur-md px-4 py-3 shadow-xl ${s.shell}`}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={`mt-0.5 shrink-0 inline-flex h-5 w-5 items-center justify-center ${s.iconColor}`}
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
            <path d={s.icon} />
          </svg>
        </span>
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
