import { z } from "zod";
import {
  BUCKETS,
  type Buckets,
  NO_BUCKETS,
  type PayrollDay,
  type PayrollMonth,
  type PayrollPerson,
  type PayrollSettings,
  withoutAmounts,
} from "./payroll";
import { HOURS_LAW, REST_DAYS } from "./payroll-details";
import {
  type BusinessPlace,
  DEFAULT_SHABBAT_CITY,
  type ShabbatCity,
  shabbatCityOf,
} from "./shabbat";

/*
 * Closing a month (payroll P9, plan §12). A closed month keeps what the hours
 * engine gave when it closed (`closedSnapshot`), with the settings, the
 * business's place (its city's rest windows and holidays) and the people's
 * details it used, in `public.payroll_months`. Hours are facts: a shift of a
 * closed month can still be corrected, and the month is then worked out again
 * from its shifts as they are now, with what it closed with (`closedReads`),
 * so only the hours make a difference. What differs from the snapshot
 * (`monthDifferences`), per person, per day and per rate, goes into the next
 * month's file for payroll, as minutes, never an amount.
 */

/** The snapshot's own shape: bumped when it changes, so an old one is still read. */
export const SNAPSHOT_VERSION = 1;

/** What a closed month keeps: the engine's month without amounts, and what it was worked out by. */
export type ClosedSnapshot = {
  version: typeof SNAPSHOT_VERSION;
  /** The month by rate, as the engine gave it, every amount left out. */
  month: PayrollMonth;
  /** The business's pay rules it was worked out by. */
  settings: PayrollSettings;
  /** Where the business was: the city its rest windows and holidays came from, and its time zone. */
  place: { timeZone: string; shabbatCity: ShabbatCity };
  /** Each person's details, periods and wages it was worked out by. */
  people: PayrollPerson[];
};

/**
 * What a month keeps when it closes: the engine's month without its amounts
 * (amounts come from minutes and wages, both kept), the pay rules alone of
 * the module's settings, the business's place as the engine read it (a city
 * no list has is kept as Tel Aviv, as `shabbatPlaceOf` reads it), and the
 * people as the engine read them.
 */
