"use client";

import { Button } from "@ui/button";
import { FieldGroup, GroupedField } from "@ui/field-group";
import { ltrInputClass } from "@ui/text-field";
import { Check, Copy } from "lucide-react";
import { type Ref, useId, useState } from "react";

/**
 * An invite link shown read-only with a copy button, for the person who
 * made it to send on themselves (WhatsApp, SMS from their phone). The
 * button is described by the field's label, so it says whose link it
 * copies, where the focus lands on it (a new link in place of its press).
 */
export function CopyLink({
  link,
  label,
  hint,
  copy,
  copied: copiedLabel,
  main = false,
  buttonRef,
}: {
  link: string;
  label: string;
  hint: string;
  copy: string;
  copied: string;
  /** Copying is the screen's main action, so the button takes the accent. */
  main?: boolean;
  /** The copy button, for a screen that brings the focus there. */
  buttonRef?: Ref<HTMLButtonElement>;
}) {
  const [copied, setCopied] = useState(false);
  const labelId = useId();

  const onCopy = async () => {
    await navigator.clipboard.writeText(link);
    setCopied(true);
  };

  return (
    <div className="flex w-full min-w-0 flex-col gap-3">
      <FieldGroup className="bg-bg shadow-none">
        <GroupedField
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
        onClick={onCopy}
        aria-live="polite"
        aria-describedby={labelId}
        className="w-full md:w-auto md:self-start"
      >
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        {copied ? copiedLabel : copy}
      </Button>
    </div>
  );
}
