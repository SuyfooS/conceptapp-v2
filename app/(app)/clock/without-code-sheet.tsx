"use client";

import { Button } from "@ui/button";
import { Sheet } from "@ui/sheet";
import { useFormatter, useTranslations } from "next-intl";
import type { ClockActionResult } from "./clock-types";

type Failure = Exclude<ClockActionResult, { ok: true }>["failure"];

/**
 * Clocking in or out without a code, for whoever can't type or scan it: the
 * time is kept as it is now, the entry is marked, and a manager approves it.
 * It says the time before it is pressed, so nothing comes as a surprise.
 */
export function WithoutCodeSheet({
  open,
  onOpenChange,
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
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
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
        {failure ? (
          <p role="alert" className="font-medium text-danger">
            {t(`failure.${failure}`)}
          </p>
        ) : null}
        <Button
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