export function closedSnapshot(
  month: PayrollMonth,
  settings: PayrollSettings,
  place: BusinessPlace,
  people: readonly PayrollPerson[],
): ClosedSnapshot {
  return {
    version: SNAPSHOT_VERSION,
    month: withoutAmounts(month),
    settings: {
      workWeek: settings.workWeek,
      shortDay: settings.shortDay,
      restStart: settings.restStart,
      restStartTime: settings.restStartTime,
      roundToMinutes: settings.roundToMinutes,
    },
    place: {
      timeZone: place.timeZone,
      shabbatCity: shabbatCityOf(place.shabbatCity) ?? DEFAULT_SHABBAT_CITY,
    },
    people: people.map((person) => ({
      userId: person.userId,
      payrollNumber: person.payrollNumber,
      restDay: person.restDay,
      hoursLaw: person.hoursLaw,
      youthUntil: person.youthUntil,
      compulsoryEducation: person.compulsoryEducation,
      periods: person.periods.map(({ startedOn, endedOn }) => ({
        startedOn,
        endedOn,
      })),
      wages: person.wages.map(({ agorot, from, setAt }) => ({
        agorot,
        from,
        setAt,
      })),
    })),
  };
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const minutes = z.int();
const buckets = z.object({
  regular: minutes,
  ot125: minutes,
  ot150: minutes,
  rest150: minutes,
  rest175: minutes,
  rest200: minutes,
}) satisfies z.ZodType<Buckets>;
const day = z.iso.date();
const snapshotSchema = z.object({
  version: z.literal(SNAPSHOT_VERSION),
  month: z.object({
    month: z.string().regex(MONTH),
    engineVersion: z.string().min(1),
    people: z.array(
      z.object({
        userId: z.string(),
        days: z.array(
          z.object({
            date: day,
            entryIds: z.array(z.string()),
            minutes,
            buckets,
          }),
        ),
      }),
    ),
  }),
  settings: z.object({
    workWeek: z.enum(["unset", "five", "six"]),
    shortDay: z.literal([0, 1, 2, 3, 4]),
    restStart: z.enum(["candleLighting", "fixed"]),
    restStartTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    roundToMinutes: z.literal([0, 5, 15]),
  }),
  // A snapshot written before the place was kept has none: it is worked out
  // again with the business's place now (`closedReads`). A city no longer
  // listed reads as Tel Aviv when the calendar is made (`shabbatPlaceOf`).
  place: z
    .object({ timeZone: z.string().min(1), shabbatCity: z.string().min(1) })
    .optional(),
  people: z.array(
    z.object({
      userId: z.string(),
      payrollNumber: z.string().nullable(),
      restDay: z.literal(REST_DAYS),
      hoursLaw: z.enum(HOURS_LAW),
      youthUntil: day.nullable(),
      compulsoryEducation: z.boolean(),
      periods: z.array(z.object({ startedOn: day, endedOn: day.nullable() })),
      wages: z.array(
        z.object({ agorot: z.int().min(1), from: day, setAt: z.string() }),
      ),
    }),
  ),
});

/** A closed month's snapshot as read back: what the differences need of it. */
export type ReadSnapshot = {
  version: typeof SNAPSHOT_VERSION;
  month: DiffMonth & { engineVersion: string };
  settings: PayrollSettings;
  /** None in a snapshot written before the place was kept. */
  place?: BusinessPlace | undefined;
  people: PayrollPerson[];
};

/**
 * A snapshot as `public.payroll_months` gives it back, read leniently: what
 * the differences and working the month out again need, or null when it
 * isn't one this app wrote.
 */
export function readSnapshot(value: unknown): ReadSnapshot | null {
  const parsed = snapshotSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * Whom a closed month is worked out for again: each person as it closed with
 * them (their details, periods and wages then), and anyone new to it, with
 * hours added since, as they are now.
 */
export function closedPeople(
  snapshot: Pick<ReadSnapshot, "people">,
  current: readonly PayrollPerson[],
): PayrollPerson[] {
  const kept = new Map(snapshot.people.map((one) => [one.userId, one]));
  return current.map((person) => kept.get(person.userId) ?? person);
}

/** What a closed month is worked out again with. */
export type ClosedReads = {
  place: BusinessPlace;
  settings: PayrollSettings;
  people: PayrollPerson[];
};

/**
 * What a closed month is worked out again with, so that only its hours make
 * a difference: the business's place, the pay rules and each person as it
 * closed with them, and anyone new to it as now (`closedPeople`). A snapshot
 * that kept no place takes the business's place now.
 */
export function closedReads(
  snapshot: Pick<ReadSnapshot, "place" | "settings" | "people">,
  current: { place: BusinessPlace; people: readonly PayrollPerson[] },
): ClosedReads {
  return {
    place: snapshot.place ?? current.place,
    settings: snapshot.settings,
    people: closedPeople(snapshot, current.people),
  };
}

/** A day as the differences read it. */
export type DiffDay = Pick<
  PayrollDay,
  "date" | "entryIds" | "minutes" | "buckets"
>;

/** A month as the differences read it: the closed one, or the same month now. */
export type DiffMonth = {
  month: string;
  people: readonly { userId: string; days: readonly DiffDay[] }[];
};

/** One day that changed since the month closed. */
export type DayDiff = {
  date: string;
  /** Its minutes when the month closed, and now. */
  before: number;
  now: number;
  /** Now less then, at each rate. */
  buckets: Buckets;
  /** The shifts behind it then and now, each once: what changed. */
  entryIds: string[];
};

/** One person's month since it closed: what changed, day by day. */
export type PersonDiff = {
  userId: string;
  /** Now less then, in all and at each rate. */
  minutes: number;
  buckets: Buckets;
  /** Only the days that changed, oldest first. */
  days: DayDiff[];
};

const ZERO: DiffDay = {
  date: "",
  entryIds: [],
  minutes: 0,
  buckets: NO_BUCKETS,
};

/**
 * What changed in a month since it closed, from what the engine gave then
 * (`closed`) and gives now (`now`, the same month worked out again): per
 * person, the days whose minutes changed in all or at any rate, each with its
 * minutes then and now, the difference at each rate and the shifts behind it.
 * Someone with no change is left out; so is a day of another month. Minutes
 * only: an amount is never worked out here.
 */
export function monthDifferences(
  closed: DiffMonth,
  now: DiffMonth,
): PersonDiff[] {
  const ownDays = (days: readonly DiffDay[]) =>
    new Map(
      days
        .filter((one) => one.date.startsWith(closed.month))
        .map((one) => [one.date, one]),
    );
  const before = new Map(
    closed.people.map((person) => [person.userId, ownDays(person.days)]),
  );
  const after = new Map(
    now.people.map((person) => [person.userId, ownDays(person.days)]),
  );
  const people = [
    ...new Set([
      ...closed.people.map((person) => person.userId),
      ...now.people.map((person) => person.userId),
    ]),
  ];

  return people.flatMap((userId) => {
    const then = before.get(userId) ?? new Map<string, DiffDay>();
    const today = after.get(userId) ?? new Map<string, DiffDay>();
    const dates = [...new Set([...then.keys(), ...today.keys()])].sort();
    const days = dates.flatMap((date): DayDiff[] => {
      const was = then.get(date) ?? ZERO;
      const is = today.get(date) ?? ZERO;
      const change = { ...NO_BUCKETS };
      for (const bucket of BUCKETS) {
        change[bucket] = is.buckets[bucket] - was.buckets[bucket];
      }
      const changed =
        is.minutes !== was.minutes ||
        BUCKETS.some((bucket) => change[bucket] !== 0);
      if (!changed) return [];
      return [
        {
          date,
          before: was.minutes,
          now: is.minutes,
          buckets: change,
          entryIds: [...new Set([...was.entryIds, ...is.entryIds])],
        },
      ];
    });
    if (days.length === 0) return [];
    const total = { ...NO_BUCKETS };
    for (const one of days) {
      for (const bucket of BUCKETS) total[bucket] += one.buckets[bucket];
    }
    return [
      {
        userId,
        minutes: days.reduce((sum, one) => sum + one.now - one.before, 0),
        buckets: total,
        days,
      },
    ];
  });
}

/** How many days changed in all, across everyone. */
export function changedDays(differences: readonly PersonDiff[]): number {
  return differences.reduce((sum, person) => sum + person.days.length, 0);
}
