import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type AvailabilityRange,
  addDays,
  availabilitySubmission,
  weekdayOf,
} from "@domain/availability";
import {
  fridayOf,
  parseAvailabilityForm,
  type ShabbatLimits,
  shabbatLimits,
  shiftHoursOf,
  suggestedDay,
} from "@domain/availability-form";
import { FILL_WEEK_HOURS, fillFromAvailability } from "@domain/fill-week";
import { minutesOf, rangeMinutes } from "@domain/hours";
import { draftWeek } from "@domain/schedule";
import {
  ISRAEL_TIME_ZONE,
  ISRAELI_CITIES,
  type ShabbatCity,
} from "@domain/shabbat";
import { shabbatTimes } from "@domain/shabbat-times";
import { type ShiftPattern, shiftPatterns } from "@domain/staffing";
import { describe, expect, it } from "vitest";

// Sample availability in the hosted demo (filling from availability, part 6;
// Orel's yes to the plan's question 3, 25 November 2026): the hosted
// restaurant's definition names next week's availability for its manager and
// two workers, and public.renew_demo_availability
// (20261128000100_demo_sample_availability.sql) sends it at the door, and on
// Today (renewDemoWeek in app/(app)/demo.ts), for whoever hasn't sent theirs,
// cut by Shabbat as the form's suggestion is. The local seed names none, so
// the browser tests send their own. This keeps the sample to those people,
// each day as the form suggests it from the
// restaurant's own shifts, and checks that the fill from availability puts
// each of them on several shifts of the restaurant's week, in winter and in
// summer. pgTAP's demo_availability.test.sql checks the function itself.
const root = join(__dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

type SampleRange = { weekday: number; start: string; end: string };
type Definition = {
  slug: string;
  template: string;
  shabbat_city: ShabbatCity;
  sampleAvailability?: { user_id: string; ranges: SampleRange[] }[];
  people: { user_id: string; role: string; name: string }[];
};

const definitions = (path: string): Definition[] =>
  [...read(path).matchAll(/\$json\$([\s\S]*?)\$json\$/g)].map(
    ([, json = "{}"]) => JSON.parse(json) as Definition,
  );

/** A template's shift pattern, as the newest migration that writes its row has it. */
function templateShifts(key: string): ShiftPattern[] {
  let found: unknown;
  const dir = "supabase/migrations";
  for (const file of readdirSync(join(root, dir)).sort()) {
    const rows = read(`${dir}/${file}`).matchAll(
      /\('([a-z][a-z0-9-]*)', \d+, \$json\$([\s\S]*?)\$json\$::jsonb\)/g,
    );
    for (const [, name, json = "{}"] of rows) {
      if (name !== key) continue;
      const definition = JSON.parse(json) as {
        modules: { scheduling?: { settings?: { shifts?: unknown } } };
      };
      found = definition.modules.scheduling?.settings?.shifts;
    }
  }
  return shiftPatterns.parse(found);
}

const ZONE = ISRAEL_TIME_ZONE;
// A week in December 2026 and one in June 2027, both from Sunday, the
// restaurant's first day (the scheduling manifest's default).
const WINTER = "2026-12-13";
const SUMMER = "2027-06-13";

const clockOf = (minutes: number) =>
  `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/**
 * The sample as private.demo_sample_ranges sends it for the week starting on
 * `weekStart`: each weekday on its date, Friday ending by candle lighting and
 * Saturday starting from havdalah while closed on Shabbat, a range left with
 * nothing left out.
 */
function sentFor(
  sample: readonly SampleRange[],
  weekStart: string,
  shabbat: ShabbatLimits | null,
): AvailabilityRange[] {
  return sample
    .flatMap(({ weekday, start, end }) => {
      const day = addDays(weekStart, (weekday - weekdayOf(weekStart) + 7) % 7);
      let from = minutesOf(start);
      let to = from + rangeMinutes(start, end);
      if (shabbat && day === shabbat.friday) {
        to = Math.min(to, minutesOf(shabbat.candleLighting));
      }
      if (shabbat && day === shabbat.saturday) {
        from = Math.max(from, minutesOf(shabbat.havdalah));
      }
      return from < to ? [{ day, start: clockOf(from), end: clockOf(to) }] : [];
    })
    .sort((a, b) => `${a.day}${a.start}`.localeCompare(`${b.day}${b.start}`));
}

const hosted = definitions("supabase/hosted-demo.sql");
const restaurant = hosted.find((d) => d.slug === "demo-restaurant");
const sample = restaurant?.sampleAvailability ?? [];

describe("the hosted demo's sample availability", () => {
  it("is the hosted restaurant's alone, and never the local seed's", () => {
    expect(hosted.map((d) => d.slug)).toEqual(["demo-restaurant", "demo-shop"]);
    expect(
      hosted.map((d) => [d.slug, d.sampleAvailability !== undefined]),
    ).toEqual([
      ["demo-restaurant", true],
      ["demo-shop", false],
    ]);
    // Locally the browser tests send their own (e2e/db.ts's
    // sendDemoAvailability), and a sample would change what they find.
    const local = definitions("supabase/seed.sql");
    expect(local.length).toBe(2);
    for (const definition of local) {
      expect(definition.sampleAvailability, definition.slug).toBeUndefined();
    }
    expect(read("supabase/seed.sql")).not.toContain("sampleAvailability");
  });

  it("names the restaurant's manager and its two workers, each once, never its owner", () => {
    const people = new Map(restaurant?.people.map((p) => [p.user_id, p.role]));
    const named = sample.map((s) => s.user_id);
    expect(new Set(named).size).toBe(named.length);
    expect(named.map((id) => people.get(id)).sort()).toEqual([
      "manager",
      "worker",
      "worker",
    ]);
    expect(
      [...people].filter(([, role]) => role === "manager" || role === "worker")
        .length,
    ).toBe(3);
  });

  it("is, on each day it names, the hours the form suggests from the restaurant's shifts", () => {
    expect(restaurant?.template).toBe("restaurant");
    const shifts = shiftHoursOf(templateShifts("restaurant"));
    const winter = shabbatLimits(
      shabbatTimes(
        ISRAELI_CITIES[restaurant?.shabbat_city ?? "telAviv"],
        fridayOf(WINTER),
      ),
      ZONE,
    );
    for (const { user_id, ranges } of sample) {
      expect(ranges.length, user_id).toBeGreaterThan(0);
      // At most one range a day, every day a day of the week.
      const days = ranges.map((r) => r.weekday);
      expect(new Set(days).size, user_id).toBe(days.length);
      for (const range of ranges) {
        expect(Number.isInteger(range.weekday), user_id).toBe(true);
        expect(range.weekday, user_id).toBeGreaterThanOrEqual(0);
        expect(range.weekday, user_id).toBeLessThanOrEqual(6);
        const date = addDays(WINTER, range.weekday);
        // In a winter week nothing of it reaches into Shabbat, so the sample
        // is the suggestion as it is.
        expect(
          [{ start: range.start, end: range.end }],
          `${user_id} ${date}`,
        ).toEqual(suggestedDay(date, winter, shifts));
      }
    }
  });

  it("is sent as an answer the form and the database take, closed on Shabbat or not", () => {
    for (const weekStart of [WINTER, SUMMER]) {
      const shabbat = shabbatLimits(
        shabbatTimes(ISRAELI_CITIES.telAviv, fridayOf(weekStart)),
        ZONE,
      );
      for (const closed of [shabbat, null]) {
        for (const { user_id, ranges } of sample) {
          const sent = sentFor(ranges, weekStart, closed);
          const label = `${user_id} ${weekStart} ${closed ? "closed" : "open"}`;
          expect(sent.length, label).toBeGreaterThan(0);
          expect(
            parseAvailabilityForm({ ranges: sent, note: "" }, weekStart, closed)
              .ok,
            label,
          ).toBe(true);
          expect(
            availabilitySubmission(weekStart).safeParse({ ranges: sent })
              .success,
            label,
          ).toBe(true);
        }
      }
    }
  });

  it("puts each of them on several of the restaurant's shifts, and nobody else", () => {
    const patterns = templateShifts("restaurant");
    const staff = (restaurant?.people ?? [])
      .filter((p) => p.role !== "accountant")
      .map((p) => p.user_id);
    const owner = restaurant?.people.find((p) => p.role === "owner")?.user_id;
    for (const weekStart of [WINTER, SUMMER]) {
      const shabbat = shabbatLimits(
        shabbatTimes(ISRAELI_CITIES.telAviv, fridayOf(weekStart)),
        ZONE,
      );
      const screen = draftWeek(weekStart, patterns);
      const fill = fillFromAvailability({
        weekStart,
        screen,
        staff,
        answers: sample.map(({ user_id, ranges }) => ({
          userId: user_id,
          ranges: sentFor(ranges, weekStart, shabbat),
        })),
        away: [],
        lastWeek: null,
        nextDays: [],
        weekHours: FILL_WEEK_HOURS,
        shabbat,
        positionKeys: ["waiter", "bartender", "cook", "host"],
        now: null,
        timeZone: ZONE,
      });
      expect(fill.openBefore, weekStart).toBe(44);
      expect(fill.people, weekStart).toBe(3);
      expect(fill.answered, weekStart).toBe(3);
      expect(fill.unplaced, weekStart).toEqual([]);
      for (const { user_id } of sample) {
        const person = fill.byPerson.find((p) => p.user === user_id);
        expect(
          person?.added ?? 0,
          `${weekStart} ${user_id}`,
        ).toBeGreaterThanOrEqual(4);
      }
      expect(
        fill.week.some((s) => s.assignees.some((a) => a.user === owner)),
      ).toBe(false);
      // Every day of the week has someone from the fill, but Saturday night
      // in summer: havdalah comes after its 19:30, so it stays open for
      // Shabbat, as the sheet says.
      const saturday = fill.shifts.find(
        (s) => screen[s.index]?.pattern === "saturday-night",
      );
      if (shabbat.havdalah > "19:30") {
        expect(saturday?.added, weekStart).toEqual([]);
        expect(saturday?.why, weekStart).toBe("shabbat");
      } else {
        expect(saturday?.added.length, weekStart).toBe(2);
      }
      for (let n = 0; n < 6; n++) {
        const date = addDays(weekStart, n);
        expect(
          fill.shifts.some(
            (s) => screen[s.index]?.day === date && s.added.length > 0,
          ),
          `${weekStart} ${date}`,
        ).toBe(true);
      }
    }
  });
});
