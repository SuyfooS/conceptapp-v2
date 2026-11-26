"use client";

import { announce } from "@ui/announcer";
import { Button } from "@ui/button";
import { FieldGroup, GroupedField } from "@ui/field-group";
import { ltrInputClass } from "@ui/text-field";
import { Check, Copy } from "lucide-react";
import { type Ref, useId, useRef, useState } from "react";

/**
 * An invite link shown read-only with a copy button, for the person who
 * made it to send on themselves (WhatsApp, SMS from their phone). The
 * button is described by the field's label, so it says whose link it
 * copies, where the focus lands on it (a new link in place of its press).
 * Each copy is said through the page's announcer, the same again too, and
 * never by the button as well. A copy the browser refuses (a permission
 * denied, an app's own browser) is said and shown, and the link is selected
 * in its field, to copy by hand.
 */
export function CopyLink({
  link,
  label,
  hint,
  copy,
  copied: copiedLabel,
  failed: failedLabel,
  main = false,
  buttonRef,
  onCopied,
}: {
  link: string;
  label: string;
  hint: string;
  copy: string;
  copied: string;
  /** What a copy the browser refused says. */
  failed: string;
  /** Copying is the screen's main action, so the button takes the accent. */
  main?: boolean;
  /** The copy button, for a screen that brings the focus there. */
  buttonRef?: Ref<HTMLButtonElement>;
  /**
   * A copy went, after it was said: for a list that moves on to the next
   * person ("עוד לא קיבלו קישור"). Given the copy button. Never for one the
   * browser refused, whose field takes the focus instead.
   */
  onCopied?: (button: HTMLButtonElement) => void;
}) {
  const [copied, setCopied] = useState<"copied" | "failed" | null>(null);
  const labelId = useId();
  const field = useRef<HTMLInputElement>(null);

  const onCopy = async (button: HTMLButtonElement) => {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      setCopied("failed");
      // Its focus selects the link (`onFocus`), read with its label.
      field.current?.focus();
      field.current?.select();
      announce(failedLabel);
      return;
    }
    setCopied("copied");
    announce(copiedLabel);
    onCopied?.(button);
  };

  return (
    <div className="flex w-full min-w-0 flex-col gap-3">
      <FieldGroup className="bg-bg shadow-none">
        <GroupedField
          ref={field}
          label={<span id={labelId}>{label}</span>}
          value={link}
          readOnly
          dir="ltr"
          className={`${ltrInputClass} text-base`}
          onFocus={(event) => event.currentTarget.select()}
          hint={hint}
        />
      </FieldGroup>
      <Button
        ref={buttonRef}
        type="button"
        variant={main ? "primary" : "secondary"}
        size={main ? "lg" : "md"}
        onClick={(event) => onCopy(event.currentTarget)}
        aria-describedby={labelId}
        className="w-full md:w-auto md:self-start"
      >
        {copied === "copied" ? (
          <Check aria-hidden="true" />
        ) : (
          <Copy aria-hidden="true" />
        )}
        {copied === "copied" ? copiedLabel : copy}
      </Button>
      {copied === "failed" ? (
        <p className="px-1 text-danger text-sm">{failedLabel}</p>
      ) : null}
    </div>
  );
}
