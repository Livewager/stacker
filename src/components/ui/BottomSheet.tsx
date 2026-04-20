"use client";

import { useEffect, useRef } from "react";
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

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = (document.activeElement as HTMLElement) || null;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
      if (e.key === "Tab" && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const t = window.setTimeout(() => {
      const focusTarget =
        panelRef.current?.querySelector<HTMLElement>("[data-autofocus]") ||
        panelRef.current?.querySelector<HTMLElement>("button, a, input") ||
        panelRef.current;
      focusTarget?.focus();
    }, 40);

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      window.clearTimeout(t);
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel || title || "Dialog"}
    >
      <button
        type="button"
        aria-label="Close dialog"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-[fadeIn_120ms_ease-out]"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border border-white/10 bg-[#0b1a2e] shadow-2xl outline-none animate-[slideUp_180ms_cubic-bezier(0.2,0.8,0.2,1)]"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {/* Drag handle (decorative) */}
        <div className="flex justify-center pt-2 pb-1 sm:hidden">
          <span aria-hidden className="h-1.5 w-10 rounded-full bg-white/25" />
        </div>

        {(title || description) && (
          <div className="px-6 pt-4 pb-2">
            {title && (
              <h2 className="text-lg font-semibold text-white">{title}</h2>
            )}
            {description && (
              <p className="mt-1 text-sm text-gray-400">{description}</p>
            )}
          </div>
        )}

        <div className="px-6 pb-6 pt-2">{children}</div>

        {footer && (
          <div className="border-t border-white/10 px-6 py-4">{footer}</div>
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
