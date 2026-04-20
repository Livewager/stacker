"use client";

import { useId } from "react";

/**
 * Dependency-free accessible toggle.
 * - Checkbox input is visually hidden but semantically present.
 * - Label, value and description are readable by screen readers.
 * - Focus ring keyed to theme cyan.
 */

export interface ToggleProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}

export function Toggle({ label, description, checked, onChange, disabled }: ToggleProps) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className={`flex items-start justify-between gap-4 py-3 ${
        disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"
      }`}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-white">{label}</span>
        {description && (
          <span className="mt-0.5 block text-xs text-gray-400 leading-snug">
            {description}
          </span>
        )}
      </span>
      <span className="relative inline-flex shrink-0 items-center">
        <input
          id={id}
          type="checkbox"
          role="switch"
          aria-checked={checked}
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden
          className={`h-6 w-11 rounded-full border transition-colors ${
            checked
              ? "bg-cyan-500/80 border-cyan-300"
              : "bg-white/10 border-white/15"
          } peer-focus-visible:ring-2 peer-focus-visible:ring-cyan-300/60`}
        />
        <span
          aria-hidden
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-[22px]" : "translate-x-0.5"
          }`}
        />
      </span>
    </label>
  );
}
