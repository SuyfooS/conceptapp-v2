import { getDepartments } from "@db/departments";
import { getEmploymentPeriods, getPayrollDetails } from "@db/payroll-details";
import { getOwnPublishedShifts } from "@db/schedule";
import {
  getCancelledEntries,
  getClockEditors,
  getClockPeople,
  getEntriesToConfirm,
  getTimeEntries,
} from "@db/time-clock";
import { getWages } from "@db/wages";
import { absenceDays, monthSpan } from "@domain/absences";
import { askFixOf, hoursFixers } from "@domain/ask-fix";
import { addDays, instantIn } from "@domain/availability";
import { canOpenModule, isStaff } from "@domain/modules";
import { canSeePay } from "@domain/payroll-access";
import {
  currentPeriod,
  type EmploymentPeriod,
  type PayrollDetails,
} from "@domain/payroll-details";
import { needsPunchCode } from "@domain/punch-code";
import { timeIn } from "@domain/shabbat";
import {
  addMonths,
  atWorkNow,
  type CancelledEntry,
  canConfirm,
  clockStatus,
  editsClock,
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
import { longShift } from "@domain/time-clock-format";
import { clockAt, nextShift } from "@domain/today";
import { canWrite } from "@domain/view-as";
import { wageNow } from "@domain/wages";
import { youthLabel } from "@domain/youth";
import { manifestFor } from "@modules/registry";
import { cache } from "react";
import { chatPaths } from "../chat/chat-paths";
import { currentMember } from "../member";
import { currentModuleSettings, currentModules } from "../modules";
import { ownAbsences } from "./absences";
import type {
  ClockAskFix,
  ClockData,
  ClockPaths,
  OwnDetails,
} from "./clock-types";
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
    /**
     * Chat is open to them (an accountant is in no chat), as `chatAccess`
     * asks it: whom a shift that needs fixing asks is written to there.
     */
    chat:
      isStaff(membership.role) &&
      canOpenModule(manifestFor("chat"), enabled, membership),
    perms: membership.perms,
    timeZone: membership.business.place.timeZone,
  };
});

type ClockAccess = NonNullable<Awaited<ReturnType<typeof clockAccess>>>;

/**
 * Whom the person asks to correct their hours (closing the pilot, PR 8):
 * those who may edit the clock in the business (`public.clock_editors`),
 * never the person, the owners only when nobody else may, those in the
 * person's departments first (`hoursFixers`); written to in chat, or only
 * named with chat off. Null for whoever edits the clock themself (they
 * correct their own on the team's hours), while viewing as someone, and
 * when nobody else may. A read that fails leaves it out: the clock still
 * opens, and its refusal still says whom to ask in words.
 */
async function askFixFor(access: ClockAccess): Promise<ClockAskFix | null> {
  if (access.viewOnly || editsClock(access)) return null;
  try {
    const [editors, departments] = await Promise.all([
      getClockEditors(access.businessId),
      getDepartments(access.businessId),
    ]);
    const fixers = hoursFixers({
      editors,
      person: access.userId,
      departments: departments === "notYet" ? [] : departments,
      chat: access.chat,
    });
    // Their private chat: the one they have, or an empty one that the
    // first message makes.
    return askFixOf(
      fixers.map((fixer) => ({
        ...fixer,
        href: fixer.chat ? chatPaths.withPerson(fixer.id) : null,
      })),
    );
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code: unknown }).code)
        : "without a code";
    console.error("who corrects hours could not be read", code);
    return null;
  }
}

/**
 * The names of whoever corrected these entries or cancelled these shifts, as
 * the reader may see them, for each shift's "corrected by" or "cancelled by"
 * line. Reads the team only when someone did.
 */
async function correctorNames(
  businessId: string,
  entries: readonly TimeEntry[],
  cancelled: readonly CancelledEntry[] = [],
): Promise<(userId: string) => string | null> {
  if (
    !entries.some((entry) => entry.editedBy !== null) &&
    !cancelled.some((one) => one.cancelledBy !== null)
  ) {
    return () => null;
  }
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

/**
 * What the clock shows of the person's own details for payroll: what a pay
 * holder set. A start copied from joining the app is left out: it is the
 * day they joined the app, for a holder to check, not when they started.
 * Null when there is nothing to show.
 */
function ownDetailsOf(
  details: PayrollDetails | undefined,
  periods: readonly EmploymentPeriod[],
  today: string,
): OwnDetails | null {
  const period = currentPeriod(periods, today);
  const own: OwnDetails = {
    payrollNumber: details?.payrollNumber ?? null,
    restDay: details ? details.restDay : null,
    youthUntil: youthLabel(details?.youthUntil ?? null, today)?.until ?? null,
    startedOn: period?.source === "set" ? period.startedOn : null,
  };
  return own.payrollNumber || own.restDay !== null || own.startedOn
    ? own
    : null;
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
  // The team's hours and the code screen, for whoever edits the clock
  // (clock.edit, as the database answers it: the roles plan's R4).
  const edits = editsClock(access);
  const [entries, today, openNow, wages, details, periods, askFix] =
    await Promise.all([
      getTimeEntries(
        businessId,
        monthRange(lastMonth, timeZone).from,
        monthRange(month, timeZone).to,
        userId,
      ),
      scheduling ? shiftToday(businessId, userId, timeZone, now) : null,
      edits ? getTimeEntries(businessId, now, now) : [],
      // Their own wages, details and periods only, under their own session.
      getWages(businessId, userId),
      getPayrollDetails(businessId, userId),
      getEmploymentPeriods(businessId, userId),
      // Whom to ask, should a press be refused for what only they can fix:
      // read with the rest, since the refusal comes from a press.
      askFixFor(access),
    ]);
  const localToday = clockAt(now, timeZone).date;
  const ownWage = wageNow(wages, localToday);

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
      canShowCode: edits && settings.codeDisplay !== "station",
    },
    team: edits
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
    ownDetails: ownDetailsOf(
      details.get(userId),
      periods.get(userId) ?? [],
      localToday,
    ),
    viewOnly,
    askFix,
  };
}

