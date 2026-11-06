"use client";

import { formatIsraeliMobile, normalizeIsraeliMobile } from "@domain/phone";
import { type ComponentProps, type ReactNode, useId, useState } from "react";
import { cn } from "./cn";
import { ltrInputClass } from "./text-field";

/**
 * Fields as a grouped list: one soft card with hairlines between its rows,
 * the same as a list of people, instead of a stack of outlined boxes. There is
 * no box at rest; when the device asks for more contrast, each row gets an edge.
 */
export function FieldGroup({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-card bg-surface shadow-card",
        className,
      )}
      {...props}
    />
  );
}

type Frame = {
  label: string;
  /** Helper text under the field. Replaced by the error when there is one. */
  hint?: ReactNode;
  error?: ReactNode;
  /** An avatar or icon at the start of the row. */
  leading?: ReactNode;
};

function Row({
  id,
  label,
  hint,
  error,
  leading,
  children,
}: Frame & { id: string; children: ReactNode }) {
  const message = error ?? hint;
  return (
    <div
      className={cn(
        "relative flex items-center transition-shadow duration-150 ease-calm",
        "not-first:before:absolute not-first:before:end-0 not-first:before:top-0 not-first:before:h-px not-first:before:bg-line not-first:before:content-['']",
        leading ? "not-first:before:start-[68px]" : "not-first:before:start-4",
        "contrast-more:shadow-[inset_0_0_0_1px_var(--edge)]",
        "focus-within:rounded-card focus-within:shadow-[inset_0_0_0_2px_var(--accent)]",
        error && "rounded-card shadow-[inset_0_0_0_2px_var(--danger)]",
      )}
    >
      {leading ? (
        <span aria-hidden="true" className="ms-4 shrink-0">
          {leading}
        </span>
      ) : null}
      <div className={cn("flex min-w-0 flex-1 flex-col", leading && "-ms-1")}>
        <label
          htmlFor={id}
          className="cursor-text px-4 pt-2.5 font-medium text-ink-2 text-sm"
        >
          {label}
        </label>
        {children}
        {message ? (
          <p
            id={`${id}-message`}
            className={cn(
              "px-4 pb-2.5 text-sm",
              error ? "text-danger" : "text-ink-2",
            )}
          >
            {message}
          </p>
        ) : null}
      </div>
    </div>
  );
}

const inputClass = cn(
  "w-full bg-transparent px-4 pb-2.5 text-md text-ink outline-none",
  "placeholder:text-ink-3 disabled:cursor-not-allowed disabled:text-ink-2",
);

export type GroupedFieldProps = ComponentProps<"input"> & Frame;

/** One line of text, as a row in a FieldGroup. */
export function GroupedField({
  label,
  hint,
  error,
  leading,
  id,
  className,
  ...props
}: GroupedFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <Row id={inputId} label={label} hint={hint} error={error} leading={leading}>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${inputId}-message` : undefined}
        className={cn(inputClass, className)}
        {...props}
      />
    </Row>
  );
}

export type GroupedTextAreaProps = ComponentProps<"textarea"> & Frame;

/** Several lines of text, as a row in a FieldGroup. */
export function GroupedTextArea({
  label,
  hint,
  error,
  leading,
  id,
  className,
  rows = 5,
  ...props
}: GroupedTextAreaProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <Row id={inputId} label={label} hint={hint} error={error} leading={leading}>
      <textarea
        id={inputId}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${inputId}-message` : undefined}
        className={cn(inputClass, "resize-none", className)}
        {...props}
      />
    </Row>
  );
}

export type GroupedPhoneFieldProps = Omit<
  GroupedFieldProps,
  "type" | "value" | "defaultValue" | "onChange" | "inputMode" | "dir"
> & {
  /** Initial number in any format (local or +972). */
  defaultValue?: string;
};

/**
 * The Israeli mobile field, as a row in a FieldGroup. Like PhoneField it formats
 * as you type, keeps digits left to right, and submits the E.164 form under
 * `name` through a hidden input.
 */
export function GroupedPhoneField({
  name,
  defaultValue = "",
  placeholder = "050-123-4567",
  autoComplete = "tel-national",
  className,
  ...props
}: GroupedPhoneFieldProps) {
  const [display, setDisplay] = useState(() =>
    formatIsraeliMobile(defaultValue),
  );
  return (
    <>
      <GroupedField
        {...props}
        type="tel"
        inputMode="tel"
        dir="ltr"
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={display}
        onChange={(event) =>
          setDisplay(formatIsraeliMobile(event.target.value))
        }
        className={cn(ltrInputClass, className)}
      />
      {name ? (
        <input
          type="hidden"
          name={name}
          value={normalizeIsraeliMobile(display) ?? ""}
        />
      ) : null}
    </>
  );
}
