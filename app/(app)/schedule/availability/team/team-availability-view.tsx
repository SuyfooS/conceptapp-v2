import { dateIn, weekdayOf } from "@domain/availability";
import { dayMonth, WEEKDAY_KEYS } from "@domain/availability-form";
import { displayIsraeliMobile } from "@domain/phone";
import { timeIn } from "@domain/shabbat";
import { Avatar, AvatarStack } from "@ui/avatar";
import { Badge } from "@ui/badge";
import { Card, CardText } from "@ui/card";
import { cn } from "@ui/cn";
import { ListGroup, ListRow } from "@ui/list-row";
import { PageBody, PageHeader, PageSection } from "@ui/page";
import { Check, Phone } from "lucide-react";
import type { ReactNode } from "react";
import { type AppWording, type Translator, translator } from "../../../wording";
import type { TeamAvailabilityWeek } from "../../week";
import { HeroChip } from "../hero-chip";

type T = Translator<"app">;
type Team = TeamAvailabilityWeek["team"];
type Sent = Team["sent"][number];
type Missing = Team["missing"][number];
type ViewProps = { t: T; data: TeamAvailabilityWeek };

const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;
const weekday = (t: T, date: string) =>
  t(`availability.weekdays.${WEEKDAY_KEYS[weekdayOf(date)] ?? "sun"}`);

/** A hairline between rows, starting at the text beside the avatar. */
const rowLine =
  "relative not-first:before:absolute not-first:before:end-0 not-first:before:start-[68px] not-first:before:top-0 not-first:before:h-px not-first:before:bg-line not-first:before:content-['']";

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
 * The manager's view of next week's availability: who has not sent it, with a
 * way to call them, and what everyone else sent. Phone: the hero with the
 * missing people lifted over it, and the answers under that; tablet: the same
 * two in two columns; desktop: one table with a column per day. Also rendered
 * with mock data on /design/shell/schedule/availability/team.
 */
export function TeamAvailabilityView({
  data,
  backHref,
  wording,
}: {
  data: TeamAvailabilityWeek;
  /** The schedule screen this one sits under. */
  backHref: string;
  /** The business's words. */
  wording: AppWording;
}) {
  const t = translator(wording, "app");
  const tm = translator(wording, "modules.scheduling");
  const { week, team } = data;
  const view = { t, data };
  const hasTeam = team.counts.sent + team.counts.missing > 0;
  return (
    <PageBody>
      <PageHeader
        back={{ href: backHref, label: tm("name") }}
        eyebrow={t("availability.subtitle", {
          from: dayMonth(week.start),
          to: dayMonth(week.dates.at(-1) ?? week.start),
        })}
        title={t("availability.team.title")}
      />
      <div className="grid gap-7 md:grid-cols-2 md:items-start md:gap-6 xl:grid-cols-1">
        <div className="flex min-w-0 flex-col">
          <Hero {...view} />
          {hasTeam ? <MissingList {...view} /> : null}
        </div>
        {hasTeam ? (
          <>
            <SentList {...view} />
            <Everyone {...view} />
          </>
        ) : null}
      </div>
    </PageBody>
  );
}

const personName = (t: T, name: string | null) => name ?? t("team.noName");

