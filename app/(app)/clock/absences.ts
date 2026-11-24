import { getAbsences, getTeamAway } from "@db/absences";
import { getOwnPublishedShifts } from "@db/schedule";
import { getClockPeople } from "@db/time-clock";
import {
  type Absence,
  type AwaySpan,
  absenceDays,
  awayToday,
  monthSpan,
  shiftsOnAbsence,
} from "@domain/absences";
import { addDays, dateIn, weekStartOf } from "@domain/availability";
import { canOpenModule, type Viewer } from "@domain/modules";
import { buildsSchedule } from "@domain/schedule";
import { editsClock } from "@domain/time-clock";
import { clockAt } from "@domain/today";
import { manifestFor } from "@modules/registry";
import { cache } from "react";
import { currentMember } from "../member";
import { currentModules } from "../modules";
import type { AbsenceRow, AwayTodayRow } from "./team/team-types";

/*
 * Days away (known issue 19), as the screens read them. The kind and the
 * note are read under RLS by the person, whoever edits the clock and pay
 * holders; the schedule's builders and Today get only who is away and when
 * (`public.team_away`). Each read answers none until Migrate brings the
 * table to a project.
 */

/** Published shifts are at most two weeks ahead: this week and the next. */
const SHIFTS_AHEAD_DAYS = 13;

/**
 * One person's days away that touch a month, for the person's page, and in
 * today's month those still to come too (a vacation recorded for next month
 * shows where it was recorded): each with its days in all and in the month,
 * who recorded it, and how many of their published shifts fall on its days
 * from today on (one read for all), with the week of the first, by the
 * schedule's `weekStartsOn`, which the builder opens.
 */
export async function personAbsenceRows(
  businessId: string,
  personId: string,
  month: string,
  today: string,
  timeZone: string,
  weekStartsOn: 0 | 1,
  nameOf: (userId: string) => string | null,
): Promise<AbsenceRow[]> {
  const span = monthSpan(month);
  const until = today.startsWith(month) ? addDays(today, 366) : span.to;
  const rows = await getAbsences(businessId, span.from, until, {
    userId: personId,
  });
  const last = addDays(today, SHIFTS_AHEAD_DAYS);
  const ahead = rows.some((one) => one.to >= today && one.from <= last);
  const shiftDays = ahead
    ? (await getOwnPublishedShifts(businessId, personId, today, last)).map(
        (shift) => shift.day,
      )
    : [];
  return rows.map((one) => {
    const on = shiftsOnAbsence(shiftDays, one, today);
    return {
      id: one.id,
      kind: one.kind,
      from: one.from,
      to: one.to,
      note: one.note,
      days: absenceDays(one),
      inMonth: absenceDays(one, span),
      recordedBy: one.recordedBy ? nameOf(one.recordedBy) : null,
      recordedOn: dateIn(new Date(one.recordedAt), timeZone),
      shifts: on.count,
      shiftsWeek: on.first ? weekStartOf(on.first, weekStartsOn) : null,
    };
  });
}

/**
 * Who on the staff is away today, with the kind, for the team's hours
 * (whoever edits the clock reads the records). Each until the last day of
 * the records that run on from today.
 */
export async function awayTodayRows(
  businessId: string,
  today: string,
  nameOf: (userId: string) => string | null,
  staff: (userId: string) => boolean,
): Promise<AwayTodayRow[]> {
  // A run of records can go on past today: those of the next two months
  // say how far, as Today's do.
  const rows = (
    await getAbsences(businessId, today, addDays(today, 62))
  ).filter((one) => staff(one.userId));
  const kindOn = new Map(
    rows
      .filter((one) => one.from <= today && today <= one.to)
      .map((one) => [one.userId, one.kind]),
  );
  return awayToday(rows, today).flatMap(({ userId, until }) => {
    const kind = kindOn.get(userId);
    return kind ? [{ userId, name: nameOf(userId), kind, until }] : [];
  });
}

/** The signed-in person's own days away that touch a month, for their hours. */
export async function ownAbsences(
  businessId: string,
  userId: string,
  month: string,
): Promise<Absence[]> {
  const span = monthSpan(month);
  return getAbsences(businessId, span.from, span.to, { userId });
}

/**
 * Who is away over some days, for whoever builds the schedule (and only
 * them: an empty list for anyone else, which the database also answers).
 */
export async function teamAwayFor(
  viewer: Viewer,
  businessId: string,
  from: string,
  to: string,
): Promise<AwaySpan[]> {
  if (!buildsSchedule(viewer)) return [];
  return getTeamAway(businessId, from, to);
}

/**
 * Who is away today, without the kind, for Today: for whoever builds the
 * schedule or edits the clock, while the clock is on; null for anyone else.
 * `links`: the rows lead to their hours, for whoever edits the clock.
 */
export const currentAwayToday = cache(
  async (): Promise<{
    rows: { userId: string; name: string | null; until: string }[];
    links: boolean;
  } | null> => {
    const [member, enabled] = await Promise.all([
      currentMember(),
      currentModules(),
    ]);
    const membership = member?.membership;
    if (
      !membership ||
      !canOpenModule(manifestFor("time_clock"), enabled, membership)
    ) {
      return null;
    }
    const edits = editsClock(membership);
    if (!edits && !buildsSchedule(membership)) return null;
    const businessId = membership.business.id;
    const today = clockAt(new Date(), membership.business.place.timeZone).date;
    // Two months ahead at most (the database's 62 days): a longer run says
    // its last day within them.
    const [spans, people] = await Promise.all([
      getTeamAway(businessId, today, addDays(today, 62)),
      getClockPeople(businessId),
    ]);
    const nameOf = (userId: string) =>
      people.find((person) => person.userId === userId)?.name ?? null;
    return {
      rows: awayToday(spans, today).map(({ userId, until }) => ({
        userId,
        name: nameOf(userId),
        until,
      })),
      links: edits,
    };
  },
);