/**
 * One month of the person's shifts, with their cancelled ones among them, each
 * saying who cancelled it, when and why (RLS lets them read their own). Null
 * when they cannot open the clock.
 */
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
  const [entries, cancelled, away] = await Promise.all([
    getTimeEntries(businessId, from, to, userId),
    getCancelledEntries(businessId, from, to, userId),
    ownAbsences(businessId, userId, month),
  ]);
  const step = settings.roundToMinutes;
  const nameOf = await correctorNames(businessId, entries, cancelled);
  const span = monthSpan(month);
  const records = monthRecords(
    entries,
    month,
    timeZone,
    now,
    step,
    nameOf,
    cancelled,
  );
  return {
    month,
    currentMonth,
    // Whom to ask, beside a shift that needs fixing or one that counted over
    // 14 hours: read only for a month that has one.
    askFix: records.some((record) => record.overdue || longShift(record))
      ? await askFixFor(access)
      : null,
    // Their own days away (known issue 19): read only, as recorded.
    absences: away.map((one) => ({
      id: one.id,
      kind: one.kind,
      from: one.from,
      to: one.to,
      note: one.note,
      days: absenceDays(one),
      inMonth: absenceDays(one, span),
    })),
    minutes: monthMinutes(entries, month, timeZone, now, step),
    records,
  };
}

/**
 * The entries made without a code, or set by someone for themselves, that the
 * signed-in person may confirm, since the start of last month, oldest first.
 * Empty for anyone who doesn't edit the clock (`editsClock`).
 */
export const currentEntriesToConfirm = cache(
  async (): Promise<{ entry: TimeEntry; toConfirm: ToConfirm }[]> => {
    const access = await clockAccess();
    if (!access || !editsClock(access)) return [];
    const { businessId, timeZone, userId, role, perms } = access;
    const month = monthOf(clockAt(new Date(), timeZone).date);
    const entries = await getEntriesToConfirm(
      businessId,
      monthRange(addMonths(month, -1), timeZone).from,
    );
    return entries.flatMap((entry) => {
      const toConfirm = entryToConfirm(entry);
      return toConfirm &&
        canConfirm(toConfirm, entry.userId, { userId, role, perms })
        ? [{ entry, toConfirm }]
        : [];
    });
  },
);

export type ClockLine =
  | { kind: "working" | "break"; at: string }
  | { kind: "ownOverdue" }
  | { kind: "overdue"; count: number }
  | { kind: "confirm"; count: number };

/**
 * What the clock's row on Today says: shifts whoever edits the clock has to
 * fix first, then hours waiting for their approval, then where the person
 * stands, their own shift open over 24 hours said as one that needs fixing
 * (closing the pilot, PR 8: the clock it links to says whom to ask). Null
 * when there is nothing to say.
 */
export const currentClockLine = cache(async (): Promise<ClockLine | null> => {
  const access = await clockAccess();
  if (!access) return null;
  const now = new Date();
  // Whoever edits the clock reads everyone's open entries here, and anyone
  // else their own.
  const open = await getTimeEntries(access.businessId, now, now);
  const overdue = editsClock(access)
    ? open.filter((entry) => entryOverdue(entry, now)).length
    : 0;
  if (overdue > 0) return { kind: "overdue", count: overdue };
  const waiting = (await currentEntriesToConfirm()).length;
  if (waiting > 0) return { kind: "confirm", count: waiting };
  const status = clockStatus(openEntryOf(open, access.userId));
  if (status.state === "off") return null;
  if (entryOverdue(status.entry, now)) return { kind: "ownOverdue" };
  const since =
    status.state === "break" ? status.pause.startedAt : status.entry.clockIn;
  return { kind: status.state, at: timeIn(new Date(since), access.timeZone) };
});
