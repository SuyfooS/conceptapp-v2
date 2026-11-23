import { describe, expect, it } from "vitest";
import { buildActivity } from "./activity";
import type { FileStatus } from "./employee-file";
import {
  FILE_HISTORY_ACTIONS,
  FILE_IDLE_MS,
  fileFilterTags,
  fileLineOf,
  fileReviewsOf,
  fileStaff,
  filesHomeOf,
  form101LineOf,
  idleLocksAt,
  minorChecklistOf,
  pensionPassed,
  seesFiles,
  stepUpFresh,
  stepUpLeft,
  touchDue,
} from "./file-holders";

/*
 * The hiring file as its holders read it (profile H6a): who sees the files,
 * how long a step-up counts, and the status lines, a holder's by the groups
 * and anyone else's by a count, never a group's name without the holder's
 * detail.
 */

const NOW = Date.UTC(2026, 10, 22, 9, 0, 0);
const MINUTE = 60_000;

const detail = (over: Partial<NonNullable<FileStatus["detail"]>> = {}) => ({
  missing: [],
  tax_year: 2026,
  status: null,
  returned_reason: null,
  change_due_by: null,
  pension_due_on: null,
  bank_review: null,
  youth_until: null,
  submitted_at: null,
  changed_at: null,
  ...over,
});

const row = (over: Partial<FileStatus> = {}): FileStatus => ({
  user_id: "f6000000-0000-4000-a000-000000000003",
  complete: true,
  missing: 0,
  form101_in: true,
  detail: null,
  ...over,
});

describe("who sees the files", () => {
  it("is an owner and the accountant, and whoever is given the key, with the module on", () => {
    const on = ["employee_files"] as const;
    expect(seesFiles({ role: "owner", perms: [] }, on)).toBe(true);
    expect(
      seesFiles(
        { role: "accountant", perms: ["clock.payroll", "people.files"] },
        on,
      ),
    ).toBe(true);
    expect(seesFiles({ role: "manager", perms: ["team.view"] }, on)).toBe(
      false,
    );
    expect(
      seesFiles({ role: "manager", perms: ["team.view", "people.files"] }, on),
    ).toBe(true);
    expect(seesFiles({ role: "owner", perms: [] }, ["scheduling"])).toBe(false);
  });
});

describe("a step-up", () => {
  it("counts for the 15 minutes after it, the last moment included", () => {
    expect(stepUpFresh(NOW, NOW)).toBe(true);
    expect(stepUpFresh(NOW, NOW + 14 * MINUTE + 59_000)).toBe(true);
    expect(stepUpFresh(NOW, NOW + FILE_IDLE_MS)).toBe(true);
    expect(stepUpFresh(NOW, NOW + FILE_IDLE_MS + 1)).toBe(false);
  });

  it("counts for nothing without one, or more than a minute ahead", () => {
    expect(stepUpFresh(null, NOW)).toBe(false);
    expect(stepUpFresh(Number.NaN, NOW)).toBe(false);
    expect(stepUpFresh(NOW + 30_000, NOW)).toBe(true);
    expect(stepUpFresh(NOW + 2 * MINUTE, NOW)).toBe(false);
  });

  it("says how long it still counts, never more than 15 minutes", () => {
    expect(stepUpLeft(NOW, NOW)).toBe(FILE_IDLE_MS);
    expect(stepUpLeft(NOW, NOW + 10 * MINUTE)).toBe(5 * MINUTE);
    expect(stepUpLeft(NOW, NOW + FILE_IDLE_MS)).toBe(0);
    expect(stepUpLeft(NOW, NOW + FILE_IDLE_MS + 1)).toBeNull();
    // A moment a little ahead, from another clock: 15 minutes, no more.
    expect(stepUpLeft(NOW + 30_000, NOW)).toBe(FILE_IDLE_MS);
    expect(stepUpLeft(NOW + 2 * MINUTE, NOW)).toBeNull();
    expect(stepUpLeft(null, NOW)).toBeNull();
    expect(stepUpLeft(Number.NaN, NOW)).toBeNull();
  });

  it("locks 15 minutes after the last activity", () => {
    expect(idleLocksAt(NOW)).toBe(NOW + 15 * MINUTE);
  });

  it("is slid at most once a minute, and at once the first time", () => {
    expect(touchDue(null, NOW)).toBe(true);
    expect(touchDue(NOW, NOW + 59_000)).toBe(false);
    expect(touchDue(NOW, NOW + MINUTE)).toBe(true);
  });
});

