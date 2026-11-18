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
  /** The dot's colour: warning by default, accent for the person's own days. */
  markTone?: "warning" | "accent";
  /** What the dot or the coverage means, for screen readers ("חסר עובד"). */
  markLabel?: string;
  /** A small line under the date, such as candle lighting on Friday. */
  note?: string;
  /** How much of the day is filled, 0 to 1. Shown as a thin track. */
  coverage?: number;
};

export type WeekStripProps = {
  days: WeekDay[];
  value: string;
  onChange: (key: string) => void;
  label: string;
};

/**
 * The week in one line, Sunday first. The same shape wherever a week
 * appears; a history (the lists' overview) passes its own seven days, today
 * last, in the same shape.
 */
export function WeekStrip({ days, value, onChange, label }: WeekStripProps) {
  return (
    <fieldset className="m-0 grid min-w-0 grid-cols-7 gap-0.5 rounded-card border-0 bg-surface p-1.5 shadow-card">
      <legend className="sr-only">{label}</legend>
      {days.map((d) => {
        const selected = d.key === value;
        const full = d.coverage !== undefined && d.coverage >= 1;
        return (
          <button
            key={d.key}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(d.key)}
            className={cn(
              "pressable relative flex min-h-[76px] flex-col items-center justify-start gap-0.5 rounded-[18px] pt-2 pb-1.5 transition-[background-color,color,transform]",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              selected
                ? "bg-ink text-bg"
                : d.muted
                  ? "text-ink-2 hover:bg-surface-2"
                  : "text-ink hover:bg-surface-2",
            )}
          >
            <span
              className={cn("text-[12px] leading-4", !selected && "text-ink-2")}
            >
              {d.label}
            </span>
            <span className="font-bold text-[19px] leading-6">{d.date}</span>
            {d.note ? (
              <span
                dir="ltr"
                className={cn(
                  "text-[10.5px] leading-[13px]",
                  !selected && "text-ink-2",
                )}
              >
                {d.note}
              </span>
            ) : null}
            {d.marked && d.markLabel ? (
              <span className="sr-only">{d.markLabel}</span>
            ) : null}
            {d.coverage !== undefined ? (
              <span
                aria-hidden="true"
                className={cn(
                  "mt-auto h-[3px] w-[22px] overflow-hidden rounded-full",
                  selected ? "bg-bg/40" : "bg-surface-2",
                )}
              >
                <span
                  className={cn(
                    "block h-full rounded-full transition-[width] duration-300",
                    selected ? "bg-bg" : full ? "bg-success" : "bg-warning",
                  )}
                  style={{ width: `${Math.round(d.coverage * 100)}%` }}
                />
              </span>
            ) : d.marked ? (
              <span
                aria-hidden="true"
                className={cn(
                  "mt-auto size-1.5 rounded-full",
                  selected
                    ? "bg-bg"
                    : d.markTone === "accent"
                      ? "bg-accent"
                      : "bg-warning",
                )}
              />
            ) : null}
          </button>
        );
      })}
    </fieldset>
  );
}
