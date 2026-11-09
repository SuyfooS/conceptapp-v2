import { getClockPeople, getTimeEntries } from "@db/time-clock";
import { timeIn } from "@domain/shabbat";
import { canSeeTeam } from "@domain/team";
import {
  attendanceOf,
  atWorkNow,
  confirmRowOf,
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
import { clockAccess, currentEntriesToConfirm } from "../clock";
import type { PersonHoursData, TeamHoursData } from "./team-types";

/** The clock's reader, when they are also someone who sees the team. */
const teamAccess = cache(async () => {
  const access = await clockAccess();
  return access && canSeeTeam(access.role) ? access : null;
});

const askedMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

/** A month from the address, or this month when it's malformed or ahead. */
function monthFrom(asked: string | undefined, currentMonth: string): string {
  const month = askedMonth.safeParse(asked);
  return month.success && month.data <= currentMonth
    ? month.data
    : currentMonth;
}

/** Everyone's hours in a month. Null when the person doesn't see the team. */
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
  const [settings, people, entries, openNow, waiting] = await Promise.all([
    currentModuleSettings("time_clock"),
    getClockPeople(businessId),
    getTimeEntries(businessId, from, to),
    getTimeEntries(businessId, now, now),
    currentEntriesToConfirm(),
  ]);

  const nameOf = (userId: string) =>
    people.find((person) => person.userId === userId)?.name ?? null;
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
  };
}

const personId = z.uuid();

/**
 * One person's shifts in a month. Null when the person asking doesn't see the
 * team, that person was never in the business, or they are off the staff (an
 * accountant) and have no hours in the month.
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
  const [settings, people, entries] = await Promise.all([
    currentModuleSettings("time_clock"),
    getClockPeople(businessId),
    getTimeEntries(businessId, from, to, id.data),
  ]);
  const person = people.find((row) => row.userId === id.data);
  if (!person || (!person.staff && entries.length === 0)) return null;

  const step = settings.roundToMinutes;
  // Who corrected each shift, for its line.
  const nameOf = (userId: string) =>
    people.find((row) => row.userId === userId)?.name ?? null;
  return {
    person: { userId: person.userId, name: person.name },
    month,
    currentMonth,
    minutes: monthMinutes(entries, month, timeZone, now, step),
    records: monthRecords(entries, month, timeZone, now, step, nameOf),
    today,
    viewOnly,
  };
}
