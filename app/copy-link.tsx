"use client";

import { Button } from "@ui/button";
import { ltrInputClass, TextField } from "@ui/text-field";
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
}: {
  link: string;
  label: string;
  hint: string;
  copy: string;
  copied: string;
}) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    await navigator.clipboard.writeText(link);
    setCopied(true);
  };

  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      <TextField
        label={label}
        value={link}
        readOnly
        dir="ltr"
        className={ltrInputClass}
        onFocus={(event) => event.currentTarget.select()}
        hint={hint}
      />
      <Button
        type="button"
        variant="secondary"
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
