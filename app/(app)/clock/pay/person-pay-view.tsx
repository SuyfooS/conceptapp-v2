import { restNameOf } from "@domain/pay-rates";
import { EmptyState } from "@ui/empty-state";
import { ListGroup, ListRow } from "@ui/list-row";
import { PageBody, PageHeader, PageSection } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { History } from "lucide-react";
import Link from "next/link";
import { type AppWording, translator } from "../../wording";
import { DetailsCard } from "./details-card";
import { MethodButton } from "./method-sheet";
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
import {
  type ClockT,
  dayRateCells,
  dayRateColumns,
  dayRatesExtra,
  RatesList,
  RemarksList,
} from "./rates-parts";
import { WageCard } from "./wage-card";

/**
 * One person's month for payroll: their hours, days and shifts, each shift
 * with how it was recorded, who corrected it and why, and its times before;
 * their hourly wage, with its history and the way to set a new one from a
 * day (payroll P4); their details for payroll and periods of work (P5); and
 * from the hours engine (P7) the month by rate with the pay for days not
 * worked and, while the business shows amounts, the estimate before tax and
 * how it is worked out, what to check in words, and each day's split.
 * Phone: the hero, the rates, what to check, the wage, the details and the
 * month's wage, then the days. Tablet: the same at the start, the days at the
 * end. Desktop: the hero, the wage with the details under it, and the summary
 * side by side; the rates beside what to check; the days as a table with
 * every rate.
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
  const tc: ClockT = translator(wording, "modules.time_clock");
  const tNotes = translator(wording, "modules.time_clock.payroll.notes");
  const monthName = useMonthName();
  const name = data.person.name ?? t("noName");
  const { totals } = data;
  // A month with nothing by rate, nothing to pay for a day not worked, nothing
  // to check and no shift still open says so once, in the days' empty state.
  const rates =
    data.rates &&
    (data.rates.minutes > 0 ||
      data.rates.holidayPay.length > 0 ||
      data.rates.remarks.length > 0 ||
      data.rates.open > 0)
      ? data.rates
      : null;
  // The night shifts in the hero, which every shape shows, as well as in the
  // summary from tablet up.
  const caption = [
    t("person.caption", { days: totals.days, shifts: totals.shifts }),
    rates && rates.nightShifts > 0
      ? t("person.nights", { count: rates.nightShifts })
      : null,
  ]
    .filter((part) => part !== null)
    .join(" · ");
  const hero = (
    <PayHero
      month={data.month}
      currentMonth={data.currentMonth}
      hrefFor={(month) => `${paths.pay}/${data.person.userId}?month=${month}`}
      minutes={totals.minutes}
      caption={caption}
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
  // The month by rate, the pay for days not worked and the estimate, with
  // how it is worked out (payroll P7). Without amounts, why there are none.
  const byRate = rates ? (
    <PageSection title={t("rateCard.title")}>
      <RatesList
        rates={rates}
        amounts={data.amounts}
        form={data.person.form}
        t={t}
        tc={tc}
      />
      {data.amounts ? (
        <p className="px-1 text-ink-2 text-sm">{t("estimate.under")}</p>
      ) : (
        <p className="px-1 text-ink-2">{t("estimate.offShort")}</p>
      )}
      <MethodButton audience="payroll" weeks={data.weeks} />
    </PageSection>
  ) : null;
  // What to check, in words, and the month's notes under it. An unset work
  // week is one sentence for the month here (`app.pay.notes.workWeekUnset`),
  // each week's way in the method sheet; P6's sentence per week
  // (`modules.time_clock.payroll.notes.workWeekUnset`) is kept for P8's file.
  const toCheck = rates ? (
    <PageSection title={t("remarks.title")}>
      <RemarksList
        remarks={rates.remarks}
        holidayPay={rates.holidayPay}
        aboutPay={rates.aboutPay}
        form={data.person.form}
        tc={tc}
        t={t}
      >
        {data.weeks.length > 0 ? (
          <p className="flex flex-col gap-1 text-ink-2 text-sm">
            <span>{t("notes.workWeekUnset")}</span>
            {data.setsWeek ? (
              <Link
                href={paths.settings}
                className="inline-flex min-h-11 items-center self-start font-semibold text-ink underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-accent"
              >
                {t("notes.setWeek")}
              </Link>
            ) : null}
          </p>
        ) : null}
        {data.stale ? (
          <p className="text-ink-2 text-sm">
            {tNotes("minimumWageTableStale")}
          </p>
        ) : null}
        <p className="text-ink-2 text-sm">{tNotes("paidAbsencesMissing")}</p>
      </RemarksList>
    </PageSection>
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
      {rates ? (
        <ListRow
          title={t("columns.nights")}
          trailing={<Count value={rates.nightShifts} />}
        />
      ) : null}
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
  const extra = rates ? dayRatesExtra(rates, data.days, t, tc) : undefined;
  const dayList =
    data.days.length > 0 ? (
      <PayDayList days={data.days} t={t} extra={extra} />
    ) : (
      empty
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

      {/* Phone: the month and its rates, what to check, the wage, the
          details and the month's wage, then the days. */}
      <div className="flex flex-col gap-6 md:hidden">
        {hero}
        {byRate}
        {toCheck}
        {wage}
        {details}
        {monthWage ? <ListGroup>{monthWage}</ListGroup> : null}
        {dayList}
      </div>

      {/* Tablet: the month, its rates, what to check, the wage and the
          summary, the days beside them. */}
      <div className="hidden md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:items-start md:gap-6 xl:hidden">
        <div className="flex min-w-0 flex-col gap-6">
          {hero}
          {byRate}
          {toCheck}
          {wage}
          {details}
          <PageSection title={t("person.summary")}>{summary}</PageSection>
        </div>
        <PageSection title={t("person.daysTitle")}>{dayList}</PageSection>
      </div>

      {/* Desktop: the month, the wage and the summary side by side, the rates
          beside what to check, and every column of the days below. */}
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
        {byRate || toCheck ? (
          <div className="grid grid-cols-2 items-start gap-8">
            {byRate ?? <div />}
            {toCheck ?? <div />}
          </div>
        ) : null}
        <PageSection title={t("person.daysTitle")}>
          {data.days.length > 0 ? (
            <div className="overflow-hidden rounded-card bg-surface shadow-card">
              <PayDayTable
                days={data.days}
                t={t}
                caption={t("person.daysTitle")}
                extraColumns={
                  rates ? dayRateColumns(t, restNameOf(rates.restDay)) : []
                }
                extraCells={
                  rates ? dayRateCells(rates, data.days, t, tc) : undefined
                }
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
