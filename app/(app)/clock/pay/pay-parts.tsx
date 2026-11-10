import type { PayDay } from "@domain/pay-month";
import { addMonths } from "@domain/time-clock-format";
import { Card } from "@ui/card";
import { cn } from "@ui/cn";
import { type DataColumn, DataTable } from "@ui/data-table";
import { ListGroup, ListRow } from "@ui/list-row";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useFormatter } from "next-intl";
import type { ReactNode } from "react";
import type { Translator } from "../../wording";
import { MonthLink } from "../month-hero";
import type { BeforePayroll, PayPerson } from "./pay-types";

/*
 * The parts the pay screens share, for the app's server views and for the
 * client parts (the desktop table's sheet): words come in as `t`, built from
 * the business's words on the server and by useTranslations in the browser.
 */

export type PayT = Translator<"app.pay">;

const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;

/** Hours to two decimals, as payroll reads them: "168.50", "1,812.25". */
export function useHoursText(): (minutes: number) => string {
  const format = useFormatter();
  return (minutes) =>
    format.number(Math.max(0, minutes) / 60, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
}

/** A month's name with its year: "אוקטובר 2026". */
export function useMonthName(): (month: string) => string {
  const format = useFormatter();
  return (month) =>
    format.dateTime(new Date(`${month}-15T12:00:00Z`), {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
}

/**
 * The month's hours on the business's colour, with the way to the months
 * around it: the pay screens' one hero. `overlap` leaves room for a list to
 * rise over its lower edge.
 */
export function PayHero({
  month,
  currentMonth,
  hrefFor,
  minutes,
  caption,
  t,
  overlap = false,
}: {
  month: string;
  currentMonth: string;
  hrefFor: (month: string) => string;
  minutes: number;
  caption: ReactNode;
  t: PayT;
  overlap?: boolean;
}) {
  const hours = useHoursText();
  const monthName = useMonthName();
  const earlier = addMonths(month, -1);
  const later = addMonths(month, 1);
  return (
    <Card
      tone="hero"
      padding="lg"
      className={overlap ? "pb-[76px]" : undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <MonthLink
          href={hrefFor(earlier)}
          label={t("month.earlier", { month: monthName(earlier) })}
          icon={<ChevronRight className="size-5 ltr:-scale-x-100" />}
        />
        <h2 className="font-semibold text-md">{monthName(month)}</h2>
        {month < currentMonth ? (
          <MonthLink
            href={hrefFor(later)}
            label={t("month.later", { month: monthName(later) })}
            icon={<ChevronLeft className="size-5 ltr:-scale-x-100" />}
          />
        ) : (
          <span className="size-11" />
        )}
      </div>
      <p className="mt-2 text-center">
        <span className="block text-md">
          {t.rich("hours", {
            hours: hours(minutes),
            ltr: (chunks) => (
              <span dir="ltr" className="font-bold text-2xl tabular-nums">
                {chunks}
              </span>
            ),
          })}
        </span>
        <span className="text-base">{caption}</span>
      </p>
    </Card>
  );
}

/** What waits before paying the month: the screen's one accent card, when anything does. */
export function BeforePayrollCard({
  before,
  t,
  fixHref,
}: {
  before: BeforePayroll;
  t: PayT;
  /** Where hours are fixed and approved, for those who do it. */
  fixHref: string | null;
}) {
  const lines = [
    before.ownerOnly > 0
      ? t("beforePayroll.ownerOnly", { count: before.ownerOnly })
      : null,
    before.waiting > 0
      ? t("beforePayroll.waiting", { count: before.waiting })
      : null,
    before.open > 0 ? t("beforePayroll.open", { count: before.open }) : null,
    before.corrected > 0
      ? t("beforePayroll.corrected", { count: before.corrected })
      : null,
    before.rounding ? t("beforePayroll.rounding") : null,
  ].filter((line): line is string => line !== null);
  if (lines.length === 0) return null;
  const waits = before.ownerOnly + before.waiting + before.open > 0;
  return (
    <Card tone="accent" padding="lg" className="flex flex-col gap-2">
      <h2 className="font-semibold text-ink text-md">
        {t("beforePayroll.title")}
      </h2>
      <ul className="flex flex-col gap-1 text-base text-ink">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {fixHref && waits ? (
        <Link
          href={fixHref}
          className="mt-1 inline-flex min-h-11 items-center self-start font-semibold text-ink underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-accent"
        >
          {t("beforePayroll.fix")}
        </Link>
      ) : null}
    </Card>
  );
}

/** A person's line in the month's list: hours and days, and what to check. */
export function PersonLine({ person, t }: { person: PayPerson; t: PayT }) {
  const hours = useHoursText();
  const check = person.totals.waiting + person.totals.open;
  return (
    <>
      <span className="block">
        {t.rich("row", {
          ltr,
          hours: hours(person.totals.minutes),
          days: person.totals.days,
        })}
      </span>
      <PersonFlags person={person} t={t} check={check} />
    </>
  );
}

function PersonFlags({
  person,
  t,
  check,
}: {
  person: PayPerson;
  t: PayT;
  check: number;
}) {
  const flags = [
    person.former ? t("former", { form: person.form }) : null,
    person.totals.corrected > 0
      ? t("corrected", { count: person.totals.corrected })
      : null,
    check > 0 ? t("toCheck", { count: check }) : null,
  ].filter((flag): flag is string => flag !== null);
  if (flags.length === 0) return null;
  return (
    <span className="block font-medium text-warning">{flags.join(" · ")}</span>
  );
}

/** The day a shift belongs to, as a list names it: "יום ה׳, 2.10". */
function useDayName(): (date: string) => string {
  const format = useFormatter();
  return (date) =>
    format.dateTime(new Date(`${date}T12:00:00Z`), {
      weekday: "short",
      day: "numeric",
      month: "numeric",
      timeZone: "UTC",
    });
}

/** Who corrected a shift, and why, as its line says it. */
function correctionLine(day: PayDay, t: PayT): string | null {
  const fix = day.correction;
  if (!fix) return null;
  const by = fix.by ?? t("day.aManager");
  if (fix.kind === "added") {
    return fix.note
      ? t("day.added", { name: by, note: fix.note })
      : t("day.addedBy", { name: by });
  }
  return fix.note
    ? t("day.corrected", { name: by, note: fix.note })
    : t("day.correctedBy", { name: by });
}

function originalLine(day: PayDay, t: PayT): ReactNode {
  if (!day.original) return null;
  return day.original.out
    ? t.rich("day.original", {
        ltr,
        in: day.original.in,
        out: day.original.out,
      })
    : t.rich("day.originalOpen", { ltr, in: day.original.in });
}

/** One person's shifts of a month, oldest first, one row each. */
export function PayDayList({
  days,
  t,
  className,
}: {
  days: readonly PayDay[];
  t: PayT;
  className?: string;
}) {
  const hours = useHoursText();
  const dayName = useDayName();
  return (
    <ListGroup className={className}>
      {days.map((day) => {
        const fix = correctionLine(day, t);
        const before = originalLine(day, t);
        return (
          <ListRow
            key={day.id}
            title={
              <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span>{dayName(day.date)}</span>
                <span className="font-normal text-ink-2">
                  {day.out
                    ? t.rich("day.times", { ltr, in: day.in, out: day.out })
                    : t.rich("day.openTimes", { ltr, in: day.in })}
                </span>
              </span>
            }
            subtitle={
              <>
                <span className="block">
                  {t.rich("hours", { ltr, hours: hours(day.minutes) })}
                  {day.unpaidBreakMinutes > 0
                    ? ` · ${t("day.breaks", { minutes: day.unpaidBreakMinutes })}`
                    : null}
                  {` · ${t(`day.source.${day.source}`)}`}
                </span>
                {day.waiting ? (
                  <span className="block font-medium text-warning">
                    {day.ownerOnly ? t("day.waitingOwner") : t("day.waiting")}
                  </span>
                ) : null}
                {fix ? <span className="block">{fix}</span> : null}
                {before ? <span className="block">{before}</span> : null}
              </>
            }
          />
        );
      })}
    </ListGroup>
  );
}

/**
 * The same shifts as a table, for a desktop: every column payroll reads. The
 * correction says who and why in the list's own words, with the times before.
 */
export function PayDayTable({
  days,
  t,
  caption,
}: {
  days: readonly PayDay[];
  t: PayT;
  caption: string;
}) {
  const hours = useHoursText();
  const format = useFormatter();
  const date = (value: string) =>
    format.dateTime(new Date(`${value}T12:00:00Z`), {
      day: "numeric",
      month: "numeric",
      timeZone: "UTC",
    });
  const weekday = (value: string) =>
    format.dateTime(new Date(`${value}T12:00:00Z`), {
      weekday: "long",
      timeZone: "UTC",
    });
  const columns: DataColumn[] = [
    { key: "date", label: t("dayColumns.date"), numeric: true },
    { key: "weekday", label: t("dayColumns.weekday") },
    { key: "in", label: t("dayColumns.in"), numeric: true },
    { key: "out", label: t("dayColumns.out"), numeric: true },
    { key: "breaks", label: t("dayColumns.breaks"), align: "end" },
    { key: "net", label: t("dayColumns.net"), align: "end", numeric: true },
    { key: "source", label: t("dayColumns.source") },
    { key: "correction", label: t("dayColumns.correction") },
  ];
  return (
    <DataTable
      caption={caption}
      columns={columns}
      rows={days.map((day) => ({
        key: day.id,
        cells: {
          date: date(day.date),
          weekday: weekday(day.date),
          in: day.in,
          out: day.out ?? (
            <span className="text-warning">{t("day.stillOpen")}</span>
          ),
          breaks:
            day.unpaidBreakMinutes > 0
              ? t("minutes", { minutes: day.unpaidBreakMinutes })
              : t("none"),
          net: hours(day.minutes),
          source: (
            <span className="flex flex-col">
              <span>{t(`day.source.${day.source}`)}</span>
              {day.waiting ? (
                <span className="font-medium text-sm text-warning">
                  {day.ownerOnly ? t("day.waitingOwner") : t("day.waiting")}
                </span>
              ) : null}
            </span>
          ),
          correction: (
            <span className="flex flex-col">
              <span>{correctionLine(day, t) ?? t("none")}</span>
              {day.original ? (
                <span className="text-ink-2 text-sm">
                  {originalLine(day, t)}
                </span>
              ) : null}
            </span>
          ),
        },
      }))}
    />
  );
}

/** Where a person's month opens: their own page, for the month on screen. */
export const personHref = (pay: string, userId: string, month: string) =>
  `${pay}/${userId}?month=${month}`;

/** The columns of the month's table, in payroll's order. */
export function payMonthColumns(t: PayT): DataColumn[] {
  return [
    { key: "name", label: t("columns.name") },
    { key: "days", label: t("columns.days"), align: "end", numeric: true },
    { key: "hours", label: t("columns.hours"), align: "end", numeric: true },
    { key: "shifts", label: t("columns.shifts"), align: "end", numeric: true },
    { key: "breaks", label: t("columns.breaks"), align: "end" },
    {
      key: "corrected",
      label: t("columns.corrected"),
      align: "end",
      numeric: true,
    },
    {
      key: "waiting",
      label: t("columns.waiting"),
      align: "end",
      numeric: true,
    },
    {
      key: "toCheck",
      label: t("columns.toCheck"),
      align: "end",
      numeric: true,
    },
  ];
}

/** A number in a table cell, quiet when it is nothing. */
export function CountCell({
  value,
  warn = false,
}: {
  value: number;
  warn?: boolean;
}) {
  return (
    <span
      className={cn(
        value === 0 ? "text-ink-2" : warn && "font-semibold text-warning",
      )}
    >
      {value}
    </span>
  );
}
