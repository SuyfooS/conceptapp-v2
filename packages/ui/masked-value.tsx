"use client";

import { Eye, EyeOff } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";
import { Button } from "./button";

/** What a page says about itself: whether it is on screen, and when that changes. */
export type PageVisibility = Pick<
  Document,
  "visibilityState" | "addEventListener" | "removeEventListener"
>;

/**
 * Asks for a number, and gives it only to a page that stayed on screen the
 * whole way: one put away while it came (another app, the phone locked) gets
 * "away", even when the answer lands as it comes back, so nothing shows that
 * the person didn't watch arrive. A failure is null.
 */
export async function revealWhileShown(
  onReveal: () => Promise<string | null>,
  page: PageVisibility,
): Promise<string | null | "away"> {
  let away = page.visibilityState === "hidden";
  const left = () => {
    if (page.visibilityState === "hidden") away = true;
  };
  page.addEventListener("visibilitychange", left);
  try {
    const value = await onReveal().catch(() => null);
    return away || page.visibilityState === "hidden" ? "away" : value;
  } finally {
    page.removeEventListener("visibilitychange", left);
  }
}

/**
 * A number that stays hidden until asked for (the hiring file, H5a: the
 * person's own ID and account): its last digits after three dots, left to
 * right, and "הצגה", which asks the server for it (`onReveal`). Shown, it
 * hides again after a minute, or as soon as the page is put away; one that
 * arrives while the page is away never shows (`revealWhileShown`). It is
 * never kept anywhere but here while it shows. Its words are the caller's.
 */
export function MaskedValue({
  label,
  masked,
  onReveal,
  showLabel,
  hideLabel,
  hiddenLabel,
  failedLabel,
  hideAfterMs = 60_000,
}: {
  /** What the number is: "מספר זהות". */
  label: string;
  /** "•••0018". */
  masked: string;
  /** The number, or null when it can't be shown now. */
  onReveal: () => Promise<string | null>;
  showLabel: string;
  hideLabel: string;
  /** "מספר זהות, מוסתר. רואים רק את הספרות האחרונות". */
  hiddenLabel: string;
  /** Said when the number didn't come. */
  failedLabel: string;
  hideAfterMs?: number;
}) {
  const [shown, setShown] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const hide = useEffectEvent(() => setShown(null));

  useEffect(() => {
    if (shown === null) return;
    const timer = setTimeout(hide, hideAfterMs);
    const away = () => {
      if (document.visibilityState === "hidden") hide();
    };
    document.addEventListener("visibilitychange", away);
    window.addEventListener("pagehide", hide);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", away);
      window.removeEventListener("pagehide", hide);
    };
  }, [shown, hideAfterMs]);

  async function reveal() {
    setPending(true);
    setFailed(false);
    const value = await revealWhileShown(onReveal, document);
    setPending(false);
    if (value === null) setFailed(true);
    // Put away while it came: it stays hidden, to be asked for again.
    else if (value !== "away") setShown(value);
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <span className="text-ink-2 text-sm">{label}</span>
          <span
            dir="ltr"
            className="self-start font-medium text-md tabular-nums"
          >
            {shown ?? (
              <>
                <span aria-hidden="true">{masked}</span>
                <span className="sr-only">{hiddenLabel}</span>
              </>
            )}
          </span>
        </div>
        <Button
          variant="secondary"
          loading={pending}
          onClick={() => (shown === null ? reveal() : setShown(null))}
          className="shrink-0"
        >
          {pending ? null : shown === null ? (
            <Eye aria-hidden="true" />
          ) : (
            <EyeOff aria-hidden="true" />
          )}
          {shown === null ? showLabel : hideLabel}
        </Button>
      </div>
      {failed ? (
        <p role="alert" className="text-danger text-sm">
          {failedLabel}
        </p>
      ) : null}
    </div>
  );
}
