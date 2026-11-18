import { availabilityDueAt, nextWeekStart } from "@domain/availability";
import { readModuleSettings } from "@domain/modules";
import { REMINDER_RULES } from "@domain/notifications";
import { manifest as scheduling } from "@modules/scheduling/manifest";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { manifest } from "./manifest";

/**
 * The reminders (notifications part 4) read the same in the database as in
 * the app: the settings they read, as readModuleSettings reads them when a
 * business stored nothing, a value offered or one that isn't; the week people
 * answer for and when its availability is due (private.week_start_after and
 * private.availability_due_moment against @domain/availability), across
 * Israel's clock changes; and their own times (private.reminder_rules against
 * REMINDER_RULES). pgTAP can't read TypeScript, so this asks SQL. Needs the
 * local database (`pnpm db:start`); run with `pnpm test:db`.
 */

const sql = postgres(
  process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  { max: 1, onnotice: () => {} },
);

afterAll(() => sql.end());

class Rollback extends Error {}

const ZONE = "Asia/Jerusalem";

/**
 * What a business may have stored, as JSON text, so the database reads each
 * as it is (24.0 stays a number, "24" text): nothing, every value offered,
 * and values not offered, beside a field the manifest doesn't know and a
 * broken hidden one, which leave the reminders alone. Each goes to SQL as
 * text (`::text::jsonb`): a parameter typed jsonb, postgres.js would send as
 * a JSON string.
 */
const STORED = [
  "null",
  "[]",
  '"24"',
  "{}",
  ...[0, 3, 12, 24, 48].map(
    (hours) => `{"availabilityReminderHours": ${hours}}`,
  ),
  ...[0, 30, 60, 120].map(
    (minutes) => `{"clockOutReminderMinutes": ${minutes}}`,
  ),
  '{"availabilityReminderHours": 5, "clockOutReminderMinutes": 45}',
  '{"availabilityReminderHours": "24", "clockOutReminderMinutes": "30"}',
  '{"availabilityReminderHours": 24.0, "clockOutReminderMinutes": 120.0}',
  '{"availabilityReminderHours": 24.5, "clockOutReminderMinutes": -30}',
  '{"availabilityReminderHours": null, "clockOutReminderMinutes": true}',
  '{"availabilityReminderHours": [3], "clockOutReminderMinutes": {"m": 30}}',
  '{"availabilityReminderHours": 3, "clockOutReminderMinutes": 30, "shiftReminderHours": 99}',
  '{"availabilityReminderHours": 48, "clockOutReminderMinutes": 0, "unknown": 1}',
];

describe("the reminder settings", () => {
  it("read in the database as readModuleSettings reads them", async () => {
    for (const stored of STORED) {
      const [row] = await sql<
        { availability_hours: number; clock_out_minutes: number }[]
      >`
        select s.availability_hours, s.clock_out_minutes
        from private.reminder_settings(${stored}::text::jsonb) s`;
      const settings = readModuleSettings(manifest, JSON.parse(stored));
      expect(
        {
          availabilityReminderHours: row?.availability_hours,
          clockOutReminderMinutes: row?.clock_out_minutes,
        },
        stored,
      ).toEqual({
        availabilityReminderHours: settings.availabilityReminderHours,
        clockOutReminderMinutes: settings.clockOutReminderMinutes,
      });
    }
  });

  it("are a business's own, and the defaults for one that stored none", async () => {
    await sql
      .begin(async (tx) => {
        const [business] = await tx<{ id: string }[]>`
          insert into public.businesses (slug, name)
          values ('reminder-settings-check', 'Reminder settings check')
          returning id`;
        const id = business?.id ?? "";
        const read = async () => {
          const [row] = await tx<
            { availability_hours: number; clock_out_minutes: number }[]
          >`
            select s.availability_hours, s.clock_out_minutes
            from private.business_reminder_settings(${id}) s`;
          return row;
        };
        expect(await read()).toEqual({
          availability_hours: manifest.settings.parse({})
            .availabilityReminderHours,
          clock_out_minutes: manifest.settings.parse({})
            .clockOutReminderMinutes,
        });
        await tx`
          insert into public.business_modules (business_id, module_key, enabled, settings)
          values (${id}, 'notifications', true,
            '{"availabilityReminderHours": 3, "clockOutReminderMinutes": 7}')`;
        expect(await read()).toEqual({
          availability_hours: 3,
          clock_out_minutes: manifest.settings.parse({})
            .clockOutReminderMinutes,
        });
        throw new Rollback();
      })
      .catch((error: unknown) => {
        if (!(error instanceof Rollback)) throw error;
      });
  });
});

/** Scheduling settings the due moment reads, as JSON text. */
const SCHEDULING = [
  "{}",
  "null",
  '{"weekStartsOn": 1, "availabilityDueDay": 0, "availabilityDueTime": "09:30"}',
  '{"weekStartsOn": 1.0, "availabilityDueDay": 6.0, "availabilityDueTime": "23:59"}',
  '{"weekStartsOn": 2, "availabilityDueDay": 7, "availabilityDueTime": "24:00"}',
  '{"weekStartsOn": "1", "availabilityDueDay": "3", "availabilityDueTime": "9:30"}',
  '{"weekStartsOn": 0, "availabilityDueDay": 2.5, "availabilityDueTime": 1800}',
  '{"availabilityDueDay": -1, "availabilityDueTime": "18:00 "}',
  '{"availabilityDueTime": "00:00", "positions": "not a list"}',
];

