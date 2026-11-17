import { createElement, Fragment, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { baseWording, translator } = await import("../wording");
const { closedWords, fixOverWords, fixUntilWords } = await import(
  "./list-words"
);

/**
 * How a closed list ended, as Lists, Today and its own screen say it, a fix
 * after its close among it (L6b-1): "נסגרה ב-08:05 על ידי נועה · תוקנה
 * ב-14:20", with the day when the fix wasn't on the day it closed, and the
 * day of a close that wasn't today (L6b-2).
 */
const t = translator(baseWording, "app.lists");
const NOA = "33333333-3333-4333-8333-333333333333";
const lookups = {
  people: { [NOA]: { name: "נועה", photo: null } },
  departments: {},
  roles: {},
};
const ZONE = "Asia/Jerusalem";
const text = (node: ReactNode) =>
  renderToStaticMarkup(createElement(Fragment, null, node)).replaceAll(
    /<[^>]+>/g,
    "",
  );
const finished = {
  status: "finished" as const,
  finishedAt: "2026-12-10T06:05:00.000Z",
  finishedBy: NOA,
  fixedAt: null,
};
/** Later the same day it closed. */
const NOW = new Date("2026-12-10T15:00:00.000Z");

describe("closedWords", () => {
  it("says who closed it and when", () => {
    expect(text(closedWords(t, finished, lookups, ZONE, NOW))).toBe(
      "נסגרה ב-08:05 על ידי נועה",
    );
  });

  it("adds when it was fixed after the close", () => {
    expect(
      text(
        closedWords(
          t,
          { ...finished, fixedAt: "2026-12-10T12:20:00.000Z" },
          lookups,
          ZONE,
          NOW,
        ),
      ),
    ).toBe("נסגרה ב-08:05 על ידי נועה · תוקנה ב-14:20");
  });

  it("names the day of a fix on another day", () => {
    expect(
      text(
        closedWords(
          t,
          { ...finished, fixedAt: "2026-12-11T05:30:00.000Z" },
          lookups,
          ZONE,
          NOW,
        ),
      ),
    ).toBe("נסגרה ב-08:05 על ידי נועה · תוקנה ב-11.12, 07:30");
  });

  it("says nothing of a fix a later finish came after, nor on a list not finished", () => {
    expect(
      text(
        closedWords(
          t,
          {
            ...finished,
            finishedAt: "2026-12-10T13:00:00.000Z",
            fixedAt: "2026-12-10T12:20:00.000Z",
          },
          lookups,
          ZONE,
          NOW,
        ),
      ),
    ).toBe("נסגרה ב-15:00 על ידי נועה");
    expect(
      text(
        closedWords(
          t,
          {
            ...finished,
            status: "cancelled",
            fixedAt: "2026-12-10T12:20:00.000Z",
          },
          lookups,
          ZONE,
          NOW,
        ),
      ),
    ).toBe(t("card.cancelled"));
  });

  // L6b-2: yesterday's list still to fix, opened the next morning beside
  // today's of the same name, and its window to the minute.
  it("names the day of a close that wasn't today", () => {
    const nextMorning = new Date("2026-12-11T05:30:00.000Z");
    expect(text(closedWords(t, finished, lookups, ZONE, nextMorning))).toBe(
      "נסגרה ב-10.12, 08:05 על ידי נועה",
    );
    expect(
      text(fixUntilWords(t, "2026-12-11T06:05:00.000Z", nextMorning, ZONE)),
    ).toBe("אפשר לתקן עד 08:05");
    expect(
      text(
        closedWords(
          t,
          { ...finished, fixedAt: "2026-12-11T05:20:00.000Z" },
          lookups,
          ZONE,
          nextMorning,
        ),
      ),
    ).toBe("נסגרה ב-10.12, 08:05 על ידי נועה · תוקנה ב-11.12, 07:20");
    // Late at night, the next day just begun.
    expect(
      text(
        closedWords(
          t,
          { ...finished, finishedAt: "2026-12-10T21:50:00.000Z" },
          lookups,
          ZONE,
          new Date("2026-12-10T22:10:00.000Z"),
        ),
      ),
    ).toBe("נסגרה ב-10.12, 23:50 על ידי נועה");
  });
});

// L6b-2: until when someone given "תיקון רשימות שנסגרו" may still fix it.
describe("fixUntilWords", () => {
  const until = "2026-12-11T06:05:00.000Z";

  it("says the time on the same day", () => {
    expect(
      text(fixUntilWords(t, until, new Date("2026-12-11T05:00:00Z"), ZONE)),
    ).toBe("אפשר לתקן עד 08:05");
  });

  it("names the day when it isn't today", () => {
    expect(
      text(fixUntilWords(t, until, new Date("2026-12-10T07:00:00Z"), ZONE)),
    ).toBe("אפשר לתקן עד 11.12, 08:05");
  });
});

// L6b-2: once that window is over, when it ended and who still fixes it.
describe("fixOverWords", () => {
  const ended = "2026-12-11T06:05:00.000Z";

  it("says the time on the same day, and who still fixes it", () => {
    expect(
      text(fixOverWords(t, ended, new Date("2026-12-11T09:00:00Z"), ZONE)),
    ).toBe(
      "הזמן לתקן את הרשימה נגמר ב-08:05. מי שעורך את הרשימות עדיין יכול לתקן אותה.",
    );
  });

  it("names the day when it wasn't today", () => {
    expect(
      text(fixOverWords(t, ended, new Date("2026-12-13T09:00:00Z"), ZONE)),
    ).toBe(
      "הזמן לתקן את הרשימה נגמר ב-11.12, 08:05. מי שעורך את הרשימות עדיין יכול לתקן אותה.",
    );
  });
});
