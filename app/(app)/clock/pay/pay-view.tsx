import { Badge } from "@ui/badge";
import { EmptyState } from "@ui/empty-state";
import { ListGroup, ListRow } from "@ui/list-row";
import { PageBody, PageHeader, PageSection } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { PersonAvatar } from "@ui/person-row";
import { ReceiptText } from "lucide-react";
import Link from "next/link";
import { type AppWording, translator } from "../../wording";
import { NoteView } from "./note-view";
import {
  BeforePayrollCard,
  MissingWage,
  PayDayList,
  PayHero,
  PersonLine,
  payCaption,
  personHref,
  useMonthName,
  useShekels,
  WageSpans,
} from "./pay-parts";
import { PayMonthTable } from "./pay-table";
import type {
  NotePayView,
  PayMonthData,
  PayPaths,
  PayPerson,
} from "./pay-types";
import {
  type ClockT,
  dayRatesExtra,
  FlagText,
  HolidayPayRemark,
  RatesList,
} from "./rates-parts";

/**
 * Hours for payroll: everyone's month, to the minute, with what to look at
 * before paying. Phone: the month's hero with the people rising over it, each
 * opening their month. Tablet: the list at the start and the chosen person's
 * month at the end. Desktop: one table, a person's days in a sheet. Each
 * person's hourly wage for the month beside their hours (P4), a minor marked
 * and the payroll number on a desktop (P5), and from the hours engine (P7)
 * each person's hours by rate, what to check in words, and while the business
 * shows amounts (`payEstimate`) each estimate before tax and the month's. The
 * file comes with P8, and becomes the screen's main action.
 * `?show=noWage` lists only those whose shifts have no wage, `?show=noNumber`
 * those with no payroll number.
 */
