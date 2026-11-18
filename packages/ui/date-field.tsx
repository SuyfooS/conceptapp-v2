"use client";

import type { DateParts } from "@domain/typed-date";
import { cleanTyped } from "@domain/typed-text";
import { type ReactNode, type Ref, useId, useRef } from "react";
import { cn } from "./cn";
import { fieldInputClass } from "./text-field";

export type DateFieldProps = {
  /** What the day is: "תאריך לידה", "מתאריך". */
  label: string;
  /** The three fields' own names, under each one: "יום", "חודש", "שנה". */
  parts: { day: string; month: string; year: string };
  value: DateParts;
  onChange: (value: DateParts) => void;
  /** Helper text under the fields. Replaced by the error when there is one. */
  hint?: ReactNode;
  error?: ReactNode;
  /** `bday` for a birth date: the browser may offer the person's own. */
  autoComplete?: "bday" | "off";
  disabled?: boolean;
  /** The first field gets the focus when the error is said. */
  firstRef?: Ref<HTMLInputElement>;
};

/** How many digits each field holds before the next one takes the typing. */
const LENGTH = { day: 2, month: 2, year: 4 } as const;
type Part = keyof typeof LENGTH;

/**
 * A day typed as three numbers, day, month and year, and never picked from a
 * wheel (profile design §3.5). The fields read left to right as a date is
 * written ("15 / 4 / 2009") in either language, take digits only, and move on
 * to the next once one is full. `@domain/typed-date` reads the three
 * (`parseTypedDate`), the same in the browser and on the server.
 */
export function DateField({
  label,
  parts,
  value,
  onChange,
  hint,
  error,
  autoComplete = "off",
  disabled = false,
  firstRef,
}: DateFieldProps) {
  const id = useId();
  const messageId = `${id}-message`;
  const message = error ?? hint;
  const refs = {
    month: useRef<HTMLInputElement>(null),
    year: useRef<HTMLInputElement>(null),
  };

  function change(part: Part, raw: string) {
    // Digits only, as many as the field holds: Arabic-Indic, Persian and
    // full-width ones as 0-9 first, direction marks dropped (`cleanTyped`).
    const digits = cleanTyped(raw).replace(/\D/g, "").slice(0, LENGTH[part]);
    onChange({ ...value, [part]: digits });
    if (digits.length === LENGTH[part]) {
      if (part === "day") refs.month.current?.focus();
      if (part === "month") refs.year.current?.focus();
    }
  }

  const field = (part: Part, className: string) => (
    <div className={cn("flex flex-col gap-1", className)}>
      <input
        ref={
          part === "day" ? firstRef : part === "month" ? refs.month : refs.year
        }
        id={`${id}-${part}`}
        value={value[part]}
        onChange={(event) => change(part, event.target.value)}
        inputMode="numeric"
        autoComplete={autoComplete === "bday" ? `bday-${part}` : "off"}
        maxLength={LENGTH[part]}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={message ? messageId : undefined}
        className={cn(fieldInputClass, "text-center tabular-nums")}
      />
      <label
        htmlFor={`${id}-${part}`}
        className="text-center text-ink-2 text-sm"
      >
        {parts[part]}
      </label>
    </div>
  );

  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0">
      <legend className="mb-1.5 font-medium text-ink text-sm">{label}</legend>
      <div dir="ltr" className="flex items-start gap-2 self-start">
        {field("day", "w-16")}
        {field("month", "w-16")}
        {field("year", "w-24")}
      </div>
      {message ? (
        <p
          id={messageId}
          className={cn("text-sm", error ? "text-danger" : "text-ink-2")}
        >
          {message}
        </p>
      ) : null}
    </fieldset>
  );
}
