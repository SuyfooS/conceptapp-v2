"use client";

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
  WageSpans,
} from "./pay-parts";
import type { PayPaths, PayPerson } from "./pay-types";

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
 * The month on a desktop: everyone in one table, and a person's days in a
 * sheet over it, with the way to their own page.
 */
export function PayMonthTable({
  people,
  month,
  paths,
}: {
  people: readonly PayPerson[];
  month: string;
  paths: PayPaths;
}) {
  const t = useTranslations("app.pay");
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
          columns={payMonthColumns(t)}
          selected={open ? chosen : null}
          onSelect={(key) => {
            setChosen(key);
            setOpen(true);
          }}
          rows={people.map((row) => ({
            key: row.userId,
            label: t("open", { name: nameOf(row) }),
            cells: {
              name: (
                <span className="flex items-center gap-3">
                  <PersonAvatar name={row.name} photo={row.photo} />
                  <span className="flex flex-col">
                    <span>{nameOf(row)}</span>
                    {row.former ? (
                      <span className="font-normal text-ink-2 text-sm">
                        {t("former", { form: row.form })}
                      </span>
                    ) : null}
                  </span>
                  {row.minor ? <Badge>{t("minor")}</Badge> : null}
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
              wage: <WageCell row={row} t={t} />,
              shifts: row.totals.shifts,
              breaks:
                row.totals.unpaidBreakMinutes > 0
                  ? t("minutes", { minutes: row.totals.unpaidBreakMinutes })
                  : t("none"),
              corrected: <CountCell value={row.totals.corrected} />,
              waiting: <CountCell value={row.totals.waiting} warn />,
              toCheck: (
                <CountCell value={row.totals.waiting + row.totals.open} warn />
              ),
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
            {person.days.length > 0 ? (
              <PayDayList days={person.days} t={t} className="bg-elevated" />
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
