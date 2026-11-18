import type { HolidayPayLine } from "@domain/holiday-pay";
import type { PayDay } from "@domain/pay-month";
import {
  type DayTag,
  daySplit,
  dayTags,
  type FlagFormat,
  flagValues,
  hasEstimate,
  keyedFlags,
  type PersonRates,
  type RatesDay,
  type RestName,
  ratesShown,
  restNameOf,
} from "@domain/pay-rates";
import { BUCKETS, type Bucket, bucketAgorot } from "@domain/payroll";
import type { OneOffRestDayKey } from "@domain/payroll-calendar";
import type { PayrollFlag } from "@domain/payroll-flags";
import type { AddressForm } from "@domain/profile";
import { Card } from "@ui/card";
import type { DataColumn } from "@ui/data-table";
import { ListGroup, ListRow } from "@ui/list-row";
import { CircleCheck, Info, TriangleAlert } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import type { Translator } from "../../wording";
import { type PayT, useHoursText, useShekels, useShortDate } from "./pay-parts";

/*
 * The parts the pay screens draw the hours engine with (payroll P7): rates,
 * the estimate, the pay for days not worked, what to check and each day's
 * split, for the app's server views and the client parts alike. Words come
 * in as `t` (app.pay) and `tc` (modules.time_clock, where the flags, the
 * holidays and the one-off rest days have theirs).
 */

export type ClockT = Translator<"modules.time_clock">;

const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;

/** How this screen writes a flag's values: days, hours, shekels, holidays by name. */
export function useFlagFormat(tc: ClockT): FlagFormat {
  const date = useShortDate();
  const hours = useHoursText();
  const shekels = useShekels();
  return {
    date,
    hours,
    shekels,
    holiday: (key) => tc(`holidays.${key}`),
    oneOff: (key) => tc(`oneOffRestDays.${key as OneOffRestDayKey}`),
  };
}

/** A flag in its words (`modules.time_clock.payroll.flags`). */
export function FlagText({ flag, tc }: { flag: PayrollFlag; tc: ClockT }) {
  const format = useFlagFormat(tc);
  return tc.rich(`payroll.flags.${flag.code}`, {
    ...flagValues(flag, format),
    ltr,
  });
}

/** Minutes at one rate, as payroll reads them: "8.60 שעות נוספות 125%". */
export function RateText({
  bucket,
  minutes,
  rest,
  t,
}: {
  bucket: Bucket;
  minutes: number;
  rest: RestName;
  t: PayT;
}) {
  const hours = useHoursText();
  return t.rich(`rates.${bucket}`, { ltr, hours: hours(minutes), rest });
}

/** An amount in shekels, left to right, the same width per digit. */
function Amount({ agorot, className }: { agorot: number; className?: string }) {
  const shekels = useShekels();
  return (
    <span dir="ltr" className={className ?? "text-ink tabular-nums"}>
      {shekels(agorot)}
    </span>
  );
}

/** What a line of pay for a day not worked says to check, by the person's form of address. */
function HolidayChecks({
  line,
  form,
  t,
}: {
  line: HolidayPayLine;
  form: AddressForm;
  t: PayT;
}) {
  return line.check.map((check) => (
    <span key={check} className="block font-medium text-warning">
      {t(`holidayPay.checks.${check}`, { form })}
    </span>
  ));
}

/** A line of pay for a day not worked: which day, its average and what to check, and its amount. */
function HolidayPayRow({
  line,
  amounts,
  form,
  t,
  tc,
}: {
  line: HolidayPayLine;
  amounts: boolean;
  form: AddressForm;
  t: PayT;
  tc: ClockT;
}) {
  const date = useShortDate();
  const hours = useHoursText();
  return (
    <ListRow
      title={
        line.holiday
          ? t.rich("holidayPay.holiday", {
              ltr,
              holiday: tc(`holidays.${line.holiday}`),
              date: date(line.date),
            })
          : t.rich("holidayPay.oneOff", {
              ltr,
              day: tc(
                `oneOffRestDays.${(line.oneOffRestDay ?? "") as OneOffRestDayKey}`,
              ),
              date: date(line.date),
            })
      }
      subtitle={
        <>
          {line.averageMinutes !== null ? (
            <span className="block">
              {t.rich("holidayPay.average", {
                ltr,
                hours: hours(line.averageMinutes),
              })}
            </span>
          ) : null}
          <HolidayChecks line={line} form={form} t={t} />
        </>
      }
      trailing={
        amounts && line.agorot !== null ? (
          <Amount agorot={line.agorot} />
        ) : undefined
      }
    />
  );
}

