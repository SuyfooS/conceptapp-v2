"use client";

import { type ComponentProps, type ReactNode, useId } from "react";
import { cn } from "./cn";

export const fieldInputClass = cn(
  "h-11 w-full rounded-control border border-line bg-surface px-3 text-base text-ink",
  "transition-colors duration-150 ease-calm placeholder:text-ink-2",
  "focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-accent/25",
  "disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-ink-2",
  "aria-invalid:border-danger aria-invalid:focus-visible:outline-danger/25",
);

/**
 * For inputs that must read left-to-right (phone, time, numbers): digits stay
 * LTR, but the field still aligns with the surrounding text, i.e. right in a
 * Hebrew form. Put it on an input that has dir="ltr".
 */
export const ltrInputClass = "[:dir(rtl)>&]:text-right";

export type TextFieldProps = ComponentProps<"input"> & {
  label: string;
  /** Helper text under the field. Replaced by the error when there is one. */
  hint?: ReactNode;
  error?: ReactNode;
};

export function TextField({
  label,
  hint,
  error,
  id,
  className,
  ...props
}: TextFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const messageId = `${inputId}-message`;
  const message = error ?? hint;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="font-medium text-ink text-sm">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={message ? messageId : undefined}
        className={cn(fieldInputClass, className)}
        {...props}
      />
      {message ? (
        <p
          id={messageId}
          className={cn("text-sm", error ? "text-danger" : "text-ink-2")}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}

export type TextAreaProps = ComponentProps<"textarea"> & {
  label: string;
  /** Helper text under the field. Replaced by the error when there is one. */
  hint?: ReactNode;
  error?: ReactNode;
};

/** Several lines of text: a pasted list, a note. Same frame as TextField. */
export function TextArea({
  label,
  hint,
  error,
  id,
  className,
  rows = 5,
  ...props
}: TextAreaProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const messageId = `${inputId}-message`;
  const message = error ?? hint;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="font-medium text-ink text-sm">
        {label}
      </label>
      <textarea
        id={inputId}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={message ? messageId : undefined}
        className={cn(fieldInputClass, "h-auto min-h-24 py-2.5", className)}
        {...props}
      />
      {message ? (
        <p
          id={messageId}
          className={cn("text-sm", error ? "text-danger" : "text-ink-2")}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
