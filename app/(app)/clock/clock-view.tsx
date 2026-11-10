import { timeIn } from "@domain/shabbat";
import { clockStatus } from "@domain/time-clock";
import type { WageNow } from "@domain/wages";
import { Card } from "@ui/card";
import { ListGroup, ListRow } from "@ui/list-row";
import { PageBody, PageHeader, PageSection } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import type { ReactNode } from "react";
import { RefreshOnReturn } from "../home/refresh-on-return";
import { type AppWording, translator } from "../wording";
import { ClockPanel } from "./clock-panel";
import type {
  ClockActions,
  ClockData,
  ClockPaths,
  OwnDetails,
  OwnPay,
} from "./clock-types";
import { HoursCount } from "./hours-count";
import { OwnPayCard } from "./own-pay-card";
import { useFullDate, useMonthYear, useShekels } from "./pay/pay-parts";
import { ShiftList } from "./shift-list";

const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;

/**
 * The clock: one large circle to start and end work, the month's hours under
 * it, and the way to the history. Tablet and desktop add the latest shifts
 * beside it. Under the person's own wage, their month's estimate before tax
 * (payroll P7) when the business shows one, in a flat card: the circle is the
 * screen's hero.
 */
export function ClockView({
  data,
  ownPay = null,
  actions,
  paths,
  wording,
}: {
  data: ClockData;
  /** Their own month in shekels (`currentOwnPay`); null when it isn't shown. */
  ownPay?: OwnPay | null;
  actions: ClockActions;
  paths: ClockPaths;
  /** The business's words. */
  wording: AppWording;
}) {
  const t = translator(wording, "app.clock");
  const tPay = translator(wording, "app.pay");
  const status = clockStatus(data.open);

  return (
    <PageBody className={pageGlowClass}>
      <RefreshOnReturn />
      <PageHeader
        title={t(`title.${status.state}`)}
        subtitle={headerLine(data, wording)}
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

          {data.ownWage || data.ownDetails ? (
            <ListGroup>
              {data.ownWage ? (
                <OwnWage wage={data.ownWage} wording={wording} />
              ) : null}
              {data.ownDetails ? (
                <OwnDetailsRow details={data.ownDetails} wording={wording} />
              ) : null}
            </ListGroup>
          ) : null}

          {ownPay ? <OwnPayCard pay={ownPay} wording={wording} /> : null}

          {data.team || data.payroll ? (
            <ListGroup>
              {data.punch.required && data.punch.canShowCode ? (
                <ListRow
                  href={paths.code}
                  title={t("showCode.title")}
                  subtitle={t("showCode.hint")}
                />
              ) : null}
              {data.team ? (
                <ListRow
                  href={paths.team}
                  title={t("team.title")}
                  subtitle={
                    data.team.overdue > 0
                      ? t("team.overdue.title", { count: data.team.overdue })
                      : t("team.atWork.count", { count: data.team.atWork })
                  }
                />
              ) : null}
              {data.payroll ? (
                <ListRow
                  href={paths.pay}
                  title={tPay("clockRow.title")}
                  subtitle={tPay("clockRow.subtitle")}
                />
              ) : null}
            </ListGroup>
          ) : null}
        </div>
      </div>
    </PageBody>
  );
}

/**
 * The line under the title: the shift or the time at work. Nothing when a code
 * is asked for and there is no shift to name: the line under the circle says
 * what pressing it does then.
 */
function headerLine(data: ClockData, wording: AppWording): ReactNode {
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
  if (scheduling) return t("noShift");
  return data.punch.needsCode ? null : t("idle");
}

/**
 * The person's own hourly wage, and nobody else's: the one in effect today
 * from its day, and the next one when one is set (or that one alone, when
 * it's the first).
 */
function OwnWage({ wage, wording }: { wage: WageNow; wording: AppWording }) {
  const t = translator(wording, "app.clock.ownWage");
  const shekels = useShekels();
  const fullDate = useFullDate();
  const shown = wage.current ?? wage.next;
  if (!shown) return null;
  const later = wage.current ? wage.next : null;
  return (
    <ListRow
      title={t.rich("title", { ltr, amount: shekels(shown.agorot) })}
      subtitle={
        <>
          <span className="block">
            {t.rich("since", { ltr, date: fullDate(shown.from) })}
          </span>
          {later ? (
            <span className="block">
              {t.rich("next", {
                ltr,
                date: fullDate(later.from),
                amount: shekels(later.agorot),
              })}
            </span>
          ) : null}
        </>
      }
    />
  );
}

/**
 * The person's own details for payroll, as a pay holder set them, and
 * nobody else's: their payroll number, rest day, until when they are a
 * minor, and when their work began.
 */
function OwnDetailsRow({
  details,
  wording,
}: {
  details: OwnDetails;
  wording: AppWording;
}) {
  const t = translator(wording, "app.clock.ownDetails");
  const tDays = translator(wording, "app.pay.details.restDay");
  const fullDate = useFullDate();
  const monthYear = useMonthYear();
  const lines = [
    details.payrollNumber
      ? {
          key: "number",
          text: t.rich("number", { ltr, number: details.payrollNumber }),
        }
      : null,
    details.restDay !== null
      ? {
          key: "rest",
          text: t("restDay", { day: tDays(`${details.restDay}`) }),
        }
      : null,
    details.youthUntil
      ? {
          key: "youth",
          text: t.rich("youth", { ltr, until: monthYear(details.youthUntil) }),
        }
      : null,
    details.startedOn
      ? {
          key: "since",
          text: t.rich("since", { ltr, date: fullDate(details.startedOn) }),
        }
      : null,
  ].filter((line) => line !== null);
  return (
    <ListRow
      title={t("title")}
      subtitle={lines.map((line) => (
        <span key={line.key} className="block">
          {line.text}
        </span>
      ))}
    />
  );
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
