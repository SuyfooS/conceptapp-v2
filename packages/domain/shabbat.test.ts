import {
  CandleLightingEvent,
  HavdalahEvent,
  HebrewCalendar,
  Location,
} from "@hebcal/core";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_SHABBAT_CITY,
  ISRAEL_TIME_ZONE,
  ISRAELI_CITIES,
  isDuringShabbat,
  SHABBAT_CITIES,
  type ShabbatCity,
  shabbatCityOf,
  shabbatFriday,
  shabbatPlace,
  shabbatPlaceOf,
  timeIn,
} from "./shabbat";
import { shabbatTimes } from "./shabbat-times";

type City = ShabbatCity;

// hebcal's names for our cities, to check them against its own list.
const HEBCAL_NAMES: Record<City, string> = {
  jerusalem: "Jerusalem",
  telAviv: "Tel Aviv",
  haifa: "Haifa",
  beerSheva: "Beer Sheva",
  ashdod: "Ashdod",
  petahTikva: "Petach Tikvah",
  tiberias: "Tiberias",
  eilat: "Eilat",
};

function local(city: City, date: string) {
  const times = shabbatTimes(ISRAELI_CITIES[city], date);
  return {
    friday: times.friday,
    candleLighting: timeIn(times.candleLighting, ISRAEL_TIME_ZONE),
    havdalah: timeIn(times.havdalah, ISRAEL_TIME_ZONE),
  };
}

describe("the Friday of a Shabbat", () => {
  it("is the coming Friday from Sunday to Friday", () => {
    expect(shabbatFriday("2026-10-25")).toBe("2026-10-30");
    expect(shabbatFriday("2026-10-28")).toBe("2026-10-30");
    expect(shabbatFriday("2026-10-30")).toBe("2026-10-30");
  });

  it("is the day before on Saturday", () => {
    expect(shabbatFriday("2026-10-31")).toBe("2026-10-30");
  });

  it("crosses months and years", () => {
    expect(shabbatFriday("2026-12-27")).toBe("2027-01-01");
    expect(shabbatFriday("2027-01-02")).toBe("2027-01-01");
  });

  it("refuses something that is not a date", () => {
    for (const bad of ["2026-13-01", "2026-02-30", "30.10.2026", ""]) {
      expect(() => shabbatFriday(bad)).toThrow();
    }
  });
});

describe("Shabbat times", () => {
  // Reference values: hebcal's Israeli calendar for each city, which uses
  // the same customs (40 minutes in Jerusalem, 30 in Haifa, 20 elsewhere).
  it.each([
    ["jerusalem", "2026-07-17", "19:05", "20:26"],
    ["jerusalem", "2026-12-18", "15:58", "17:18"],
    ["telAviv", "2026-07-17", "19:27", "20:28"],
    ["telAviv", "2026-12-18", "16:19", "17:19"],
    ["haifa", "2026-07-17", "19:18", "20:29"],
    ["haifa", "2026-12-18", "16:06", "17:17"],
  ] as const)(
    "%s on %s: candles %s, havdalah %s",
    (city, friday, candles, havdalah) => {
      expect(local(city, friday)).toEqual({
        friday,
        candleLighting: candles,
        havdalah,
      });
    },
  );

  it("follows the clocks on the Friday summer time starts", () => {
    // Israel moves to summer time early on Friday 27 March 2026.
    expect(local("telAviv", "2026-03-27")).toEqual({
      friday: "2026-03-27",
      candleLighting: "18:37",
      havdalah: "19:34",
    });
  });

  it("gives the same Shabbat for any day of its week", () => {
    const fromSunday = shabbatTimes(ISRAELI_CITIES.haifa, "2026-12-13");
    const fromSaturday = shabbatTimes(ISRAELI_CITIES.haifa, "2026-12-19");
    expect(fromSunday).toEqual(fromSaturday);
    expect(fromSunday.friday).toBe("2026-12-18");
  });

  it("lights candles the given minutes before sunset", () => {
    const jerusalem = ISRAELI_CITIES.jerusalem;
    const custom = shabbatTimes(jerusalem, "2026-07-17");
    const plain = shabbatTimes(
      { latitude: jerusalem.latitude, longitude: jerusalem.longitude },
      "2026-07-17",
    );
    expect(
      plain.candleLighting.getTime() - custom.candleLighting.getTime(),
    ).toBe(20 * 60_000);
    expect(plain.havdalah).toEqual(custom.havdalah);
  });

  it("agrees with hebcal's own Israeli calendar through a whole year", () => {
    const names = HEBCAL_NAMES;
    for (const city of SHABBAT_CITIES) {
      const events = HebrewCalendar.calendar({
        start: new Date(2026, 9, 25),
        end: new Date(2027, 9, 24),
        candlelighting: true,
        noHolidays: true,
        il: true,
        location: Location.lookup(names[city]),
      });
      let fridays = 0;
      for (const event of events) {
        const date = event.getDate().greg();
        const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
        if (event instanceof CandleLightingEvent && date.getDay() === 5) {
          const times = shabbatTimes(ISRAELI_CITIES[city], iso);
          expect(times.candleLighting, `${city} ${iso}`).toEqual(
            event.eventTime,
          );
          fridays += 1;
        }
        if (event instanceof HavdalahEvent && date.getDay() === 6) {
          const times = shabbatTimes(ISRAELI_CITIES[city], iso);
          expect(times.havdalah, `${city} ${iso}`).toEqual(event.eventTime);
        }
      }
      expect(fridays).toBeGreaterThanOrEqual(50);
    }
  });
});

