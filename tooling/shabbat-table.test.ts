import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { addDays, dateIn } from "@domain/availability";
import {
  ISRAEL_TIME_ZONE,
  ISRAELI_CITIES,
  SHABBAT_CITIES,
  type ShabbatCity,
  timeIn,
} from "@domain/shabbat";
import { shabbatTimes } from "@domain/shabbat-times";
import { describe, expect, it } from "vitest";

// Lists L4: the database opens scheduled lists by itself and has no hebcal,
// so it reads Shabbat from private.shabbat_times, a row a Friday for each
// city of ISRAELI_CITIES, written into the migration below. This keeps every
// row equal to what @domain/shabbat-times says (candle lighting and havdalah,
// to the minute, in Israel's time), every Friday of every city there, and
// says a year ahead when the rows are about to run out. Run it with
// SHABBAT_TABLE=print (and SHABBAT_TABLE_FILE=<path> to write them to a
// file) to print the rows of a longer table.
const MIGRATION = "supabase/migrations/20261110001300_list_schedules.sql";
const FIRST_FRIDAY = "2026-11-06";
const LAST_FRIDAY = "2031-12-26";

const root = join(__dirname, "..");
const printing = process.env.SHABBAT_TABLE === "print";

/** "2026-11-06 16:24+02": the minute in Israel, with its offset then. */
function local(instant: Date): string {
  const wall = Date.parse(
    `${dateIn(instant, ISRAEL_TIME_ZONE)}T${timeIn(instant, ISRAEL_TIME_ZONE)}:00Z`,
  );
  const offset = Math.round((wall - instant.getTime()) / 3_600_000);
  const sign = offset < 0 ? "-" : "+";
  return `${dateIn(instant, ISRAEL_TIME_ZONE)} ${timeIn(instant, ISRAEL_TIME_ZONE)}${sign}${String(Math.abs(offset)).padStart(2, "0")}`;
}

function row(city: ShabbatCity, friday: string): string {
  const times = shabbatTimes(
    { ...ISRAELI_CITIES[city], timeZone: ISRAEL_TIME_ZONE },
    friday,
  );
  return `('${city}', '${times.friday}', '${local(times.candleLighting)}', '${local(times.havdalah)}')`;
}

function fridays(from: string, to: string): string[] {
  const out: string[] = [];
  for (let day = from; day <= to; day = addDays(day, 7)) out.push(day);
  return out;
}

it.runIf(printing)("prints the rows of private.shabbat_times", () => {
  const rows = fridays(
    FIRST_FRIDAY,
    process.env.SHABBAT_TABLE_TO ?? LAST_FRIDAY,
  )
    .flatMap((friday) => SHABBAT_CITIES.map((city) => `  ${row(city, friday)}`))
    .join(",\n");
  const file = process.env.SHABBAT_TABLE_FILE;
  if (file) writeFileSync(file, `${rows};\n`);
  else console.log(rows);
});

/** The migration's rows, read when a test asks (printing needs none). */
function tableRows() {
  const sql = readFileSync(join(root, MIGRATION), "utf8");
  return [
    ...sql.matchAll(
      /\('([a-zA-Z]+)', '(\d{4}-\d{2}-\d{2})', '([^']+)', '([^']+)'\)/g,
    ),
  ].map(([text, city = "", friday = ""]) => ({ text, city, friday }));
}

describe.skipIf(printing)("private.shabbat_times", () => {
  it("has every city's every Friday, once", () => {
    const expected = fridays(FIRST_FRIDAY, LAST_FRIDAY).flatMap((friday) =>
      SHABBAT_CITIES.map((city) => `${city} ${friday}`),
    );
    expect(
      tableRows()
        .map((r) => `${r.city} ${r.friday}`)
        .sort(),
    ).toEqual(expected.sort());
  });

  it("says what @domain/shabbat-times says, to the minute", () => {
    const wrong = tableRows().filter(
      (r) => r.text !== row(r.city as ShabbatCity, r.friday),
    );
    expect(wrong.map((r) => r.text)).toEqual([]);
  });

  it("reaches more than a year ahead", () => {
    const today = dateIn(new Date(), ISRAEL_TIME_ZONE);
    expect(
      LAST_FRIDAY >= addDays(today, 365),
      `extend private.shabbat_times past ${addDays(today, 365)} (SHABBAT_TABLE=print)`,
    ).toBe(true);
  });
});
