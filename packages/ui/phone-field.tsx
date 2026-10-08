"use client";

import { formatIsraeliMobile, normalizeIsraeliMobile } from "@domain/phone";
import { useState } from "react";
import { cn } from "./cn";
import { ltrInputClass, TextField, type TextFieldProps } from "./text-field";

export type PhoneValue = {
  /** What the person sees: "050-123-4567". */
  display: string;
  /** Canonical "+972501234567", or null until the number is complete and valid. */
  e164: string | null;
};

export type PhoneFieldProps = Omit<
  TextFieldProps,
  "type" | "value" | "defaultValue" | "onChange" | "inputMode" | "dir"
> & {
  /** Initial number in any format (local or +972). */
  defaultValue?: string;
  onPhoneChange?: (value: PhoneValue) => void;
};

/**
 * Israeli mobile number input. Formats as you type, always shows digits
 * left-to-right, and submits the E.164 form under `name` through a hidden
 * input, so server code never parses display formats.
 */
export function PhoneField({
  name,
  defaultValue = "",
  onPhoneChange,
  placeholder = "050-123-4567",
  autoComplete = "tel-national",
  className,
  ...props
}: PhoneFieldProps) {
  const [display, setDisplay] = useState(() =>
    formatIsraeliMobile(defaultValue),
  );
  const e164 = normalizeIsraeliMobile(display);

  return (
    <>
      <TextField
        {...props}
        type="tel"
        inputMode="tel"
        dir="ltr"
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={display}
        onChange={(event) => {
          const next = formatIsraeliMobile(event.target.value);
          setDisplay(next);
          onPhoneChange?.({
            display: next,
            e164: normalizeIsraeliMobile(next),
          });
        }}
        className={cn(ltrInputClass, className)}
      />
      {name ? <input type="hidden" name={name} value={e164 ?? ""} /> : null}
    </>
  );
}
