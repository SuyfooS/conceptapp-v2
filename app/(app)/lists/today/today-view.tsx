import { weekdayOf } from "@domain/availability";
import { dayMonth, WEEKDAY_KEYS } from "@domain/availability-form";
import { type ListSummary, numberRange, signed } from "@domain/lists";
import { timeIn } from "@domain/shabbat";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { cn } from "@ui/cn";
import { EmptyState } from "@ui/empty-state";
import { ListGroup, ListRow } from "@ui/list-row";
import { PageBody, PageHeader, PageSection } from "@ui/page";
import { pageGlowClass } from "@ui/page-glow";
import { ListChecks, Send, Thermometer, TriangleAlert } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { type AppWording, type Translator, translator } from "../../wording";
import { ListCard, type ListShown, ListTable } from "../list-card";
import type { DayReading, ListsTodayData, WeekReadings } from "../list-types";
import { ltr, personName } from "../list-words";
import { DayPicker } from "./day-picker";

type T = Translator<"app.lists.overview">;

/** Where the overview leads, inside the app or the demo. */
export type TodayPaths = {
  lists: string;
  list: (id: string) => string;
  /** The overview itself; a past day is `?day=`. */
  today: string;
  send: string;
  /** The screen of templates, and one template's editor. */
  templates: string;
  template: (id: string) => string;
};

/** A reading with its sign and unit, as the list shows it. */
function readingText(reading: number, unit: string | null) {
  return `${signed(reading)}${unit ? ` ${unit}` : ""}`;
}

function rangeNote(
  tl: Translator<"app.lists.list">,
  item: { min: number | null; max: number | null; unit: string | null },
): ReactNode {
  const range = numberRange(item);
  return range
    ? tl.rich(`range.${range.kind}`, { ltr, range: range.range })
    : null;
}

/** A section's lists as cards; its title says when it has none. */
function Cards({
  lists,
  shown,
}: {
  lists: readonly ListSummary[];
  shown: ListShown;
}) {
  if (lists.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      {lists.map((list) => (
        <ListCard key={list.id} list={list} shown={shown} />
      ))}
    </div>
  );
}

/** The day's readings, those outside their range first and flagged. */
function Readings({
  readings,
  data,
  t,
  tl,
  shown,
}: {
  readings: readonly DayReading[];
  data: ListsTodayData;
  t: T;
  tl: Translator<"app.lists.list">;
  shown: ListShown;
}) {
  const out = readings.filter((r) => r.outOfRange).length;
  return (
    <PageSection
      title={t("readings.title")}
      action={
        out > 0 ? (
          <Badge tone="warning">
            {t("readings.outOfRange", { count: out })}
          </Badge>
        ) : null
      }
    >
      {readings.length === 0 ? (
        <p className="px-1 text-ink-2">{t("readings.none")}</p>
      ) : (
        <ListGroup>
          {readings.map((r) => (
            <ListRow
              key={`${r.listId}:${r.label}:${r.doneAt}`}
              href={shown.href(r.listId)}
              leading={r.outOfRange ? <TriangleAlert /> : <Thermometer />}
              title={t("readings.of", { label: r.label, list: r.listName })}
              subtitle={
                <>
                  <span
                    dir="ltr"
                    className={cn(r.outOfRange && "font-semibold text-warning")}
                  >
                    {readingText(r.reading, r.unit)}
                  </span>
                  {r.outOfRange ? (
                    <>
                      {" · "}
                      {tl.rich("outOfRange", {
                        ltr,
                        range: numberRange(r)?.range ?? "",
                      })}
                    </>
                  ) : rangeNote(tl, r) ? (
                    <>
                      {" · "}
                      {rangeNote(tl, r)}
                    </>
                  ) : null}
                  {r.doneAt ? (
                    <>
                      {" · "}
                      {t.rich("doneBy", {
                        ltr,
                        name: personName(shown.t, data.lookups, r.doneBy),
                        time: timeIn(new Date(r.doneAt), data.timeZone),
                      })}
                    </>
                  ) : null}
                </>
              }
            />
          ))}
        </ListGroup>
      )}
    </PageSection>
  );
}