function Hero({ t, data }: ViewProps) {
  const { week, team } = data;
  const { sent, missing } = team.counts;
  const total = sent + missing;
  const due = t.rich("availability.team.due", {
    ...moment(t, week.dueAt, week.timeZone),
    ltr,
  });
  const lifted = total > 0;
  return (
    <Card
      tone="hero"
      padding="lg"
      className={cn(
        "flex flex-col",
        lifted ? "pb-[4.25rem] xl:pb-5" : undefined,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium text-base">
          {t("availability.team.heroLabel")}
        </span>
        {total === 0 ? null : missing > 0 ? (
          <HeroChip>
            {t("availability.team.missing.count", { count: missing })}
          </HeroChip>
        ) : (
          <HeroChip icon={<Check aria-hidden="true" />}>
            {t("availability.team.entry.allSent")}
          </HeroChip>
        )}
      </div>
      <div className="mt-3 flex items-end justify-between gap-6">
        <div className="min-w-0">
          <p className="font-bold text-2xl">
            {total === 0
              ? t("availability.team.noTeam")
              : t("availability.team.progress", { sent, total })}
          </p>
          <p className="text-base">
            {total === 0 ? t("availability.team.noTeamHint") : due}
          </p>
        </div>
        {missing > 0 ? (
          <AvatarStack
            size="md"
            max={6}
            people={team.missing.map((m) => ({
              name: personName(t, m.name),
              photo: m.photo,
            }))}
            className="hidden shrink-0 xl:flex"
          />
        ) : null}
      </div>
      {total > 0 ? (
        <div aria-hidden="true" className="mt-4 flex gap-1">
          {team.sent.map((s) => (
            <span
              key={s.userId}
              className="h-1.5 min-w-0 flex-1 rounded-full bg-accent-ink"
            />
          ))}
          {team.missing.map((m) => (
            <span
              key={m.userId}
              className="h-1.5 min-w-0 flex-1 rounded-full bg-accent-ink/30"
            />
          ))}
        </div>
      ) : null}
    </Card>
  );
}

/**
 * A way to call someone: the icon alone in a list, whose row shows the number
 * already, or the number beside it in the table.
 */
function CallLink({
  t,
  person,
  showNumber = false,
}: {
  t: T;
  person: Missing;
  showNumber?: boolean;
}) {
  if (!person.phone) return null;
  const name = personName(t, person.name);
  const number = displayIsraeliMobile(person.phone);
  const call = t("availability.team.call", { name });
  return (
    <a
      href={`tel:${person.phone}`}
      // With the number showing, the name starts with it, as it reads, and
      // the words need no tooltip; the phone alone has one.
      aria-label={
        showNumber ? t("availability.team.callNumber", { number, name }) : call
      }
      title={showNumber ? undefined : call}
      className={cn(
        "pressable inline-flex size-11 shrink-0 items-center justify-center gap-2 rounded-full bg-accent-soft text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&_svg]:size-5",
        showNumber && "w-auto ps-3.5 pe-4 font-medium text-base",
      )}
    >
      <Phone aria-hidden="true" />
      {showNumber ? <span dir="ltr">{number}</span> : null}
    </a>
  );
}

function roleAndPhone(t: T, person: Missing) {
  return (
    <>
      {t(`team.roles.${person.role}`)}
      {person.phone ? (
        <>
          {" · "}
          <span dir="ltr" className="whitespace-nowrap">
            {displayIsraeliMobile(person.phone)}
          </span>
        </>
      ) : null}
    </>
  );
}

function MissingList({ t, data }: ViewProps) {
  const { missing } = data.team;
  const title = t("availability.team.missing.title");
  const lift = "relative z-10 mx-3 -mt-11 xl:hidden";
  if (missing.length === 0) {
    return (
      <Card tone="float" className={cn(lift, "flex items-center gap-3")}>
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-success-soft text-success [&_svg]:size-5">
          <Check aria-hidden="true" />
        </span>
        <span className="min-w-0 font-medium">
          {t("availability.team.missing.empty")}
        </span>
      </Card>
    );
  }
  return (
    <ListGroup className={cn(lift, "shadow-float")}>
      <h2 className="px-4 pt-3.5 pb-1 font-bold text-md">{title}</h2>
      <ul aria-label={title}>
        {missing.map((m) => (
          <li key={m.userId} className={rowLine}>
            <ListRow
              leading={<Avatar name={personName(t, m.name)} photo={m.photo} />}
              title={personName(t, m.name)}
              subtitle={roleAndPhone(t, m)}
              trailing={<CallLink t={t} person={m} />}
            />
          </li>
        ))}
      </ul>
    </ListGroup>
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
    <Badge tone="warning" className="whitespace-nowrap">
      {t("availability.team.late")}
    </Badge>
  ) : null;
}

function Note({
  t,
  note,
  className,
}: {
  t: T;
  note: string | null;
  className?: string;
}) {
  return note ? (
    <span
      className={cn(
        "block rounded-control bg-surface-2 px-3 py-2 text-sm [overflow-wrap:anywhere]",
        className,
      )}
    >
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
      className="xl:hidden"
      action={
        <span className="text-base text-ink-2">
          {t("availability.team.sent.count", { count: counts.sent })}
        </span>
      }
    >
      {sent.length === 0 ? (
        <Card padding="lg">
          <CardText>
            {t.rich("availability.team.sent.empty", {
              ...moment(t, data.week.dueAt, data.week.timeZone),
              ltr,
            })}
          </CardText>
        </Card>
      ) : (
        <ListGroup>
          <ul aria-label={title}>
            {sent.map((s) => (
              <li
                key={s.userId}
                className={cn(rowLine, "flex flex-col gap-2 px-4 py-3")}
              >
                <div className="flex items-center gap-3">
                  <Avatar name={personName(t, s.name)} photo={s.photo} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-medium">{personName(t, s.name)}</span>
                    <span className="text-ink-2 text-sm">
                      <SentAt {...view} person={s} />
                    </span>
                  </span>
                  <LateBadge t={t} late={s.late} />
                </div>
                <div className="flex flex-col gap-2 ps-[3.25rem]">
                  {s.days.length === 0 ? (
                    <p className="text-base text-ink-2">
                      {t("availability.team.noHours")}
                    </p>
                  ) : (
                    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-0.5 text-base">
                      {s.days.map((day) => (
                        <div key={day} className="contents">
                          <dt className="text-ink-2">
                            {weekday(t, day)} {dayMonth(day)}
                          </dt>
                          <dd className="font-medium">
                            <Ranges person={s} day={day} />
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  <Note t={t} note={s.answer.note} />
                </div>
              </li>
            ))}
          </ul>
        </ListGroup>
      )}
    </PageSection>
  );
}

const th = "px-1 py-3 text-start align-bottom font-medium text-ink-2 text-sm";
const td = "border-line border-t px-1 py-3 align-middle";
const rowHead = cn(
  "relative py-3 ps-4 pe-3 text-start align-middle font-normal",
  "before:absolute before:end-0 before:start-[68px] before:top-0 before:h-px before:bg-line before:content-['']",
);

function Person({ name, subtitle }: { name: string; subtitle: ReactNode }) {
  return (
    <span className="flex min-w-48 items-center gap-3">
      <Avatar name={name} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-medium text-md">{name}</span>
        <span className="text-ink-2 text-sm">{subtitle}</span>
      </span>
    </span>
  );
}

function Everyone(view: ViewProps) {
  const { t, data } = view;
  const { week, team } = data;
  const title = t("availability.team.everyone");
  return (
    <PageSection title={title} className="hidden xl:flex">
      <div className="overflow-x-auto rounded-card bg-surface shadow-card">
        <table className="w-full border-separate border-spacing-0">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr>
              <th scope="col" className={cn(th, "ps-[68px]")}>
                {t("availability.team.columns.name")}
              </th>
              <th scope="col" className={th}>
                {t("availability.team.columns.status")}
              </th>
              {week.dates.map((day) => (
                <th key={day} scope="col" className={cn(th, "text-center")}>
                  <span className="text-ink">{weekday(t, day)}</span>
                  <span className="block font-normal">{dayMonth(day)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {team.missing.map((m) => (
              <tr key={m.userId}>
                <th scope="row" className={rowHead}>
                  <Person
                    name={personName(t, m.name)}
                    subtitle={t(`team.roles.${m.role}`)}
                  />
                </th>
                <td className={td}>
                  <Badge tone="warning" className="whitespace-nowrap">
                    {t("availability.team.notSent")}
                  </Badge>
                </td>
                <td colSpan={week.dates.length} className={cn(td, "ps-3")}>
                  <CallLink t={t} person={m} showNumber />
                </td>
              </tr>
            ))}
            {team.sent.map((s) => (
              <tr key={s.userId}>
                <th scope="row" className={rowHead}>
                  <Person
                    name={personName(t, s.name)}
                    subtitle={t(`team.roles.${s.role}`)}
                  />
                  <Note t={t} note={s.answer.note} className="ms-[52px] mt-2" />
                </th>
                <td className={cn(td, "text-ink-2 text-sm")}>
                  <span className="flex flex-col items-start gap-1">
                    <span className="text-balance">
                      <SentAt {...view} person={s} />
                    </span>
                    <LateBadge t={t} late={s.late} />
                  </span>
                </td>
                {week.dates.map((day) =>
                  s.days.includes(day) ? (
                    <td key={day} className={cn(td, "text-center text-sm")}>
                      <span className="block rounded-[10px] bg-accent-soft px-0.5 py-1.5 font-medium">
                        <Ranges person={s} day={day} stacked />
                      </span>
                    </td>
                  ) : (
                    <td key={day} className={cn(td, "text-center text-ink-2")}>
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
        <p className="px-1 text-ink-2 text-sm">
          {t.rich("availability.team.sent.empty", {
            ...moment(t, week.dueAt, week.timeZone),
            ltr,
          })}
        </p>
      ) : null}
    </PageSection>
  );
}
