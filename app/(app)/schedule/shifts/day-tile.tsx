"use client";

import { weekdayOf } from "@domain/availability";
import { WEEKDAY_KEYS } from "@domain/availability-form";
import { useTranslations } from "next-intl";

/** The day of a shift at a glance, as on the week strip. */
export function DayTile({ date }: { date: string }) {
  const tDays = useTranslations("days");
  return (
    <span
      aria-hidden="true"
      className="flex size-10 shrink-0 flex-col items-center justify-center rounded-[13px] bg-surface-2 leading-none"
    >
      <span className="font-medium text-[11px] text-ink-2">
        {tDays(`${WEEKDAY_KEYS[weekdayOf(date)] ?? "sun"}.short`)}
      </span>
      <span className="font-bold text-md">{Number(date.slice(8))}</span>
    </span>
  );
}
