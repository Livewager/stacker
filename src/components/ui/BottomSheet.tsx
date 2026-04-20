"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  /** Optional footer rendered under the content (sticky action rail). */
  footer?: ReactNode;
  /** Screen-reader label override when `title` isn't visible enough. */
  ariaLabel?: string;
};

/**
 * Drag-to-dismiss: below this Y delta the sheet snaps back; above it,
 * or past the velocity threshold, we close. Only listened for in the
 * mobile layout (drag handle is sm:hidden).
 */
const DRAG_DISMISS_PX = 100;
const DRAG_VELOCITY_THRESHOLD = 0.8; // px/ms

export function BottomSheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  ariaLabel,
}: Props) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  // Stable ids for the dialog's title / description labelling so
  // SR announces "<title>. <description>." on arrival instead of
  // only the title (or the ariaLabel fallback). Missing halves are
  // simply omitted from the aria-* attribute below.
  const autoId = useId();
  const titleId = `bs-${autoId}-title`;
  const descId = `bs-${autoId}-desc`;

  // Drag state — lives in a ref during motion (no per-frame re-render)
  // plus a display `dragY` state for the transform so the panel moves.
  const dragStart = useRef<{ y: number; t: number } | null>(null);
  const [dragY, setDragY] = useState(0);
  // POLISH-363 — trailing-window velocity samples for release intent.
  // The old `dy/dt` over the full drag span understated flick speed:
  // a user who held for 400ms then flicked for the last 40ms got a
  // velocity averaged across 440ms, well below the threshold. Toast
  // (POLISH-181) already uses this pattern; bringing BottomSheet in
  // line. Window = last ~80ms, which captures the wrist motion of a
  // flick without including too much of the slow pre-amble.
  const dragSamples = useRef<Array<{ y: number; t: number }>>([]);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = (document.activeElement as HTMLElement) || null;
    setDragY(0);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
      if (e.key === "Tab" && panelRef.current) {
        const panel = panelRef.current;
        const focusables = panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const current = document.activeElement as HTMLElement | null;
        // Escape-through guard: if focus has somehow landed outside
        // the panel (click on a document element, focus scripted by
        // another lib), yank it back in. Without this the wrap logic
        // below is a no-op and the user can tab away from a modal.
        if (!current || !panel.contains(current)) {
          e.preventDefault();
          (e.shiftKey ? last : first).focus();
          return;
        }
        if (e.shiftKey && current === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && current === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Initial-focus fallback chain (POLISH-282 audit):
    //   1. [data-autofocus] — explicit caller opt-in (palette input,
    //      Connect primary CTA, settings sign-out confirm)
    //   2. First focusable inside the panel — widened the selector
    //      past "button, a, input" so a sheet rendering only a
    //      textarea (memo-heavy forms) or a tabindex=0 region
    //      doesn't skip past its content and land on the panel div.
    //      Matches the same selector the Tab-trap handler above uses,
    //      so the "first" target on arrival equals the "first" the
    //      trap wraps to on Shift+Tab-from-start.
    //   3. Panel div itself — tabIndex=-1 on the wrapper makes
    //      programmatic .focus() work even with no interactive
    //      descendants. preventScroll so the focus call doesn't
    //      bump a long page's scroll position (caller's trigger
    //      may be far from the sheet's overlay entry point).
    const t = window.setTimeout(() => {
      const focusTarget =
        panelRef.current?.querySelector<HTMLElement>("[data-autofocus]") ||
        panelRef.current?.querySelector<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
        ) ||
        panelRef.current;
      try {
        focusTarget?.focus({ preventScroll: true });
      } catch {
        /* .focus() can race with a rapid remount; ignore */
      }
    }, 40);

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      window.clearTimeout(t);
      // Focus-return contract (POLISH-264 audit). This cleanup runs
      // on every close path — Escape handler, scrim click, drag-
      // dismiss, programmatic `open=false` — because all four end
      // up flipping `open` and invalidating the effect. So every
      // path converges here and restores focus on the trigger the
      // user launched the sheet from. Don't add a close-path-
      // specific restoration; the shared cleanup is the correct
      // single owner.
      //
      // Only restore focus if the original trigger is still in the
      // DOM. Otherwise silently drop — focusing a detached element
      // logs a React warning in dev and does nothing in prod. Skip
      // also if the previously-focused element is already hidden
      // (display:none / aria-hidden) which .focus() ignores.
      const prev = previouslyFocused.current;
      if (prev && document.body.contains(prev)) {
        try {
          prev.focus();
        } catch {
          /* focus can throw in some edge cases (disabled, removed) */
        }
      }
    };
  }, [open, onClose]);

  if (!open) return null;

  // --- drag-to-dismiss handlers (attached to the drag-handle row) ---
  const onHandlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Only track primary button / first touch, and only on mobile layout.
    if (e.pointerType === "mouse" && e.button !== 0) return;
    dragStart.current = { y: e.clientY, t: performance.now() };
    dragSamples.current = [{ y: e.clientY, t: performance.now() }];
    // Capture so subsequent move/up fire even if the pointer slips out.
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onHandlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStart.current) return;
    const dy = e.clientY - dragStart.current.y;
    // Don't let the user drag the sheet *up* past its rest position —
    // that would just pull it above the viewport.
    setDragY(Math.max(0, dy));
    // Ring-buffer the last ~80ms of samples for release-velocity.
    // A cap of 16 entries is generous (~5ms resolution) for an 80ms
    // window even on 120Hz displays, and avoids unbounded growth
    // during slow drags. Prune off the head when it exceeds the cap.
    const now = performance.now();
    dragSamples.current.push({ y: e.clientY, t: now });
    if (dragSamples.current.length > 16) dragSamples.current.shift();
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStart.current) {
      setDragY(0);
      return;
    }
    const dy = e.clientY - dragStart.current.y;
    // POLISH-363 — trailing-window velocity. Before: `velocity =
    // dy_total / dt_total` diluted a late flick across a slow
    // pre-amble (hold 400ms, flick last 40ms → velocity averaged
    // over 440ms, well below 0.8 px/ms threshold). Now: find the
    // oldest sample within the last ~80ms and measure dy/dt from
    // there. Matches the Toast drag-dismiss pattern (POLISH-181).
    // Fallback to full-span velocity when fewer than 2 samples
    // exist (pointer-down + pointer-up with no moves between).
    const samples = dragSamples.current;
    const now = performance.now();
    const WINDOW_MS = 80;
    const last = samples[samples.length - 1];
    let first = samples[0];
    for (let i = samples.length - 1; i >= 0; i--) {
      if (now - samples[i].t <= WINDOW_MS) {
        first = samples[i];
      } else {
        break;
      }
    }
    const velocity =
      last && first && last.t > first.t
        ? (last.y - first.y) / (last.t - first.t)
        : dy / Math.max(1, now - dragStart.current.t);
    dragStart.current = null;
    dragSamples.current = [];
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* no-op if already released */
    }

    if (dy > DRAG_DISMISS_PX || velocity > DRAG_VELOCITY_THRESHOLD) {
      // POLISH-264 finding. The close-path audit (Escape, scrim,
      // drag) confirmed all three route through onClose() → parent
      // flips `open` → the effect cleanup restores focus on the
      // previously-focused element. Drag-dismiss is NOT a distinct
      // path; focus-return works identically.
      //
      // The real drag-only gap the audit found: when onClose() fires
      // from inside endDrag, React unmounts on the next render (we
      // early-return null on !open at line 120) while the user's
      // finger is still mid-gesture. The 160ms snap-close transition
      // can't run on a removed element, so the last visible frame is
      // whatever dragY was at release — the sheet appears to stop
      // mid-drag and blink out, not slide away. To keep the exit
      // continuous, push dragY to just past the viewport bottom so
      // the final paint before unmount shows the sheet off-screen.
      // transitionMs will still be 0 (dragStart.current is cleared
      // above), so this is an instant jump on the rendered frame —
      // but visually that frame already reads as "the sheet is
      // gone" which is what we want the user to see.
      if (typeof window !== "undefined") {
        setDragY(window.innerHeight);
      }
      onClose();
    } else {
      setDragY(0);
    }
  };

  const translateY = dragY > 0 ? `translate3d(0, ${dragY}px, 0)` : undefined;
  // While actively dragging, we skip the snap transition so the panel
  // tracks the finger 1:1. On release we re-enable it for the spring
  // back (or fall off the screen if dismissing).
  const transitionMs = dragStart.current ? 0 : 160;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      // Prefer the explicit ariaLabel override when given (legacy
      // call sites). When a visible title exists, let the heading
      // label the dialog via aria-labelledby so SR hears the same
      // string sighted users see. Same for description. Fall back
      // to the literal "Dialog" only when neither is available.
      aria-label={ariaLabel || (!title ? "Dialog" : undefined)}
      aria-labelledby={!ariaLabel && title ? titleId : undefined}
      aria-describedby={description ? descId : undefined}
    >
      {/* Scrim: clickable for pointer dismissal, but removed from the
          tab sequence — keyboard users close via Escape (wired in the
          global keydown handler above). A focus-trap panel with an
          invisible full-screen close button as the first tab stop is
          hostile; marking it aria-hidden + tabIndex -1 + removing the
          aria-label routes SR announcements to the actual dialog
          heading / description instead of "Close dialog" every open. */}
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-[fadeIn_120ms_ease-out]"
        style={{
          opacity: dragY > 0 ? Math.max(0.3, 1 - dragY / 320) : undefined,
        }}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        // POLISH-320 — panel height cap. Previously the panel had
        // no max-height, so a sheet with ~500+ px of natural
        // content (OnboardingNudge w/ 3+ bullets, CommandPalette
        // expanded route list, a long settings subsheet) would
        // grow past the viewport on iPhone SE (568px) — pushing
        // the drag handle behind the OS status bar and clipping
        // content off the top with no scroll recovery.
        //
        // 85dvh leaves ~15% at the top for the status bar + a
        // visual "this is a sheet" gap that confirms the sheet
        // doesn't own the whole screen. dvh (dynamic viewport
        // height) instead of vh so Safari's URL-bar collapse
        // doesn't break the cap mid-scroll. flex-col so the
        // content area can scroll internally while the handle
        // stays pinned up top and the footer (if any) stays
        // anchored at the bottom — see the child classes below.
        className="relative w-full sm:max-w-md max-h-[85dvh] flex flex-col rounded-t-3xl sm:rounded-3xl border border-white/10 bg-[#0b1a2e] shadow-2xl outline-none animate-[slideUp_180ms_cubic-bezier(0.2,0.8,0.2,1)]"
        style={{
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          transform: translateY,
          transition: `transform ${transitionMs}ms cubic-bezier(0.2, 0.8, 0.2, 1)`,
          touchAction: "pan-y",
        }}
      >
        {/* Drag handle — mobile-only. Has the pointer listeners so the
            gesture is scoped to the top strip; content inside the sheet
            scrolls and interacts normally.
            POLISH-238: bumped opacity from /25 → /40 for discoverability
            against the dark #0b1a2e panel background, added a group
            hover/active brighten so a user who taps-without-dragging
            gets a visible "yes this is grabbable" acknowledgement.
            Increased vertical padding to pt-3 pb-2 so the hit target
            is ~28px tall (matches iOS native sheet handle region)
            even though the visible pill stays 6px. */}
        <div
          className="group/handle shrink-0 flex justify-center pt-3 pb-2 sm:hidden cursor-grab active:cursor-grabbing touch-none"
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          aria-hidden
        >
          <span className="h-1.5 w-10 rounded-full bg-white/40 transition-colors group-active/handle:bg-white/70" />
        </div>

        {(title || description) && (
          <div className="shrink-0 px-6 pt-4 pb-2">
            {title && (
              <h2 id={titleId} className="text-lg font-semibold text-white">
                {title}
              </h2>
            )}
            {description && (
              <p id={descId} className="mt-1 text-sm text-gray-400">
                {description}
              </p>
            )}
          </div>
        )}

        {/* Children scroll when the panel hits its max-h cap.
            min-h-0 is required on flex children to allow shrinking
            below their intrinsic min-content size (common flex
            scroll footgun). overflow-y-auto + overscroll-contain
            keeps the scroll inside the sheet rather than bouncing
            the underlying page. Chrome/Safari momentum scroll
            behaves naturally with touch-action: pan-y inherited
            from the panel. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-6 pt-2">
          {children}
        </div>

        {footer && (
          <div className="shrink-0 border-t border-white/10 px-6 py-4">{footer}</div>
        )}
      </div>

      <style jsx>{`
        @keyframes slideUp {
          from {
            transform: translateY(20%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
