"use client";

import { Minus, Plus } from "lucide-react";
import type { KeyboardEventHandler } from "react";
import { announce } from "./announcer";
import { cn } from "./cn";
import { IconButton } from "./icon-button";

export type StepperProps = {
  id?: string;
  /** As typed: the field may be empty for a moment while someone types. */
  value: string;
  onValueChange: (value: string) => void;
  /**
   * A press of minus or plus, when it is told apart from typing: a setting
   * saves a press soon after it, and what is typed only once it is left, so
   * nothing half typed is saved. Without it a press goes to `onValueChange`.
   */
  onStep?: (value: string) => void;
  min: number;
  max: number;
  decreaseLabel: string;
  increaseLabel: string;
  /**
   * Names the number for screen readers when no visible label points at it
   * with `htmlFor` (a count beside an item's own name, say).
   */
  label?: string;
  /**
   * What is said after a press of minus or plus, the new number given: the
   * number alone by default ("3"), never on typing.
   */
  spoken?: (value: number) => string;
  /** Room for four digits (an order's count), not two. */
  wide?: boolean;
  invalid?: boolean;
  describedBy?: string;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
  /** When the typed number loses focus; the buttons never take it there. */
  onBlur?: () => void;
  /** Nothing changes it (a view session): both buttons and the number. */
  disabled?: boolean;
  className?: string;
};

/**
 * The number one step from `value` (as typed: an empty field counts from
 * nothing), kept between `min` and `max`; null when the step changes
 * nothing, at an end.
 */
export function stepped(
  value: string,
  by: number,
  min: number,
  max: number,
): string | null {
  const current = Number(value);
  const from = Number.isFinite(current) ? current : min;
  const next = String(Math.min(max, Math.max(min, from + by)));
  return next === value ? null : next;
}

/**
 * A count: minus, the number, plus. Most changes are one tap either way, and
 * the number is still a field for whoever wants to type it. A press says
 * the new number to a screen reader (`spoken`), as the field it doesn't
 * move the focus to would. At an end its button dims and does nothing, but
 * keeps the focus, so the keyboard isn't thrown to the top of the page.
 */
export function Stepper({
  id,
  value,
  onValueChange,
  onStep = onValueChange,
  min,
  max,
  decreaseLabel,
  increaseLabel,
  label,
  spoken,
  wide = false,
  invalid,
  describedBy,
  onKeyDown,
  onBlur,
  disabled = false,
  className,
}: StepperProps) {
  const current = Number(value);
  const atMin = current <= min;
  const atMax = current >= max;
  const step = (by: number) => {
    const next = stepped(value, by, min, max);
    if (next === null) return;
    onStep(next);
    announce(spoken ? spoken(Number(next)) : next);
  };
  return (
    <span
      className={cn("flex items-center rounded-full bg-surface-2", className)}
    >
      <IconButton
        label={decreaseLabel}
        icon={<Minus />}
        disabled={disabled}
        aria-disabled={atMin || undefined}
        onClick={() => {
          if (!atMin) step(-1);
        }}
      />
      <input
        id={id}
        type="number"
        dir="ltr"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        disabled={disabled}
        aria-label={label}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className={cn(
          "min-h-11 bg-transparent text-center font-semibold text-md text-ink [appearance:textfield] focus-visible:outline-2 focus-visible:outline-accent aria-invalid:text-danger [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
          wide ? "w-14" : "w-9",
        )}
      />
      <IconButton
        label={increaseLabel}
        icon={<Plus />}
        disabled={disabled}
        aria-disabled={atMax || undefined}
        onClick={() => {
          if (!atMax) step(1);
        }}
      />
    </span>
  );
}