describe("a file's line", () => {
  it("names the groups missing for a holder, in their order", () => {
    expect(
      fileLineOf(
        row({
          complete: false,
          missing: 2,
          detail: detail({ missing: ["pension", "bank"] }),
        }),
      ),
    ).toEqual({
      kind: "groups",
      groups: ["bank", "pension"],
      bankReview: null,
    });
  });

  it("says complete, with an account to look at for a holder", () => {
    expect(fileLineOf(row({ detail: detail() }))).toEqual({
      kind: "complete",
      bankReview: null,
    });
    expect(
      fileLineOf(row({ detail: detail({ bank_review: "disputed" }) })),
    ).toEqual({ kind: "complete", bankReview: "disputed" });
  });

  it("only counts for anyone else, never a group's name", () => {
    const line = fileLineOf(
      row({ complete: false, missing: 2, form101_in: false }),
    );
    expect(line).toEqual({ kind: "count", count: 2 });
    expect(JSON.stringify(line)).not.toMatch(/identity|address|bank|pension/);
    expect(fileLineOf(row())).toEqual({ kind: "complete", bankReview: null });
  });
});

describe("a file's 101", () => {
  it("keeps a returned one returned for a holder, and not in for the team", () => {
    expect(
      form101LineOf(
        row({ form101_in: false, detail: detail({ status: "returned" }) }),
      ),
    ).toEqual({
      kind: "holder",
      year: 2026,
      status: "returned",
      changeDueBy: null,
    });
    expect(form101LineOf(row({ form101_in: false }))).toEqual({
      kind: "team",
      in: false,
    });
  });

  it("says one due again with its day to a holder, and in to the team", () => {
    expect(
      form101LineOf(
        row({
          detail: detail({ status: "change_due", change_due_by: "2026-12-01" }),
        }),
      ),
    ).toMatchObject({ status: "change_due", changeDueBy: "2026-12-01" });
    expect(form101LineOf(row({ form101_in: true }))).toEqual({
      kind: "team",
      in: true,
    });
  });
});

describe("the accountant's Home", () => {
  const rows = [
    row({
      complete: false,
      missing: 2,
      form101_in: false,
      detail: detail({ missing: ["bank", "pension"] }),
    }),
    row({ detail: detail({ bank_review: "new", status: "handed_in" }) }),
    row({ form101_in: false, detail: detail() }),
  ];

  it("counts the files, those missing anything, the 101s and the accounts", () => {
    expect(filesHomeOf(rows, true)).toEqual({
      files: 3,
      missing: 1,
      form101Open: 2,
      bankReviews: 1,
    });
  });

  it("counts no 101 while the business takes it outside the app", () => {
    expect(filesHomeOf(rows, false).form101Open).toBe(0);
  });
});

describe("a files-only reader's staff", () => {
  it("is the managers and the workers", () => {
    const people = [
      { id: "1", role: "owner" },
      { id: "2", role: "manager" },
      { id: "3", role: "worker" },
      { id: "4", role: "accountant" },
    ] as const;
    expect(fileStaff(people).map((p) => p.id)).toEqual(["2", "3"]);
  });
});

// Profile H6b: what a holder does in a file. A part handed directly is
// added or taken off by the database itself, one at a time
// (employee_files_writes.test.sql); the twin's address, by
// file-edits-rules.test.ts.

describe("a pension whose day passed", () => {
  it("passed the day after its day, and only while it is missing", () => {
    expect(pensionPassed(["pension"], "2026-11-21", "2026-11-22")).toBe(true);
    expect(pensionPassed(["pension"], "2026-11-22", "2026-11-22")).toBe(false);
    expect(pensionPassed(["pension"], "2026-11-23", "2026-11-22")).toBe(false);
    expect(pensionPassed(["pension"], null, "2026-11-22")).toBe(false);
    expect(pensionPassed(["bank"], "2026-11-01", "2026-11-22")).toBe(false);
  });
});

