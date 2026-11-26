import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "@playwright/test";
import { costOf, databaseBytesOf, sizesOf } from "./cost";
import { localDatabase } from "./guard";
import { seedScaleBusiness } from "./seed";
import { SIZES, type Size, shape } from "./shape";

/**
 * `pnpm measure:seed`: makes the test business on the local stack and keeps
 * it, for the measuring run (docs/measure.md). No browser: Playwright only
 * runs this file, as it runs TypeScript with the repo's aliases. Sizes from
 * MEASURE_PEOPLE (30, 100, 300 or 600; 300 by default) and MEASURE_MONTHS (13).
 * Its counts, time, cost a month and the database's size before and after
 * go to measure/out/seed-<people>.json.
 */

function sizeOf(value: string | undefined): Size {
  const n = Number(value ?? 300);
  const size = SIZES.find((s) => s === n);
  if (!size)
    throw new Error(`MEASURE_PEOPLE is ${value}; it takes ${SIZES.join(", ")}`);
  return size;
}

test("the test business, made on the local stack", async () => {
  test.setTimeout(60 * 60_000);
  const people = sizeOf(process.env.MEASURE_PEOPLE);
  const months = Number(process.env.MEASURE_MONTHS ?? 13);
  const sql = localDatabase(process.env);
  try {
    // The database's size before the seed, and after it below (the plan's 1.5 and 2.5).
    const before = await databaseBytesOf(sql);
    const { s, report } = await sql.begin(async (tx) => {
      const [now] = await tx<{ now: Date }[]>`select now() as now`;
      if (!now) throw new Error("No time from the database");
      const s = shape({ people, depth: "history", months, anchor: now.now });
      const report = await seedScaleBusiness(tx, s, { analyze: true });
      return { s, report };
    });
    const sizes = await sizesOf(sql);
    const databaseBytes = { before, after: await databaseBytesOf(sql) };
    const cost = costOf(s, report, sizes, databaseBytes);
    const out = join(__dirname, "..", "out");
    mkdirSync(out, { recursive: true });
    writeFileSync(
      join(out, `seed-${people}.json`),
      `${JSON.stringify({ ...report, sizes, databaseBytes, cost }, null, 2)}\n`,
    );
    console.log(
      `Seeded ${people} people over ${months} months in ${(report.ms / 1000).toFixed(1)} s; about ${cost.databaseMbAMonth} MB a month in the database.`,
    );
  } finally {
    await sql.end();
  }
});
