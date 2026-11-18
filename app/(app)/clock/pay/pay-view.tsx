import { addMonths } from "@domain/time-clock";
import { Badge } from "@ui/badge";
import { EmptyState } from "@ui/empty-state";
import { ListGroup, ListRow } from "@ui/list-row";
import { PageBody, PageHeader, PageSection } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { PersonAvatar } from "@ui/person-row";
import { ReceiptText } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { type AppWording, translator } from "../../wording";
import { MonthCloseAction } from "./close-month";
import { ExportButton } from "./export-button";
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
  useShortDate,
  WageSpans,
} from "./pay-parts";
import { PayMonthTable } from "./pay-table";
import type {
  CloseMonth,
  NotePayView,
  PayMonthData,
  PayPaths,
  PayPerson,
  ReopenMonth,
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
 * month's file for payroll (P8) is the screen's main action, on every shape,
 * with what it holds and when the last one went out, warned when the hours or
 * wages changed since. `?show=noWage` lists only those whose shifts have no
 * wage, `?show=noNumber` those with no payroll number. A month that has
 * ended closes (P9): the owner or an accountant closes it beside the file,
 * the header then says when and by whom, and they may reopen it with a
 * reason; what changed since goes into the next month's file, which says so,
 * and which is there to download even when that month has no hours.
 */
export function PayMonthView({
  data,
  paths,
  note,
  close,
  reopen,
  wording,
}: {
  data: PayMonthData;
  paths: PayPaths;
  /** Notes the view once it is on screen; the demo notes nothing. */
  note: NotePayView;
  /** Closes the month, and reopens it; the demo's store nothing. */
  close: CloseMonth;
  reopen: ReopenMonth;
  /** The business's words. */
  wording: AppWording;
}) {
  const t = translator(wording, "app.pay");
  const tc: ClockT = translator(wording, "modules.time_clock");
  const monthName = useMonthName();
  const shortDate = useShortDate();
  const shekels = useShekels();
  const monthHref = (month: string) => `${paths.pay}?month=${month}`;
  // The demo's file path may carry a query of its own (`demoPayPathsFor`).
  const fileHref = `${paths.file}${paths.file.includes("?") ? "&" : "?"}month=${data.month}`;
  const empty = data.counts.withHours === 0;
  // A month with no hours has no file, unless the month before's differences
  // go into it (payroll P9): then its file is still the main action.
  const fileless = empty && !data.differences;
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
  const ltrSpan = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;
  // Closing the month (payroll P9): the owner's and an accountant's second
  // action, beside the file; once closed, the header says when and by whom.
  const { closing } = data;
  const closedLine = closing.closed
    ? closing.closed.by
      ? t.rich("close.closedBy", {
          ltr: ltrSpan,
          date: shortDate(closing.closed.date),
          name: closing.closed.by,
        })
      : t.rich("close.closedOn", {
          ltr: ltrSpan,
          date: shortDate(closing.closed.date),
        })
    : null;
  // An empty month that never closed has nothing to close.
  const closeAction =
    !closing.can || !closing.ended || (empty && !closing.closed) ? null : (
      <MonthCloseAction
        month={data.month}
        monthName={monthName(data.month)}
        closed={closing.closed !== null}
        close={close}
        reopen={reopen}
      />
    );
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
        subtitle={
          closedLine ? (
            <>
              <span className="block">{t("subtitle")}</span>
              <span className="block font-medium text-ink">{closedLine}</span>
            </>
          ) : (
            t("subtitle")
          )
        }
        // The screen's main action (payroll P8): the month's file, once it
        // has hours or the month before's differences; beside it, closing or
        // reopening the month (P9).
        actions={
          fileless ? (
            (closeAction ?? undefined)
          ) : (
            <>
              <ExportButton
                href={fileHref}
                label={t("file.download")}
                done={t("file.downloading")}
              />
              {closeAction}
            </>
          )
        }
      />

      {fileless ? null : (
        <div className="flex flex-col gap-1 px-1 text-ink-2">
          {/* What the file holds, and what it never does. */}
          <p>{t("file.what")}</p>
          {/* The month before changed since it closed: this file says so. */}
          {data.differences ? (
            <p>
              {t("diff.inFile", {
                month: monthName(data.differences.month),
                count: data.differences.days,
              })}
            </p>
          ) : null}
          {/* Closing it, and what happens to a correction after. */}
          {closeAction && !closing.closed ? <p>{t("close.hint")}</p> : null}
          {closing.closed && closing.changed > 0 ? (
            <p className="font-medium text-warning">
              {t("diff.changed", {
                count: closing.changed,
                next: monthName(addMonths(data.month, 1)),
              })}
              {/* The month after closed already: its file may lack them. */}
              {closing.nextClosed ? (
                <span className="block">
                  {t("diff.nextClosed", {
                    next: monthName(addMonths(data.month, 1)),
                  })}
                </span>
              ) : null}
            </p>
          ) : null}
          {data.lastFile ? (
            <p
              className={
                data.lastFile.changed ? "font-medium text-warning" : undefined
              }
            >
              {t.rich(data.lastFile.changed ? "file.changed" : "file.last", {
                ltr: (chunks) => <span dir="ltr">{chunks}</span>,
                month: monthName(data.month),
                date: shortDate(data.lastFile.date),
                time: data.lastFile.time,
              })}
            </p>
          ) : null}
          {/* Every amount on the screen sits under one line; without amounts, why. */}
          {empty ? null : (
            <p>{data.amounts ? t("estimate.under") : t("estimate.off")}</p>
          )}
        </div>
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
