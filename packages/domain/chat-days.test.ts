import { describe, expect, it } from "vitest";
import {
  chatDay,
  chatShortDate,
  chatWhen,
  inThisYear,
  messageTime,
} from "./chat-days";

const ZONE = "Asia/Jerusalem";

describe("chatDay", () => {
  it("says today and yesterday, and writes other days out", () => {
    expect(chatDay("2026-11-03", "2026-11-03")).toEqual({ kind: "today" });
    expect(chatDay("2026-11-02", "2026-11-03")).toEqual({ kind: "yesterday" });
    expect(chatDay("2026-11-01", "2026-11-03")).toEqual({
      kind: "date",
      day: "2026-11-01",
    });
  });

  it("crosses a month and a year", () => {
    expect(chatDay("2026-10-31", "2026-11-01")).toEqual({ kind: "yesterday" });
    expect(chatDay("2026-12-31", "2027-01-01")).toEqual({ kind: "yesterday" });
  });

  it("writes out a day after today", () => {
    expect(chatDay("2026-11-04", "2026-11-03")).toEqual({
      kind: "date",
      day: "2026-11-04",
    });
  });
});

describe("messageTime", () => {
  it("reads the business's clock, on 24 hours", () => {
    // 06:05 UTC is 08:05 in Israel in winter, and 21:30 UTC is 23:30.
    expect(messageTime("2026-11-03T06:05:00.000Z", ZONE)).toBe("08:05");
    expect(messageTime(new Date("2026-11-03T21:30:00.000Z"), ZONE)).toBe(
      "23:30",
    );
  });

  it("follows summer time", () => {
    expect(messageTime("2026-07-01T05:00:00.000Z", ZONE)).toBe("08:00");
  });

  it("writes midnight as 00", () => {
    expect(messageTime("2026-11-02T22:00:00.000Z", ZONE)).toBe("00:00");
  });
});

describe("chatWhen", () => {
  const now = new Date("2026-11-03T06:12:00.000Z");

  it("gives today's time, yesterday's word and an older date", () => {
    expect(chatWhen("2026-11-03T05:40:00.000Z", now, ZONE)).toEqual({
      kind: "time",
      time: "07:40",
    });
    expect(chatWhen("2026-11-02T19:40:00.000Z", now, ZONE)).toEqual({
      kind: "yesterday",
    });
    expect(chatWhen("2026-11-01T16:00:00.000Z", now, ZONE)).toEqual({
      kind: "date",
      day: "2026-11-01",
    });
  });

  it("counts the day on the business's clock, not in UTC", () => {
    // 22:30 UTC on the 2nd is already 00:30 on the 3rd in Israel.
    expect(chatWhen("2026-11-02T22:30:00.000Z", now, ZONE)).toEqual({
      kind: "time",
      time: "00:30",
    });
  });
});

describe("a day in another year", () => {
  it("is told from one in this year", () => {
    expect(inThisYear("2026-01-02", "2026-11-03")).toBe(true);
    expect(inThisYear("2025-11-10", "2026-11-03")).toBe(false);
  });

  it("is written with its year in the list, so an old chat never looks recent", () => {
    expect(chatShortDate("2026-11-01", "2026-11-03")).toBe("1.11");
    expect(chatShortDate("2025-11-10", "2026-11-03")).toBe("10.11.25");
    expect(chatShortDate("2026-12-31", "2027-01-02")).toBe("31.12.26");
  });
});
