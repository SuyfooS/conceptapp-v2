import { describe, expect, it } from "vitest";
import {
  cityName,
  cityNamed,
  cityOf,
  normalizeCityQuery,
  searchCities,
} from "./cities";
import { CITIES, CITIES_AS_OF } from "./cities-data";

const codes = (query: string, limit?: number) =>
  searchCities(query, limit).map((city) => city.code);

describe("the list of settlements", () => {
  it("holds about 1,300, each code once, each with a Hebrew name", () => {
    expect(CITIES.length).toBeGreaterThan(1200);
    expect(CITIES.length).toBeLessThan(1500);
    const all = CITIES.map(([code]) => code);
    expect(new Set(all).size).toBe(all.length);
    for (const [code, he] of CITIES) {
      // cityCodeSchema: 1 to 9999.
      expect(
        Number.isInteger(code) && code >= 1 && code <= 9999,
        `${code}`,
      ).toBe(true);
      expect(he.trim(), `${code}`).not.toBe("");
      expect(he, `${code}`).toBe(he.trim());
    }
  });

  it("is dated", () => {
    expect(CITIES_AS_OF).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("cityOf and cityName", () => {
  it("finds a settlement by its code", () => {
    expect(cityOf(4000)).toEqual({ code: 4000, he: "חיפה", en: "Haifa" });
    expect(cityOf(1)).toBeNull();
    expect(cityOf(null)).toBeNull();
  });

  it("names it in English, or in Hebrew where the list has no English", () => {
    const haifa = cityOf(4000);
    expect(haifa && cityName(haifa, "en")).toBe("Haifa");
    expect(haifa && cityName(haifa, "he")).toBe("חיפה");
    const noEnglish = CITIES.find(([, , en]) => en === "");
    expect(noEnglish).toBeDefined();
    const city = cityOf(noEnglish?.[0]);
    expect(city && cityName(city, "en")).toBe(noEnglish?.[1]);
  });
});

describe("normalizeCityQuery", () => {
  it("lets spellings of the same Hebrew name meet", () => {
    const he = (text: string) => normalizeCityQuery(text, "he");
    expect(he("קריית ביאליק")).toBe(he("קרית ביאליק"));
    expect(he("גבעתיים")).toBe(he("גבעתים"));
    expect(he("כפר-סבא")).toBe(he("כפר סבא"));
    expect(he("ג'סר")).toBe(he("גסר"));
    expect(he("רמת גן")).toBe(he("רמתגנ"));
  });

  it("lets spellings of the same English name meet", () => {
    const en = (text: string) => normalizeCityQuery(text, "en");
    expect(en("Kiryat Ata")).toBe(en("QIRYAT ATTA"));
    expect(en("tel-aviv")).toBe(en("Tel Aviv"));
    // A doubled letter across the list's apostrophe is one letter too.
    expect(en("Raanana")).toBe(en("Ra'anana"));
    expect(en("Beer Sheva")).toBe(en("Be'er Sheva"));
  });
});

describe("searchCities", () => {
  it("finds a town by its Hebrew name, spelled either way", () => {
    expect(codes("קריית ביאליק")[0]).toBe(9500);
    expect(codes("קרית ביאליק")[0]).toBe(9500);
    expect(codes("חיפה")[0]).toBe(4000);
    expect(codes("תל אביב")[0]).toBe(5000);
  });

  it("finds a town by its English name, spelled either way", () => {
    expect(codes("kiryat ata")[0]).toBe(6800);
    expect(codes("tel aviv")[0]).toBe(5000);
    expect(codes("Haifa")[0]).toBe(4000);
  });

  it("finds an English name the list writes with an apostrophe, typed without it", () => {
    // "Ra'anana", "Be'er Sheva", "Ma'ale Adummim", "Be'er Ya'aqov".
    expect(codes("Raanana")[0]).toBe(8700);
    expect(codes("Raan")).toContain(8700);
    expect(codes("Beer Sheva")[0]).toBe(9000);
    expect(codes("Maale Adumim")[0]).toBe(3616);
    expect(codes("beer yaakov")[0]).toBe(2530);
    // And with it, as before.
    expect(codes("Ra'anana")[0]).toBe(8700);
    expect(cityNamed("Raanana")?.code).toBe(8700);
    expect(cityNamed("beer sheva")?.code).toBe(9000);
  });

  it("puts names that start with the query before names that only hold it", () => {
    const found = searchCities("יפו", 20);
    expect(found.length).toBeGreaterThan(0);
    // "תל אביב - יפו" holds it as a word, after any name that starts with it.
    const telAviv = found.findIndex((city) => city.code === 5000);
    expect(telAviv).toBeGreaterThanOrEqual(0);
    for (const city of found.slice(0, telAviv)) {
      expect(normalizeCityQuery(city.he, "he").startsWith("יפו")).toBe(true);
    }
  });

  it("finds nothing for nothing, or for what no name holds", () => {
    expect(codes("")).toEqual([]);
    expect(codes("  - ")).toEqual([]);
    expect(codes("זזזזקקק")).toEqual([]);
    expect(codes("xqzwv")).toEqual([]);
  });

  it("gives at most as many as asked", () => {
    expect(codes("כפר").length).toBe(8);
    expect(codes("כפר", 3)).toHaveLength(3);
  });
});

describe("cityNamed", () => {
  const code = (query: string) => cityNamed(query)?.code ?? null;

  it("finds the town a name is, spelled either way, in either language", () => {
    expect(code("חיפה")).toBe(4000);
    expect(code("haifa")).toBe(4000);
    expect(code("קריית אתא")).toBe(6800);
    expect(code("kiryat ata")).toBe(6800);
    // Another town holds its name ("חצור-אשדוד"), and it is still this one.
    expect(searchCities("אשדוד").length).toBeGreaterThan(1);
    expect(code("אשדוד")).toBe(70);
  });

  it("finds the only town a beginning meets", () => {
    expect(searchCities("תל אביב")).toHaveLength(1);
    expect(code("תל אביב")).toBe(5000);
    expect(code("tel aviv")).toBe(5000);
  });

  it("finds none for several, or for nothing", () => {
    expect(searchCities("מודיעין").length).toBeGreaterThan(1);
    expect(code("מודיעין")).toBeNull();
    expect(code("רמת")).toBeNull();
    expect(code("")).toBeNull();
    expect(code("זזזזקקק")).toBeNull();
  });
});
