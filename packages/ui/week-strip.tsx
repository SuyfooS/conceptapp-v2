"use client";

import { cn } from "./cn";

export type WeekDay = {
  key: string;
  /** Short day name: א׳, ב׳… */
  label: string;
  /** Day of month, e.g. "13". */
  date: string;
  /** e.g. closed on Shabbat — still selectable, shown muted. */
  muted?: boolean;
  /** A dot under the day, e.g. it has an open shift or a warning. */
  marked?: boolean;
  /** What the dot means, for screen readers ("חסר עובד"). */
  markLabel?: string;
};

export type WeekStripProps = {
  days: WeekDay[];
  value: string;
  onChange: (key: string) => void;
  label: string;
};

/** Seven big day buttons — the phone's way to move through a week. */
export function WeekStrip({ days, value, onChange, label }: WeekStripProps) {
  return (
    <fieldset className="m-0 grid min-w-0 grid-cols-7 gap-1 border-0 p-0">
      <legend className="sr-only">{label}</legend>
      {days.map((d) => {
        const selected = d.key === value;
        return (
          <button
            key={d.key}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(d.key)}
            className={cn(
              "relative flex h-16 flex-col items-center justify-center gap-0.5 rounded-control transition-colors duration-150",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              selected
                ? "bg-accent text-accent-ink"
                : d.muted
                  ? "text-ink-2 hover:bg-surface-2"
                  : "text-ink hover:bg-surface-2",
            )}
          >
            <span className="text-sm">{d.label}</span>
            <span className="font-bold text-md leading-none">{d.date}</span>
            {d.marked && d.markLabel ? (
              <span className="sr-only">{d.markLabel}</span>
            ) : null}
            {d.marked ? (
              <span
                aria-hidden="true"
                className={cn(
                  "absolute bottom-1.5 size-1.5 rounded-full",
                  selected ? "bg-accent-ink" : "bg-warning",
                )}
              />
            ) : null}
          </button>
        );
      })}
    </fieldset>
  );
}
