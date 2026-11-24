import { getRunningStations } from "@db/clock-stations";
import {
  getCancelledEntries,
  getClockPeople,
  getTimeEntries,
} from "@db/time-clock";
import { canRecordAbsence } from "@domain/absences";
import { dateIn } from "@domain/availability";
import { stationSeen } from "@domain/clock-station";
import { canSeePay } from "@domain/payroll-access";
import { buildsSchedule } from "@domain/schedule";
import { timeIn } from "@domain/shabbat";
import {
  attendanceOf,
  atWorkNow,
  confirmRowOf,
  editsClock,
  entryDate,
  entryOverdue,
  monthMinutes,
  monthOf,
  monthRange,
  monthRecords,
  teamMonth,
} from "@domain/time-clock";
import { clockAt } from "@domain/today";
import { cache } from "react";
import { z } from "zod";
import { currentModuleSettings } from "../../modules";
import { awayTodayRows, personAbsenceRows } from "../absences";
import { clockAccess, currentEntriesToConfirm } from "../clock";
import type { PersonHoursData, StationRow, TeamHoursData } from "./team-types";

/**
 * The clock's reader, when they also edit it (`editsClock`: clock.edit, the
 * roles plan's R4): the team's hours are theirs to read and fix.
 */
const teamAccess = cache(async () => {
  const access = await clockAccess();
  return access && editsClock(access) ? access : null;
});

const askedMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

/** A month from the address, or this month when it's malformed or ahead. */
function monthFrom(asked: string | undefined, currentMonth: string): string {
  const month = askedMonth.safeParse(asked);
  return month.success && month.data <= currentMonth
    ? month.data
    : currentMonth;
}

/** Everyone's hours in a month. Null when the person doesn't edit the clock. */
export async function currentTeamHours(
  asked: string | undefined,
): Promise<TeamHoursData | null> {
  const access = await teamAccess();
  if (!access) return null;
  const { businessId, timeZone, viewOnly } = access;

  const now = new Date();
  const currentMonth = monthOf(clockAt(now, timeZone).date);
  const month = monthFrom(asked, currentMonth);
  const { from, to } = monthRange(month, timeZone);
  const [settings, people, entries, openNow, waiting, running] =
    await Promise.all([
      currentModuleSettings("time_clock"),
      getClockPeople(businessId),
      getTimeEntries(businessId, from, to),
      getTimeEntries(businessId, now, now),
      currentEntriesToConfirm(),
      getRunningStations(businessId),
    ]);

  const nameOf = (userId: string) =>
    people.find((person) => person.userId === userId)?.name ?? null;
  const today = clockAt(now, timeZone).date;
  const awayToday = await awayTodayRows(businessId, today, nameOf, (userId) =>
    people.some(
      (person) => person.userId === userId && person.staff && person.active,
    ),
  );
  const hours = teamMonth(
    entries,
    month,
    timeZone,
    now,
    settings.roundToMinutes,
  );
  // Those who left, and accountants (off the staff), are listed only for a
  // month they have hours in: someone who worked here before becoming one.
  const rows = people
    .filter(
      (person) => (person.staff && person.active) || hours.has(person.userId),
    )
    .map((person) => {
      const sum = hours.get(person.userId);
      return {
        userId: person.userId,
        name: person.name,
        former: !person.active,
        minutes: sum?.minutes ?? 0,
        shifts: sum?.shifts ?? 0,
        breakMinutes: sum?.breakMinutes ?? 0,
      };
    })
    .sort(
      (a, b) =>
        // Unnamed people go last, as on the team screen.
        (a.name === null ? 1 : 0) - (b.name === null ? 1 : 0) ||
        (a.name ?? "").localeCompare(b.name ?? "", "he"),
    );

  // A station shows the code where codes may show on a station, so the line
  // on leaving one is said there: under those running, or alone where the
  // business asks for the code. Those running are listed wherever, to stop.
  const stationRows = running.map((station): StationRow => {
    const seen = stationSeen(station.lastSeenAt, now);
    return {
      id: station.id,
      name: station.name,
      seen:
        seen.kind === "seen"
          ? {
              kind: "seen",
              date: dateIn(new Date(seen.at), timeZone),
              time: timeIn(new Date(seen.at), timeZone),
            }
          : seen,
    };
  });
  const howTo = settings.codeDisplay !== "manager";

  // Someone who forgot to leave days ago needs fixing; they aren't at work.
  const current = openNow.filter((entry) => !entryOverdue(entry, now));
  return {
    month,
    currentMonth,
    minutes: rows.reduce((sum, row) => sum + row.minutes, 0),
    shifts: rows.reduce((sum, row) => sum + row.shifts, 0),
    required: settings.requirePunchCode,
    showCode: settings.requirePunchCode && settings.codeDisplay !== "station",
    viewOnly,
    payroll: canSeePay({ role: access.role, perms: access.perms }),
    toConfirm: waiting.map(({ entry, toConfirm }) => ({
      entryId: entry.id,
      userId: entry.userId,
      name: nameOf(entry.userId),
      date: entryDate(entry, timeZone),
      ...confirmRowOf(
        {
          in: timeIn(new Date(entry.clockIn), timeZone),
          out: entry.clockOut
            ? timeIn(new Date(entry.clockOut), timeZone)
            : null,
        },
        toConfirm,
      ),
    })),
    atWork: atWorkNow(current, now).map((person) => {
      const entry = current.find(
        (open) => open.userId === person.userId && open.clockOut === null,
      );
      return {
        userId: person.userId,
        name: nameOf(person.userId),
        since: timeIn(new Date(person.since), timeZone),
        onBreak: person.onBreak,
        month: monthOf(entryDate({ clockIn: person.since }, timeZone)),
        attendance: entry ? attendanceOf(entry) : null,
      };
    }),
    overdue: openNow
      .filter((entry) => entryOverdue(entry, now))
      .map((entry) => ({
        entryId: entry.id,
        userId: entry.userId,
        name: nameOf(entry.userId),
        date: entryDate(entry, timeZone),
        in: timeIn(new Date(entry.clockIn), timeZone),
      })),
    people: rows,
    // Always, so the list (and a stop's toast in it) stays when the page is
    // read again with its last station stopped.
    stations: {
      rows: stationRows,
      howTo,
      shownEmpty: howTo && settings.requirePunchCode,
      today,
    },
    awayToday,
  };
}