/**
 * A line of pay for a day not worked, as a thing to check: which day, and
 * that its pay waits for a check ("דמי חג על יום כיפור, 21.9, לבדיקה").
 */
export function HolidayPayRemark({
  line,
  t,
  tc,
}: {
  line: HolidayPayLine;
  t: PayT;
  tc: ClockT;
}) {
  const date = useShortDate();
  return line.holiday
    ? t.rich("remarks.holidayPay", {
        ltr,
        holiday: tc(`holidays.${line.holiday}`),
        date: date(line.date),
      })
    : t.rich("remarks.oneOff", {
        ltr,
        day: tc(
          `oneOffRestDays.${(line.oneOffRestDay ?? "") as OneOffRestDayKey}`,
        ),
        date: date(line.date),
      });
}

/**
 * The month by rate: for each wage, the rates with minutes and, while the
 * business shows amounts, what each comes to; then the pay for days not
 * worked; then the estimate before tax, or why there is none. A raise in the
 * month gives each wage its own heading row. Shifts still open are said last:
 * the month's hours count them up to now, the rates once they end.
 */
export function RatesList({
  rates,
  amounts,
  form,
  t,
  tc,
  className,
}: {
  rates: PersonRates;
  amounts: boolean;
  /** The person's form of address, for the holiday lines' checks. */
  form: AddressForm;
  t: PayT;
  tc: ClockT;
  className?: string;
}) {
  const date = useShortDate();
  const shekels = useShekels();
  const rest = restNameOf(rates.restDay);
  const many = rates.segments.length > 1;
  const empty = rates.segments.every(
    (segment) => ratesShown(segment.buckets).length === 0,
  );
  return (
    <ListGroup className={className}>
      {empty ? <ListRow title={t("rateCard.empty")} /> : null}
      {rates.segments.map((segment) => (
        <Fragment key={segment.from}>
          {many ? (
            <ListRow
              title={
                segment.agorot === null
                  ? t.rich("rateCard.segmentNoWage", {
                      ltr,
                      from: date(segment.from),
                      to: date(segment.to),
                    })
                  : t.rich("rateCard.segment", {
                      ltr,
                      amount: shekels(segment.agorot),
                      from: date(segment.from),
                      to: date(segment.to),
                    })
              }
              trailing={
                amounts && segment.amountAgorot !== null ? (
                  <Amount
                    agorot={segment.amountAgorot}
                    className="font-semibold text-ink tabular-nums"
                  />
                ) : undefined
              }
            />
          ) : null}
          {ratesShown(segment.buckets).map((bucket) => (
            <ListRow
              key={bucket}
              title={
                <span className={many ? "font-normal" : undefined}>
                  <RateText
                    bucket={bucket}
                    minutes={segment.buckets[bucket]}
                    rest={rest}
                    t={t}
                  />
                </span>
              }
              trailing={
                amounts && segment.agorot !== null ? (
                  <Amount
                    agorot={bucketAgorot(
                      segment.buckets[bucket],
                      segment.agorot,
                      bucket,
                    )}
                  />
                ) : undefined
              }
            />
          ))}
        </Fragment>
      ))}
      {rates.holidayPay.map((line) => (
        <HolidayPayRow
          key={line.date}
          line={line}
          amounts={amounts}
          form={form}
          t={t}
          tc={tc}
        />
      ))}
      {amounts && hasEstimate(rates) ? (
        <ListRow
          title={t("estimate.label")}
          subtitle={
            rates.estimateAgorot === null ? (
              <span className="font-medium text-warning">
                {t("estimate.none")}
              </span>
            ) : undefined
          }
          trailing={
            rates.estimateAgorot !== null ? (
              <Amount
                agorot={rates.estimateAgorot}
                className="font-bold text-ink text-xl tabular-nums"
              />
            ) : undefined
          }
        />
      ) : null}
      {rates.open > 0 ? (
        <ListRow
          title={
            <span className="font-medium text-warning">
              {t("beforePayroll.open", { count: rates.open })}
            </span>
          }
        />
      ) : null}
    </ListGroup>
  );
}

