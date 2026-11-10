import { MINIMUM_WAGES } from "@domain/minimum-wage";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

/**
 * The minimum wage the database keeps (public.minimum_wages, which
 * set_hourly_wage logs beside each wage) is the one the screens warn by
 * (@domain/minimum-wage): a new April is a row in both. pgTAP can't read
 * TypeScript, so this asks SQL. Needs the local database (`pnpm db:start`);
 * run with `pnpm test:db`.
 */

const sql = postgres(
  process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  { max: 1, onnotice: () => {} },
);

afterAll(() => sql.end());

type Row = {
  from: string;
  monthly: number;
  hourly: number;
  statute: number;
  under16: number;
  age16: number;
  age17: number;
  apprentice: number;
  published: boolean;
};

describe("the minimum wage", () => {
  it("is the same in the database as on the screens", async () => {
    const rows = await sql<Row[]>`
      select effective_from::text as "from", monthly_agorot as monthly,
        hourly_agorot as hourly, statute_hourly_agorot as statute,
        under16_hourly_agorot as under16, age16_hourly_agorot as age16,
        age17_hourly_agorot as age17, apprentice_hourly_agorot as apprentice,
        youth_published as published
      from public.minimum_wages
      order by effective_from`;
    expect(rows.map((row) => ({ ...row }))).toEqual(
      MINIMUM_WAGES.map((row) => ({
        from: row.from,
        monthly: row.monthlyAgorot,
        hourly: row.hourlyAgorot,
        statute: row.statuteHourlyAgorot,
        under16: row.youthHourlyAgorot.under16,
        age16: row.youthHourlyAgorot["16"],
        age17: row.youthHourlyAgorot["17"],
        apprentice: row.youthHourlyAgorot.apprentice,
        published: row.youthPublished,
      })),
    );
  });
});
