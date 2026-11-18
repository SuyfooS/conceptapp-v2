"use client";

import { shareText, whatsappHref } from "@domain/share";
import { Check, Copy, MessageCircle, Share } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "./button";
import { cn } from "./cn";
import { Sheet } from "./sheet";
import { ltrInputClass } from "./text-field";

export type ShareSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What is shared ("שיתוף הסידור"). */
  title: string;
  /** The sentence, in the business's words, without the link. */
  message: string;
  /** Where the link leads: a path of the app, made whole on this device. */
  path: `/${string}`;
  /** Where the keyboard's focus goes once it has closed (`Sheet`). */
  returnFocus?: () => HTMLElement | null | undefined;
};

/**
 * A message for the team, shown as it will go out, with three ways to send
 * it on: WhatsApp (no number, so WhatsApp asks whom), the device's own share
 * sheet where it has one, and a copy. The app never sends it itself, so it
 * holds only what everyone it may reach can read already.
 *
 * The sentence and the link go as one text: given both a text and a link,
 * some apps on an iPhone keep only one of them. The link is made whole from
 * the address the person opened the app on, once the sheet is open.
 */
export function ShareSheet({
  open,
  onOpenChange,
  title,
  message,
  path,
  returnFocus,
}: ShareSheetProps) {
  const t = useTranslations("ui.share");
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  /** The share sheet didn't open: its button goes, and the line says so. */
  const [shareFailed, setShareFailed] = useState(false);
  /** The address the app was opened on, read as the sheet opens. */
  const [origin, setOrigin] = useState<string | null>(null);

  // Each opening starts afresh: what the last one said is over. Closed, the
  // sheet draws nothing, so the server never needs the address.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setCopied(false);
      setCopyFailed(false);
      setShareFailed(false);
      setOrigin(window.location.origin);
    }
  }

  const link = origin ? new URL(path, origin).href : path;
  const text = shareText(message, link);
  const shareable =
    !shareFailed &&
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    (typeof navigator.canShare !== "function" || navigator.canShare({ text }));

  async function shareOther() {
    try {
      await navigator.share({ text });
      onOpenChange(false);
    } catch (error) {
      // The person backed out of the share sheet: nothing to say.
      if (error instanceof DOMException && error.name === "AbortError") return;
      setShareFailed(true);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setCopyFailed(false);
    } catch {
      setCopied(false);
      setCopyFailed(true);
    }
  }

  const failure = copyFailed
    ? t("copyFailed")
    : shareFailed
      ? t("shareFailed")
      : null;

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      closeLabel={t("close")}
      returnFocus={returnFocus}
    >
      <div className="flex flex-col gap-4 px-2 pb-1">
        <figure className="flex flex-col gap-1.5">
          <figcaption className="px-1 text-ink-2 text-sm">
            {t("preview")}
          </figcaption>
          {/* Copying failed: one tap takes the whole message, to copy by hand. */}
          <div
            className={cn(
              "rounded-card bg-elevated px-4 py-3 shadow-card",
              copyFailed && "select-all",
            )}
          >
            <p className="text-md">{message}</p>
            <p
              dir="ltr"
              className={cn(
                ltrInputClass,
                "mt-1 text-base text-ink-2 [overflow-wrap:anywhere]",
              )}
            >
              {link}
            </p>
          </div>
        </figure>
        <div className="flex flex-col gap-1 px-1">
          <p className="text-base text-ink-2">{t("note")}</p>
          <p role="status" className="font-medium text-base">
            {failure}
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <Button asChild size="lg">
            <a
              href={whatsappHref(text)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => onOpenChange(false)}
            >
              <MessageCircle aria-hidden="true" />
              {t("whatsapp")}
            </a>
          </Button>
          {shareable ? (
            <Button size="lg" variant="secondary" onClick={shareOther}>
              <Share aria-hidden="true" />
              {t("other")}
            </Button>
          ) : null}
          <Button size="lg" variant="ghost" onClick={copy} aria-live="polite">
            {copied ? (
              <Check aria-hidden="true" />
            ) : (
              <Copy aria-hidden="true" />
            )}
            {copied ? t("copied") : t("copy")}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