/**
 * What to check in a person's month, in words: its remarks, then each line of
 * pay for a day not worked with what to check on it (so the list holds all
 * that "N הערות לבדיקה" counts), and how they are paid when the Hours law
 * doesn't apply.
 */
export function RemarksList({
  remarks,
  holidayPay,
  aboutPay,
  form,
  tc,
  t,
  children,
}: {
  remarks: readonly PayrollFlag[];
  holidayPay: readonly HolidayPayLine[];
  aboutPay: readonly PayrollFlag[];
  /** The person's form of address, for the holiday lines' checks. */
  form: AddressForm;
  tc: ClockT;
  t: PayT;
  /** Notes on the whole month, under the remarks. */
  children?: ReactNode;
}) {
  return (
    <Card padding="lg" className="flex flex-col gap-3">
      {remarks.length === 0 &&
      holidayPay.length === 0 &&
      aboutPay.length === 0 ? (
        <p className="flex items-start gap-2 text-ink-2">
          <CircleCheck
            aria-hidden="true"
            className="mt-0.5 size-5 shrink-0 text-success"
          />
          {t("remarks.none")}
        </p>
      ) : (
        <ul className="flex flex-col gap-2 text-ink">
          {keyedFlags(remarks).map(({ key, flag }) => (
            <li key={key} className="flex items-start gap-2">
              <TriangleAlert
                aria-hidden="true"
                className="mt-0.5 size-5 shrink-0 text-warning"
              />
              <span>
                <FlagText flag={flag} tc={tc} />
              </span>
            </li>
          ))}
          {holidayPay.map((line) => (
            <li key={`pay:${line.date}`} className="flex items-start gap-2">
              <TriangleAlert
                aria-hidden="true"
                className="mt-0.5 size-5 shrink-0 text-warning"
              />
              <span className="flex flex-col">
                <span>
                  <HolidayPayRemark line={line} t={t} tc={tc} />
                </span>
                {line.check.map((check) => (
                  <span key={check} className="text-ink-2 text-sm">
                    {t(`holidayPay.checks.${check}`, { form })}
                  </span>
                ))}
              </span>
            </li>
          ))}
          {aboutPay.map((flag) => (
            <li key={flag.code} className="flex items-start gap-2">
              <Info
                aria-hidden="true"
                className="mt-0.5 size-5 shrink-0 text-ink-2"
              />
              <span>
                <FlagText flag={flag} tc={tc} />
              </span>
            </li>
          ))}
        </ul>
      )}
      {children}
    </Card>
  );
}

/** A day's tags in words: a holiday or election day by name, the rest, an eve, a night shift. */
function tagText(
  tag: DayTag,
  day: RatesDay,
  rest: RestName,
  t: PayT,
  tc: ClockT,
): string {
  switch (tag) {
    case "holiday":
      return day.holiday ? tc(`holidays.${day.holiday}`) : "";
    case "oneOff":
      return tc(
        `oneOffRestDays.${(day.oneOffRestDay ?? "") as OneOffRestDayKey}`,
      );
    case "rest":
      return t("tags.rest", { rest });
    case "eve":
      return t("tags.eve", { rest });
    case "night":
      return t("tags.night");
    default:
      return tag satisfies never;
  }
}

/**
 * What the engine adds under a shift in a list: on the day's last shift, its
 * minutes past the regular ones by rate ("מתוכן 0.60 נוספות 125%"), what kind
 * of day it was, and what to check on it, in the warning colour.
 */
