import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * What the stand-in database answers: the rows of a read, page by page as
 * PostgREST serves them (at most 1000), the filters asked for, and the error
 * a read or a write gives.
 */
const db = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  filters: [] as unknown[][],
  readError: null as { code?: string; message: string } | null,
  calls: [] as [string, Record<string, unknown>][],
  writeError: null as {
    code?: string;
    message: string;
    hint?: string | null;
    details?: string | null;
  } | null,
}));

vi.mock("./supabase/server", () => ({
  createClient: async () => {
    const query = {
      select: () => query,
      eq: (...args: unknown[]) => {
        db.filters.push(["eq", ...args]);
        return query;
      },
      lte: (...args: unknown[]) => {
        db.filters.push(["lte", ...args]);
        return query;
      },
      gte: (...args: unknown[]) => {
        db.filters.push(["gte", ...args]);
        return query;
      },
      is: (...args: unknown[]) => {
        db.filters.push(["is", ...args]);
        return query;
      },
      in: (...args: unknown[]) => {
        db.filters.push(["in", ...args]);
        return query;
      },
      gt: (...args: unknown[]) => {
        db.filters.push(["gt", ...args]);
        return query;
      },
      order: () => query,
      range: async (first: number, last: number) =>
        db.readError
          ? { data: null, error: db.readError }
          : {
              data: db.rows.slice(first, Math.min(last + 1, first + 1000)),
              error: null,
            },
    };
    return {
      from: () => query,
      rpc: (name: string, args: Record<string, unknown>) => {
        db.calls.push([name, args]);
        return query;
      },
    };
  },
}));

vi.mock("./supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: async (name: string, args: Record<string, unknown>) => {
      db.calls.push([name, args]);
      return db.writeError
        ? { data: null, error: db.writeError }
        : { data: "ab5e0000-0000-4000-d000-000000000009", error: null };
    },
  }),
}));

const {
  absenceWriteOf,
  changeAbsence,
  getAbsences,
  getAbsenceWrites,
  getTeamAway,
  recordAbsence,
  removeAbsence,
  restoreAbsence,
} = await import("./absences");

const BUSINESS = "ab5e0000-0000-4000-b000-000000000001";
const NOA = "ab5e0000-0000-4000-a000-000000000003";

const row = (n: number, more: Record<string, unknown> = {}) => ({
  id: `ab5e0000-0000-4000-d000-${String(n).padStart(12, "0")}`,
  user_id: NOA,
  kind: "vacation",
  from_day: "2026-12-03",
  to_day: "2026-12-05",
  note: null,
  recorded_by: null,
  recorded_at: "2026-11-24T08:00:00+00:00",
  changed_at: null,
  removed_by: null,
  removed_at: null,
  ...more,
});

