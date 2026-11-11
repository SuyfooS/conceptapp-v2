import { instantIn, weekdayOf } from "@domain/availability";
import { dayMonth, WEEKDAY_KEYS } from "@domain/availability-form";
import type { ModuleNavEntry, Role } from "@domain/modules";
import { firstNameOf } from "@domain/people";
import { formArg } from "@domain/profile";
import {
  type ScheduledShift,
  scheduleGaps,
  shiftsByDay,
  stillNeeded,
} from "@domain/schedule";
import { timeIn } from "@domain/shabbat";
import { approvalsFor, myRequestFor, offersFor } from "@domain/swaps";
import { canSeeTeam, type Team } from "@domain/team";
import {
  availabilityStatus,
  type BusinessClock,
  clockAt,
  dayPart,
  nextShift,
  shiftPhase,
  shiftWhen,
  type TodayTile,
  tileNeedsAction,
  todayTiles,
} from "@domain/today";
import { Ambient } from "@ui/ambient";
import { Avatar, type AvatarPerson, AvatarStack } from "@ui/avatar";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Card, CardText, CardTitle } from "@ui/card";
import { cn } from "@ui/cn";
import { IconButton } from "@ui/icon-button";
import { ListGroup, ListRow } from "@ui/list-row";
import { PageBody, PageHeader, PageSection } from "@ui/page";
import { PersonAvatar } from "@ui/person-row";
import { Tile, type TileProps } from "@ui/tile";
import {
  Bell,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  ChevronRight,
  Repeat,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import Link from "next/link";
import { getFormatter } from "next-intl/server";
import type { ReactNode } from "react";
import type { Businesses } from "../businesses";
import type { ChatHomeData } from "../chat/chat";
import { TodayChat } from "../chat/today-chat";
import type { ListsHomeData } from "../lists/list-types";
import { TodayLists } from "../lists/today-lists";
import { moduleIcons } from "../module-icons";
import type {
  AvailabilityWeek,
  PublishedSchedule,
  ScheduleBuildWeek,
  TeamAvailabilityWeek,
} from "../schedule/week";
import { type AppWording, type Translator, translator } from "../wording";
import { MyBusinesses } from "./my-businesses";
import { RefreshOnReturn } from "./refresh-on-return";

/** What the schedule module brings to Today; null when it is off. */
export type TodaySchedule = {
  published: PublishedSchedule;
  availability: AvailabilityWeek;
  /** Owners and managers only, like `build`. */
  teamAvailability: TeamAvailabilityWeek | null;
  build: ScheduleBuildWeek | null;
};

export type TodayData = {
  /** ISO timestamp of the moment the screen is read. */
  now: string;
  timeZone: string;
  /** The person's full name, if they have one yet. */
  name: string | null;
  /** Their photo (`profilePhotoSrc`), or null for initials. */
  photo: string | null;
  role: Role;
  businessName: string;
  /** From `moduleWidgets`: what the enabled modules bring for this role. */
  widgets: ModuleNavEntry[];
  /** Where the person stands on the clock, when they are at work. */
  clockLine?:
    | { kind: "working" | "break"; at: string }
    | { kind: "overdue"; count: number }
    | { kind: "confirm"; count: number }
    | null;
  schedule: TodaySchedule | null;
  /** Owners and managers only. */
  team: Team | null;
  /** The bell and how many lines are unread; null when there is none. */
  bell?: { unread: number } | null;
  /** What lists bring to Today; null when they are off or out of reach. */
  lists?: ListsHomeData | null;
  /** What chat brings to Today (C3); null when it is off or out of reach. */
  chat?: ChatHomeData | null;
};

type T = Translator<"app">;
type Format = Awaited<ReturnType<typeof getFormatter>>;
/** A route in the app, or in the demo when it runs under /design/shell. */
type Path = (to: string) => string;
type ViewProps = {
  t: T;
  path: Path;
  clock: BusinessClock;
  role: Role;
  schedule: TodaySchedule;
};

const ltr = (chunks: ReactNode) => <span dir="ltr">{chunks}</span>;
const weekday = (t: T, date: string) =>
  t(`availability.weekdays.${WEEKDAY_KEYS[weekdayOf(date)] ?? "sun"}`);
const allShifts = ({ thisWeek, nextWeek }: PublishedSchedule) => [
  ...thisWeek.shifts,
  ...nextWeek.shifts,
];
const nameIn = (t: T, published: PublishedSchedule, userId: string) =>
  published.people.find((p) => p.userId === userId)?.name ?? t("shifts.noName");
const photoIn = (published: PublishedSchedule, userId: string | null) =>
  published.people.find((p) => p.userId === userId)?.photo ?? null;
/** How the app writes about them, for an ICU `select`. */
const formIn = (published: PublishedSchedule, userId: string | null) =>
  formArg(published.people.find((p) => p.userId === userId)?.addressForm);
/** Someone as an avatar shows them: their name and their photo. */
const personIn = (t: T, published: PublishedSchedule, userId: string) => ({
  name: nameIn(t, published, userId),
  photo: photoIn(published, userId),
});

/**
 * Today: what is next for the person and what needs them. Each enabled module
 * brings its part (`moduleWidgets`), so a module that is off disappears.
 * Scheduling brings the hero, the requests, the tiles and who works today; a
 * module with nothing to say yet keeps one quiet row, and its own part takes
 * the row's place when the module is built.
 *
 * One layout that changes shape. Phone: one thing under the other, tiles in a
 * row that scrolls. Tablet: the hero beside the tiles, each list across the
 * width in two columns. Desktop: the same with the lists under the tiles, and
 * today's shifts side by side. The avatar by the greeting leads to the
 * person's profile, where signing out is. Someone in more than one business
 * (payroll P3b) has them listed last, on phones and tablets, to switch
 * between. `base` prefixes links for the demo, which also renders this with
 * mock data on /design/shell.
 */
export async function TodayView({
  data,
  wording,
  businesses,
  base = "",
}: {
  data: TodayData;
  /** The business's words; the app's own on the demo. */
  wording: AppWording;
  /** The businesses to switch between, for someone in more than one. */
  businesses?: Businesses | null;
  base?: string;
}) {
  const t = translator(wording, "app");
  const tm = translator(wording, "modules");
  const format = await getFormatter();
  const clock = clockAt(new Date(data.now), data.timeZone);
  const path: Path = (to) => `${base}${to}`;
  const part = dayPart(clock.time);
  const schedule = data.widgets.some((w) => w.key === "scheduling")
    ? data.schedule
    : null;
  const lists =
    data.widgets.some((w) => w.key === "lists") && data.lists
      ? data.lists
      : null;
  const chat =
    data.widgets.some((w) => w.key === "chat") && data.chat ? data.chat : null;
  // Modules with a part of their own aren't quiet rows.
  const quiet = data.widgets.filter(
    (w) =>
      w.key !== "scheduling" &&
      !(w.key === "lists" && lists) &&
      !(w.key === "chat" && chat),
  );
  const view = schedule ? { t, path, clock, role: data.role, schedule } : null;
  // Chat's part, then lists', one under the other where lists' part was:
  // what waits for the person's "קראתי" first.
  const listsPart = (className?: string) =>
    lists || chat ? (
      <div className={cn("flex min-w-0 flex-col gap-6", className)}>
        {chat ? <TodayChat data={chat} wording={wording} path={path} /> : null}
        {lists ? (
          <TodayLists data={lists} wording={wording} path={path} />
        ) : null}
      </div>
    ) : null;

  /** The quiet lists at the end: modules with no part of their own yet, the team. */
  const rest = (className?: string) =>
    quiet.length > 0 || data.team ? (
      <div className={cn("grid min-w-0 gap-6 md:grid-cols-2", className)}>
        {quiet.length > 0 ? (
          <PageSection title={t("home.modulesTitle")}>
            <ListGroup>
              {quiet.map((widget) => (
                <ListRow
                  key={widget.key}
                  href={
                    // Hours waiting for approval are approved on the team's hours.
                    widget.key === "time_clock" &&
                    data.clockLine?.kind === "confirm"
                      ? path("/clock/team")
                      : path(widget.href)
                  }
                  leading={moduleIcons[widget.icon]}
                  title={tm(`${widget.key}.name`)}
                  subtitle={
                    widget.key === "time_clock" && data.clockLine
                      ? data.clockLine.kind === "overdue"
                        ? t("clock.team.overdue.title", {
                            count: data.clockLine.count,
                          })
                        : data.clockLine.kind === "confirm"
                          ? t("clock.team.confirm.title", {
                              count: data.clockLine.count,
                            })
                          : t.rich(`clock.todayLine.${data.clockLine.kind}`, {
                              time: data.clockLine.at,
                              ltr,
                            })
                      : tm(`${widget.key}.description`)
                  }
                />
              ))}
            </ListGroup>
          </PageSection>
        ) : null}
        {data.team ? (
          <PageSection title={t("home.manageTitle")}>
            <ListGroup>
              <ListRow
                href={path("/team")}
                leading={<Users />}
                title={t("team.title")}
                subtitle={
                  data.team.counts.open > 0
                    ? t("team.invites.open", { count: data.team.counts.open })
                    : t("team.members.count", {
                        count: data.team.counts.members,
                      })
                }
              />
              <ListRow
                href={path("/manage")}
                leading={<SlidersHorizontal />}
                title={t("manage.row")}
                subtitle={t("manage.rowSubtitle")}
              />
            </ListGroup>
          </PageSection>
        ) : null}
      </div>
    ) : null;

  return (
    <div className="relative isolate">
      {/* On desktop the glow runs on under the sidebar, so it has no hard edge. */}
      <Ambient className="xl:-start-[17.5rem]" />
      <RefreshOnReturn />
      <PageBody>
        <div className="flex items-center gap-3">
          <Link
            href={path("/me")}
            aria-label={t("me.open")}
            title={t("me.open")}
            className="pressable shrink-0 rounded-full p-0.5 focus-visible:outline-2 focus-visible:outline-accent"
          >
            <PersonAvatar name={data.name} photo={data.photo} />
          </Link>
          <div className="min-w-0 flex-1">
            <PageHeader
              eyebrow={t("home.eyebrow", {
                date: format.dateTime(
                  instantIn(clock.date, "12:00", data.timeZone),
                  {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    timeZone: data.timeZone,
                  },
                ),
                business: data.businessName,
              })}
              title={
                data.name
                  ? t("home.greeting", { part, name: firstNameOf(data.name) })
                  : t("home.title")
              }
            />
          </div>
          {data.bell ? (
            <IconButton
              href={path("/notifications")}
              label={t("notifications.bell")}
              badge={{
                count: data.bell.unread,
                label: t("notifications.bellCount", {
                  count: data.bell.unread,
                }),
              }}
              icon={<Bell />}
              variant="ghost"
            />
          ) : null}
        </div>

        {view ? (
          <div className="grid items-start gap-6 md:grid-cols-2 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] xl:gap-x-8">
            <div className="min-w-0 xl:row-span-2">
              <NextShift {...view} format={format} />
            </div>
            <Needs {...view} now={data.now} />
            {listsPart(
              "md:col-span-2 xl:col-span-1 xl:col-start-2 xl:row-start-2",
            )}
            <WhoWorksToday {...view} />
            {rest(
              lists || chat
                ? "md:col-span-2"
                : "md:col-span-2 xl:col-span-1 xl:col-start-2 xl:row-start-2",
            )}
          </div>
        ) : data.widgets.length > 0 ? (
          <div className="flex flex-col gap-6 md:gap-8">
            {listsPart("md:max-w-2xl")}
            {rest()}
          </div>
        ) : (
          <>
            <Card
              tone="flat"
              padding="lg"
              className="flex flex-col gap-2 md:max-w-xl"
            >
              <CardTitle as="h2">{t("home.empty.title")}</CardTitle>
              <CardText>{t("home.empty.body")}</CardText>
            </Card>
            {rest()}
          </>
        )}
        <MyBusinesses
          businesses={businesses}
          wording={wording}
          className="md:max-w-xl"
        />
      </PageBody>
    </div>
  );
}

/** The hero and, for an owner or manager, the first request floating over it. */
function NextShift({
  t,
  path,
  clock,
  role,
  schedule,
  format,
}: ViewProps & { format: Format }) {
  const { published, availability } = schedule;
  const shifts = allShifts(published);
  const manager = canSeeTeam(role);
  // Last night's shift can still be on in the first hours of the week.
  const ahead = [...published.overnight, ...shifts];
  const own = nextShift(ahead, clock, published.userId);
  // Someone who runs the place and is on no shift still has a next shift to
  // look out for: the business's.
  const shift = own ?? (manager ? nextShift(ahead, clock) : null);
  const request = manager
    ? approvalsFor(published.swaps, shifts, clock.date)[0]
    : null;
  const overlap = Boolean(request);

  if (!shift) {
    const anyPublished =
      published.thisWeek.publishedAt !== null ||
      published.nextWeek.publishedAt !== null;
    const copy = !anyPublished
      ? {
          title: t("home.hero.notPublished.title"),
          body: manager
            ? t("home.hero.notPublished.manager")
            : t("home.hero.notPublished.worker"),
        }
      : manager
        ? {
            title: t("home.hero.allDone.title"),
            body: t("home.hero.allDone.body"),
          }
        : {
            title: t("home.hero.noShifts.title"),
            body: t("home.hero.noShifts.body"),
          };
    const action = manager
      ? { href: "/schedule/build", label: t("home.hero.build") }
      : anyPublished
        ? { href: "/schedule/shifts", label: t("home.hero.myShifts") }
        : {
            href: "/schedule/availability",
            label: availability.mine
              ? t("home.hero.updateAvailability")
              : t("home.hero.sendAvailability"),
          };
    return (
      <HeroCard
        label={manager ? t("home.hero.businessNext") : t("home.hero.next")}
      >
        <h2 className="mt-3.5 text-balance font-bold text-xl">{copy.title}</h2>
        <p className="mt-1 text-base">{copy.body}</p>
        <div className="mt-4 flex">
          <HeroLink href={path(action.href)}>{action.label}</HeroLink>
        </div>
      </HeroCard>
    );
  }

  const mine = own !== null;
  const running = shiftPhase(shift, clock) === "now";
  const others = shift.assignees
    .filter((a) => a.user !== published.userId)
    .map((a) => personIn(t, published, a.user));
  const position = shift.assignees.find(
    (a) => a.user === published.userId,
  )?.position;
  const positionName = published.positions.find(
    (p) => p.key === position,
  )?.name;
  const label = mine
    ? running
      ? t("home.hero.now")
      : t("home.hero.next")
    : running
      ? t("home.hero.businessNow")
      : t("home.hero.businessNext");
  const details: ReactNode[] = [
    t.rich("home.hero.until", { end: shift.end, ltr }),
    mine
      ? positionName
      : t("home.hero.filled", {
          count: shift.assignees.length,
          needed: shift.needed,
        }),
    others.length > 0
      ? withPeople(
          t,
          format,
          others.map((o) => o.name),
        )
      : null,
  ].filter(Boolean);
  const swap = mine
    ? myRequestFor(published.swaps, shift.id, published.userId)
    : null;

  return (
    <>
      <HeroCard
        label={label}
        overlap={overlap}
        chip={whenChip(t, shift, clock)}
      >
        <h2 className="mt-3.5 font-bold text-2xl">
          {t.rich("home.hero.title", {
            name: shift.name,
            start: shift.start,
            ltr,
          })}
        </h2>
        <p className="text-base">
          {details.map((detail, i) => (
            // The details never change order within a render.
            // biome-ignore lint/suspicious/noArrayIndexKey: see above
            <span key={i}>
              {i > 0 ? ", " : null}
              {detail}
            </span>
          ))}
        </p>
        {swap ? (
          <p className="mt-2 flex items-start gap-1.5 font-medium text-sm">
            <Repeat aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {swap.status === "taken"
              ? t("shifts.swap.taken", {
                  name: nameIn(t, published, swap.takenBy ?? ""),
                  form: formIn(published, swap.takenBy),
                })
              : t("shifts.swap.open")}
          </p>
        ) : null}
        <div className="mt-4 flex items-center gap-3">
          <HeroLink href={path("/schedule/shifts")}>
            {mine ? t("home.hero.myShifts") : t("home.hero.weekSchedule")}
          </HeroLink>
          {others.length > 0 ? (
            // The ring around each avatar takes the hero's colour, not the page's.
            <span className="shrink-0 [--surface:var(--accent)]">
              <AvatarStack people={others} />
            </span>
          ) : null}
        </div>
      </HeroCard>
      {request ? (
        <RequestCard
          t={t}
          href={path("/schedule/swaps")}
          from={personIn(t, published, request.swap.requestedBy)}
          to={personIn(t, published, request.swap.takenBy)}
          shift={request.shift}
        />
      ) : null}
    </>
  );
}

function HeroCard({
  label,
  chip,
  overlap = false,
  children,
}: {
  label: string;
  chip?: ReactNode;
  /** Room at the bottom for a card that floats over the hero. */
  overlap?: boolean;
  children: ReactNode;
}) {
  return (
    <section aria-label={label}>
      <Card tone="hero" padding="lg" className={cn(overlap && "pb-[62px]")}>
        <div className="flex items-center justify-between gap-2.5">
          <span className="font-medium text-base">{label}</span>
          {chip ? (
            <span className="inline-flex min-h-[30px] shrink-0 items-center rounded-full bg-accent-press px-3 font-semibold text-sm shadow-[inset_0_0.5px_0_var(--glass-sheen)]">
              {chip}
            </span>
          ) : null}
        </div>
        {children}
      </Card>
    </section>
  );
}

/** The hero's one action: a pill in the reverse of the hero's colours. */
function HeroLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Button
      asChild
      size="lg"
      variant="secondary"
      className="min-w-0 flex-1 bg-accent-ink text-accent hover:bg-accent-ink hover:opacity-90 active:bg-accent-ink focus-visible:outline-accent-ink"
    >
      <Link href={href}>
        <CalendarClock aria-hidden="true" />
        {children}
      </Link>
    </Button>
  );
}

