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
  personHref,
  useMonthName,
  WageSpans,
} from "./pay-parts";
import { PayMonthTable } from "./pay-table";
import type {
  NotePayView,
  PayMonthData,
  PayPaths,
  PayPerson,
} from "./pay-types";

/**
 * Hours for payroll: everyone's month, to the minute, with what to look at
 * before paying. Phone: the month's hero with the people rising over it, each
 * opening their month. Tablet: the list at the start and the chosen person's
 * days at the end. Desktop: one table, a person's days in a sheet. Each
 * person's hourly wage for the month beside their hours (P4); amounts come
 * with P7, the file with P8, which becomes the screen's main action.
 * `?show=noWage` lists only those whose shifts have no wage.
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
  const monthName = useMonthName();
  const monthHref = (month: string) => `${paths.pay}?month=${month}`;
  const empty = data.counts.withHours === 0;
  const caption = t("caption", {
    people: data.counts.withHours,
    toCheck: data.counts.toCheck,
  });
  const selected =
    data.people.find((person) => person.userId === data.selected) ?? null;
  const hero = (overlap: boolean) => (
    <PayHero
      month={data.month}
      currentMonth={data.currentMonth}
      hrefFor={monthHref}
      minutes={data.minutes}
      caption={caption}
      t={t}
      overlap={overlap}
    />
  );
  const name = (person: PayPerson) => person.name ?? t("noName");
  const row = (person: PayPerson, href: string, current = false) => (
    <ListRow
      key={person.userId}
      href={href}
      leading={<PersonAvatar name={person.name} photo={person.photo} />}
      title={name(person)}
      subtitle={<PersonLine person={person} t={t} />}
      // The person shown beside the list.
      current={current}
    />
  );

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

      <BeforePayrollCard
        before={data.before}
        t={t}
        fixHref={data.fixes ? `${paths.team}?month=${data.month}` : null}
        noWageHref={
          data.filter === "noWage"
            ? null
            : `${monthHref(data.month)}&show=noWage`
        }
      />

      {data.filter === "noWage" ? (
        <p className="flex flex-wrap items-center gap-x-4 px-1 text-ink-2">
          <span>{t("filter.noWage")}</span>
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

          {/* Tablet: the list, and the chosen person's days beside it. */}
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
                {selected.days.length > 0 ? (
                  <PayDayList days={selected.days} t={t} />
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
            />
          </div>
        </>
      )}
    </PageBody>
  );
}