const personId = z.uuid();

/**
 * One person's shifts in a month, with those cancelled among them, each saying
 * who cancelled it, when and why (they count for nothing). Null when the
 * person asking doesn't edit the clock, that person was never in the
 * business, or they are off the staff (an accountant) with no shifts in the
 * month, live or cancelled: a cancelled shift of someone who left can still
 * be reached.
 */
export async function currentPersonHours(
  asked: string,
  askedForMonth: string | undefined,
): Promise<PersonHoursData | null> {
  const access = await teamAccess();
  const id = personId.safeParse(asked);
  if (!access || !id.success) return null;
  const { businessId, timeZone, viewOnly } = access;

  const now = new Date();
  const today = clockAt(now, timeZone).date;
  const currentMonth = monthOf(today);
  const month = monthFrom(askedForMonth, currentMonth);
  const { from, to } = monthRange(month, timeZone);
  const [settings, scheduling, people, entries, cancelled] = await Promise.all([
    currentModuleSettings("time_clock"),
    // The weeks the builder opens, for the way to a shift on a day away.
    currentModuleSettings("scheduling"),
    getClockPeople(businessId),
    getTimeEntries(businessId, from, to, id.data),
    getCancelledEntries(businessId, from, to, id.data),
  ]);
  const person = people.find((row) => row.userId === id.data);
  if (
    !person ||
    (!person.staff && entries.length === 0 && cancelled.length === 0)
  ) {
    return null;
  }

  const step = settings.roundToMinutes;
  // Who corrected or cancelled each shift, or recorded days away, for its line.
  const nameOf = (userId: string) =>
    people.find((row) => row.userId === userId)?.name ?? null;
  const absences = await personAbsenceRows(
    businessId,
    person.userId,
    month,
    today,
    timeZone,
    scheduling.weekStartsOn,
    nameOf,
  );
  const records = canRecordAbsence(access, access.userId, person.userId);
  const onStaff = person.staff && person.active;
  return {
    person: { userId: person.userId, name: person.name },
    month,
    currentMonth,
    minutes: monthMinutes(entries, month, timeZone, now, step),
    records: monthRecords(
      entries,
      month,
      timeZone,
      now,
      step,
      nameOf,
      cancelled,
    ),
    today,
    unpaidBreaks: settings.unpaidBreaks,
    viewOnly,
    absences,
    // Someone off the staff gets no new days away: the database says so too.
    canRecord: records && onStaff,
    // The viewer edits the clock (`teamAccess`), so only one's own stops it,
    // or someone who left.
    recordsNot: !records ? "own" : !onStaff ? "offStaff" : null,
    builds: access.scheduling && buildsSchedule(access),
  };
}
