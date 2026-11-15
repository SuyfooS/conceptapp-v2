import { dateIn, weekdayOf } from "@domain/availability";
import { dayMonth, WEEKDAY_KEYS } from "@domain/availability-form";
import {
  BUILDER_PATH,
  boardDraft,
  builderHref,
  runningFirst,
  runningGaps,
} from "@domain/running-week";
import { scheduleGaps, scheduleOpening } from "@domain/schedule";
import { timeIn } from "@domain/shabbat";
import { offersFor, toApprove } from "@domain/swaps";
import { Badge } from "@ui/badge";
import { ListGroup, ListRow } from "@ui/list-row";
import { PageBody, PageSection } from "@ui/page";
import {
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  Repeat,
  Users,
} from "lucide-react";
import { getLocale } from "next-intl/server";
import type { ReactNode } from "react";
import type { PushAskOffer } from "../notifications/push-ask";
import { type AppWording, type Translator, translator } from "../wording";
import type { SwapAction } from "./shifts/shift-sheet";
import { ltr, upcomingShifts } from "./shifts/shift-text";
import { pendingApprovals } from "./swaps/swap-approvals-view";
import type {
  AvailabilityWeek,
  PublishedSchedule,
  ScheduleBuildWeek,
  TeamAvailabilityWeek,
} from "./week";
import { type BoardWeek, WeekBoard } from "./week-board";

type T = Translator<"app">;

/** A group of rows: under each other, and side by side on a desktop. */
const groupClass =
  "xl:grid xl:auto-cols-fr xl:grid-flow-col xl:[&>*]:before:hidden xl:[&>*:not(:first-child)]:border-s xl:[&>*:not(:first-child)]:border-line";

/** The count or verb of the row that waits for this person: the screen's main action. */
function Waiting({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex min-h-[26px] min-w-[26px] items-center justify-center rounded-full bg-accent px-2.5 font-semibold text-accent-ink text-sm">
      {children}
    </span>
  );
}

export type ScheduleViewProps = {
  data: PublishedSchedule;
  /** Next week, for the person's own availability. */
  week: AvailabilityWeek;
  /** The due moment for availability has passed. */
  late: boolean;
  /** Set for owners and managers. */
  team: TeamAvailabilityWeek | null;
  /** Next week as the manager builds it; set for owners and managers. */
  build: ScheduleBuildWeek | null;
  /**
   * The week running now as the manager builds it, once someone built it
   * (`currentRunningBuild`); null for anyone else, and until then.
   */
  running: ScheduleBuildWeek | null;
  swap: SwapAction;
  /** After giving a shift away, once, the offer of notifications on the phone. */
  ask?: PushAskOffer | null;
};

/**
 * The schedule tab, for everyone: the week and the person's shifts straight
 * away, and rows with counts to the screens around it. Also rendered with
 * mock data on /design/shell/schedule and /design/shell/schedule/worker.
 */