/** "In 48 minutes", "tomorrow", or the day; nothing while the shift is on. */
function whenChip(
  t: T,
  shift: Pick<ScheduledShift, "day" | "start" | "end">,
  clock: BusinessClock,
): string | null {
  const when = shiftWhen(shift, clock);
  switch (when.kind) {
    case "now":
      return null;
    case "minutes":
      return t("home.hero.when.minutes", { count: when.count });
    case "hours":
      return t("home.hero.when.hours", { count: when.count });
    case "tomorrow":
      return t("home.hero.when.tomorrow");
    case "later":
      return t("shifts.day", {
        day: weekday(t, shift.day),
        date: dayMonth(shift.day),
      });
  }
}

/** "With Noa, Itay, Shira and 2 more": first names, as people call each other. */
function withPeople(t: T, format: Format, names: string[]) {
  const shown = names.slice(0, 3).map(firstNameOf);
  const left = names.length - shown.length;
  return t("home.hero.with", {
    names: format.list(
      left > 0 ? [...shown, t("home.hero.others", { count: left })] : shown,
      { type: "conjunction" },
    ),
  });
}

/** The first swap waiting for a decision, floating over the hero. */
function RequestCard({
  t,
  href,
  from,
  to,
  shift,
}: {
  t: T;
  href: string;
  from: AvatarPerson;
  to: AvatarPerson;
  shift: Pick<ScheduledShift, "name" | "day">;
}) {
  return (
    <Card tone="float" padding="none" className="relative z-10 mx-3 -mt-11">
      <Link
        href={href}
        className="pressable flex min-h-[72px] items-center gap-3 rounded-card p-3.5 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
      >
        <AvatarStack people={[to, from]} size="md" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-semibold text-base">
            {t("home.swap.title", {
              to: firstNameOf(to.name),
              from: firstNameOf(from.name),
            })}
          </span>
          <span className="text-ink-2 text-sm">
            {t("home.swap.subtitle", {
              shift: shift.name,
              day: weekday(t, shift.day),
              date: dayMonth(shift.day),
            })}
          </span>
        </span>
        <ChevronRight
          aria-hidden="true"
          className="size-5 shrink-0 text-ink-2 rtl:-scale-x-100"
        />
      </Link>
    </Card>
  );
}

