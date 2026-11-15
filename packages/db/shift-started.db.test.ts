import { shiftStarted } from "@domain/schedule";
import { ISRAEL_TIME_ZONE } from "@domain/shabbat";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

/**
 * When a shift begins is one moment in the database (the start of
 * `private.shift_span`, from which giving a shift away, taking it and
 * approving the swap are refused) and on the screens (`shiftStarted` in
 * @domain/schedule). pgTAP can't read TypeScript, so this asks SQL for the
 * start of each shift below, on ordinary days and on the clock changes of a
 * business in Israel and of one west of UTC, and checks that `shiftStarted`
 * turns true at that very moment and not a millisecond before. In one
 * transaction it rolls back. Needs the local database (`pnpm db:start`); run
 * with `pnpm test:db`.
 */

const sql = postgres(
  process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  { max: 1, onnotice: () => {} },
);

afterAll(() => sql.end());

class Rollback extends Error {}

type Tx = postgres.TransactionSql;

type Shift = [day: string, start: string, end: string];

// Ids and slugs of their own, apart from every other test's. No people.
const BUSINESSES: {
  id: string;
  week: string;
  slug: string;
  timezone: string;
  shifts: Shift[];
}[] = [
  {
    id: "8f000000-0000-4000-b000-0000000000f1",
    week: "8f000000-0000-4000-c000-0000000000f1",
    slug: "started-parity",
    timezone: ISRAEL_TIME_ZONE,
    shifts: [
      // Ordinary days, in winter (UTC+2) and in summer (UTC+3).
      ["2026-11-15", "09:00", "16:00"],
      ["2026-07-01", "09:00", "16:00"],
      // Past midnight: it begins on its own day.
      ["2026-11-14", "22:00", "06:00"],
      // Friday 27 March 2026: 02:00 becomes 03:00, so 02:00–02:59 never
      // happen.
      ["2026-03-27", "01:30", "08:00"],
      ["2026-03-27", "02:00", "08:00"],
      ["2026-03-27", "02:30", "08:00"],
      ["2026-03-27", "02:59", "08:00"],
      ["2026-03-27", "03:00", "08:00"],
      ["2026-03-27", "03:30", "08:00"],
      // Sunday 25 October 2026: 02:00 goes back to 01:00, so 01:00–01:59
      // happen twice.
      ["2026-10-25", "00:30", "08:00"],
      ["2026-10-25", "01:00", "08:00"],
      ["2026-10-25", "01:30", "08:00"],
      ["2026-10-25", "01:59", "08:00"],
      ["2026-10-25", "02:00", "08:00"],
      ["2026-10-25", "02:30", "08:00"],
    ],
  },
  {
    id: "8f000000-0000-4000-b000-0000000000f2",
    week: "8f000000-0000-4000-c000-0000000000f2",
    slug: "started-parity-west",
    timezone: "America/New_York",
    shifts: [
      // An ordinary day, in winter (UTC-5).
      ["2026-11-15", "09:00", "16:00"],
      // Sunday 8 March 2026: 02:00 becomes 03:00, so 02:00–02:59 never
      // happen.
      ["2026-03-08", "01:30", "08:00"],
      ["2026-03-08", "02:00", "08:00"],
      ["2026-03-08", "02:30", "08:00"],
      ["2026-03-08", "03:00", "08:00"],
      // Sunday 1 November 2026: 02:00 goes back to 01:00, so 01:00–01:59
      // happen twice.
      ["2026-11-01", "00:30", "08:00"],
      ["2026-11-01", "01:00", "08:00"],
      ["2026-11-01", "01:30", "08:00"],
      ["2026-11-01", "02:00", "08:00"],
    ],
  },
];

async function shifts(tx: Tx) {
  for (const business of BUSINESSES) {
    await tx`
      insert into public.businesses (id, slug, name, timezone)
      values (${business.id}, ${business.slug}, 'Started parity',
        ${business.timezone})`;
    await tx`
      insert into public.schedule_weeks (id, business_id, starts_on, availability_due_at)
      values (${business.week}, ${business.id}, '2026-11-08', '2026-11-04 16:00+00')`;
    for (const [day, start, end] of business.shifts) {
      await tx`
        insert into public.schedule_shifts
          (business_id, week_id, day, name, starts_at, ends_at, needed)
        values (${business.id}, ${business.week}, ${day}::date, 'Shift',
          ${start}::time, ${end}::time, 1)`;
    }
  }
}

/** Runs `check` against the shifts, then rolls everything back. */
async function withShifts(check: (tx: Tx) => Promise<void>) {
  await sql
    .begin(async (tx) => {
      await shifts(tx);
      await check(tx);
      throw new Rollback();
    })
    .catch((error: unknown) => {
      if (!(error instanceof Rollback)) throw error;
    });
}

describe("a shift begins, in the database as on the screens", () => {
  it("at the same moment, east and west of UTC", async () => {
    await withShifts(async (tx) => {
      const rows = await tx<
        { timezone: string; day: string; start: string; begins: Date }[]
      >`
        select b.timezone, s.day::text as day,
          to_char(s.starts_at, 'HH24:MI') as start,
          lower(private.shift_span(s.id)) as begins
        from public.schedule_shifts s
        join public.businesses b on b.id = s.business_id
        where s.business_id in ${tx(BUSINESSES.map((b) => b.id))}
        order by b.timezone, s.day, s.starts_at`;
      expect(rows).toHaveLength(
        BUSINESSES.reduce((sum, b) => sum + b.shifts.length, 0),
      );
      for (const { timezone, day, start, begins } of rows) {
        const shift = { day, start };
        const before = new Date(begins.getTime() - 1);
        const where = `${timezone} ${day} ${start}`;
        expect(
          shiftStarted(shift, begins, timezone),
          `${where} at ${begins.toISOString()}`,
        ).toBe(true);
        expect(
          shiftStarted(shift, before, timezone),
          `${where} just before ${begins.toISOString()}`,
        ).toBe(false);
      }
    });
  });
});
