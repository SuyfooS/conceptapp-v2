import { describe, expect, it } from "vitest";
import {
  addYears,
  ageBandOn,
  isMinorOn,
  minorUnderAge,
  youthLabel,
  youthUntilOf,
} from "./youth";

describe("youthUntilOf", () => {
  it("is the 18th birthday of a minor", () => {
    expect(youthUntilOf("2009-04-15", "2026-11-10")).toBe("2027-04-15");
  });

  it("is null for someone 18 already, the day itself included", () => {
    expect(youthUntilOf("2000-01-01", "2026-11-10")).toBeNull();
    expect(youthUntilOf("2008-11-10", "2026-11-10")).toBeNull();
    expect(youthUntilOf("2008-11-11", "2026-11-10")).toBe("2026-11-11");
  });

  it("takes 29 February to 28 February, as Postgres adds years", () => {
    expect(youthUntilOf("2008-02-29", "2026-01-01")).toBe("2026-02-28");
    // A day every year has stays as it is.
    expect(youthUntilOf("2010-02-28", "2026-01-01")).toBe("2028-02-28");
    expect(addYears("2012-02-29", 4)).toBe("2016-02-29");
  });
});

describe("addYears", () => {
  it("adds and takes away whole years", () => {
    expect(addYears("2027-03-01", -1)).toBe("2026-03-01");
    expect(addYears("2026-02-28", -2)).toBe("2024-02-28");
    expect(addYears("2024-02-29", 1)).toBe("2025-02-28");
    expect(addYears("2024-02-29", -4)).toBe("2020-02-29");
  });
});

describe("ageBandOn", () => {
  // The 18th birthday is 1 March 2027: 16 on 1 March 2025, 17 on 1 March 2026.
  const until = "2027-03-01";

  it("is 17 from the 17th birthday", () => {
    expect(ageBandOn("2026-10-13", until)).toBe("17");
    expect(ageBandOn("2026-03-01", until)).toBe("17");
  });

  it("is 16 from the 16th birthday until the day before the 17th", () => {
    expect(ageBandOn("2025-03-01", until)).toBe("16");
    expect(ageBandOn("2026-02-28", until)).toBe("16");
  });

  it("is under 16 before the 16th birthday", () => {
    expect(ageBandOn("2025-02-28", until)).toBe("under16");
  });

  it("is an adult from the 18th birthday, and always without one", () => {
    expect(ageBandOn("2027-03-01", until)).toBe("adult");
    expect(ageBandOn("2026-10-13", null)).toBe("adult");
  });
});

describe("minorUnderAge", () => {
  it("is under 15 until three years before the 18th birthday", () => {
    // The 15th birthday is 1 March 2024.
    expect(minorUnderAge("2024-02-29", "2027-03-01")).toBe(true);
    expect(minorUnderAge("2024-03-01", "2027-03-01")).toBe(false);
    expect(minorUnderAge("2024-02-29", null)).toBe(false);
  });
});

describe("isMinorOn and youthLabel", () => {
  it("is a minor before the 18th birthday only", () => {
    expect(isMinorOn("2027-02-28", "2027-03-01")).toBe(true);
    expect(isMinorOn("2027-03-01", "2027-03-01")).toBe(false);
    expect(isMinorOn("2027-02-28", null)).toBe(false);
  });

  it("says until when, for a minor today", () => {
    expect(youthLabel("2027-04-15", "2026-11-10")).toEqual({
      until: "2027-04-15",
    });
    expect(youthLabel("2026-02-28", "2026-11-10")).toBeNull();
    expect(youthLabel(null, "2026-11-10")).toBeNull();
  });
});