/** A tile on screen: what it counts, where it leads and how loudly it says so. */
function tileContent(
  t: T,
  tile: TodayTile,
  due: { day: string; time: string },
): Omit<TileProps, "className"> {
  switch (tile.key) {
    case "gaps":
      return {
        href: "/schedule/build",
        icon: <CalendarDays />,
        tone: tile.count > 0 ? "warning" : "neutral",
        value: tile.count,
        label: t("home.needs.gaps", { count: tile.count }),
      };
    case "missing":
      return {
        href: "/schedule/availability/team",
        icon: <Users />,
        tone: tile.count === 0 ? "neutral" : tile.late ? "danger" : "warning",
        value: tile.count,
        label: t("home.needs.missing", { count: tile.count }),
      };
    case "swaps":
      return {
        href: "/schedule/swaps",
        icon: <Repeat />,
        tone: tile.count > 0 ? "accent" : "neutral",
        value: tile.count,
        label: t("home.needs.swaps", { count: tile.count }),
      };
    case "offers":
      return {
        href: "/schedule/shifts",
        icon: <CalendarPlus />,
        tone: tile.count > 0 ? "accent" : "neutral",
        value: tile.count,
        label: t("home.needs.offers", { count: tile.count }),
      };
    case "availability": {
      const href = "/schedule/availability";
      switch (tile.status) {
        case "sent":
          return {
            href,
            icon: <CalendarCheck />,
            tone: "accent",
            value: t("home.needs.availability.sent.value"),
            label: t("home.needs.availability.sent.label"),
          };
        case "due":
          return {
            href,
            icon: <CalendarClock />,
            tone: "warning",
            value: t("home.needs.availability.due.value"),
            label: t.rich("home.needs.availability.due.label", { ...due, ltr }),
          };
        case "late":
          return {
            href,
            icon: <CalendarClock />,
            tone: "danger",
            value: t("home.needs.availability.late.value"),
            label: t("home.needs.availability.late.label"),
          };
        case "closed":
          return {
            href,
            icon: <CalendarClock />,
            tone: "neutral",
            value: t("home.needs.availability.closed.value"),
            label: t("home.needs.availability.closed.label"),
          };
      }
    }
  }
}

