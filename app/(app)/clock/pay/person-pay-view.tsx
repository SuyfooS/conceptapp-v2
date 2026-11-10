import { EmptyState } from "@ui/empty-state";
import { ListGroup, ListRow } from "@ui/list-row";
import { PageBody, PageHeader, PageSection } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { History } from "lucide-react";
import { type AppWording, translator } from "../../wording";
import { DetailsCard } from "./details-card";
import { NoteView } from "./note-view";
import {
  MissingWage,
  PayDayList,
  PayDayTable,
  PayHero,
  useMonthName,
  WageSpans,
} from "./pay-parts";
import type {
  NotePayView,
  PayPaths,
  PayPersonData,
  SetDetails,
  SetPeriod,
  SetWage,
} from "./pay-types";
import { WageCard } from "./wage-card";

/**
 * One person's month for payroll: their hours, days and shifts, each shift
 * with how it was recorded, who corrected it and why, and its times before;
 * their hourly wage, with its history and the way to set a new one from a
 * day (payroll P4); and their details for payroll and periods of work (P5).
 * Phone: the hero, the wage, the details and the month's wage, then the days.
 * Tablet: the hero, the wage, the details and the month's summary (the
 * month's wage at its top) at the start, the days at the end. Desktop: the
 * hero, the wage with the details under it, and the summary side by side, the
 * days as a table.
 */
export function PersonPayView({
  data,
  paths,
  note,
  setWage,
  setDetails,
  setPeriod,
  wording,
}: {
  data: PayPersonData;
  paths: PayPaths;
  note: NotePayView;
  /** Sets the person's hourly wage; the demo's stores nothing. */
  setWage: SetWage;
  /** Sets the person's details for payroll; the demo's stores nothing. */
  setDetails: SetDetails;
  /** Adds or changes a period of their work; the demo's stores nothing. */
  setPeriod: SetPeriod;
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
  const wage = data.wage ? (
    <WageCard
      personId={data.person.userId}
      name={name}
      wage={data.wage}
      setWage={setWage}
    />
  ) : null;
  const details = data.details ? (
    <DetailsCard
      personId={data.person.userId}
      name={name}
      form={data.person.form}
      data={data.details}
      setDetails={setDetails}
      setPeriod={setPeriod}
    />
  ) : null;
  // The month's wage, and whose shifts it leaves without one: in every shape,
  // on its own on the phone and at the top of the summary from tablet up.
  const monthWage = data.monthWage ? (
    <ListRow
      title={t("person.wage", { month: monthName(data.month) })}
      subtitle={
        <>
          {data.monthWage.spans.length > 0 ? (
            <span className="block">
              <WageSpans wage={data.monthWage} t={t} />
            </span>
          ) : null}
          {data.monthWage.missing ? (
            <span className="block font-medium text-warning">
              <MissingWage wage={data.monthWage} t={t} />
            </span>
          ) : data.monthWage.spans.length === 0 ? (
            <span className="block">{t("wage.notSet")}</span>
          ) : null}
        </>
      }
    />
  ) : null;
  const summary = (
    <ListGroup>
      {monthWage}
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

      {/* Phone: the month, the wage, the details and the month's wage, then
          the days. */}
      <div className="flex flex-col gap-6 md:hidden">
        {hero}
        {wage}
        {details}
        {monthWage ? <ListGroup>{monthWage}</ListGroup> : null}
        {data.days.length > 0 ? <PayDayList days={data.days} t={t} /> : empty}
      </div>

      {/* Tablet: the month, the wage and the summary, the days beside them. */}
      <div className="hidden md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:items-start md:gap-6 xl:hidden">
        <div className="flex min-w-0 flex-col gap-6">
          {hero}
          {wage}
          {details}
          <PageSection title={t("person.summary")}>{summary}</PageSection>
        </div>
        <PageSection title={t("person.daysTitle")}>
          {data.days.length > 0 ? <PayDayList days={data.days} t={t} /> : empty}
        </PageSection>
      </div>

      {/* Desktop: the month, the wage and the summary side by side, every
          column of the days below. */}
      <div className="hidden flex-col gap-6 xl:flex">
        <div className="grid grid-cols-[minmax(0,4fr)_minmax(0,3fr)_minmax(0,3fr)] items-start gap-8">
          {hero}
          {wage || details ? (
            <div className="flex min-w-0 flex-col gap-6">
              {wage}
              {details}
            </div>
          ) : (
            <div />
          )}
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
