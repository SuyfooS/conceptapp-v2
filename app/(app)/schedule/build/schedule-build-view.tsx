import { weekDates, weekdayOf } from "@domain/availability";
import { dayMonth, WEEKDAY_KEYS } from "@domain/availability-form";
import type { ShiftSwap } from "@domain/swaps";
import { Button } from "@ui/button";
import { EmptyState } from "@ui/empty-state";
import { PageBody, PageHeader } from "@ui/page";
import { CalendarCheck } from "lucide-react";
import Link from "next/link";
import { type AppWording, translator } from "../../wording";
import type { ShareWeek } from "../share-week";
import { ltr } from "../shifts/shift-text";
import type { ScheduleBuildWeek } from "../week";
import type { ScheduleState } from "./actions";
import { type BuilderWeeks, ScheduleBuilder } from "./schedule-builder";

/**
 * The page around the builder. Also rendered with mock data on
 * /design/shell/schedule/build and /design/shell/schedule/build/running.
 */
export function ScheduleBuildView({
  data,
  swaps,
  save,
  backHref = "/schedule",
  manageHref = "/manage/scheduling",
  running,
  publishes = true,
  share = null,
  wording,
}: {
  data: ScheduleBuildWeek;
  /** The week's waiting swap requests, for the warning before publishing. */
  swaps: ShiftSwap[];
  save: (prev: ScheduleState, form: FormData) => Promise<ScheduleState>;
  /** Where "back" goes: the schedule's entry, or the demo's. */
  backHref?: string;
  /**
   * Where the regular shifts are set; null for someone who can't open the
   * management page.
   */
  manageHref?: string | null;
  /**
   * Which of the two weeks this is, the moment the server read it, and the
   * switch between them. Without it (the next-week demo) the screen is next
   * week's, with no switch, on the demo's own moment.
   */
  running?: BuilderWeeks;
  /**
   * The person publishes the schedule too (`publishesSchedule`): without it
   * they save drafts, and read a published week. True unless said otherwise.
   */
  publishes?: boolean;
  /**
   * Sharing the week with the team once it is published: the business's
   * name and the schedule tab the link opens. None while viewing as a role.
   */
  share?: ShareWeek | null;
  /** The business's words. */
  wording: AppWording;
}) {
  const t = translator(wording, "app.build");
  const tm = translator(wording, "modules.scheduling");
  const { week } = data;
  return (
    <PageBody>
      <PageHeader
        title={t(running?.which === "this" ? "titleRunning" : "title")}
        eyebrow={t.rich("subtitle", {
          from: dayMonth(week.start),
          to: dayMonth(week.dates.at(-1) ?? week.start),
          ltr,
        })}
        back={{ href: backHref, label: tm("name") }}
      />
      <ScheduleBuilder
        // Another week is another screen: its work, its day and what the
        // last save answered stay with the week they were for.
        key={week.start}
        week={week}
        savedAt={data.savedAt}
        publishedAt={data.publishedAt}
        shifts={data.shifts}
        basis={data.basis}
        swaps={swaps}
        team={data.team}
        people={data.people}
        hasPattern={data.hasPattern}
        answers={data.answers}
        positions={data.positions}
        manageHref={manageHref}
        running={running}
        publishes={publishes}
        share={share}
        save={save}
      />
    </PageBody>
  );
}

/**
 * `?week=` named a week already over: it changes no more, and the way on is
 * the week running now, named by its own first and last days (the business's
 * week, whichever day it starts on).
 */
export function EndedWeekView({
  running,
  runningHref,
  backHref = "/schedule",
  wording,
}: {
  /** The first day of the week running now. */
  running: string;
  runningHref: string;
  backHref?: string;
  wording: AppWording;
}) {
  const t = translator(wording, "app.build");
  const tm = translator(wording, "modules.scheduling");
  const ta = translator(wording, "app.availability");
  const dates = weekDates(running);
  const first = dates[0] ?? running;
  const last = dates.at(-1) ?? running;
  const weekday = (date: string) =>
    ta(`weekdays.${WEEKDAY_KEYS[weekdayOf(date)] ?? "sun"}`);
  return (
    <PageBody>
      <PageHeader
        title={t("ended.title")}
        back={{ href: backHref, label: tm("name") }}
      />
      <EmptyState
        headingLevel="h2"
        icon={<CalendarCheck />}
        body={t("ended.body", {
          first: weekday(first),
          from: dayMonth(first),
          last: weekday(last),
          to: dayMonth(last),
        })}
        className="md:py-16"
      >
        <Button asChild size="lg">
          <Link href={runningHref}>{t("ended.action")}</Link>
        </Button>
      </EmptyState>
    </PageBody>
  );
}
