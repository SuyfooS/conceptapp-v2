"use client";

import { Button } from "@ui/button";
import { focusFirst } from "@ui/focus-after";
import { Sheet } from "@ui/sheet";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { closeHeldForRefusal } from "./clock-focus";
import type { ClockActionResult } from "./clock-types";

type Failure = Exclude<ClockActionResult, { ok: true }>["failure"];

/**
 * Clocking in or out without a code, for whoever can't type or scan it: the
 * time is kept as it is now, the entry is marked, and a manager approves it.
 * It says the time before it is pressed, so nothing comes as a surprise.
 * A refusal keeps the sheet, and says why once nothing is on its way, with
 * the focus back on the press first (busy meanwhile, so it lost it, and
 * Radix put it on the sheet's frame): said before that move, it would be
 * cut off. Until it has said it, ✕, Escape, the scrim or a swipe close
 * nothing: the page read again comes after the answer, and a sheet closed
 * meanwhile would take the refusal along unsaid.
 */
export function WithoutCodeSheet({
  open,
  onOpenChange,
  returnFocus,
  direction,
  now,
  timeZone,
  pending,
  failure,
  onConfirm,
  onBack,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Where the focus goes once it has closed (Sheet's `returnFocus`): it
   * opens from the camera or the digits' sheet, gone as it opens.
   */
  returnFocus?: () => HTMLElement | null | undefined;
  direction: "in" | "out";
  /** The time now, ticking. */
  now: number;
  /** The business's, for the time shown. */
  timeZone: string;
  pending: boolean;
  failure: Failure | null;
  onConfirm: () => void;
  /** Back to scanning the code. */
  onBack?: () => void;
}) {
  const t = useTranslations("app.clock");
  const format = useFormatter();
  const at = new Date(now);
  const confirm = useRef<HTMLButtonElement>(null);
  const [said, setSaid] = useState<Failure | null>(null);
  useEffect(() => {
    if (failure === null) {
      setSaid(null);
      return;
    }
    if (pending) return;
    focusFirst([confirm.current], { title: false });
    setSaid(failure);
  }, [failure, pending]);
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (closeHeldForRefusal(next, { failure, said })) return;
        onOpenChange(next);
      }}
      returnFocus={returnFocus}
      title={t(direction === "in" ? "none.titleIn" : "none.titleOut")}
      closeLabel={t("team.sheet.close")}
    >
      <div className="flex flex-col items-center gap-3 px-2 pt-1 text-center">
        <time
          dateTime={at.toISOString()}
          dir="ltr"
          className="font-bold text-2xl text-ink tabular-nums"
        >
          {format.dateTime(at, {
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23",
            timeZone,
          })}
        </time>
        <p className="text-ink-2">{t("none.body")}</p>
        {said ? (
          <p role="alert" className="font-medium text-danger">
            {t(`failure.${said}`)}
          </p>
        ) : null}
        <Button
          ref={confirm}
          size="lg"
          className="w-full"
          loading={pending}
          onClick={onConfirm}
        >
          {t(direction === "in" ? "none.confirmIn" : "none.confirmOut")}
        </Button>
        {onBack ? (
          <Button
            variant="ghost"
            className="w-full"
            disabled={pending}
            onClick={onBack}
          >
            {t("none.back")}
          </Button>
        ) : null}
      </div>
    </Sheet>
  );
}