export function PayMonthView({
  data,
  paths,
  note,
  wording,
}: {
  data: PayMonthData;
  paths: PayPaths;
  /** Notes the view once it is on screen; the demo notes nothing. */
  note: NotePayView;
  /** The business's words. */
  wording: AppWording;
}) {
  const t = translator(wording, "app.pay");
  const tc: ClockT = translator(wording, "modules.time_clock");
  const monthName = useMonthName();
  const shekels = useShekels();
  const monthHref = (month: string) => `${paths.pay}?month=${month}`;
  const empty = data.counts.withHours === 0;
  // Shifts and remarks each on their own: "nothing to check" only with neither.
  const caption = payCaption(t, {
    people: data.counts.withHours,
    shifts: data.counts.toCheck,
    remarks: data.remarks.total,
  });
  const estimate = data.estimate ? (
    <>
      {t.rich("estimate.total", {
        ltr: (chunks) => (
          <span dir="ltr" className="font-semibold tabular-nums">
            {chunks}
          </span>
        ),
        amount: shekels(data.estimate.agorot),
      })}
      {data.estimate.missing > 0 ? (
        <span className="block text-sm">
          {t("estimate.missing", { count: data.estimate.missing })}
        </span>
      ) : null}
    </>
  ) : null;
  const selected =
    data.people.find((person) => person.userId === data.selected) ?? null;
  const hero = (overlap: boolean) => (
    <PayHero
      month={data.month}
      currentMonth={data.currentMonth}
      hrefFor={monthHref}
      minutes={data.minutes}
      caption={caption}
      estimate={estimate}
      t={t}
      overlap={overlap}
    />
  );
  const name = (person: { name: string | null }) => person.name ?? t("noName");
  const row = (person: PayPerson, href: string, current = false) => (
    <ListRow
      key={person.userId}
      href={href}
      leading={<PersonAvatar name={person.name} photo={person.photo} />}
      title={name(person)}
      subtitle={<PersonLine person={person} t={t} amounts={data.amounts} />}
      // A minor: the row's one badge.
      trailing={person.minor ? <Badge>{t("minor")}</Badge> : undefined}
      // The person shown beside the list.
      current={current}
    />
  );
  // What the engine asks to check, each in words with whose it is, for the
  // accent card (payroll P7).
  const remarks = [
    // One line per person and kind of remark, and one for their pay for days
    // not worked: the lines and the rest add up to the hero's count.
    ...data.remarks.lines.map((line) => ({
      key: `${line.userId}:${"flag" in line ? line.flag.code : "holidayPay"}`,
      line: (
        <>
          <span className="font-semibold">{name(line)}</span>
          {": "}
          {"flag" in line ? (
            <FlagText flag={line.flag} tc={tc} />
          ) : (
            <HolidayPayRemark line={line.holidayPay} t={t} tc={tc} />
          )}
          {line.more > 0
            ? ` · ${t("remarks.more", { count: line.more })}`
            : null}
        </>
      ),
    })),
    ...(data.remarks.rest > 0
      ? [
          {
            key: "rest",
            line: (
              <span className="text-ink-2">
                {t("remarks.rest", { count: data.remarks.rest })}
              </span>
            ),
          },
        ]
      : []),
  ];

  return (
    <PageBody className={pageGlowClass}>
      <NoteView month={data.month} kind="month" note={note} />
      <PageHeader
        back={
          data.back === "team"
            ? {
                href: `${paths.team}?month=${data.month}`,
                label: t("backTeam"),
              }
            : data.back === "clock"
              ? { href: paths.clock, label: t("backClock") }
              : undefined
        }
        title={t("title")}
        subtitle={t("subtitle")}
      />

      {/* Every amount on the screen sits under one line; without amounts, why. */}
      {empty ? null : (
        <p className="px-1 text-ink-2">
          {data.amounts ? t("estimate.under") : t("estimate.off")}
        </p>
      )}

      <BeforePayrollCard
        before={data.before}
        t={t}
        fixHref={data.fixes ? `${paths.team}?month=${data.month}` : null}
        noWageHref={
          data.filter === "noWage"
            ? null
            : `${monthHref(data.month)}&show=noWage`
        }
        noNumberHref={
          data.filter === "noNumber"
            ? null
            : `${monthHref(data.month)}&show=noNumber`
        }
        remarks={remarks}
      />

      {data.filter ? (
        <p className="flex flex-wrap items-center gap-x-4 px-1 text-ink-2">
          <span>{t(`filter.${data.filter}`)}</span>
          <Link
            href={monthHref(data.month)}
            className="inline-flex min-h-11 items-center font-semibold text-ink underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-accent"
          >
            {t("filter.all")}
          </Link>
        </p>
      ) : null}

      {empty ? (
        <div className="flex flex-col gap-2 md:mx-auto md:w-full md:max-w-2xl">
          {hero(false)}
          <EmptyState
            icon={<ReceiptText />}
            headingLevel="h2"
            title={t("empty.title", { month: monthName(data.month) })}
            // A month gone by gets no more hours: the way is to another one.
            body={t(
              data.month < data.currentMonth ? "empty.bodyPast" : "empty.body",
              { month: monthName(data.month) },
            )}
            className="py-8"
          />
        </div>
      ) : (
        <>
          {/* Phone: one month, the people rising over it. */}
          <div className="flex flex-col md:hidden">
            {hero(true)}
            <ListGroup className="relative z-10 mx-3 -mt-[56px] shadow-float">
              {data.people.map((person) =>
                row(person, personHref(paths.pay, person.userId, data.month)),
              )}
            </ListGroup>
          </div>

          {/* Tablet: the list, and the chosen person's month beside it. */}
          <div className="hidden md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:items-start md:gap-6 xl:hidden">
            <div className="flex min-w-0 flex-col">
              {hero(true)}
              <ListGroup className="relative z-10 mx-3 -mt-[56px] shadow-float">
                {data.people.map((person) =>
                  row(
                    person,
                    `${paths.pay}?month=${data.month}&person=${person.userId}${
                      data.filter ? `&show=${data.filter}` : ""
                    }`,
                    person.userId === selected?.userId,
                  ),
                )}
              </ListGroup>
            </div>
            {selected ? (
              <PageSection
                title={name(selected)}
                action={
                  <Link
                    href={personHref(paths.pay, selected.userId, data.month)}
                    className="inline-flex min-h-11 items-center font-medium text-ink-2 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    {t("sheet.page", { name: name(selected) })}
                  </Link>
                }
              >
                <p className="px-1 text-ink-2">
                  {t("person.caption", {
                    days: selected.totals.days,
                    shifts: selected.totals.shifts,
                  })}
                  {selected.wage && selected.wage.spans.length > 0 ? (
                    <span className="block">
                      <WageSpans wage={selected.wage} t={t} />
                    </span>
                  ) : null}
                  {selected.wage?.missing ? (
                    <span className="block font-medium text-warning">
                      <MissingWage wage={selected.wage} t={t} />
                    </span>
                  ) : null}
                </p>
                {/* The person column shows the rates (payroll P7). */}
                {selected.rates ? (
                  <RatesList
                    rates={selected.rates}
                    amounts={data.amounts}
                    form={selected.form}
                    t={t}
                    tc={tc}
                  />
                ) : null}
                {selected.days.length > 0 ? (
                  <PayDayList
                    days={selected.days}
                    t={t}
                    extra={
                      selected.rates
                        ? dayRatesExtra(selected.rates, selected.days, t, tc)
                        : undefined
                    }
                  />
                ) : (
                  <p className="px-1 text-ink-2">
                    {t("person.empty.body", { form: selected.form })}
                  </p>
                )}
              </PageSection>
            ) : null}
          </div>

          {/* Desktop: the full picture. */}
          <div className="hidden flex-col gap-6 xl:flex">
            <div className="max-w-xl">{hero(false)}</div>
            <PayMonthTable
              people={data.people}
              month={data.month}
              paths={paths}
              amounts={data.amounts}
              restName={data.restName}
            />
          </div>
        </>
      )}
    </PageBody>
  );
}
