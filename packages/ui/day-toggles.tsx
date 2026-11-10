"use client";

import { cn } from "./cn";

export type DayTogglesProps = {
  /** What the days are for, said above them ("באילו ימים"). */
  legend: string;
  /** The days on, 0 = Sunday. */
  value: readonly number[];
  /** The days on now, in order. */
  onChange: (days: number[]) => void;
  /** Sunday first: the short name each button shows, and the full one it says. */
  days: readonly { short: string; long: string }[];
  disabled?: boolean;
  className?: string;
};

/**
 * The days of the week as seven round toggles, Sunday first, each 44px and
 * named in full for screen readers. One tap turns a day on or off. Used for a
 * shift's days on /manage and a list's times in its editor.
 */
export function DayToggles({
  legend,
  value,
  onChange,
  days,
  disabled = false,
  className,
}: DayTogglesProps) {
  const toggle = (day: number) =>
    onChange(
      value.includes(day)
        ? value.filter((other) => other !== day)
        : [...value, day].sort((a, b) => a - b),
    );
  return (
    <fieldset
      disabled={disabled}
      className={cn("m-0 flex min-w-0 flex-col gap-2 border-0 p-0", className)}
    >
      <legend className="px-2 pb-2 font-medium">{legend}</legend>
      <div className="flex flex-wrap justify-between gap-1 px-1">
        {days.map((day, index) => {
          const on = value.includes(index);
          return (
            <button
              key={day.long}
              type="button"
              aria-pressed={on}
              aria-label={day.long}
              onClick={() => toggle(index)}
              className={cn(
                "pressable grid size-11 place-items-center rounded-full font-semibold transition-colors duration-150",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                "disabled:opacity-50",
                on ? "bg-accent text-accent-ink" : "bg-surface-2 text-ink-2",
              )}
            >
              {day.short}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
