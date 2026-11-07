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

/**
 * A short choice between views of the same thing, such as this week or next. A
 * lens slides to the choice with a spring, after Rubber Segment from React Bits
 * (see packages/ui/README.md).
 */
export function Segmented<V extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: SegmentedProps<V>) {
  const index = options.findIndex((option) => option.value === value);
  return (
    <fieldset
      className={cn(
        "relative isolate m-0 flex min-w-0 rounded-full border-0 bg-surface-2 p-[3px]",
        className,
      )}
    >
      <legend className="sr-only">{label}</legend>
      {index >= 0 ? (
        <span
          aria-hidden="true"
          style={{
            width: `calc((100% - 6px) / ${options.length})`,
            insetInlineStart: `calc(3px + (100% - 6px) * ${index / options.length})`,
          }}
          className="absolute inset-y-[3px] -z-10 rounded-full bg-[var(--glass-lens)] shadow-[0_1px_4px_rgb(16_18_26/0.12)] transition-[inset-inline-start] duration-300 ease-spring"
        />
      ) : null}
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "pressable min-h-11 min-w-0 flex-1 basis-0 whitespace-nowrap rounded-full px-4 text-base transition-colors duration-150",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              selected
                ? "font-semibold text-ink"
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