describe("the scheduling settings the due moment reads", () => {
  it("read in the database as readModuleSettings reads them", async () => {
    for (const stored of SCHEDULING) {
      const [row] = await sql<
        { first_day: number; due_day: number; due_time: string }[]
      >`
        select r.first_day, r.due_day, r.due_time::text as due_time
        from private.schedule_rules(${stored}::text::jsonb) r`;
      const settings = readModuleSettings(scheduling, JSON.parse(stored));
      expect(
        {
          weekStartsOn: row?.first_day,
          availabilityDueDay: row?.due_day,
          availabilityDueTime: row?.due_time.slice(0, 5),
        },
        stored,
      ).toEqual({
        weekStartsOn: settings.weekStartsOn,
        availabilityDueDay: settings.availabilityDueDay,
        availabilityDueTime: settings.availabilityDueTime,
      });
    }
  });
});

describe("when availability is due", () => {
  // Weeks around the clock going back (25 October 2026) and forward (26
  // March 2027), and a plain one, starting on Sunday and on Monday.
  const weeks = [
    "2026-10-18",
    "2026-10-25",
    "2026-10-26",
    "2026-11-01",
    "2026-11-29",
    "2027-03-21",
    "2027-03-28",
    "2027-03-29",
    "2027-04-04",
  ];
  // Times of day the due moment may have, those the clock skips (02:30 on 26
  // March 2027) and repeats (01:30 on 25 October 2026) among them.
  const times = ["00:00", "01:30", "02:30", "08:00", "18:00", "23:59"];

  it("is the same moment in the database as in the app", async () => {
    let compared = 0;
    for (const week of weeks) {
      for (let day = 0; day < 7; day += 1) {
        const rows = await sql<{ due_time: string; due: Date }[]>`
          select t.due_time,
            private.availability_due_moment(${week}::text::date, ${day}::integer,
              t.due_time::time, ${ZONE}::text) as due
          from unnest(${times}::text[]) as t (due_time)`;
        for (const row of rows) {
          const expected = availabilityDueAt(
            week,
            { day, time: row.due_time },
            ZONE,
          );
          expect(
            row.due.toISOString(),
            `${week}, day ${day}, ${row.due_time}`,
          ).toBe(expected.toISOString());
          compared += 1;
        }
      }
    }
    expect(compared).toBe(weeks.length * 7 * times.length);
  });

  it("is for the same next week in the database as in the app", async () => {
    let compared = 0;
    for (const first of [0, 1] as const) {
      const rows = await sql<{ at_time: Date; starts: string }[]>`
        select a.at_time,
          private.week_start_after(a.at_time, ${ZONE}::text, ${first}::integer)::text as starts
        from generate_series('2026-10-22T00:00:00Z'::timestamptz,
          '2026-10-28T00:00:00Z'::timestamptz, interval '47 minutes') as a (at_time)
        union all
        select a.at_time,
          private.week_start_after(a.at_time, ${ZONE}::text, ${first}::integer)::text
        from generate_series('2027-03-24T00:00:00Z'::timestamptz,
          '2027-03-30T00:00:00Z'::timestamptz, interval '47 minutes') as a (at_time)`;
      for (const row of rows) {
        expect(row.starts, `${row.at_time.toISOString()}, ${first}`).toBe(
          nextWeekStart(row.at_time, ZONE, first),
        );
        compared += 1;
      }
    }
    expect(compared).toBeGreaterThan(700);
  });

  it("follows the business's own settings and clock", async () => {
    await sql
      .begin(async (tx) => {
        const [business] = await tx<{ id: string }[]>`
          insert into public.businesses (slug, name, timezone)
          values ('reminder-due-check', 'Reminder due check', 'Europe/London')
          returning id`;
        const id = business?.id ?? "";
        const week = "2026-11-30";
        const dueAt = async () => {
          const [row] = await tx<{ due: Date }[]>`
            select private.availability_due_at(${id}, ${week}::text::date) as due`;
          return row?.due.toISOString();
        };
        // Nothing stored: Wednesday at 18:00, on London's clock.
        expect(await dueAt()).toBe(
          availabilityDueAt(
            week,
            { day: 3, time: "18:00" },
            "Europe/London",
          ).toISOString(),
        );
        await tx`
          insert into public.business_modules (business_id, module_key, enabled, settings)
          values (${id}, 'scheduling', true,
            '{"weekStartsOn": 1, "availabilityDueDay": 9, "availabilityDueTime": "07:15"}')`;
        // A due day the manifest doesn't offer reads as Wednesday.
        expect(await dueAt()).toBe(
          availabilityDueAt(
            week,
            { day: 3, time: "07:15" },
            "Europe/London",
          ).toISOString(),
        );
        throw new Rollback();
      })
      .catch((error: unknown) => {
        if (!(error instanceof Rollback)) throw error;
      });
  });
});

describe("the reminders' own times", () => {
  it("are the same in the database as in the app", async () => {
    const [row] = await sql<
      {
        missing_for: number;
        open_without_shift: number;
        open_for: number;
        earliest: string;
      }[]
    >`
      select extract(epoch from r.missing_for)::integer / 3600 as missing_for,
        extract(epoch from r.open_without_shift)::integer / 3600 as open_without_shift,
        extract(epoch from r.open_for)::integer / 3600 as open_for,
        to_char(r.earliest, 'HH24:MI') as earliest
      from private.reminder_rules() r`;
    expect({ ...row }).toEqual({
      missing_for: REMINDER_RULES.missingForHours,
      open_without_shift: REMINDER_RULES.openWithoutShiftHours,
      open_for: REMINDER_RULES.openForHours,
      earliest: REMINDER_RULES.earliestAt,
    });
  });
});
