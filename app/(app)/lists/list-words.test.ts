import { createElement, Fragment, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { baseWording, translator } = await import("../wording");
const { closedWords } = await import("./list-words");

/**
 * How a closed list ended, as Lists, Today and its own screen say it, a fix
 * after its close among it (L6b-1): "נסגרה ב-08:05 על ידי נועה · תוקנה
 * ב-14:20", with the day when the fix wasn't on the day it closed.
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

describe("closedWords", () => {
  it("says who closed it and when", () => {
    expect(text(closedWords(t, finished, lookups, ZONE))).toBe(
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
        ),
      ),
    ).toBe(t("card.cancelled"));
  });
});
