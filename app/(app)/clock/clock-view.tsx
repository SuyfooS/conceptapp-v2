import { timeIn } from "@domain/shabbat";
import { clockStatus } from "@domain/time-clock";
import { Card } from "@ui/card";
import { ListGroup, ListRow } from "@ui/list-row";
import { PageBody, PageHeader, PageSection } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import type { ReactNode } from "react";
import { RefreshOnReturn } from "../home/refresh-on-return";
import { type AppWording, translator } from "../wording";
import { ClockPanel } from "./clock-panel";
import type { ClockActions, ClockData, ClockPaths } from "./clock-types";
import { HoursCount } from "./hours-count";
import { ShiftList } from "./shift-list";

const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;

/**
 * The clock: one large circle to start and end work, the month's hours under
 * it, and the way to the history. Tablet and desktop add the latest shifts
 * beside it.
 */
export function ClockView({
  data,
  actions,
  paths,
  wording,
}: {
  data: ClockData;
  actions: ClockActions;
  paths: ClockPaths;
  /** The business's words. */
  wording: AppWording;
}) {
  const t = translator(wording, "app.clock");
  const status = clockStatus(data.open);

  return (
    <PageBody className={pageGlowClass}>
      <RefreshOnReturn />
      <PageHeader
        title={t(`title.${status.state}`)}
        subtitle={<Line data={data} wording={wording} />}
      />

      <div className="flex flex-col gap-6 md:grid md:grid-cols-2 md:items-start md:gap-8 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="pt-2 md:sticky md:top-6">
          <ClockPanel data={data} actions={actions} />
        </div>

        <div className="flex flex-col gap-6">
          <Card tone="float" padding="none" className="overflow-hidden">
            <dl className="grid grid-cols-2">
              <Hours
                label={t("hours.thisMonth")}
                minutes={data.thisMonth}
                id="this-month"
                wording={wording}
              />
              <Hours
                label={t("hours.lastMonth")}
                minutes={data.lastMonth}
                id="last-month"
                wording={wording}
              />
            </dl>
            <ListRow
              href={paths.history}
              title={t("history.title")}
              className="before:absolute before:end-0 before:start-4 before:top-0 before:h-px before:bg-line"
            />
          </Card>

          {data.recent.length > 0 ? (
            <PageSection title={t("recent")} className="hidden md:flex">
              <ShiftList
                records={data.recent}
                t={translator(wording, "app.clock.history")}
              />
            </PageSection>
          ) : null}

          {data.team ? (
            <ListGroup>
              <ListRow
                href={paths.team}
                title={t("team.title")}
                subtitle={
                  data.team.overdue > 0
                    ? t("team.overdue.title", { count: data.team.overdue })
                    : t("team.atWork.count", { count: data.team.atWork })
                }
              />
            </ListGroup>
          ) : null}
        </div>
      </div>
    </PageBody>
  );
}

function Line({ data, wording }: { data: ClockData; wording: AppWording }) {
  const t = translator(wording, "app.clock.line");
  const { open, shift, scheduling, timeZone } = data;
  const at = (instant: string) => timeIn(new Date(instant), timeZone);
  if (open) {
    const pause = open.breaks.find((b) => b.endedAt === null);
    if (pause) {
      return t.rich("breakSince", { time: at(pause.startedAt), ltr });
    }
    const time = at(open.clockIn);
    return shift
      ? t.rich("workingUntil", { time, end: shift.end, ltr })
      : t.rich("workingSince", { time, ltr });
  }
  if (shift) {
    return t.rich("shift", { start: shift.start, end: shift.end, ltr });
  }
  return t(scheduling ? "noShift" : "idle");
}

function Hours({
  label,
  minutes,
  id,
  wording,
}: {
  label: string;
  minutes: number;
  id: string;
  wording: AppWording;
}) {
  const t = translator(wording, "app.clock.hours");
  return (
    <div className="flex flex-col gap-0.5 p-4 not-first:border-line not-first:border-s">
      <dt className="text-ink-2 text-sm">{label}</dt>
      <dd className="flex items-baseline gap-1.5">
        <HoursCount
          minutes={minutes}
          id={id}
          className="font-bold text-xl text-ink tabular-nums"
        />
        <span className="text-ink-2 text-sm">{t("unit")}</span>
      </dd>
    </div>
  );
}
