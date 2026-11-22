"use client";

import { cleanTyped } from "@domain/typed-text";
import type { ReactNode } from "react";
import { ltrInputClass, TextField } from "./text-field";

/** How many characters each kind keeps once its spaces and dashes are gone. */
const LENGTH = { il: 9, document: 20 } as const;

/**
 * A number that names a person (the hiring file, H5a): an Israeli ID, digits
 * only, or a passport's or another document's, letters and digits. It reads
 * left to right and aligns with the page; whatever a phone pastes (Arabic
 * digits, direction marks, spaces and dashes) is tidied as it is typed, so
 * the caller checks what the database would. The field says nothing itself:
 * the caller's check gives the error, in words.
 */
export function IdField({
  label,
  kind,
  value,
  onChange,
  hint,
  error,
  name,
  disabled,
}: {
  label: string;
  /** `il`: nine digits; `document`: up to 20 letters and digits. */
  kind: "il" | "document";
  value: string;
  onChange: (value: string) => void;
  hint?: ReactNode;
  error?: ReactNode;
  name?: string;
  disabled?: boolean;
}) {
  function change(raw: string) {
    const typed = cleanTyped(raw).replace(/[\s.-]/g, "");
    onChange(
      (kind === "il" ? typed.replace(/\D/g, "") : typed).slice(0, LENGTH[kind]),
    );
  }
  return (
    <TextField
      label={label}
      name={name}
      value={value}
      onChange={(event) => change(event.target.value)}
      hint={hint}
      error={error}
      disabled={disabled}
      dir="ltr"
      className={ltrInputClass}
      inputMode={kind === "il" ? "numeric" : "text"}
      autoCapitalize={kind === "il" ? undefined : "characters"}
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
    />
  );
}
