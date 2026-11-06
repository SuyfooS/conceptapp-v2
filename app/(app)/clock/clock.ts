import { getBusinessPlace, getWeek } from "@db/availability";
import { getWeekSchedule } from "@db/schedule";
import { getTimeEntries } from "@db/time-clock";
import { addDays, instantIn } from "@domain/availability";
import { canOpenModule } from "@domain/modules";
import { timeIn } from "@domain/shabbat";
import { canSeeTeam } from "@domain/team";
import {
  addMonths,
  atWorkNow,
  clockStatus,
  entryMinutes,
  entryOverdue,
  monthMinutes,
  monthOf,
  monthRange,
  monthRecords,
  openEntryOf,
  UNDO_CLOCK_OUT_SECONDS,
  undoableEntry,
} from "@domain/time-clock";
import { clockAt, nextShift } from "@domain/today";
import { canWrite } from "@domain/view-as";
import { manifestFor } from "@modules/registry";
import { cache } from "react";
import { currentMember } from "../member";
import { currentModuleSettings, currentModules } from "../modules";
import { currentPublishedSchedule } from "../schedule/week";
import type { ClockData } from "./clock-types";
import type { HistoryData } from "./history/history-view";

export const clockPaths = {
  clock: "/clock",
  history: "/clock/history",
  team: "/clock/team",
};

/** How many shifts the wider screens show beside the circle. */
const RECENT_SHIFTS = 5;
/** Clocked in earlier than this before a shift, they are not on that shift. */
const EARLY_ARRIVAL_MS = 3_600_000;

/**
 * The signed-in person and their business, when the clock is on for it and
 * their role reaches it. Null otherwise: the screens then do not exist for them.
 */
export const clockAccess = cache(async () => {
  const [member, enabled] = await Promise.all([
    currentMember(),
    currentModules(),
  ]);
  const membership = member?.membership;
  if (
    !member ||
    !membership ||
    !canOpenModule(manifestFor("time_clock"), enabled, membership.role)
  ) {
    return null;
  }
  const { timeZone } = await getBusinessPlace(membership.business.id);
  return {
    userId: member.userId,
    businessId: membership.business.id,
    role: membership.role,
    viewOnly: !canWrite(member.viewing),
    timeZone,
  };
});

/** The person's shift that is on or still to come today, by the schedule. */
async function shiftToday(
  businessId: string,
  userId: string,
  timeZone: string,
  now: Date,
) {
  const published = await currentPublishedSchedule();
  if (!published) return { scheduling: false, shift: null };
  const clock = clockAt(now, timeZone);
  // On a week's first day, last week's final shift may still be running.
  const lastWeek =
    published.today === published.thisWeek.start
      ? await getWeek(businessId, addDays(published.thisWeek.start, -7))
      : null;
  const shift = nextShift(
    [
      ...(lastWeek?.schedulePublishedAt
        ? await getWeekSchedule(lastWeek.id)
        : []),
      ...published.thisWeek.shifts,
      ...published.nextWeek.shifts,
    ],
    clock,
    userId,
  );
  if (!shift || shift.day > clock.date) {
    return { scheduling: true, shift: null };
  }
  const endDate = shift.end > shift.start ? shift.day : addDays(shift.day, 1);
  return {
    scheduling: true,
    shift: {
      start: shift.start,
      end: shift.end,
      from: instantIn(shift.day, shift.start, timeZone).toISOString(),
      to: instantIn(endDate, shift.end, timeZone).toISOString(),
    },
  };
}

