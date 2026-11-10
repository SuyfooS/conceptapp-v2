import { describe, expect, it } from "vitest";
import {
  AGE_BANDS,
  hourlyFor,
  MINIMUM_WAGES,
  type MinimumWageRow,
  minimumWageOn,
  minimumWageRowOn,
  minimumWageTableFrom,
  minimumWageTableStale,
} from "./minimum-wage";

describe("minimumWageOn", () => {
  it("takes the row in effect on the day", () => {
    expect(minimumWageOn("2026-03-31", "adult")).toEqual({
      agorot: 3432,
      from: "2025-04-01",
    });
    expect(minimumWageOn("2026-04-01", "adult")).toEqual({
      agorot: 3540,
      from: "2026-04-01",
    });
    expect(minimumWageOn("2026-10-13", "17")).toEqual({
      agorot: 3092,
      from: "2026-04-01",
    });
    expect(minimumWageOn("2026-10-13", "16")?.agorot).toBe(2794);
    expect(minimumWageOn("2026-10-13", "under16")?.agorot).toBe(2607);
  });

  it("has nothing before the first row", () => {
    expect(minimumWageOn("2025-03-31", "adult")).toBeNull();
    expect(minimumWageRowOn("2025-03-31")).toBeNull();
  });
});

describe("minimumWageTableStale", () => {
  it("says so from the April after the last row", () => {
    expect(minimumWageTableStale("2026-11")).toBe(false);
    expect(minimumWageTableStale("2027-03")).toBe(false);
    expect(minimumWageTableStale("2027-04")).toBe(true);
    expect(minimumWageTableStale("2028-01")).toBe(true);
  });

  it("knows the day of its newest row", () => {
    expect(minimumWageTableFrom()).toBe("2026-04-01");
    expect(minimumWageTableFrom([])).toBeNull();
  });

  it("counts from the row's own year when it starts before April", () => {
    const winter: MinimumWageRow[] = [
      { ...(MINIMUM_WAGES[1] as MinimumWageRow), from: "2027-01-01" },
    ];
    expect(minimumWageTableStale("2027-03", winter)).toBe(false);
    expect(minimumWageTableStale("2027-04", winter)).toBe(true);
    expect(minimumWageTableStale("2027-04", [])).toBe(true);
  });
});

describe("the table", () => {
  it("is sorted, one row a day", () => {
    const days = MINIMUM_WAGES.map((row) => row.from);
    expect(days).toEqual([...new Set(days)].sort());
  });

  it("keeps each minor's minimum under the adult's", () => {
    for (const row of MINIMUM_WAGES) {
      for (const band of AGE_BANDS.filter((one) => one !== "adult")) {
        expect(hourlyFor(row, band), `${row.from} ${band}`).toBeLessThan(
          row.hourlyAgorot,
        );
      }
      expect(row.youthHourlyAgorot.apprentice).toBeLessThan(
        row.youthHourlyAgorot.under16,
      );
    }
  });

  // The published figures follow two rules; a new April that breaks either is
  // worth a second look before it merges.
  it("cuts the adult hour (182 hours, 186 by the statute)", () => {
    for (const row of MINIMUM_WAGES) {
      expect(row.hourlyAgorot, row.from).toBe(
        Math.floor(row.monthlyAgorot / 182),
      );
      expect(row.statuteHourlyAgorot, row.from).toBe(
        Math.floor(row.monthlyAgorot / 186),
      );
    }
  });

  it("rounds a minor's hour: their month in agorot, then ÷ 173", () => {
    const shares = { under16: 70, "16": 75, "17": 83, apprentice: 60 } as const;
    for (const row of MINIMUM_WAGES) {
      for (const [band, share] of Object.entries(shares)) {
        const month = Math.round((row.monthlyAgorot * share) / 100);
        expect(
          row.youthHourlyAgorot[band as keyof typeof shares],
          `${row.from} ${band}`,
        ).toBe(Math.round(month / 173));
      }
    }
  });

  it("marks the 2025 youth figures as worked out, to be checked", () => {
    expect(
      MINIMUM_WAGES.filter((row) => !row.youthPublished).map((row) => row.from),
    ).toEqual(["2025-04-01"]);
  });
});
