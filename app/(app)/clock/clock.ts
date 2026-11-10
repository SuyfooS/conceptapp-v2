import { getOwnPublishedShifts } from "@db/schedule";
import {
  getClockPeople,
  getEntriesToConfirm,
  getTimeEntries,
} from "@db/time-clock";
import { getWages } from "@db/wages";
import { addDays, instantIn } from "@domain/availability";
import { canOpenModule } from "@domain/modules";
import { canSeePay } from "@domain/payroll-access";
import { needsPunchCode } from "@domain/punch-code";
import { timeIn } from "@domain/shabbat";
import { canSeeTeam } from "@domain/team";
import {
  addMonths,
  atWorkNow,
  canConfirm,
  clockStatus,
  entryMinutes,
  entryOverdue,
  entryToConfirm,
  monthMinutes,
  monthOf,
  monthRange,
  monthRecords,
  openEntryOf,
  type TimeEntry,
  type ToConfirm,
  UNDO_CLOCK_OUT_SECONDS,
  undoableEntry,
} from "@domain/time-clock";
import { clockAt, nextShift } from "@domain/today";
import { canWrite } from "@domain/view-as";
import { wageNow } from "@domain/wages";
import { manifestFor } from "@modules/registry";
import { cache } from "react";
import { currentMember } from "../member";
import { currentModuleSettings, currentModules } from "../modules";
import type { ClockData, ClockPaths } from "./clock-types";
import type { HistoryData } from "./history/history-view";

export const clockPaths: ClockPaths = {
  clock: "/clock",
  history: "/clock/history",
  team: "/clock/team",
  code: "/clock/code",
  pay: "/clock/pay",
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
    !canOpenModule(manifestFor("time_clock"), enabled, membership)
  ) {
    return null;
  }
  return {
    userId: member.userId,
    businessId: membership.business.id,
    businessName: membership.business.name,
    role: membership.role,
    viewOnly: !canWrite(member.viewing),
    scheduling: canOpenModule(manifestFor("scheduling"), enabled, membership),
    perms: membership.perms,
    timeZone: membership.business.place.timeZone,
  };
});

/**
 * The names of whoever corrected these entries, as the reader may see them,
 * for each shift's "corrected by" line. Reads the team only when one was.
 */
async function correctorNames(
  businessId: string,
  entries: readonly TimeEntry[],
): Promise<(userId: string) => string | null> {
  if (!entries.some((entry) => entry.editedBy !== null)) return () => null;
  const people = await getClockPeople(businessId);
  return (userId) =>
    people.find((person) => person.userId === userId)?.name ?? null;
}

/** The person's shift that is on or still to come today, by the schedule. */
async function shiftToday(
  businessId: string,
  userId: string,
  timeZone: string,
  now: Date,
) {
  const clock = clockAt(now, timeZone);
  // Yesterday too: a shift past midnight may still be running, even from the
  // last day of the week before.
  const shift = nextShift(
    await getOwnPublishedShifts(
      businessId,
      userId,
      addDays(clock.date, -1),
      clock.date,
    ),
    clock,
    userId,
  );
  if (!shift) return null;
  const endDate = shift.end > shift.start ? shift.day : addDays(shift.day, 1);
  return {
    start: shift.start,
    end: shift.end,
    from: instantIn(shift.day, shift.start, timeZone).toISOString(),
    to: instantIn(endDate, shift.end, timeZone).toISOString(),
  };
}

/** Everything on the clock screen. Null when the person cannot open it. */
export async function currentClock(): Promise<ClockData | null> {
  const access = await clockAccess();
  if (!access) return null;
  const { userId, businessId, role, viewOnly, scheduling, timeZone } = access;

  const now = new Date();
  const settings = await currentModuleSettings("time_clock");
  const month = monthOf(clockAt(now, timeZone).date);
  const lastMonth = addMonths(month, -1);
  const manager = canSeeTeam(role);
  const [entries, today, openNow, wages] = await Promise.all([
    getTimeEntries(
      businessId,
      monthRange(lastMonth, timeZone).from,
      monthRange(month, timeZone).to,
      userId,
    ),
    scheduling ? shiftToday(businessId, userId, timeZone, now) : null,
    manager ? getTimeEntries(businessId, now, now) : [],
    // Their own wages only, under their own session.
    getWages(businessId, userId),
  ]);
  const ownWage = wageNow(wages, clockAt(now, timeZone).date);

  const step = settings.roundToMinutes;
  const nameOf = await correctorNames(businessId, entries);
  const open = openEntryOf(entries, userId);
  const undo = open ? null : undoableEntry(entries, now);
  // Still here after their shift, the next one ahead is not the one they are on.
  const later =
    open && today && Date.parse(today.from) - now.getTime() > EARLY_ARRIVAL_MS;
  return {
    now: now.toISOString(),
    timeZone,
    open,
    scheduling,
    shift: later ? null : today,
    thisMonth: monthMinutes(entries, month, timeZone, now, step),
    lastMonth: monthMinutes(entries, lastMonth, timeZone, now, step),
    recent: [
      ...monthRecords(entries, month, timeZone, now, step, nameOf),
      ...monthRecords(entries, lastMonth, timeZone, now, step, nameOf),
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
    punch: {
      required: settings.requirePunchCode,
      needsCode: needsPunchCode(settings, role),
      canShowCode: manager && settings.codeDisplay !== "station",
    },
    team: manager
      ? {
          atWork: atWorkNow(
            openNow.filter((entry) => !entryOverdue(entry, now)),
            now,
          ).length,
          overdue: openNow.filter((entry) => entryOverdue(entry, now)).length,
        }
      : null,
    payroll: canSeePay({ role, perms: access.perms }),
    ownWage: ownWage.current || ownWage.next ? ownWage : null,
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
  const nameOf = await correctorNames(businessId, entries);
  return {
    month,
    currentMonth,
    minutes: monthMinutes(entries, month, timeZone, now, step),
    records: monthRecords(entries, month, timeZone, now, step, nameOf),
  };
}

/**
 * The entries made without a code, or set by someone for themselves, that the
 * signed-in person may confirm, since the start of last month, oldest first.
 * Empty for anyone who doesn't see the team.
 */
export const currentEntriesToConfirm = cache(
  async (): Promise<{ entry: TimeEntry; toConfirm: ToConfirm }[]> => {
    const access = await clockAccess();
    if (!access || !canSeeTeam(access.role)) return [];
    const { businessId, timeZone, userId, role } = access;
    const month = monthOf(clockAt(new Date(), timeZone).date);
    const entries = await getEntriesToConfirm(
      businessId,
      monthRange(addMonths(month, -1), timeZone).from,
    );
    return entries.flatMap((entry) => {
      const toConfirm = entryToConfirm(entry);
      return toConfirm && canConfirm(toConfirm, entry.userId, { userId, role })
        ? [{ entry, toConfirm }]
        : [];
    });
  },
);

export type ClockLine =
  | { kind: "working" | "break"; at: string }
  | { kind: "overdue"; count: number }
  | { kind: "confirm"; count: number };

/**
 * What the clock's row on Today says: shifts a manager has to fix first, then
 * hours waiting for their approval, then where the person stands. Null when
 * there is nothing to say.
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
  const waiting = (await currentEntriesToConfirm()).length;
  if (waiting > 0) return { kind: "confirm", count: waiting };
  const status = clockStatus(openEntryOf(open, access.userId));
  if (status.state === "off") return null;
  const since =
    status.state === "break" ? status.pause.startedAt : status.entry.clockIn;
  return { kind: status.state, at: timeIn(new Date(since), access.timeZone) };
});
