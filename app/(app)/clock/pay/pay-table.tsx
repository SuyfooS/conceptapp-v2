"use client";

import { hasEstimate, type RestName } from "@domain/pay-rates";
import { BUCKETS } from "@domain/payroll";
import { Badge } from "@ui/badge";
import { Card } from "@ui/card";
import { DataTable } from "@ui/data-table";
import { PersonAvatar } from "@ui/person-row";
import { Sheet } from "@ui/sheet";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  CountCell,
  MissingWage,
  PayDayList,
  type PayT,
  payMonthColumns,
  personHref,
  useHoursText,
  useMonthName,
  useShekels,
  WageSpans,
} from "./pay-parts";
import type { PayPaths, PayPerson } from "./pay-types";
import {
  type ClockT,
  dayRatesExtra,
  RateCell,
  RatesList,
  rateColumns,
} from "./rates-parts";

/**
 * The month's wages in the table: each stretch, then what is missing, in the
 * warning colour. With neither, a dash: the list on a phone and a tablet says
 * nothing there either.
 */
function WageCell({ row, t }: { row: PayPerson; t: PayT }) {
  if (!row.wage || (row.wage.spans.length === 0 && !row.wage.missing)) {
    return <span className="text-ink-2">{t("none")}</span>;
  }
  return (
    <span className="flex flex-col">
      {row.wage.spans.length > 0 ? (
        <span>
          <WageSpans wage={row.wage} t={t} />
        </span>
      ) : null}
      {row.wage.missing ? (
        <span className="font-semibold text-warning">
          <MissingWage wage={row.wage} t={t} />
        </span>
      ) : null}
    </span>
  );
}

/**
 * The person's estimate before tax, or a dash when there is none: no wage for
 * some days, or nothing in the month to estimate (as on a phone's row).
 */
function EstimateCell({ row, t }: { row: PayPerson; t: PayT }) {
  const shekels = useShekels();
  const agorot =
    row.rates && hasEstimate(row.rates) ? row.rates.estimateAgorot : null;
  return agorot === null ? (
    <span className="text-ink-2">{t("none")}</span>
  ) : (
    <span className="font-semibold">{shekels(agorot)}</span>
  );
}

/**
 * The month on a desktop: everyone in one table, with their hours at each rate
 * (payroll P7) and, while the business shows amounts, their estimate, and the
 * same counts as a phone's row; a person's month in a sheet over it, by rate
 * and day, with the way to their own page.
 */
export function PayMonthTable({
  people,
  month,
  paths,
  amounts,
  restName,
}: {
  people: readonly PayPerson[];
  month: string;
  paths: PayPaths;
  /** The business shows amounts (`payEstimate`). */
  amounts: boolean;
  /** How the rest columns are named: by the rest day everyone shares. */
  restName: RestName;
}) {
  const t = useTranslations("app.pay");
  const tc: ClockT = useTranslations("modules.time_clock");
  const hours = useHoursText();
  const monthName = useMonthName();
  // The sheet stays mounted, closed, so it opens already inside the
  // business's colour.
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const person = people.find((row) => row.userId === chosen) ?? null;
  const nameOf = (row: PayPerson) => row.name ?? t("noName");

  return (
    <>
      <Card padding="none" className="overflow-hidden">
        <DataTable
          caption={t("title")}
          columns={payMonthColumns(t, rateColumns(t, restName), amounts)}
          selected={open ? chosen : null}
          onSelect={(key) => {
            setChosen(key);
            setOpen(true);
          }}
          // Each row's button is named by what it shows: the name, and
          // "left" and "minor" when they show, each after a comma only a
          // screen reader hears ("מאיה פרץ, עזבה, נוער"), so they read as
          // parts, not one sentence. The avatar, a picture, stays out of it;
          // what the button does is said after, as its hint.
          rowHint={t("rowHint")}
          rows={people.map((row) => ({
            key: row.userId,
            cells: {
              name: (
                <span className="flex items-center gap-3">
                  <PersonAvatar name={row.name} photo={row.photo} />
                  <span className="flex flex-col">
                    <span>{nameOf(row)}</span>
                    {row.former ? (
                      <span className="font-normal text-ink-2 text-sm">
                        <span className="sr-only">, </span>
                        {t("former", { form: row.form })}
                      </span>
                    ) : null}
                  </span>
                  {row.minor ? (
                    <>
                      <span className="sr-only">, </span>
                      <Badge>{t("minor")}</Badge>
                    </>
                  ) : null}
                </span>
              ),
              number: row.payrollNumber ?? (
                <span className="text-ink-2">{t("none")}</span>
              ),
              days: row.totals.days,
              hours: (
                <span className="font-semibold">
                  {hours(row.totals.minutes)}
                </span>
              ),
              ...Object.fromEntries(
                BUCKETS.map((bucket) => [
                  bucket,
                  <RateCell
                    key={bucket}
                    minutes={row.rates?.buckets[bucket] ?? 0}
                  />,
                ]),
              ),
              nights: <CountCell value={row.rates?.nightShifts ?? 0} />,
              breaks:
                row.totals.unpaidBreakMinutes > 0
                  ? t("minutes", { minutes: row.totals.unpaidBreakMinutes })
                  : t("none"),
              wage: <WageCell row={row} t={t} />,
              estimate: <EstimateCell row={row} t={t} />,
              // The phone's row says each of these on its own, in these words.
              corrected: <CountCell value={row.totals.corrected} />,
              toCheck: (
                <CountCell value={row.totals.waiting + row.totals.open} warn />
              ),
              remarks: <CountCell value={row.rates?.toCheck ?? 0} warn />,
            },
          }))}
        />
      </Card>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={person ? nameOf(person) : t("title")}
        subtitle={
          person
            ? `${monthName(month)} · ${t("person.caption", {
                days: person.totals.days,
                shifts: person.totals.shifts,
              })}`
            : undefined
        }
        closeLabel={t("sheet.close")}
      >
        {person ? (
          <div className="flex flex-col gap-3">
            {person.wage ? (
              <p className="px-1 text-ink-2">
                <WageCell row={person} t={t} />
              </p>
            ) : null}
            {person.rates ? (
              <RatesList
                rates={person.rates}
                amounts={amounts}
                form={person.form}
                t={t}
                tc={tc}
                className="bg-elevated"
              />
            ) : null}
            {person.days.length > 0 ? (
              <PayDayList
                days={person.days}
                t={t}
                className="bg-elevated"
                extra={
                  person.rates
                    ? dayRatesExtra(person.rates, person.days, t, tc)
                    : undefined
                }
              />
            ) : (
              <p className="px-1 text-ink-2">
                {t("person.empty.title", { month: monthName(month) })}
              </p>
            )}
            <Link
              href={personHref(paths.pay, person.userId, month)}
              className="inline-flex min-h-11 items-center self-start px-1 font-semibold text-ink underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-accent"
            >
              {t("sheet.page", { name: nameOf(person) })}
            </Link>
          </div>
        ) : null}
      </Sheet>
    </>
  );
}