describe("independent of the server's time zone", () => {
  const original = process.env.TZ;
  afterEach(() => {
    process.env.TZ = original;
  });

  it.each(["UTC", "America/Los_Angeles", "Pacific/Kiritimati"])(
    "in %s",
    (zone) => {
      process.env.TZ = zone;
      expect(local("jerusalem", "2026-12-18")).toEqual({
        friday: "2026-12-18",
        candleLighting: "15:58",
        havdalah: "17:18",
      });
    },
  );
});

describe("during Shabbat", () => {
  const times = shabbatTimes(ISRAELI_CITIES.telAviv, "2026-12-18");
  const minute = 60_000;

  it("starts at candle lighting and ends at havdalah", () => {
    const start = times.candleLighting.getTime();
    const end = times.havdalah.getTime();
    expect(isDuringShabbat(new Date(start - minute), times)).toBe(false);
    expect(isDuringShabbat(new Date(start), times)).toBe(true);
    expect(isDuringShabbat(new Date(end - minute), times)).toBe(true);
    expect(isDuringShabbat(new Date(end), times)).toBe(false);
  });

  it("lasts about a day", () => {
    const hours =
      (times.havdalah.getTime() - times.candleLighting.getTime()) /
      (60 * minute);
    expect(hours).toBeGreaterThan(24);
    expect(hours).toBeLessThan(26);
  });
});

describe("the cities", () => {
  it("are hebcal's Israeli cities, where hebcal puts them", () => {
    expect([...SHABBAT_CITIES].sort()).toEqual(
      Object.keys(ISRAELI_CITIES).sort(),
    );
    for (const city of SHABBAT_CITIES) {
      const location = Location.lookup(HEBCAL_NAMES[city]);
      expect(location?.getIsrael(), city).toBe(true);
      expect(ISRAELI_CITIES[city].latitude, city).toBe(location?.getLatitude());
      expect(ISRAELI_CITIES[city].longitude, city).toBe(
        location?.getLongitude(),
      );
    }
  });

  it("keep their keys in the form the database checks", () => {
    for (const city of SHABBAT_CITIES) {
      expect(city).toMatch(/^[a-z][A-Za-z]{1,39}$/);
    }
  });

  it("are read from what's stored, and nothing else", () => {
    expect(shabbatCityOf("jerusalem")).toBe("jerusalem");
    for (const value of [
      null,
      undefined,
      "",
      "Jerusalem",
      "toString",
      "constructor",
      5,
    ]) {
      expect(shabbatCityOf(value)).toBeNull();
    }
  });

  it("give a business its city's place and custom", () => {
    expect(
      shabbatPlaceOf({ shabbatCity: "jerusalem", timeZone: ISRAEL_TIME_ZONE }),
    ).toEqual({ ...ISRAELI_CITIES.jerusalem, timeZone: ISRAEL_TIME_ZONE });
    // Jerusalem lights candles 40 minutes before sunset.
    expect(local("jerusalem", "2026-12-18").candleLighting).toBe("15:58");
  });

  it("read as Tel Aviv until one is chosen, or for one no longer listed", () => {
    for (const shabbatCity of [null, "atlantis"]) {
      expect(
        shabbatPlaceOf({ shabbatCity, timeZone: ISRAEL_TIME_ZONE }),
      ).toEqual({
        ...ISRAELI_CITIES[DEFAULT_SHABBAT_CITY],
        timeZone: ISRAEL_TIME_ZONE,
      });
    }
  });
});

describe("places", () => {
  it("default to Israel's time zone and 20 minutes", () => {
    expect(shabbatPlace.parse({ latitude: 32, longitude: 35 })).toEqual({
      latitude: 32,
      longitude: 35,
      timeZone: ISRAEL_TIME_ZONE,
      candleLightingMinutes: 20,
    });
  });

  it("refuse impossible coordinates and minutes", () => {
    for (const place of [
      { latitude: 91, longitude: 35 },
      { latitude: 32, longitude: 181 },
      { latitude: 32, longitude: 35, candleLightingMinutes: -5 },
      { latitude: 32, longitude: 35, candleLightingMinutes: 18.5 },
    ]) {
      expect(shabbatPlace.safeParse(place).success).toBe(false);
    }
  });
});

describe("times of day", () => {
  it("print on the 24-hour clock in the zone asked for", () => {
    const instant = new Date("2026-12-18T14:19:00Z");
    expect(timeIn(instant, ISRAEL_TIME_ZONE)).toBe("16:19");
    expect(timeIn(instant, "UTC")).toBe("14:19");
    expect(timeIn(new Date("2026-07-17T21:05:00Z"), ISRAEL_TIME_ZONE)).toBe(
      "00:05",
    );
  });
});