/** Everything on the clock screen. Null when the person cannot open it. */
export async function currentClock(): Promise<ClockData | null> {
  const access = await clockAccess();
  if (!access) return null;
  const { userId, businessId, role, viewOnly, timeZone } = access;

  const now = new Date();
  const settings = await currentModuleSettings("time_clock");
  const month = monthOf(clockAt(now, timeZone).date);
  const lastMonth = addMonths(month, -1);
  const manager = canSeeTeam(role);
  const [entries, today, openNow] = await Promise.all([
    getTimeEntries(
      businessId,
      monthRange(lastMonth, timeZone).from,
      monthRange(month, timeZone).to,
      userId,
    ),
    shiftToday(businessId, userId, timeZone, now),
    manager ? getTimeEntries(businessId, now, now) : [],
  ]);

  const step = settings.roundToMinutes;
  const open = openEntryOf(entries, userId);
  const undo = open ? null : undoableEntry(entries, now);
  // Still here after their shift, the next one ahead is not the one they are on.
  const later =
    open &&
    today.shift &&
    Date.parse(today.shift.from) - now.getTime() > EARLY_ARRIVAL_MS;
  return {
    now: now.toISOString(),
    timeZone,
    open,
    scheduling: today.scheduling,
    shift: later ? null : today.shift,
    thisMonth: monthMinutes(entries, month, timeZone, now, step),
    lastMonth: monthMinutes(entries, lastMonth, timeZone, now, step),
    recent: [
      ...monthRecords(entries, month, timeZone, now, step),
      ...monthRecords(entries, lastMonth, timeZone, now, step),
    ].slice(0, RECENT_SHIFTS),
    undo:
      undo?.clockOut != null
        ? {
            entryId: undo.id,
            out: timeIn(new Date(undo.clockOut), timeZone),
            minutes: entryMinutes(undo, now),
            until: new Date(
              Date.parse(undo.clockOut) + UNDO_CLOCK_OUT_SECONDS * 1000,
            ).toISOString(),
          }
        : null,
    unpaidBreaks: settings.unpaidBreaks,
    canManage: role === "owner" || role === "manager",
    team: manager
      ? {
          atWork: atWorkNow(openNow, now).length,
          overdue: openNow.filter((entry) => entryOverdue(entry, now)).length,
        }
      : null,
    viewOnly,
  };
}

/** One month of the person's shifts. Null when they cannot open the clock. */
export async function currentClockHistory(
  asked: string | undefined,
): Promise<HistoryData | null> {
  const access = await clockAccess();
  if (!access) return null;
  const { userId, businessId, timeZone } = access;

  const now = new Date();
  const currentMonth = monthOf(clockAt(now, timeZone).date);
  // A month from the address that is malformed or ahead of today shows today's.
  const month =
    asked && /^\d{4}-(0[1-9]|1[0-2])$/.test(asked) && asked <= currentMonth
      ? asked
      : currentMonth;
  const settings = await currentModuleSettings("time_clock");
  const { from, to } = monthRange(month, timeZone);
  const entries = await getTimeEntries(businessId, from, to, userId);
  const step = settings.roundToMinutes;
  return {
    month,
    currentMonth,
    minutes: monthMinutes(entries, month, timeZone, now, step),
    records: monthRecords(entries, month, timeZone, now, step),
  };
}

export type ClockLine =
  | { kind: "working" | "break"; at: string }
  | { kind: "overdue"; count: number };

/**
 * What the clock's row on Today says: shifts a manager has to fix first, then
 * where the person stands. Null when there is nothing to say.
 */
export const currentClockLine = cache(async (): Promise<ClockLine | null> => {
  const access = await clockAccess();
  if (!access) return null;
  const now = new Date();
  // A manager reads everyone's open entries here, and anyone else their own.
  const open = await getTimeEntries(access.businessId, now, now);
  const overdue = canSeeTeam(access.role)
    ? open.filter((entry) => entryOverdue(entry, now)).length
    : 0;
  if (overdue > 0) return { kind: "overdue", count: overdue };
  const status = clockStatus(openEntryOf(open, access.userId));
  if (status.state === "off") return null;
  const since =
    status.state === "break" ? status.pause.startedAt : status.entry.clockIn;
  return { kind: status.state, at: timeIn(new Date(since), access.timeZone) };
});
