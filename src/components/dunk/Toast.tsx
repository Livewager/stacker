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
  /**
   * Optional action button. Common pattern: undo a reversible action.
   * `dismissOnClick` defaults to true — after the user taps, the
   * toast goes away, matching the "I took the undo, done" mental
   * model. Pass false for actions that should keep the toast open
   * (multi-step flows).
   */
  action?: {
    label: string;
    onClick: () => void;
    dismissOnClick?: boolean;
  };
}

interface ToastEntry extends Required<Pick<ToastInput, "title">> {
  id: string;
  kind: ToastKind;
  description?: string;
  ttlMs: number;
  action?: ToastInput["action"];
  createdAt: number;
  /** Number of times an identical toast has been collapsed into this
   *  entry. Rendered as " · ×N" when > 1 so rage-clicks don't spawn
   *  a tower of duplicates. */
  repeatCount: number;
}

/** Collapse window for identical toasts. Anything within this many
 *  ms of the most recent matching toast merges into it instead of
 *  spawning a new entry. */
const COLLAPSE_WINDOW_MS = 2000;

/** Error-only throttle window. Error toasts with the same title that
 *  arrive within this many ms of a previous error — even after the
 *  first one has dismissed — are silently dropped. Protects against
 *  re-throwing effects pumping "Fetch failed" into the stack eight
 *  times in a row. Non-error kinds still flow normally so success
 *  chimes stay responsive. */
