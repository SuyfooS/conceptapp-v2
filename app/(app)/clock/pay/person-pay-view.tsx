import { EmptyState } from "@ui/empty-state";
import { ListGroup, ListRow } from "@ui/list-row";
import { PageBody, PageHeader, PageSection } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { History } from "lucide-react";
import { type AppWording, translator } from "../../wording";
import { NoteView } from "./note-view";
import { PayDayList, PayDayTable, PayHero, useMonthName } from "./pay-parts";
import type { NotePayView, PayPaths, PayPersonData } from "./pay-types";

/**
 * One person's month for payroll: their hours, days and shifts, and each shift
 * with how it was recorded, who corrected it and why, and its times before.
 * Phone: the hero, then the days. Tablet: the hero and the month's summary at
 * the start, the days at the end. Desktop: the hero and summary above, the
 * days as a table.
 */
export function PersonPayView({
  data,
  paths,
  note,
  wording,
}: {
  data: PayPersonData;
  paths: PayPaths;
  note: NotePayView;
  wording: AppWording;
}) {
  const t = translator(wording, "app.pay");
  const monthName = useMonthName();
  const name = data.person.name ?? t("noName");
  const { totals } = data;
  const hero = (
    <PayHero
      month={data.month}
      currentMonth={data.currentMonth}
      hrefFor={(month) => `${paths.pay}/${data.person.userId}?month=${month}`}
      minutes={totals.minutes}
      caption={t("person.caption", {
        days: totals.days,
        shifts: totals.shifts,
      })}
      t={t}
    />
  );
  const summary = (
    <ListGroup>
      <ListRow
        title={t("person.days")}
        trailing={<Count value={totals.days} />}
      />
      <ListRow
        title={t("person.shifts")}
        trailing={<Count value={totals.shifts} />}
      />
      <ListRow
        title={t("person.breaks")}
        trailing={
          <span className="text-ink-2">
            {totals.unpaidBreakMinutes > 0
              ? t("minutes", { minutes: totals.unpaidBreakMinutes })
              : t("none")}
          </span>
        }
      />
      <ListRow
        title={t("person.corrected")}
        trailing={<Count value={totals.corrected} />}
      />
      <ListRow
        title={t("person.waiting")}
        trailing={<Count value={totals.waiting} warn />}
      />
      {totals.open > 0 ? (
        <ListRow
          title={t("person.open")}
          trailing={<Count value={totals.open} warn />}
        />
      ) : null}
    </ListGroup>
  );
  const empty = (
    <EmptyState
      icon={<History />}
      headingLevel="h2"
      title={t("person.empty.title", { month: monthName(data.month) })}
      body={t("person.empty.body", { form: data.person.form })}
      className="py-8"
    />
  );

  return (
    <PageBody className={pageGlowClass}>
      <NoteView month={data.month} kind="person" note={note} />
      <PageHeader
        back={{ href: `${paths.pay}?month=${data.month}`, label: t("title") }}
        title={name}
        subtitle={
          data.person.former
            ? t("former", { form: data.person.form })
            : undefined
        }
      />

      {/* Phone: the month, then its days. */}
      <div className="flex flex-col gap-4 md:hidden">
        {hero}
        {data.days.length > 0 ? <PayDayList days={data.days} t={t} /> : empty}
      </div>

      {/* Tablet: the month and its summary, the days beside them. */}
      <div className="hidden md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:items-start md:gap-6 xl:hidden">
        <div className="flex min-w-0 flex-col gap-4">
          {hero}
          <PageSection title={t("person.summary")} level={2}>
            {summary}
          </PageSection>
        </div>
        <PageSection title={t("person.daysTitle")}>
          {data.days.length > 0 ? <PayDayList days={data.days} t={t} /> : empty}
        </PageSection>
      </div>

      {/* Desktop: the summary above, every column of the days below. */}
      <div className="hidden flex-col gap-6 xl:flex">
        <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-start gap-8">
          {hero}
          <PageSection title={t("person.summary")}>{summary}</PageSection>
        </div>
        <PageSection title={t("person.daysTitle")}>
          {data.days.length > 0 ? (
            <div className="overflow-hidden rounded-card bg-surface shadow-card">
              <PayDayTable
                days={data.days}
                t={t}
                caption={t("person.daysTitle")}
              />
            </div>
          ) : (
            empty
          )}
        </PageSection>
      </div>
    </PageBody>
  );
}

function Count({ value, warn = false }: { value: number; warn?: boolean }) {
  return (
    <span
      dir="ltr"
      className={
        value > 0 && warn
          ? "font-semibold text-warning tabular-nums"
          : "font-semibold text-ink tabular-nums"
      }
    >
      {value}
    </span>
  );
}