/** The week's readings: phone and tablet a card per item, desktop a table. */
function WeekReadingsView({
  rows,
  week,
  t,
  dayName,
  wide,
}: {
  rows: readonly WeekReadings[];
  week: readonly string[];
  t: T;
  dayName: (day: string) => string;
  wide: boolean;
}) {
  if (rows.length === 0) return null;
  const cell = (row: WeekReadings, day: string) => {
    const value = row.days[day];
    return value ? (
      <span
        dir="ltr"
        className={cn(value.outOfRange && "font-semibold text-warning")}
      >
        {readingText(value.reading, row.unit)}
      </span>
    ) : (
      <span className="text-ink-2">
        <span aria-hidden="true">—</span>
        <span className="sr-only">{t("readings.noReading")}</span>
      </span>
    );
  };
  if (!wide) {
    return (
      <PageSection title={t("readings.week")}>
        <div className="flex flex-col gap-3">
          {rows.map((row) => (
            <div
              key={row.key}
              className="flex flex-col gap-2 rounded-card bg-surface p-4 shadow-card"
            >
              <span className="font-semibold">
                {t("readings.of", { label: row.label, list: row.listName })}
              </span>
              <dl className="grid grid-cols-4 gap-x-3 gap-y-1 text-sm sm:grid-cols-7">
                {week.map((day) => (
                  <div key={day} className="flex flex-col">
                    <dt className="text-ink-2">{dayName(day)}</dt>
                    <dd>{cell(row, day)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </PageSection>
    );
  }
  const th = "px-4 py-3 text-start font-medium text-ink-2 text-sm";
  const td = "border-line border-t px-4 py-3 align-middle";
  return (
    <PageSection title={t("readings.week")}>
      <div className="overflow-hidden rounded-card bg-surface shadow-card">
        <table className="w-full border-collapse text-base">
          <caption className="sr-only">{t("readings.weekCaption")}</caption>
          <thead>
            <tr>
              <th scope="col" className={th}>
                {t("readings.item")}
              </th>
              {week.map((day) => (
                <th key={day} scope="col" className={th}>
                  {dayName(day)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <th scope="row" className={cn(td, "text-start font-semibold")}>
                  {t("readings.of", { label: row.label, list: row.listName })}
                </th>
                {week.map((day) => (
                  <td key={day} className={td}>
                    {cell(row, day)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageSection>
  );
}

/**
 * The manager's overview of a day (lists L4): late lists first, then open,
 * closed and not done, each with who it is for, how far it is and by when;
 * the day's readings, those outside their range first; and the week's
 * readings of each item. A week strip on top picks a past day, the history,
 * with a dot on each day that has a list nobody did, one late or a reading
 * out of range; times that open nothing since what they follow is gone say
 * so first, each with the way to its template. Phone: one section under the
 * other. Tablet: what still waits beside what closed and the readings.
 * Desktop: one table of the day's lists, the day's counts beside its title,
 * and a table of the week's readings. Main action: sending a list. Also on
 * /design/shell/lists/today with mock data.
 */
export function ListsTodayView({
  data,
  wording,
  paths,
}: {
  data: ListsTodayData;
  wording: AppWording;
  paths: TodayPaths;
}) {
  const tLists = translator(wording, "app.lists");
  const t = translator(wording, "app.lists.overview");
  const tl = translator(wording, "app.lists.list");
  const tDays = translator(wording, "days");
  const tNames = translator(wording, "app.lists.schedules");
  const now = new Date(data.now);
  const shown: ListShown = {
    t: tLists,
    lookups: data.lookups,
    userId: data.userId,
    now,
    timeZone: data.timeZone,
    timing: data.timing,
    href: paths.list,
  };
  const keyOf = (day: string) => WEEKDAY_KEYS[weekdayOf(day)] ?? "sun";
  const dayShort = (day: string) => tDays(`${keyOf(day)}.short`);
  const dayName = (day: string) => `${dayShort(day)} ${dayMonth(day)}`;
  const all = [...data.late, ...data.open, ...data.closed, ...data.missed];
  const nothing = all.length === 0;
  const send = data.send ? (
    <Button asChild size="lg">
      <Link href={paths.send}>
        <Send aria-hidden="true" />
        {tLists("send.action")}
      </Link>
    </Button>
  ) : null;
  const hrefs = Object.fromEntries(
    data.week.map((day, at) => [
      day,
      at === data.week.length - 1 ? paths.today : `${paths.today}?day=${day}`,
    ]),
  );

  const late =
    data.late.length > 0 ? (
      <PageSection title={t("sections.late", { count: data.late.length })}>
        <Cards lists={data.late} shown={shown} />
      </PageSection>
    ) : null;
  const open = (
    <PageSection title={t("sections.open", { count: data.open.length })}>
      <Cards lists={data.open} shown={shown} />
    </PageSection>
  );
  const closed = (
    <PageSection title={t("sections.closed", { count: data.closed.length })}>
      <Cards lists={data.closed} shown={shown} />
    </PageSection>
  );
  const missed =
    data.missed.length > 0 ? (
      <PageSection title={t("sections.missed", { count: data.missed.length })}>
        <Cards lists={data.missed} shown={shown} />
      </PageSection>
    ) : null;
  const readings = (
    <Readings
      readings={data.readings}
      data={data}
      t={t}
      tl={tl}
      shown={shown}
    />
  );
  const week = (wide: boolean) => (
    <WeekReadingsView
      rows={data.weekReadings}
      week={data.week}
      t={t}
      dayName={dayName}
      wide={wide}
    />
  );
  /** A day's dot in the week, and what it has to look at in words. */
  const markOf = (day: string) => {
    const flags = data.weekFlags[day];
    const words = flags
      ? [
          flags.missed > 0
            ? t("sections.missed", { count: flags.missed })
            : null,
          flags.late > 0 ? t("sections.late", { count: flags.late }) : null,
          flags.outOfRange > 0
            ? t("readings.outOfRange", { count: flags.outOfRange })
            : null,
        ].filter((word): word is string => word !== null)
      : [];
    return words.length > 0
      ? { marked: true, markLabel: words.join(", ") }
      : {};
  };
  // The day's counts, as the sections on a phone and a tablet title them.
  const counts = (
    <span className="flex flex-wrap items-center justify-end gap-2">
      {data.late.length > 0 ? (
        <Badge tone="warning">
          {t("sections.late", { count: data.late.length })}
        </Badge>
      ) : null}
      {data.missed.length > 0 ? (
        <Badge tone="warning">
          {t("sections.missed", { count: data.missed.length })}
        </Badge>
      ) : null}
      <span className="text-ink-2 text-sm">
        {t("sections.open", { count: data.open.length })}
        {" · "}
        {t("sections.closed", { count: data.closed.length })}
      </span>
    </span>
  );
  // A view session sends nothing and edits nothing: it only hears what shows.
  const emptyBody = !data.today
    ? t("empty.pastBody")
    : data.viewOnly
      ? t("empty.viewOnlyBody")
      : t("empty.body");

  return (
    <PageBody className={pageGlowClass}>
      <PageHeader
        back={{ href: paths.lists, label: tLists("title") }}
        title={t("title")}
        subtitle={
          data.viewOnly
            ? t("viewOnly")
            : data.today
              ? t("subtitle")
              : t.rich("subtitlePast", {
                  ltr,
                  day: tNames(`dayNames.${keyOf(data.day)}`),
                  date: dayMonth(data.day),
                })
        }
        actions={send}
      />

      <DayPicker
        label={t("pick")}
        value={data.day}
        hrefs={hrefs}
        days={data.week.map((day, at) => ({
          key: day,
          label: at === data.week.length - 1 ? t("today") : dayShort(day),
          date: String(Number(day.slice(8))),
          ...markOf(day),
        }))}
      />

      {data.today && data.stopped.length > 0 ? (
        <PageSection title={t("stopped.title", { count: data.stopped.length })}>
          <ListGroup>
            {data.stopped.map((template) => (
              <ListRow
                key={template.id}
                href={paths.template(template.id)}
                leading={<TriangleAlert className="text-warning" />}
                title={template.name}
                subtitle={t("stopped.body")}
              />
            ))}
          </ListGroup>
        </PageSection>
      ) : null}

      {nothing ? (
        <>
          <EmptyState
            headingLevel="h2"
            icon={<ListChecks />}
            title={data.today ? t("empty.title") : t("empty.pastTitle")}
            body={emptyBody}
            className="md:py-12"
          >
            {data.today && !data.viewOnly ? (
              <Button asChild variant="ghost">
                <Link href={paths.templates}>{t("empty.toTemplates")}</Link>
              </Button>
            ) : null}
          </EmptyState>
          {/* The week's readings still read on a day with none of its own. */}
          <div className="xl:hidden">{week(false)}</div>
          <div className="hidden xl:block">{week(true)}</div>
        </>
      ) : (
        <>
          {/* Phone: late first, then one section under the other. */}
          <div className="flex flex-col gap-8 md:hidden">
            {late}
            {open}
            {closed}
            {missed}
            {readings}
            {week(false)}
          </div>

          {/* Tablet: what still waits beside what closed and the readings. */}
          <div className="hidden gap-6 md:grid md:grid-cols-2 xl:hidden">
            <div className="flex min-w-0 flex-col gap-8">
              {late}
              {open}
            </div>
            <div className="flex min-w-0 flex-col gap-8">
              {closed}
              {missed}
              {readings}
            </div>
            <div className="col-span-2">{week(false)}</div>
          </div>

          {/* Desktop: the full picture, as tables, the day's counts on top. */}
          <div className="hidden flex-col gap-8 xl:flex">
            <PageSection title={t("title")} action={counts}>
              <ListTable lists={all} shown={shown} caption={t("title")} />
            </PageSection>
            <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-start gap-8">
              {readings}
              {week(true)}
            </div>
          </div>
        </>
      )}
    </PageBody>
  );
}