const ERROR_THROTTLE_MS = 10_000;

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
  // Per-title timestamps of recent error pushes. Compared against
  // ERROR_THROTTLE_MS so an error that's already surfaced within
  // the last 10s doesn't spawn another entry — covers the case where
  // the entry has dismissed but the underlying error is still firing.
  const recentErrors = useRef(new Map<string, number>());
  // Focus-return snapshot. For each toast we remember which element
  // was focused when it was pushed; on dismiss we restore focus IF
  // the user was interacting with the toast (activeElement is inside
  // the host container). Otherwise we leave focus where it is — a
  // user who tabbed elsewhere during the toast lifetime shouldn't
  // get yanked back mid-task.
  const returnFocus = useRef(new Map<string, HTMLElement>());
  const hostRef = useRef<HTMLDivElement | null>(null);

  const dismiss = useCallback((id: string) => {
    // Decide BEFORE we tear down whether to restore focus: only if
    // the current activeElement is inside our toast region.
    const focusTarget = returnFocus.current.get(id);
    returnFocus.current.delete(id);
    const shouldRestore =
      !!focusTarget &&
      typeof document !== "undefined" &&
      !!hostRef.current &&
      document.activeElement !== null &&
      hostRef.current.contains(document.activeElement) &&
      focusTarget.isConnected;
    setToasts((xs) => xs.filter((t) => t.id !== id));
    const st = timers.current.get(id);
    if (st) {
      clearTimeout(st.handle);
      timers.current.delete(id);
    }
    if (shouldRestore) {
      // Defer one frame so React can unmount the toast first;
      // otherwise focus() on a dying node can race with browser
      // focus moving to body.
      requestAnimationFrame(() => {
        try {
          focusTarget!.focus({ preventScroll: true });
        } catch {
          /* element may have been removed between frames */
        }
      });
    }
  }, []);

  const dismissAll = useCallback(() => {
    setToasts([]);
    timers.current.forEach((st) => clearTimeout(st.handle));
    timers.current.clear();
    // Wipe the focus-return snapshots too — once the region is
    // cleared by a bulk action, any per-toast stash is moot.
    returnFocus.current.clear();
  }, []);

  const push = useCallback(
    (input: ToastInput) => {
      const kind = input.kind ?? "info";
      const ttlMs = input.ttlMs ?? 4500;
      const now = Date.now();
      // Snapshot the currently-focused element so we can restore
      // focus when the toast dismisses (if the user ended up
      // interacting with the toast itself). Skip when focus is on
      // <body> — that's "nothing in particular", no point stashing.
      const focusSnapshot =
        typeof document !== "undefined" &&
        document.activeElement instanceof HTMLElement &&
        document.activeElement !== document.body
          ? document.activeElement
          : null;

      // Error-only 10s throttle by title. The collapse path below
      // handles the "within 2s and still visible" case; this one
      // protects against re-throwing effects pumping the same error
      // after the first toast has already dismissed. Silently drop
      // — we'd rather the user miss one than get spammed with ten.
      // Non-error kinds bypass; success/info chimes stay snappy.
      if (kind === "error") {
        const last = recentErrors.current.get(input.title);
        if (last !== undefined && now - last < ERROR_THROTTLE_MS) {
          return ""; // empty id signals "did not surface"
        }
        recentErrors.current.set(input.title, now);
        // Prune stale entries so the Map doesn't leak when error
        // titles change (e.g. Date-stamped messages).
        for (const [title, ts] of recentErrors.current) {
          if (now - ts >= ERROR_THROTTLE_MS) {
            recentErrors.current.delete(title);
          }
        }
      }

      // Collapse-into-last when an identical (kind + title) toast is
      // already on screen and within the collapse window. Avoids the
      // "rage-click produces N identical toasts" failure mode.
      let collapsed = false;
      let targetId = "";
      setToasts((xs) => {
        const last = xs[xs.length - 1];
        if (
          last &&
          last.kind === kind &&
          last.title === input.title &&
          now - last.createdAt < COLLAPSE_WINDOW_MS
        ) {
          collapsed = true;
          targetId = last.id;
          return xs.map((t) =>
            t.id === last.id
              ? {
                  ...t,
                  repeatCount: t.repeatCount + 1,
                  description: input.description ?? t.description,
                  createdAt: now, // reset for the next collapse window
                }
              : t,
          );
        }
        return xs;
      });

      if (collapsed) {
        // Reset the TTL on the collapsed target so the count-bump
        // stays visible for a full TTL cycle.
        const st = timers.current.get(targetId);
        if (st) {
          clearTimeout(st.handle);
          const handle = setTimeout(() => dismiss(targetId), ttlMs);
          timers.current.set(targetId, {
            handle,
            startedAt: performance.now(),
            remainingMs: ttlMs,
          });
        }
        // Collapse doesn't spawn a new entry, so we only refresh
        // the return-focus snapshot if the existing one is stale
        // (the target element was removed). Otherwise the original
        // caller's focus target remains authoritative — a burst of
        // repeats shouldn't shift "where was focus before this started".
        const existing = returnFocus.current.get(targetId);
        if ((!existing || !existing.isConnected) && focusSnapshot) {
          returnFocus.current.set(targetId, focusSnapshot);
        }
        return targetId;
      }

      const id =
        (typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : String(Math.random())) + "";
      const entry: ToastEntry = {
        id,
        kind,
        title: input.title,
        description: input.description,
        ttlMs,
        action: input.action,
        createdAt: now,
        repeatCount: 1,
      };
      setToasts((xs) => [...xs, entry]);
      if (focusSnapshot) {
        returnFocus.current.set(id, focusSnapshot);
      }
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

  // Pause every active timer when the tab hides; resume when it
  // returns. Without this, a 4.5s toast fired the instant before a
  // user ⌘-tabs away simply disappears — they come back to silence.
  // Mirrors the hover-pause semantics at the tab level.
  useEffect(() => {
    const onVisibility = () => {
      const hidden = document.visibilityState === "hidden";
      timers.current.forEach((_st, id) => {
        if (hidden) pause(id);
        else resume(id);
      });
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [pause, resume]);

  const api = useMemo<ToastApi>(() => ({ push, dismiss }), [push, dismiss]);

  // Show the newest VISIBLE_CAP toasts; older ones are hidden but kept
  // in state so their auto-dismiss timer still runs. Prevents the stack
  // from eating the whole viewport on mobile during a burst of events.
  const visible = toasts.slice(-VISIBLE_CAP);
  const hiddenCount = Math.max(0, toasts.length - VISIBLE_CAP);

  return (
    <ToastCtx.Provider value={api}>
      {children}
      {/* Container is just a landmark — each ToastCard declares its
          own aria-live role (status/alert) so the SR announces per
          card with the right urgency. Leaving an aria-live here
          would double-up on every error. */}
      <div
        ref={hostRef}
        role="region"
        aria-label="Notifications"
        className="pointer-events-none fixed top-4 right-4 z-[1000] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2 max-h-[calc(100vh-2rem)] overflow-y-auto"
        style={{ scrollbarWidth: "none" }}
      >
        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={dismissAll}
            className="pointer-events-auto self-end text-[10px] uppercase tracking-widest px-2.5 py-1 rounded-full border border-white/15 bg-black/60 text-gray-300 hover:text-white hover:border-white/30 transition backdrop-blur focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            +{hiddenCount} more · clear all
          </button>
        )}
        {visible.map((t, i) => {
          // Stack-depth cue: the newest toast (last in array) renders
          // flat; each older one above it gets a subtle scale-down
          // and a small translateY to peek from behind. Gives the
          // "pile" a depth read without stealing room from the text.
          // Capped at 3 steps of recession so a five-deep stack
          // doesn't vanish. Newest-first visual order: reverse-index
          // from the end of the array.
          const fromNewest = visible.length - 1 - i;
          const steps = Math.min(fromNewest, 3);
          const scale = 1 - steps * 0.03;
          const translateY = steps * 4;
          const depthStyle =
            steps === 0
              ? undefined
              : {
                  transform: `translateY(${translateY}px) scale(${scale})`,
                  transformOrigin: "center top",
                  opacity: 1 - steps * 0.07,
                };
          return (
            <div
              key={t.id}
              className="transition-[transform,opacity] duration-200 ease-out"
              style={depthStyle}
            >
              <ToastCard
                t={t}
                onDismiss={() => dismiss(t.id)}
                onPause={() => pause(t.id)}
                onResume={() => resume(t.id)}
              />
            </div>
          );
        })}
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

const DRAG_DISMISS_PX = 120;
const DRAG_VELOCITY_THRESHOLD = 0.8; // px/ms

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
  const dragStart = useRef<{ x: number; t: number } | null>(null);
  // Trailing window of recent samples so the release-velocity check
  // measures the *end* of the gesture, not the whole drag. A user
  // who hesitates mid-swipe and then flicks should still dismiss —
  // averaging across the slow start would hide that flick.
  const samples = useRef<Array<{ x: number; t: number }>>([]);
  const [dragX, setDragX] = useState(0);

  // Touch-only swipe-to-dismiss so desktop mouse hover keeps
  // pause/resume intact.
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "touch") return;
    const now = performance.now();
    dragStart.current = { x: e.clientX, t: now };
    samples.current = [{ x: e.clientX, t: now }];
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    onPause();
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStart.current) return;
    const now = performance.now();
    samples.current.push({ x: e.clientX, t: now });
    // Keep only the last ~120ms so the ring never grows unbounded
    // during a long slow drag. 120ms is enough headroom to land on
    // an ≥80ms window even at the edges of the gesture.
    const cutoff = now - 120;
    while (samples.current.length > 2 && samples.current[0].t < cutoff) {
      samples.current.shift();
    }
    setDragX(e.clientX - dragStart.current.x);
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStart.current) return;
    const dx = e.clientX - dragStart.current.x;
    dragStart.current = null;
    // Trailing-window velocity (last ~80ms) — captures a flick at
    // the end of a slower drag. Falls back to the overall gesture
    // when the window has fewer than two samples (very short tap).
    const now = performance.now();
    const window = samples.current.filter((s) => now - s.t <= 80);
    let velocity = 0;
    if (window.length >= 2) {
      const first = window[0];
      const last = window[window.length - 1];
      const wdx = last.x - first.x;
      const wdt = Math.max(1, last.t - first.t);
      velocity = Math.abs(wdx) / wdt;
    } else if (samples.current.length >= 2) {
      const first = samples.current[0];
      const last = samples.current[samples.current.length - 1];
      velocity = Math.abs(last.x - first.x) / Math.max(1, last.t - first.t);
    }
    samples.current = [];
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* no-op */
    }
    if (Math.abs(dx) > DRAG_DISMISS_PX || velocity > DRAG_VELOCITY_THRESHOLD) {
      onDismiss();
    } else {
      setDragX(0);
      onResume();
    }
  };

  const dragging = dragStart.current !== null;
  const transform = dragX !== 0 ? `translate3d(${dragX}px, 0, 0)` : undefined;
  const opacity = Math.max(0.3, 1 - Math.abs(dragX) / 280);

  // Error and warning kinds announce via role=alert (implicit
  // aria-live=assertive) so screen readers interrupt whatever they
  // were saying — a failed transfer or ledger rejection needs the
  // SR to pay attention now, not queue behind a polite read of the
  // page. Success/info keep role=status (polite) so a chime doesn't
  // trample an ongoing narration. Matches the visual hierarchy:
  // error/warning already have louder accent colors.
  const assertive = t.kind === "error" || t.kind === "warning";
  return (
    <div
      role={assertive ? "alert" : "status"}
      aria-live={assertive ? "assertive" : "polite"}
      onMouseEnter={onPause}
      onMouseLeave={onResume}
      onFocusCapture={onPause}
      onBlurCapture={onResume}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      // Reduced-motion audit (POLISH-225):
      //   - lw-reveal entrance: the keyframe duration is clamped to
      //     0.001ms by the global prefers-reduced-motion rule in
      //     style.css (both the OS @media query and the in-app
      //     html.lw-reduce-motion mirror), so the slide+fade
      //     collapses to the terminal frame.
      //   - `transition: transform … ease` on the inline style below
      //     is governed by the same global `transition-duration: 0.001ms`
      //     clamp — the settle-in animation after a swipe-dismiss
      //     drag flattens automatically. The drag itself (dragX
      //     tracking the pointer) is direct manipulation and
      //     deliberately unaffected: prefers-reduced-motion only
      //     applies to *autonomous* motion, not user-driven
      //     transforms that follow a finger.
      //   - Stack-depth transform at the parent wrapper is a static
      //     offset applied once; no animation, nothing to clamp.
      // No local useReducedMotion guard needed. Pinned here so a
      // future refactor that swaps to framer-motion doesn't silently
      // regress the contract.
      className={`lw-reveal pointer-events-auto rounded-xl border backdrop-blur-md px-4 py-3 shadow-xl ${s.shell}`}
      style={{
        transform,
        opacity,
        transition: dragging ? "none" : "transform 140ms ease, opacity 140ms ease",
        touchAction: "pan-y", // lets the user scroll the region vertically
      }}
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
          <div className="text-sm font-semibold text-white leading-snug">
            {t.title}
            {t.repeatCount > 1 && (
              <span className="ml-2 inline-flex items-center rounded-full border border-white/15 bg-black/40 px-1.5 py-0.5 text-[10px] font-mono text-gray-300">
                ×{t.repeatCount}
              </span>
            )}
          </div>
          {t.description && (
            <div className="mt-0.5 text-xs text-gray-300 leading-snug break-words">
              {t.description}
            </div>
          )}
          {t.action && (
            <button
              onClick={() => {
                t.action?.onClick();
                // Default: dismiss after the action fires. Callers
                // that want to keep the toast open (e.g. multi-step
                // flows) pass dismissOnClick: false. The "?? true"
                // preserves backwards-compatible behavior for any
                // pre-existing callers that don't set the flag.
                if (t.action?.dismissOnClick ?? true) onDismiss();
              }}
              className="mt-2 text-[11px] uppercase tracking-widest text-cyan-300 hover:text-cyan-200 rounded px-1 -mx-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b1a2e]"
            >
              {t.action.label}
            </button>
          )}
        </div>
        <button
          onClick={onDismiss}
          className="flex-shrink-0 -mt-1 -mr-1 rounded p-1 text-gray-400 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b1a2e]"
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
