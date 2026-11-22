import { describe, expect, it } from "vitest";
import type { FileStatus } from "./employee-file";
import {
  FILE_IDLE_MS,
  fileLineOf,
  fileStaff,
  filesHomeOf,
  form101LineOf,
  idleLocksAt,
  seesFiles,
  stepUpFresh,
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