function Needs({
  t,
  path,
  clock,
  role,
  schedule,
  now,
}: ViewProps & { now: string }) {
  const { published, availability, build } = schedule;
  const shifts = allShifts(published);
  const teamView = canSeeTeam(role) && schedule.teamAvailability;
  const nextWeekPublished = published.nextWeek.publishedAt !== null;
  const dueAt = new Date(availability.dueAt);
  const tiles = todayTiles({
    role,
    availability: availabilityStatus({
      sent: availability.mine !== null,
      published: nextWeekPublished,
      dueAt: availability.dueAt,
      now: new Date(now),
    }),
    offers: offersFor(
      published.swaps,
      shifts,
      published.userId,
      clock.date,
    ).filter((offer) => offer.state === "available").length,
    team: teamView
      ? {
          gaps:
            build && build.shifts.length > 0
              ? scheduleGaps(build.shifts).people
              : null,
          missing: nextWeekPublished ? null : teamView.team.counts.missing,
          pastDue: dueAt.getTime() < new Date(now).getTime(),
          swaps: approvalsFor(published.swaps, shifts, clock.date).length,
        }
      : null,
  });
  const due = {
    day: weekday(t, clockAt(dueAt, availability.timeZone).date),
    time: timeIn(dueAt, availability.timeZone),
  };
  const title = tiles.some(tileNeedsAction)
    ? teamView
      ? t("home.needs.title")
      : t("home.needs.waiting")
    : t("home.needs.calm");
  const scrolls = tiles.length > 2;

  return (
    <PageSection title={title}>
      {/* Room above and below, so the row that scrolls does not clip the shadows. */}
      <div
        className={cn(
          "-my-3 gap-2.5 py-3",
          "md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0",
          "md:[&>:last-child:nth-child(odd)]:col-span-2",
          "xl:auto-cols-fr xl:grid-flow-col xl:grid-cols-none xl:[&>:last-child:nth-child(odd)]:col-span-1",
          scrolls
            ? "-mx-4 flex snap-x snap-proximity scroll-px-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            : "grid grid-cols-2",
        )}
      >
        {tiles.map((tile) => {
          const { href, ...content } = tileContent(t, tile, due);
          return (
            <Tile
              key={tile.key}
              href={path(href)}
              className={
                scrolls ? "w-[138px] shrink-0 snap-start md:w-auto" : undefined
              }
              {...content}
            />
          );
        })}
      </div>
    </PageSection>
  );
}

