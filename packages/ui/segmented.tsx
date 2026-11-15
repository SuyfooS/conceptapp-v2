"use client";

import { cn } from "./cn";

export type SegmentedOption<V extends string> = {
  value: V;
  label: string;
  /**
   * A count beside the label, and what it means for a screen reader ("2
   * shifts short"), which joins the label ("This week, 2 shifts short"), as
   * IconButton's badge does. Nothing shows at 0.
   */
  badge?: { count: number; label: string };
};

export type SegmentedProps<V extends string> = {
  options: SegmentedOption<V>[];
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
        "m-0 flex min-w-0 rounded-full border-0 bg-surface-2 p-[3px]",
        className,
      )}
    >
      <legend className="sr-only">{label}</legend>
      {/* Equal widths, each as wide as the longest label needs. */}
      <div className="relative isolate grid min-w-0 flex-1 grid-flow-col auto-cols-fr">
        {index >= 0 ? (
          <span
            aria-hidden="true"
            style={{
              width: `calc(100% / ${options.length})`,
              insetInlineStart: `calc(100% * ${index / options.length})`,
            }}
            className="absolute inset-y-0 -z-10 rounded-full bg-[var(--glass-lens)] shadow-[0_1px_4px_rgb(16_18_26/0.12)] transition-[inset-inline-start] duration-300 ease-spring"
          />
        ) : null}
        {options.map((option) => {
          const selected = option.value === value;
          const counted =
            option.badge && option.badge.count > 0 ? option.badge : null;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(option.value)}
              className={cn(
                "pressable inline-flex min-h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-4 text-base transition-colors duration-150",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                selected
                  ? "font-semibold text-ink"
                  : "font-medium text-ink-2 hover:text-ink",
              )}
            >
              {option.label}
              {counted ? (
                <>
                  <span
                    aria-hidden="true"
                    className="min-w-5 rounded-full bg-danger px-1.5 text-center font-bold text-danger-ink text-sm leading-5 tabular-nums"
                  >
                    {counted.count}
                  </span>
                  <span className="sr-only">, {counted.label}</span>
                </>
              ) : null}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