beforeEach(() => {
  db.rows = [];
  db.filters = [];
  db.readError = null;
  db.calls = [];
  db.writeError = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("getAbsences", () => {
  it("reads the live days away that touch the days asked, every page of them", async () => {
    db.rows = Array.from({ length: 1001 }, (_, n) => row(n));
    const rows = await getAbsences(BUSINESS, "2026-12-01", "2026-12-31");
    expect(rows).toHaveLength(1001);
    expect(rows[0]).toMatchObject({
      userId: NOA,
      kind: "vacation",
      from: "2026-12-03",
      to: "2026-12-05",
    });
    expect(db.filters).toContainEqual(["lte", "from_day", "2026-12-31"]);
    expect(db.filters).toContainEqual(["gte", "to_day", "2026-12-01"]);
    expect(db.filters).toContainEqual(["is", "removed_at", null]);
  });

  it("reads one person's when asked, the live ones still", async () => {
    db.rows = [row(1)];
    await getAbsences(BUSINESS, "2026-12-01", "2026-12-31", { userId: NOA });
    expect(db.filters).toContainEqual(["eq", "user_id", NOA]);
    expect(db.filters).toContainEqual(["is", "removed_at", null]);
  });

  it("reads none before the table reaches the project, and throws anything else", async () => {
    db.readError = { code: "PGRST205", message: "no table" };
    expect(await getAbsences(BUSINESS, "2026-12-01", "2026-12-31")).toEqual([]);
    db.readError = { code: "42501", message: "denied" };
    await expect(
      getAbsences(BUSINESS, "2026-12-01", "2026-12-31"),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("throws on a row that isn't a record", async () => {
    db.rows = [row(1, { kind: "holiday" })];
    await expect(
      getAbsences(BUSINESS, "2026-12-01", "2026-12-31"),
    ).rejects.toThrow();
  });
});

describe("getAbsenceWrites", () => {
  const SINCE = "2026-11-03T08:00:00+00:00";
  const span = { kind: "vacation", from: "2026-12-30", to: "2026-12-31" };
  const logRow = (action: string, details: unknown, n = 1) => ({
    action,
    details,
    created_at: `2026-11-0${4 + n}T08:00:00+00:00`,
  });

  it("reads the business's writes of days away since, every page, each record before and after", async () => {
    db.rows = [
      logRow("clock.absence_add", {
        absence: "a1",
        person: NOA,
        ...span,
        noted: false,
      }),
      logRow(
        "clock.absence_change",
        {
          absence: "a1",
          person: NOA,
          from: span,
          to: { kind: "vacation", from: "2027-01-03", to: "2027-01-04" },
          note_changed: false,
        },
        2,
      ),
      logRow(
        "clock.absence_remove",
        { absence: "a2", person: NOA, ...span },
        3,
      ),
      logRow(
        "clock.absence_restore",
        { absence: "a2", person: NOA, ...span },
        4,
      ),
    ];
    const noa = (more: Partial<typeof span> = {}) => ({
      userId: NOA,
      ...span,
      ...more,
    });
    expect(await getAbsenceWrites(BUSINESS, SINCE)).toEqual([
      { absence: "a1", at: db.rows[0]?.created_at, before: null, after: noa() },
      {
        absence: "a1",
        at: db.rows[1]?.created_at,
        before: noa(),
        after: noa({ from: "2027-01-03", to: "2027-01-04" }),
      },
      { absence: "a2", at: db.rows[2]?.created_at, before: noa(), after: null },
      { absence: "a2", at: db.rows[3]?.created_at, before: null, after: noa() },
    ]);
    expect(db.filters).toContainEqual(["eq", "business_id", BUSINESS]);
    expect(db.filters).toContainEqual(["gt", "created_at", SINCE]);
    expect(db.filters).toContainEqual([
      "in",
      "action",
      [
        "clock.absence_add",
        "clock.absence_change",
        "clock.absence_remove",
        "clock.absence_restore",
      ],
    ]);
  });

  it("reads past a page of them", async () => {
    db.rows = Array.from({ length: 1001 }, () =>
      logRow("clock.absence_add", { absence: "a1", person: NOA, ...span }),
    );
    expect(await getAbsenceWrites(BUSINESS, SINCE)).toHaveLength(1001);
  });

  it("leaves out a row it can't read, and another action", () => {
    expect(
      absenceWriteOf(logRow("clock.absence_add", { absence: "a1", ...span })),
    ).toBeNull();
    expect(
      absenceWriteOf(
        logRow("clock.absence_add", {
          absence: "a1",
          person: NOA,
          ...span,
          kind: "holiday",
        }),
      ),
    ).toBeNull();
    expect(
      absenceWriteOf(
        logRow("clock.correct", { absence: "a1", person: NOA, ...span }),
      ),
    ).toBeNull();
  });

  it("throws when the log can't be read", async () => {
    db.readError = { code: "42501", message: "denied" };
    await expect(getAbsenceWrites(BUSINESS, SINCE)).rejects.toMatchObject({
      code: "42501",
    });
  });
});

describe("getTeamAway", () => {
  it("reads who is away and when, never more", async () => {
    db.rows = [{ user_id: NOA, from_day: "2026-12-03", to_day: "2026-12-05" }];
    expect(await getTeamAway(BUSINESS, "2026-12-01", "2026-12-07")).toEqual([
      { userId: NOA, from: "2026-12-03", to: "2026-12-05" },
    ]);
    expect(db.calls).toEqual([
      [
        "team_away",
        { business: BUSINESS, first_day: "2026-12-01", last_day: "2026-12-07" },
      ],
    ]);
  });

  it("reads nobody before the function reaches the project", async () => {
    db.readError = { code: "PGRST202", message: "no function" };
    expect(await getTeamAway(BUSINESS, "2026-12-01", "2026-12-07")).toEqual([]);
  });
});

describe("the writes", () => {
  const values = {
    kind: "sick" as const,
    from: "2026-12-03",
    to: "2026-12-03",
    note: null,
  };

  it("send the record as the database names it, a note only when there is one", async () => {
    expect(await recordAbsence("actor", BUSINESS, NOA, values)).toEqual({
      ok: true,
      value: "ab5e0000-0000-4000-d000-000000000009",
    });
    await changeAbsence("actor", "a1", { ...values, note: "certificate" });
    await removeAbsence("actor", "a1");
    await restoreAbsence("actor", "a1");
    expect(db.calls).toEqual([
      [
        "record_absence",
        {
          actor: "actor",
          business: BUSINESS,
          person: NOA,
          absence_kind: "sick",
          first_day: "2026-12-03",
          last_day: "2026-12-03",
        },
      ],
      [
        "change_absence",
        {
          actor: "actor",
          absence: "a1",
          absence_kind: "sick",
          first_day: "2026-12-03",
          last_day: "2026-12-03",
          absence_note: "certificate",
        },
      ],
      ["remove_absence", { actor: "actor", absence: "a1" }],
      ["restore_absence", { actor: "actor", absence: "a1" }],
    ]);
  });

  it("say each refusal by its code and hint, a closed month with its month", async () => {
    const refusals: [typeof db.writeError, unknown][] = [
      [
        { code: "23P01", message: "absences_no_overlap" },
        { failure: "overlap" },
      ],
      [
        { code: "42501", message: "Only an owner", hint: "own" },
        { failure: "ownAbsence" },
      ],
      [
        { code: "42501", message: "Managers and owners only" },
        { failure: "noAccess" },
      ],
      [
        {
          code: "55000",
          message: "The month is closed for payroll",
          hint: "month_closed",
          details: "2026-11",
        },
        { failure: "monthClosed", month: "2026-11" },
      ],
      [
        {
          code: "55000",
          message: "The month is closed for payroll",
          hint: "month_closed",
          details: "not a month",
        },
        { failure: "monthClosed" },
      ],
      [
        { code: "22023", message: "too far", hint: "too_far" },
        { failure: "tooFar" },
      ],
      [{ code: "XX000", message: "boom" }, { failure: "failed" }],
    ];
    for (const [error, said] of refusals) {
      db.writeError = error;
      expect(await recordAbsence("actor", BUSINESS, NOA, values)).toEqual({
        ok: false,
        ...(said as object),
      });
    }
  });
});