export function DayRates({
  day,
  rest,
  t,
  tc,
}: {
  day: RatesDay;
  rest: RestName;
  t: PayT;
  tc: ClockT;
}) {
  const hours = useHoursText();
  const split = daySplit(day.buckets);
  const tags = dayTags(day);
  return (
    <>
      {split.length > 0 ? (
        <span className="block">
          {day.shifts > 1
            ? t.rich("day.ofWhichDay", { ltr, hours: hours(day.minutes) })
            : t("day.ofWhich")}{" "}
          {split.map((part, index) => (
            <Fragment key={part.bucket}>
              {index > 0 ? ", " : null}
              {t.rich("day.part", {
                ltr,
                hours: hours(part.minutes),
                rate: t(`rateColumns.${part.bucket}`, { rest }),
              })}
            </Fragment>
          ))}
        </span>
      ) : null}
      {tags.length > 0 ? (
        <span className="block">
          {tags.map((tag) => tagText(tag, day, rest, t, tc)).join(" · ")}
        </span>
      ) : null}
      {keyedFlags(day.remarks).map(({ key, flag }) => (
        <span key={key} className="block font-medium text-warning">
          <FlagText flag={flag} tc={tc} />
        </span>
      ))}
    </>
  );
}

/**
 * The engine's extra under each shift of a list (`PayDayList`'s `extra`): a
 * day's rates, tags and remarks on its last shift only, so a day with two
 * shifts says them once.
 */
export function dayRatesExtra(
  rates: Pick<PersonRates, "days" | "restDay">,
  shifts: readonly PayDay[],
  t: PayT,
  tc: ClockT,
): (shift: PayDay) => ReactNode {
  const lastOfDay = new Map<string, string>();
  for (const shift of shifts) lastOfDay.set(shift.date, shift.id);
  const rest = restNameOf(rates.restDay);
  return (shift) => {
    if (lastOfDay.get(shift.date) !== shift.id) return null;
    const day = rates.days.find((one) => one.date === shift.date);
    return day ? <DayRates day={day} rest={rest} t={t} tc={tc} /> : null;
  };
}

/** The rate columns of a table, in payroll's order, named by the rest day `rest`. */
export function rateColumns(t: PayT, rest: RestName): DataColumn[] {
  return BUCKETS.map((bucket) => ({
    key: bucket,
    label: t(`rateColumns.${bucket}`, { rest }),
    align: "end",
    numeric: true,
  }));
}

/** Minutes at a rate in a table cell: decimal hours, quiet when there are none. */
export function RateCell({ minutes }: { minutes: number }) {
  const hours = useHoursText();
  return (
    <span className={minutes > 0 ? undefined : "text-ink-2"}>
      {hours(minutes)}
    </span>
  );
}

/** The engine's columns of the person's days table, after the net hours: each rate, the kind of day, what to check. */
export function dayRateColumns(t: PayT, rest: RestName): DataColumn[] {
  return [
    ...rateColumns(t, rest),
    { key: "kind", label: t("dayColumns.kind") },
    { key: "toCheck", label: t("dayColumns.toCheck") },
  ];
}

/**
 * The engine's cells of a day in the person's table (`PayDayTable`'s
 * `extraCells`, under `dayRateColumns`): the day's minutes at each rate,
 * what kind of day it was and what to check on it, on its last shift only.
 */
export function dayRateCells(
  rates: Pick<PersonRates, "days" | "restDay">,
  shifts: readonly PayDay[],
  t: PayT,
  tc: ClockT,
): (shift: PayDay) => Record<string, ReactNode> {
  const lastOfDay = new Map<string, string>();
  for (const shift of shifts) lastOfDay.set(shift.date, shift.id);
  const rest = restNameOf(rates.restDay);
  const none = t("none");
  return (shift) => {
    const day =
      lastOfDay.get(shift.date) === shift.id
        ? rates.days.find((one) => one.date === shift.date)
        : undefined;
    if (!day) return {};
    return {
      ...Object.fromEntries(
        BUCKETS.map((bucket) => [
          bucket,
          <RateCell key={bucket} minutes={day.buckets[bucket]} />,
        ]),
      ),
      kind:
        dayTags(day).length > 0 ? (
          dayTags(day)
            .map((tag) => tagText(tag, day, rest, t, tc))
            .join(" · ")
        ) : (
          <span className="text-ink-2">{none}</span>
        ),
      toCheck:
        day.remarks.length > 0 ? (
          <span className="flex flex-col gap-1 font-medium text-sm text-warning">
            {keyedFlags(day.remarks).map(({ key, flag }) => (
              <span key={key}>
                <FlagText flag={flag} tc={tc} />
              </span>
            ))}
          </span>
        ) : (
          <span className="text-ink-2">{none}</span>
        ),
    };
  };
}