/** Today's published shifts, each a grouped list of who works it. */
function WhoWorksToday({ t, path, clock, schedule }: ViewProps) {
  const { published } = schedule;
  const { thisWeek, nextWeek } = published;
  // With nothing published at all the hero says so, and says what to do next.
  if (thisWeek.publishedAt === null && nextWeek.publishedAt === null) {
    return null;
  }
  const today = shiftsByDay([clock.date], thisWeek.shifts)[0]?.shifts ?? [];
  const message =
    thisWeek.publishedAt === null
      ? t("home.who.notPublished")
      : today.length === 0
        ? t("home.who.noShifts")
        : null;
  return (
    <PageSection
      title={t("home.who.title")}
      className="md:col-span-2"
      action={
        <Link
          href={path("/schedule/shifts")}
          className="-my-2.5 flex min-h-11 items-center rounded-full text-base text-ink-2 focus-visible:outline-2 focus-visible:outline-accent"
        >
          {t("home.who.week")}
        </Link>
      }
    >
      {message ? (
        <Card tone="flat" padding="lg" className="md:max-w-xl">
          <CardText>{message}</CardText>
        </Card>
      ) : (
        <div
          className={cn(
            "grid gap-x-6 gap-y-5 md:grid-cols-2 xl:gap-x-8",
            today.length > 2 && "xl:grid-cols-3",
          )}
        >
          {today.map((shift) => {
            const short = stillNeeded(shift);
            return (
              <section
                key={shift.id}
                aria-label={t("shifts.shift", {
                  name: shift.name,
                  day: weekday(t, shift.day),
                  date: dayMonth(shift.day),
                })}
                className="flex min-w-0 flex-col gap-2"
              >
                <div className="flex min-h-[26px] flex-wrap items-center gap-x-2 gap-y-1 px-1">
                  <h3 className="font-semibold text-md">{shift.name}</h3>
                  <span className="text-base text-ink-2">
                    {t.rich("shifts.time", {
                      start: shift.start,
                      end: shift.end,
                      ltr,
                    })}
                  </span>
                  <span className="ms-auto flex flex-wrap gap-1.5">
                    {shiftPhase(shift, clock) === "now" ? (
                      <Badge tone="success">{t("home.who.now")}</Badge>
                    ) : null}
                    {short > 0 ? (
                      <Badge tone="warning">
                        {t("home.who.short", { count: short })}
                      </Badge>
                    ) : null}
                  </span>
                </div>
                <ListGroup>
                  {shift.assignees.length === 0 ? (
                    <ListRow title={t("shifts.nobody")} />
                  ) : (
                    shift.assignees.map((a) => {
                      const name = nameIn(t, published, a.user);
                      return (
                        <ListRow
                          key={a.user}
                          leading={
                            <Avatar
                              name={name}
                              photo={photoIn(published, a.user)}
                            />
                          }
                          title={name}
                          subtitle={
                            published.positions.find(
                              (p) => p.key === a.position,
                            )?.name
                          }
                        />
                      );
                    })
                  )}
                </ListGroup>
              </section>
            );
          })}
        </div>
      )}
    </PageSection>
  );
}