describe("the accounts to look at", () => {
  it("puts “לא שיניתי” first, then a doubted number, then new ones, by name", () => {
    const people = [
      row({ user_id: "a", detail: detail({ bank_review: "new" }) }),
      row({ user_id: "b", detail: detail({ bank_review: "disputed" }) }),
      row({ user_id: "c", detail: detail({ bank_review: "warned" }) }),
      row({ user_id: "d", detail: detail({ bank_review: "new" }) }),
      row({ user_id: "e", detail: detail() }),
    ];
    const names = new Map([
      ["a", "יואב לוי"],
      ["d", "אורי מזרחי"],
    ]);
    expect(fileReviewsOf(people, names)).toEqual([
      { userId: "b", review: "disputed" },
      { userId: "c", review: "warned" },
      { userId: "d", review: "new" },
      { userId: "a", review: "new" },
    ]);
  });

  it("has none without a holder's detail", () => {
    expect(fileReviewsOf([row(), row({ detail: detail() })])).toEqual([]);
  });
});

describe("what happened in a file", () => {
  it("lists only rows the log knows, each as its own line", () => {
    const person = "f6000000-0000-4000-a000-000000000003";
    const details: Record<string, unknown> = {
      "employee.details": { person, fields: ["bank"] },
      "employee.submit": { person },
      "employee.tax_year": { person, year: 2026, status: "accepted" },
      "employee.bank_ack": { person },
      "employee.bank_disputed": { person },
      "employee.direct": { person, groups: ["bank"] },
    };
    const entries = buildActivity(
      FILE_HISTORY_ACTIONS.map((action, at) => ({
        id: at + 1,
        action,
        details: details[action],
        createdAt: `2026-11-22T0${at}:00:00Z`,
        actorId: null,
      })),
      {
        members: new Map(),
        invites: new Map(),
        shifts: new Map(),
        swaps: new Map(),
        departments: new Map(),
        stations: new Map(),
      },
    );
    expect(entries.map((entry) => entry.line.action)).toEqual([
      ...FILE_HISTORY_ACTIONS,
    ]);
  });
});

describe("a minor's checklist", () => {
  it("says the notice's day, a week from the start, and whether it passed", () => {
    expect(
      minorChecklistOf("2010-05-01", "2028-05-01", "2026-11-10", "2026-11-15"),
    ).toEqual({ noticeBy: "2026-11-17", noticePassed: false, under15: false });
    expect(
      minorChecklistOf("2010-05-01", "2028-05-01", "2026-11-10", "2026-11-18"),
    ).toMatchObject({ noticeBy: "2026-11-17", noticePassed: true });
    expect(
      minorChecklistOf("2010-05-01", "2028-05-01", null, "2026-11-18"),
    ).toMatchObject({ noticeBy: null, noticePassed: false });
  });

  it("says under 15 until the 15th birthday, by the 18th when there is no birth date", () => {
    expect(
      minorChecklistOf("2011-11-23", "2029-11-23", null, "2026-11-22")?.under15,
    ).toBe(true);
    expect(
      minorChecklistOf("2011-11-22", "2029-11-22", null, "2026-11-22")?.under15,
    ).toBe(false);
    expect(
      minorChecklistOf(null, "2029-11-23", null, "2026-11-22")?.under15,
    ).toBe(true);
  });

  it("is nothing for an adult, or from the 18th birthday", () => {
    expect(
      minorChecklistOf("1995-01-01", null, "2026-11-10", "2026-11-22"),
    ).toBeNull();
    expect(
      minorChecklistOf("2008-11-22", "2026-11-22", "2026-11-10", "2026-11-22"),
    ).toBeNull();
  });
});

describe("the team's filter", () => {
  it("tags a file missing details, and an open 101 for a holder", () => {
    expect(
      fileFilterTags(
        row({ complete: false, missing: 1, detail: detail({ status: null }) }),
        true,
      ),
    ).toEqual(["missing", "form101"]);
    for (const status of ["returned", "change_due"] as const) {
      expect(fileFilterTags(row({ detail: detail({ status }) }), true)).toEqual(
        ["form101"],
      );
    }
    for (const status of ["handed_in", "accepted"] as const) {
      expect(fileFilterTags(row({ detail: detail({ status }) }), true)).toEqual(
        [],
      );
    }
  });

  it("tags by what anyone else sees: a count and whether the 101 is in", () => {
    expect(fileFilterTags(row({ form101_in: false }), true)).toEqual([
      "form101",
    ]);
    expect(fileFilterTags(row({ form101_in: true }), true)).toEqual([]);
  });

  it("has no 101 tag while the business takes it outside the app", () => {
    expect(
      fileFilterTags(row({ form101_in: false, detail: detail() }), false),
    ).toEqual([]);
  });
});
