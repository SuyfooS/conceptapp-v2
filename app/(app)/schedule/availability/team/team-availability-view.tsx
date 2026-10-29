import { dateIn, weekdayOf } from "@domain/availability";
import { dayMonth, WEEKDAY_KEYS } from "@domain/availability-form";
import { displayIsraeliMobile } from "@domain/phone";
import { timeIn } from "@domain/shabbat";
import { Badge } from "@ui/badge";
import { Card, CardText } from "@ui/card";
import { cn } from "@ui/cn";
import { ListGroup } from "@ui/list-row";
import { PageBody, PageHeader, PageSection } from "@ui/page";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import type { TeamAvailabilityWeek } from "../../week";

type T = Awaited<ReturnType<typeof getTranslations<"app">>>;
type Team = TeamAvailabilityWeek["team"];
type Sent = Team["sent"][number];
type Missing = Team["missing"][number];
type ViewProps = { t: T; data: TeamAvailabilityWeek };

const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;
const weekday = (t: T, date: string) =>
  t(`availability.weekdays.${WEEKDAY_KEYS[weekdayOf(date)] ?? "sun"}`);

/** Day, date and time of an instant in the business's zone. */
function moment(t: T, iso: string, timeZone: string) {
  const date = dateIn(new Date(iso), timeZone);
  return {
    day: weekday(t, date),
    date: dayMonth(date),
    time: timeIn(new Date(iso), timeZone),
  };
}

/**
 * The manager's view of next week's availability: who has not sent it,
 * and what everyone else sent. Phone: the two lists one under the other;
 * tablet: side by side; desktop: one table with a column per day. Also
 * rendered with mock data on /design/shell/schedule/availability/team.
 */
export async function TeamAvailabilityView({
  data,
}: {
  data: TeamAvailabilityWeek;
}) {
  const t = await getTranslations("app");
  const { week } = data;
  const view = { t, data };
  return (
    <PageBody>
      <PageHeader
        title={t("availability.team.title")}
        subtitle={t("availability.subtitle", {
          from: dayMonth(week.start),
          to: dayMonth(week.dates.at(-1) ?? week.start),
        })}
      />
      <p className="text-ink-2">
        {t.rich("availability.team.due", {
          ...moment(t, week.dueAt, week.timeZone),
          ltr,
        })}
      </p>
      <div className="grid gap-6 md:grid-cols-2 md:items-start md:gap-8 xl:hidden">
        <MissingList {...view} />
        <SentList {...view} />
      </div>
      <div className="hidden xl:block">
        <Everyone {...view} />
      </div>
    </PageBody>
  );
}

const personName = (t: T, name: string | null) => name ?? t("team.noName");

function roleAndPhone(t: T, person: Missing) {
  return (
    <>
      {t(`team.roles.${person.role}`)}
      {person.phone ? (
        <>
          {" · "}
          <span dir="ltr">{displayIsraeliMobile(person.phone)}</span>
        </>
      ) : null}
    </>
  );
}

function MissingBadge({ t, count }: { t: T; count: number }) {
  return count > 0 ? (
    <Badge tone="warning">
      {t("availability.team.missing.count", { count })}
    </Badge>
  ) : null;
}

function MissingList({ t, data }: ViewProps) {
  const { missing, counts } = data.team;
  const title = t("availability.team.missing.title");
  return (
    <PageSection
      title={title}
      action={<MissingBadge t={t} count={counts.missing} />}
    >
      {missing.length === 0 ? (
        <Card tone="flat" padding="lg">
          <CardText>{t("availability.team.missing.empty")}</CardText>
        </Card>
      ) : (
        <ListGroup>
          <ul aria-label={title} className="divide-y divide-line">
            {missing.map((m) => (
              <li key={m.userId} className="flex min-h-14 flex-col px-4 py-3">
                <span className="truncate font-medium">
                  {personName(t, m.name)}
                </span>
                <span className="truncate text-ink-2 text-sm">
                  {roleAndPhone(t, m)}
                </span>
              </li>
            ))}
          </ul>
        </ListGroup>
      )}
    </PageSection>
  );
}

/**
 * A day's ranges, each reading left to right: "09:00–17:00, 19:00–23:00"
 * in a line, or one under another when `stacked`.
 */
function Ranges({
  person,
  day,
  stacked = false,
}: {
  person: Sent;
  day: string;
  stacked?: boolean;
}) {
  const ranges = person.answer.ranges.filter((r) => r.day === day);
  return ranges.map((r, i) => (
    <span key={r.start} className={stacked ? "block" : undefined}>
      {i > 0 && !stacked ? ", " : null}
      <span dir="ltr" className="whitespace-nowrap">
        {r.start}–{r.end}
      </span>
    </span>
  ));
}

function SentAt({ t, data, person }: ViewProps & { person: Sent }) {
  return t.rich("availability.team.sentAt", {
    ...moment(t, person.answer.updatedAt, data.week.timeZone),
    ltr,
  });
}

