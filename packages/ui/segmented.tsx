"use client";

import { cn } from "./cn";

export type SegmentedProps<V extends string> = {
  options: { value: V; label: string }[];
  value: V;
  onChange: (value: V) => void;
  /** What the choice is about, for screen readers. */
  label: string;
  className?: string;
};

/** A short choice between views of the same thing, such as this week or next. */
export function Segmented<V extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: SegmentedProps<V>) {
  return (
    <fieldset
      className={cn(
        "m-0 flex min-w-0 rounded-full border-0 bg-surface-2 p-[3px]",
        className,
      )}
    >
      <legend className="sr-only">{label}</legend>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "min-h-11 flex-1 whitespace-nowrap rounded-full px-4 text-base transition-[background-color,color] duration-150",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              selected
                ? "bg-[var(--glass-lens)] font-semibold text-ink shadow-[0_1px_4px_rgb(16_18_26/0.14),inset_0_0.5px_0_var(--glass-edge)]"
                : "font-medium text-ink-2 hover:text-ink",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </fieldset>
  );
}
