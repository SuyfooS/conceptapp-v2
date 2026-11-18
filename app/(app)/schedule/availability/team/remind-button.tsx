"use client";

import { dateIn, weekdayOf } from "@domain/availability";
import { WEEKDAY_KEYS } from "@domain/availability-form";
import { timeIn } from "@domain/shabbat";
import { weekRange } from "@domain/share";
import { Button } from "@ui/button";
import { ShareSheet } from "@ui/share-sheet";
import { MessageCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import type { AvailabilityWeek } from "../../week";

/** What the reminder needs, beyond the week itself. */
export type Remind = {
  /** The business's name, as the team knows it. */
  business: string;
  /** The due moment has passed: late answers are still taken. */
  late: boolean;
  /** Where each person sends theirs: "/schedule/availability", or a twin's. */
  path: `/${string}`;
};

/**
 * The team availability screen's main action while someone hasn't sent next
 * week's: one message for the whole team (`ShareSheet`), with the week and
 * the due moment, or that it is still not too late. It never says who is
 * missing: each person sees only their own availability, so a group would
 * read what the screen keeps from them.
 */
export function RemindButton({
  business,
  late,
  path,
  week,
}: Remind & {
  /** Next week: its dates, due moment and zone. */
  week: Pick<AvailabilityWeek, "dates" | "dueAt" | "timeZone">;
}) {
  const t = useTranslations("app.availability");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const due = new Date(week.dueAt);
  const words = {
    business,
    range: weekRange(locale, week.dates),
    day: t(
      `weekdays.${WEEKDAY_KEYS[weekdayOf(dateIn(due, week.timeZone))] ?? "sun"}`,
    ),
    time: timeIn(due, week.timeZone),
  };
  return (
    <>
      <Button size="lg" onClick={() => setOpen(true)}>
        <MessageCircle aria-hidden="true" />
        {t("team.remind.action")}
      </Button>
      <ShareSheet
        open={open}
        onOpenChange={setOpen}
        title={t("team.remind.title")}
        message={t(late ? "team.remind.textLate" : "team.remind.text", words)}
        path={path}
      />
    </>
  );
}