function LateBadge({ t, late }: { t: T; late: boolean }) {
  return late ? (
    <Badge tone="warning">{t("availability.team.late")}</Badge>
  ) : null;
}

function Note({ t, note }: { t: T; note: string | null }) {
  return note ? (
    <span className="block text-ink-2 text-sm [overflow-wrap:anywhere]">
      {t("availability.team.note", { note })}
    </span>
  ) : null;
}

function SentList(view: ViewProps) {
  const { t, data } = view;
  const { sent, counts } = data.team;
  const title = t("availability.team.sent.title");
  return (
    <PageSection
      title={title}
      action={
        <span className="text-ink-2 text-sm">
          {t("availability.team.sent.count", { count: counts.sent })}
        </span>
      }
    >
      {sent.length === 0 ? (
        <Card tone="flat" padding="lg">
          <CardText>
            {t.rich("availability.team.sent.empty", {
              ...moment(t, data.week.dueAt, data.week.timeZone),
              ltr,
            })}
          </CardText>
        </Card>
      ) : (
        <ListGroup>
          <ul aria-label={title} className="divide-y divide-line">
            {sent.map((s) => (
              <li
                key={s.userId}
                className="flex min-h-14 flex-col gap-2 px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">
                      {personName(t, s.name)}
                    </span>
                    <span className="truncate text-ink-2 text-sm">
                      <SentAt {...view} person={s} />
                    </span>
                  </span>
                  <LateBadge t={t} late={s.late} />
                </div>
                {s.days.length === 0 ? (
                  <p className="text-sm">{t("availability.team.noHours")}</p>
                ) : (
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                    {s.days.map((day) => (
                      <div key={day} className="contents">
                        <dt className="text-ink-2">
                          {weekday(t, day)} {dayMonth(day)}
                        </dt>
                        <dd>
                          <Ranges person={s} day={day} />
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
                <Note t={t} note={s.answer.note} />
              </li>
            ))}
          </ul>
        </ListGroup>
      )}
    </PageSection>
  );
}

const th = "px-3 py-2.5 text-start align-bottom font-medium text-ink-2 text-sm";
const td = "px-3 py-3 align-top";

function Everyone(view: ViewProps) {
  const { t, data } = view;
  const { week, team } = data;
  const title = t("availability.team.everyone");
  return (
    <PageSection
      title={title}
      action={<MissingBadge t={t} count={team.counts.missing} />}
    >
      <div className="overflow-x-auto rounded-card border border-line bg-surface">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr className="border-line border-b bg-surface-2">
              <th scope="col" className={cn(th, "w-56")}>
                {t("availability.team.columns.name")}
              </th>
              <th scope="col" className={cn(th, "w-40")}>
                {t("availability.team.columns.status")}
              </th>
              {week.dates.map((day) => (
                <th key={day} scope="col" className={th}>
                  {weekday(t, day)}
                  <span className="block font-normal">{dayMonth(day)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {team.missing.map((m) => (
              <tr key={m.userId} className="border-line border-b">
                <th scope="row" className={cn(td, "text-start font-medium")}>
                  {personName(t, m.name)}
                  <span className="block font-normal text-ink-2">
                    {roleAndPhone(t, m)}
                  </span>
                </th>
                <td className={td}>
                  <Badge tone="warning">{t("availability.team.notSent")}</Badge>
                </td>
                <td colSpan={week.dates.length} className={td} />
              </tr>
            ))}
            {team.sent.map((s) => (
              <tr
                key={s.userId}
                className="border-line border-b last:border-b-0"
              >
                <th scope="row" className={cn(td, "text-start font-medium")}>
                  {personName(t, s.name)}
                  <span className="block font-normal text-ink-2">
                    {t(`team.roles.${s.role}`)}
                  </span>
                  <span className="mt-1 block max-w-56 font-normal">
                    <Note t={t} note={s.answer.note} />
                  </span>
                </th>
                <td className={cn(td, "text-ink-2")}>
                  <span className="flex flex-col items-start gap-1">
                    <SentAt {...view} person={s} />
                    <LateBadge t={t} late={s.late} />
                  </span>
                </td>
                {week.dates.map((day) =>
                  s.days.includes(day) ? (
                    <td key={day} className={td}>
                      <Ranges person={s} day={day} stacked />
                    </td>
                  ) : (
                    <td key={day} className={cn(td, "text-ink-2")}>
                      <span aria-hidden="true">–</span>
                      <span className="sr-only">
                        {t("availability.team.noHoursDay")}
                      </span>
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {team.sent.length === 0 ? (
        <p className="text-ink-2 text-sm">
          {t.rich("availability.team.sent.empty", {
            ...moment(t, week.dueAt, week.timeZone),
            ltr,
          })}
        </p>
      ) : null}
    </PageSection>
  );
}
