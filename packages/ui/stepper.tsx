"use client";

import { Minus, Plus } from "lucide-react";
import type { KeyboardEventHandler } from "react";
import { cn } from "./cn";
import { IconButton } from "./icon-button";

export type StepperProps = {
  id?: string;
  /** As typed: the field may be empty for a moment while someone types. */
  value: string;
  onValueChange: (value: string) => void;
  min: number;
  max: number;
  decreaseLabel: string;
  increaseLabel: string;
  invalid?: boolean;
  describedBy?: string;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
  /** When the typed number loses focus; the buttons never take it there. */
  onBlur?: () => void;
  className?: string;
};

/**
 * A count: minus, the number, plus. Most changes are one tap either way, and
 * the number is still a field for whoever wants to type it.
 */
export function Stepper({
  id,
  value,
  onValueChange,
  min,
  max,
  decreaseLabel,
  increaseLabel,
  invalid,
  describedBy,
  onKeyDown,
  onBlur,
  className,
}: StepperProps) {
  const current = Number(value);
  const step = (by: number) => {
    const from = Number.isFinite(current) ? current : min;
    onValueChange(String(Math.min(max, Math.max(min, from + by))));
  };
  return (
    <span
      className={cn("flex items-center rounded-full bg-surface-2", className)}
    >
      <IconButton
        label={decreaseLabel}
        icon={<Minus />}
        disabled={current <= min}
        onClick={() => step(-1)}
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
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className="min-h-11 w-9 bg-transparent text-center font-semibold text-md text-ink [appearance:textfield] focus-visible:outline-2 focus-visible:outline-accent aria-invalid:text-danger [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <IconButton
        label={increaseLabel}
        icon={<Plus />}
        disabled={current >= max}
        onClick={() => step(1)}
      />
    </span>
  );
}
