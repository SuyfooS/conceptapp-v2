"use client";

import { Button } from "@ui/button";
import { FieldGroup, GroupedField } from "@ui/field-group";
import { ltrInputClass } from "@ui/text-field";
import { Check, Copy } from "lucide-react";
import { useState } from "react";

/**
 * An invite link shown read-only with a copy button, for the person who
 * made it to send on themselves (WhatsApp, SMS from their phone).
 */
export function CopyLink({
  link,
  label,
  hint,
  copy,
  copied: copiedLabel,
  main = false,
}: {
  link: string;
  label: string;
  hint: string;
  copy: string;
  copied: string;
  /** Copying is the screen's main action, so the button takes the accent. */
  main?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    await navigator.clipboard.writeText(link);
    setCopied(true);
  };

  return (
    <div className="flex w-full min-w-0 flex-col gap-3">
      <FieldGroup className="bg-bg shadow-none">
        <GroupedField
          label={label}
          value={link}
          readOnly
          dir="ltr"
          className={`${ltrInputClass} text-base`}
          onFocus={(event) => event.currentTarget.select()}
          hint={hint}
        />
      </FieldGroup>
      <Button
        type="button"
        variant={main ? "primary" : "secondary"}
        size={main ? "lg" : "md"}
        onClick={onCopy}
        aria-live="polite"
        className="w-full md:w-auto md:self-start"
      >
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        {copied ? copiedLabel : copy}
      </Button>
    </div>
  );
}
