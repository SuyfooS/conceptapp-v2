import { addMonths, formatHours, type ShiftRecord } from "@domain/time-clock";
import { Button } from "@ui/button";
import { Card } from "@ui/card";
import { EmptyState } from "@ui/empty-state";
import { PageBody, PageHeader } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { ChevronLeft, ChevronRight, History } from "lucide-react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { ClockPaths } from "../clock-types";
import { ShiftList } from "../shift-list";

export type HistoryData = {
  /** The month shown, `YYYY-MM`. */
  month: string;
  /** The month it is now: the history stops there. */
  currentMonth: string;
  minutes: number;
  records: ShiftRecord[];
};

/** The person's shifts of one month: its total, and each shift with its hours. */
export function HistoryView({
  data,
  paths,
}: {
  data: HistoryData;
  paths: ClockPaths;
}) {
  const t = useTranslations("app.clock.history");
  const format = useFormatter();
  const monthName = (month: string) =>
    format.dateTime(new Date(`${month}-15T12:00:00Z`), {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  const monthHref = (month: string) => `${paths.history}?month=${month}`;
  const earlier = addMonths(data.month, -1);
  const later = addMonths(data.month, 1);

  return (
    <PageBody className={pageGlowClass}>
      <PageHeader
        back={{ href: paths.clock, label: t("back") }}
        title={t("title")}
      />

      <div className="flex flex-col md:mx-auto md:w-full md:max-w-2xl xl:max-w-none">
        <Card
          tone="hero"
          padding="lg"
          className={data.records.length > 0 ? "pb-[76px]" : undefined}
        >
          <div className="flex items-center justify-between gap-2">
            <MonthLink
              href={monthHref(earlier)}
              label={t("earlier", { month: monthName(earlier) })}
              icon={<ChevronRight className="size-5 ltr:-scale-x-100" />}
            />
            <h2 className="font-semibold text-md">{monthName(data.month)}</h2>
            {data.month < data.currentMonth ? (
              <MonthLink
                href={monthHref(later)}
                label={t("later", { month: monthName(later) })}
                icon={<ChevronLeft className="size-5 ltr:-scale-x-100" />}
              />
            ) : (
              <span className="size-11" />
            )}
          </div>
          <p className="mt-2 text-center">
            <span dir="ltr" className="block font-bold text-2xl tabular-nums">
              {formatHours(data.minutes)}
            </span>
            <span className="text-base">
              {t("total", { count: data.records.length })}
            </span>
          </p>
        </Card>

        {data.records.length > 0 ? (
          <ShiftList
            records={data.records}
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
      </div>
    </PageBody>
  );
}

function MonthLink({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className="pressable glass grid size-11 shrink-0 place-items-center rounded-full text-ink focus-visible:outline-2 focus-visible:outline-current focus-visible:outline-offset-2"
    >
      {icon}
    </Link>
  );
}
