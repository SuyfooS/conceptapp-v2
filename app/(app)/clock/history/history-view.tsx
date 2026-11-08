import type { ShiftRecord } from "@domain/time-clock";
import { Button } from "@ui/button";
import { EmptyState } from "@ui/empty-state";
import { PageBody, PageHeader } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { History } from "lucide-react";
import Link from "next/link";
import { type AppWording, translator } from "../../wording";
import type { ClockPaths } from "../clock-types";
import { MonthHero } from "../month-hero";
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
  wording,
}: {
  data: HistoryData;
  paths: ClockPaths;
  /** The business's words. */
  wording: AppWording;
}) {
  const t = translator(wording, "app.clock.history");

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
          caption={t("total", { count: data.records.length })}
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
      </div>
    </PageBody>
  );
}
