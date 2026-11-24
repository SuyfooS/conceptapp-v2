import type { AbsenceKind } from "@domain/absences";
import { hasEstimate } from "@domain/pay-rates";
import type { ShiftRecord } from "@domain/time-clock";
import { Button } from "@ui/button";
import { EmptyState } from "@ui/empty-state";
import { ListGroup, ListRow } from "@ui/list-row";
import { PageBody, PageHeader, PageSection } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { History } from "lucide-react";
import Link from "next/link";
import { useFormatter } from "next-intl";
import type { ReactNode } from "react";
import { type AppWording, translator } from "../../wording";
import type { ClockPaths, OwnPay } from "../clock-types";
import { MonthHero } from "../month-hero";
import { OwnPayCard } from "../own-pay-card";
import { ShiftList } from "../shift-list";

export type HistoryData = {
  /** The month shown, `YYYY-MM`. */
  month: string;
  /** The month it is now: the history stops there. */
  currentMonth: string;
  minutes: number;
  records: ShiftRecord[];
  /** Their days away that touch the month (known issue 19), in date order. */
  absences: {
    id: string;
    kind: AbsenceKind;
    from: string;
    to: string;
    note: string | null;
    /** Its days in all, by the calendar, and those in the month. */
    days: number;
    inMonth: number;
  }[];
};

const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;

/**
 * The person's shifts of one month: its total, and each shift with its hours,
 * then the month's estimate of their own pay (payroll P7) when the business
 * shows one, as a flat card: the month is the screen's hero. A month with
 * nothing to estimate and no shift still open shows only its empty state, so
 * it never says twice that there is nothing.
 */
export function HistoryView({
  data,
  ownPay = null,
  paths,
  wording,
}: {
  data: HistoryData;
  /** Their own month in shekels (`currentOwnPay`); null when it isn't shown. */
  ownPay?: OwnPay | null;
  paths: ClockPaths;
  /** The business's words. */
  wording: AppWording;
}) {
  const t = translator(wording, "app.clock.history");
  const tAbsences = translator(wording, "app.clock.absences");
  const format = useFormatter();
  const date = (day: string) =>
    format.dateTime(new Date(`${day}T12:00:00Z`), {
      day: "numeric",
      month: "numeric",
      timeZone: "UTC",
    });
  const weekday = (day: string) =>
    format.dateTime(new Date(`${day}T12:00:00Z`), {
      weekday: "long",
      timeZone: "UTC",
    });

  return (
    <PageBody className={pageGlowClass}>
      <PageHeader
        back={{ href: paths.clock, label: t("back") }}
        title={t("title")}
      />

      <div className="flex flex-col md:mx-auto md:w-full md:max-w-2xl xl:max-w-none">
        <MonthHero
          month={data.month}
          currentMonth={data.currentMonth}
          hrefFor={(month) => `${paths.history}?month=${month}`}
          minutes={data.minutes}
          countId="history"
          // A cancelled shift is listed, and counts as none.
          caption={t("total", {
            count: data.records.filter((shift) => shift.cancelled === null)
              .length,
          })}
          t={t}
          overlap={data.records.length > 0}
        />

        {data.records.length > 0 ? (
          <ShiftList
            records={data.records}
            t={t}
            className="relative z-10 mx-3 -mt-[56px] shadow-float xl:mx-5"
          />
        ) : (
          <EmptyState
            icon={<History />}
            headingLevel="h2"
            title={t("empty.title")}
            body={t("empty.body")}
            className="py-8"
          >
            <Button asChild variant="secondary" size="lg">
              <Link href={paths.clock}>{t("empty.action")}</Link>
            </Button>
          </EmptyState>
        )}

        {data.absences.length > 0 ? (
          <PageSection title={tAbsences("title")} className="mt-6">
            <ListGroup>
              {data.absences.map((one) => (
                <ListRow
                  key={one.id}
                  title={tAbsences(`kinds.${one.kind}`)}
                  subtitle={
                    <span className="flex flex-col">
                      <span>
                        {one.from === one.to
                          ? tAbsences.rich("oneDay", {
                              ltr,
                              weekday: weekday(one.from),
                              date: date(one.from),
                            })
                          : tAbsences.rich("range", {
                              ltr,
                              from: date(one.from),
                              to: date(one.to),
                            })}
                        {one.from === one.to
                          ? null
                          : ` · ${
                              one.inMonth < one.days
                                ? tAbsences("inMonth", { count: one.inMonth })
                                : tAbsences("days", { count: one.days })
                            }`}
                      </span>
                      {one.note ? <span>{one.note}</span> : null}
                    </span>
                  }
                />
              ))}
            </ListGroup>
          </PageSection>
        ) : null}

        {ownPay && (hasEstimate(ownPay) || ownPay.open > 0) ? (
          <div className="mt-6">
            <OwnPayCard pay={ownPay} wording={wording} />
          </div>
        ) : null}
      </div>
    </PageBody>
  );
}