export async function ScheduleView({
  data,
  week,
  late,
  team,
  build,
  running,
  swap,
  wording,
  ask = null,
}: ScheduleViewProps & {
  /** The business's words. */
  wording: AppWording;
}) {
  const t = translator(wording, "app");
  const tm = translator(wording, "modules.scheduling");
  const locale = await getLocale();
  const manager = team !== null;
  const range = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
  const rangeOf = (dates: string[]) =>
    range.formatRange(
      new Date(`${dates[0]}T00:00:00Z`),
      new Date(`${dates.at(-1)}T00:00:00Z`),
    );

  const publishedOf = (at: string | null) =>
    at
      ? {
          date: dayMonth(dateIn(new Date(at), data.timeZone)),
          time: timeIn(new Date(at), data.timeZone),
        }
      : null;

  // Drafts stay with the managers: the rest of the team reads what is out.
  // This week's too, once someone saved it: a draft outlives the week's turn
  // (the running-week plan's R4), and the builder opens the week under way.
  const thisDraft = boardDraft(data.thisWeek, running);
  const draft = boardDraft(data.nextWeek, build);
  const weeks: [BoardWeek, BoardWeek] = [
    {
      key: "this",
      range: rangeOf(data.thisWeek.dates),
      dates: data.thisWeek.dates,
      state: data.thisWeek.publishedAt
        ? "published"
        : thisDraft
          ? "draft"
          : "none",
      shifts: thisDraft ? thisDraft.shifts : data.thisWeek.shifts,
      shabbat: data.thisWeek.shabbat,
      published: publishedOf(data.thisWeek.publishedAt),
    },
    {
      key: "next",
      range: rangeOf(data.nextWeek.dates),
      dates: data.nextWeek.dates,
      state: data.nextWeek.publishedAt ? "published" : draft ? "draft" : "none",
      shifts: draft ? draft.shifts : data.nextWeek.shifts,
      shabbat: data.nextWeek.shabbat,
      published: publishedOf(data.nextWeek.publishedAt),
    },
  ];

  // A request whose shift has begun can only be declined: it waits for no
  // approval, so it is not counted (it is still listed on the screen).
  const approvals = toApprove(pendingApprovals(data)).length;
  // The one thing waiting for this person goes first, in the accent.
  const approvalsFirst = manager && approvals > 0;
  const availabilityFirst = !manager && !week.mine;
  const availability = (
    <AvailabilityRow t={t} week={week} late={late} first={availabilityFirst} />
  );
  const approvalsRow = (
    <ApprovalsRow t={t} count={approvals} first={approvalsFirst} />
  );
  const prompt: ReactNode = approvalsFirst
    ? approvalsRow
    : availabilityFirst
      ? availability
      : null;

  const offers = offersFor(
    data.swaps,
    [...data.thisWeek.shifts, ...data.nextWeek.shifts],
    data.userId,
    new Date(data.now),
    data.timeZone,
  ).filter((o) => o.state === "available").length;

  const own = (
    <ListGroup className={groupClass}>
      <ShiftsRow t={t} data={data} />
      {offers > 0 ? <OffersRow t={t} count={offers} /> : null}
      {availabilityFirst ? null : availability}
    </ListGroup>
  );

  return (
    <PageBody>
      <WeekBoard
        title={tm("name")}
        weeks={weeks}
        opening={scheduleOpening({
          today: data.today,
          userId: data.userId,
          manager,
          thisWeek: weeks[0],
          nextWeek: weeks[1],
        })}
        data={{
          userId: data.userId,
          today: data.today,
          now: data.now,
          timeZone: data.timeZone,
          people: data.people,
          positions: data.positions,
          swaps: data.swaps,
        }}
        manager={manager}
        swap={swap}
        ask={ask}
        draftHref={BUILDER_PATH}
        prompt={
          prompt ? (
            <ListGroup className="bg-accent-soft shadow-none [&_a>span:first-child]:bg-surface [&_a]:hover:bg-transparent">
              {prompt}
            </ListGroup>
          ) : null
        }
        manage={
          team ? (
            <PageSection title={t("shifts.board.manage")}>
              <ListGroup className={groupClass}>
                {running ? (
                  <RunningRow
                    t={t}
                    running={running}
                    now={data.now}
                    timeZone={data.timeZone}
                  />
                ) : null}
                {build ? <BuildRow t={t} build={build} /> : null}
                <TeamRow t={t} team={team} />
                {approvalsFirst ? null : approvalsRow}
              </ListGroup>
            </PageSection>
          ) : null
        }
        own={
          team ? (
            <PageSection title={t("shifts.board.own")}>{own}</PageSection>
          ) : (
            own
          )
        }
      />
    </PageBody>
  );
}

/** Everyone: their next shift, and how many are coming. */
function ShiftsRow({ t, data }: { t: T; data: PublishedSchedule }) {
  const mine = upcomingShifts(data);
  const next = mine[0]?.shift;
  const anyPublished =
    data.thisWeek.publishedAt !== null || data.nextWeek.publishedAt !== null;
  return (
    <ListRow
      href="/schedule/shifts"
      leading={<CalendarClock />}
      title={t("shifts.title")}
      subtitle={
        next
          ? t.rich("shifts.entry.next", {
              day: t(
                `availability.weekdays.${WEEKDAY_KEYS[weekdayOf(next.day)] ?? "sun"}`,
              ),
              name: next.name,
              time: next.start,
              ltr,
            })
          : anyPublished
            ? t("shifts.entry.none")
            : t("shifts.entry.notPublished")
      }
      trailing={
        mine.length > 0 ? <Badge tone="accent">{mine.length}</Badge> : null
      }
    />
  );
}

/** Colleagues' shifts this person could take. */
function OffersRow({ t, count }: { t: T; count: number }) {
  return (
    <ListRow
      href="/schedule/shifts"
      leading={<Repeat />}
      title={t("shifts.swap.offers.title")}
      subtitle={t("shifts.swap.offers.count", { count })}
      trailing={<Badge tone="accent">{count}</Badge>}
    />
  );
}

