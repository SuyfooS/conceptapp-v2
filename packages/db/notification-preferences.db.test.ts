import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  DEFAULT_QUIET_HOURS,
  NOTIFICATION_GROUPS,
  NOTIFICATION_KIND_KEYS,
  notificationGroupOf,
  type QuietHours,
  quietEnd,
} from "@domain/notifications";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

/**
 * Each person's choices for their phone (notifications part 3) are read the
 * same in the database as in the app: the group of every kind of line
 * (private.notification_group, which decides what a group switched off keeps
 * off the phone, against @domain/notifications), the groups themselves, the
 * defaults, and when quiet hours end (private.quiet_end against quietEnd),
 * across midnight and Israel's clock changes. pgTAP can't read TypeScript, so
 * this asks SQL. Needs the local database (`pnpm db:start`); run with
 * `pnpm test:db`.
 */

const sql = postgres(
  process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  { max: 1, onnotice: () => {} },
);

afterAll(() => sql.end());

const ZONE = "Asia/Jerusalem";

describe("the groups of notifications", () => {
  it("hold the same kinds in the database as in the app", async () => {
    const rows = await sql<{ kind_key: string; group_key: string | null }[]>`
      select g.kind_key, g.group_key
      from private.notification_kind_groups() g
      order by g.kind_key`;
    expect(
      Object.fromEntries(rows.map((row) => [row.kind_key, row.group_key])),
    ).toEqual(
      Object.fromEntries(
        NOTIFICATION_KIND_KEYS.map((kind) => [kind, notificationGroupOf(kind)]),
      ),
    );
  });

  it("put every kind in the same group, and one the app doesn't know in none", async () => {
    for (const kind of [...NOTIFICATION_KIND_KEYS, "weather.rain", "chat"]) {
      const [row] = await sql<{ group_key: string | null }[]>`
        select private.notification_group(${kind}::text) as group_key`;
      expect(row?.group_key ?? null, kind).toBe(notificationGroupOf(kind));
    }
  });

  it("are the same groups, in the same order", async () => {
    const [row] = await sql<{ groups: unknown }[]>`
      select to_jsonb(private.notification_groups()) as groups`;
    expect(row?.groups).toEqual([...NOTIFICATION_GROUPS]);
  });

  it("start from the same choices", async () => {
    const [hours] = await sql<{ starts: string; stops: string }[]>`
      select d.starts::text as starts, d.stops::text as stops
      from private.default_quiet_hours() d`;
    expect({
      from: hours?.starts.slice(0, 5),
      to: hours?.stops.slice(0, 5),
    }).toEqual(DEFAULT_QUIET_HOURS);
    const columns = await sql<
      { column_name: string; column_default: string }[]
    >`
      select c.column_name, c.column_default
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = 'notification_preferences'
        and c.column_name in ('previews', 'time_zone', 'push_off')`;
    const defaults = Object.fromEntries(
      columns.map((column) => [column.column_name, column.column_default]),
    );
    expect(defaults.previews).toBe(
      String(DEFAULT_NOTIFICATION_PREFERENCES.previews),
    );
    expect(defaults.time_zone).toContain(
      `'${DEFAULT_NOTIFICATION_PREFERENCES.timeZone}'`,
    );
    expect(defaults.push_off).toContain("'{}'");
  });
});

describe("quiet hours", () => {
  // Ends away from 01:00 to 03:00, where Israel's clock changes: a time that
  // happens twice or not at all is no end anyone sets.
  const windows: QuietHours[] = [
    { from: "22:00", to: "07:00" },
    { from: "13:00", to: "15:00" },
    { from: "00:00", to: "06:00" },
    { from: "23:30", to: "00:30" },
    { from: "06:00", to: "22:00" },
  ];
  // Days around the clock going back (25 October 2026) and forward (26 March
  // 2027), and a plain week in between, every 37 minutes.
  const ranges = [
    ["2026-10-23T00:00:00Z", "2026-10-27T00:00:00Z"],
    ["2026-11-19T00:00:00Z", "2026-11-21T00:00:00Z"],
    ["2027-03-24T00:00:00Z", "2027-03-28T00:00:00Z"],
  ] as const;

  it("end at the same moment in the database as in the app", async () => {
    let compared = 0;
    for (const quiet of windows) {
      for (const [first, last] of ranges) {
        const rows = await sql<{ at_time: Date; ends: Date | null }[]>`
          select a.at_time,
            private.quiet_end(${quiet.from}::time, ${quiet.to}::time, ${ZONE}::text, a.at_time) as ends
          from generate_series(${first}::timestamptz, ${last}::timestamptz,
            interval '37 minutes') as a (at_time)`;
        for (const row of rows) {
          const expected = quietEnd(quiet, ZONE, row.at_time);
          expect(
            row.ends?.toISOString() ?? null,
            `${quiet.from}-${quiet.to} at ${row.at_time.toISOString()}`,
          ).toBe(expected?.toISOString() ?? null);
          compared += 1;
        }
      }
    }
    expect(compared).toBeGreaterThan(1500);
  });

  it("are none at all without an end, or with no length", async () => {
    const [row] = await sql<{ none: Date | null; same: Date | null }[]>`
      select
        private.quiet_end(null::time, null::time, ${ZONE}::text, now()) as none,
        private.quiet_end('07:00'::time, '07:00'::time, ${ZONE}::text, now()) as same`;
    expect(row).toEqual({ none: null, same: null });
  });
});
