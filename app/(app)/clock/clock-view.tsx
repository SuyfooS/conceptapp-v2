import { timeIn } from "@domain/shabbat";
import { clockStatus, formatHours } from "@domain/time-clock";
import { Card } from "@ui/card";
import { ListRow } from "@ui/list-row";
import { PageBody, PageHeader, PageSection } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { ClockPanel } from "./clock-panel";
import { ClockSettings } from "./clock-settings";
import type { ClockActions, ClockData, ClockPaths } from "./clock-types";
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
}: {
  data: ClockData;
  actions: ClockActions;
  paths: ClockPaths;
}) {
  const t = useTranslations("app.clock");
  const status = clockStatus(data.open);

  return (
    <PageBody className={pageGlowClass}>
      <PageHeader
        title={t(`title.${status.state}`)}
        subtitle={<Line data={data} />}
      />

      <div className="flex flex-col gap-6 md:grid md:grid-cols-2 md:items-start md:gap-8 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="pt-2 md:sticky md:top-6">
          <ClockPanel data={data} actions={actions} />
        </div>

        <div className="flex flex-col gap-6">
          <Card tone="float" padding="none" className="overflow-hidden">
            <dl className="grid grid-cols-2">
              <Hours label={t("hours.thisMonth")} minutes={data.thisMonth} />
              <Hours label={t("hours.lastMonth")} minutes={data.lastMonth} />
            </dl>
            <ListRow
              href={paths.history}
              title={t("history.title")}
              className="before:absolute before:end-0 before:start-4 before:top-0 before:h-px before:bg-line"
            />
          </Card>

          {data.recent.length > 0 ? (
            <PageSection title={t("recent")} className="hidden md:flex">
              <ShiftList records={data.recent} />
            </PageSection>
          ) : null}

          {data.canManage ? (
            <ClockSettings
              unpaidBreaks={data.unpaidBreaks}
              save={actions.saveSettings}
            />
          ) : null}
        </div>
      </div>
    </PageBody>
  );
}

function Line({ data }: { data: ClockData }) {
  const t = useTranslations("app.clock.line");
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

function Hours({ label, minutes }: { label: string; minutes: number }) {
  const t = useTranslations("app.clock.hours");
  return (
    <div className="flex flex-col gap-0.5 p-4 not-first:border-line not-first:border-s">
      <dt className="text-ink-2 text-sm">{label}</dt>
      <dd className="flex items-baseline gap-1.5">
        <span dir="ltr" className="font-bold text-xl text-ink tabular-nums">
          {formatHours(minutes)}
        </span>
        <span className="text-ink-2 text-sm">{t("unit")}</span>
      </dd>
    </div>
  );
}