/** Everyone: their own availability for next week. */
function AvailabilityRow({
  t,
  week,
  late,
  first,
}: {
  t: T;
  week: AvailabilityWeek;
  late: boolean;
  first: boolean;
}) {
  const due = new Date(week.dueAt);
  const when = {
    day: t(
      `availability.weekdays.${WEEKDAY_KEYS[weekdayOf(dateIn(due, week.timeZone))] ?? "sun"}`,
    ),
    time: timeIn(due, week.timeZone),
  };
  return (
    <ListRow
      href="/schedule/availability"
      leading={<CalendarCheck />}
      title={t("availability.title")}
      subtitle={
        week.mine
          ? t("availability.entry.sent", when)
          : late
            ? t("availability.entry.late")
            : t("availability.entry.notSent", when)
      }
      trailing={
        week.mine ? null : first ? (
          <Waiting>{t("availability.entry.badge")}</Waiting>
        ) : (
          <Badge tone={late ? "warning" : "accent"}>
            {t("availability.entry.badge")}
          </Badge>
        )
      }
    />
  );
}

/**
 * Owners and managers: this week's schedule, only while a shift still to
 * start lacks someone or while it waits to be published (Orel's answer 6 of
 * 15 November 2026: what is nearer goes first; `runningFirst`), leading to
 * the builder of the week under way.
 */
function RunningRow({
  t,
  running,
  now,
  timeZone,
}: {
  t: T;
  running: ScheduleBuildWeek;
  /** ISO timestamp: the moment the server read the schedule. */
  now: string;
  timeZone: string;
}) {
  const at = new Date(now);
  if (!runningFirst(running, at, timeZone)) return null;
  const short = runningGaps(running, at, timeZone).shifts;
  const status = running.publishedAt
    ? t("build.entry.subtitlePublished")
    : t("build.entry.subtitleSaved");
  return (
    <ListRow
      href={builderHref(running.week.start)}
      leading={<CalendarClock />}
      title={t("build.titleRunning")}
      subtitle={
        short > 0
          ? `${status} · ${t("build.entry.thisWeek", { count: short })}`
          : status
      }
      trailing={short > 0 ? <Badge tone="warning">{short}</Badge> : null}
    />
  );
}

/** Owners and managers: next week's schedule, and the shifts still short. */
function BuildRow({ t, build }: { t: T; build: ScheduleBuildWeek }) {
  const short = scheduleGaps(build.shifts).shifts.length;
  const status = build.publishedAt
    ? t("build.entry.subtitlePublished")
    : build.savedAt
      ? t("build.entry.subtitleSaved")
      : t("build.entry.subtitleDraft");
  return (
    <ListRow
      href="/schedule/build"
      leading={<CalendarDays />}
      title={t("build.title")}
      subtitle={
        build.shifts.length === 0
          ? status
          : short > 0
            ? `${status} · ${t("build.gaps", { count: short })}`
            : `${status} · ${t("build.entry.full")}`
      }
      trailing={
        build.shifts.length > 0 && short > 0 ? (
          <Badge tone="warning">{short}</Badge>
        ) : null
      }
    />
  );
}

/** Owners and managers: how many answers are in, and how many missing. */
function TeamRow({ t, team }: { t: T; team: TeamAvailabilityWeek }) {
  const { sent, missing } = team.team.counts;
  return (
    <ListRow
      href="/schedule/availability/team"
      leading={<Users />}
      title={t("availability.team.title")}
      subtitle={
        missing > 0
          ? `${t("availability.team.missing.count", { count: missing })} · ${t("shifts.board.teamSent", { sent, total: sent + missing })}`
          : t("availability.team.entry.allSent")
      }
      trailing={missing > 0 ? <Badge tone="warning">{missing}</Badge> : null}
    />
  );
}

/** Owners and managers: the swaps a colleague took, waiting for them. */
function ApprovalsRow({
  t,
  count,
  first,
}: {
  t: T;
  count: number;
  first: boolean;
}) {
  return (
    <ListRow
      href="/schedule/swaps"
      leading={<Repeat />}
      title={t("swaps.title")}
      subtitle={t("swaps.entry.subtitle", { count })}
      trailing={first ? <Waiting>{count}</Waiting> : null}
    />
  );
}
