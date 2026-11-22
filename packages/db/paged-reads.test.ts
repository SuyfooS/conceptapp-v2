import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * The reads that can pass PostgREST's 1000 rows (bigger teams, the first
 * fixes) against a stand-in for it that, like `max_rows`, serves at most 1000
 * rows a request: `range(first, last)` gives rows `first` to `last` of the
 * ordered result, and a read awaited without one gives its first 1000. It
 * narrows by `eq`, `neq`, `in` (also on `details->>entry`) and `is` null on
 * the columns as seeded, sorts by the orders asked, and ignores the rest.
 * Each case seeds more than 1000 rows, or more than 100 ids, so a read in one
 * request comes back short here as it would on the hosted project. CI's
 * database job runs Postgres without PostgREST, so this is where paging is
 * proved.
 */

type Row = Record<string, unknown>;
type Request = {
  table: string;
  orders: string[];
  /** The length of each `in` filter. */
  ins: number[];
  range: [number, number] | null;
};

const db = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  requests: [] as Request[],
}));

/** PostgREST's `max_rows`, here and on hosted Supabase. */
const MAX_ROWS = 1000;

/** A row's value at `column`, `a->>b` reading inside a json column. */
function valueAt(row: Row, column: string): unknown {
  const [outer = "", inner] = column.split("->>");
  const value = row[outer];
  if (inner === undefined) return value;
  return value && typeof value === "object" ? (value as Row)[inner] : undefined;
}

type Order = { column: string; ascending: boolean; nullsFirst: boolean };

function compare(a: Row, b: Row, orders: readonly Order[]): number {
  for (const { column, ascending, nullsFirst } of orders) {
    const x = valueAt(a, column) ?? null;
    const y = valueAt(b, column) ?? null;
    if (x === y) continue;
    if (x === null) return nullsFirst ? -1 : 1;
    if (y === null) return nullsFirst ? 1 : -1;
    const by = (x as string | number) < (y as string | number) ? -1 : 1;
    return ascending ? by : -by;
  }
  return 0;
}

/** A read of `table`'s seeded rows, as PostgREST answers it. */
function read(table: string) {
  const request: Request = { table, orders: [], ins: [], range: null };
  const keep: ((row: Row) => boolean)[] = [];
  const orders: Order[] = [];
  const answer = () => {
    db.requests.push(request);
    const rows = (db.tables[table] ?? [])
      .filter((row) => keep.every((test) => test(row)))
      .sort((a, b) => compare(a, b, orders));
    const [first, last] = request.range ?? [0, MAX_ROWS - 1];
    return {
      data: rows.slice(first, Math.min(last + 1, first + MAX_ROWS)),
      error: null,
    };
  };
  const ignored = () => builder;
  const builder = {
    select: ignored,
    eq: (column: string, value: unknown) => {
      keep.push((row) => valueAt(row, column) === value);
      return builder;
    },
    neq: (column: string, value: unknown) => {
      keep.push((row) => valueAt(row, column) !== value);
      return builder;
    },
    in: (column: string, values: readonly unknown[]) => {
      request.ins.push(values.length);
      const wanted = new Set(values);
      keep.push((row) => wanted.has(valueAt(row, column)));
      return builder;
    },
    is: (column: string, value: null) => {
      keep.push((row) => (valueAt(row, column) ?? null) === value);
      return builder;
    },
    not: ignored,
    gt: ignored,
    gte: ignored,
    lt: ignored,
    lte: ignored,
    or: ignored,
    order: (
      column: string,
      options: { ascending?: boolean; nullsFirst?: boolean } = {},
    ) => {
      const ascending = options.ascending ?? true;
      orders.push({
        column,
        ascending,
        nullsFirst: options.nullsFirst ?? !ascending,
      });
      request.orders.push(column);
      return builder;
    },
    range: (first: number, last: number) => {
      request.range = [first, last];
      return builder;
    },
    // biome-ignore lint/suspicious/noThenProperty: a stand-in for the query builder, which is awaited.
    then: (
      resolve: (value: ReturnType<typeof answer>) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(answer()).then(resolve, reject),
  };
  return builder;
}

const client = {
  from: read,
  // A set-returning function reads as a table of its rows.
  rpc: (name: string) => read(name),
};
vi.mock("./supabase/server", () => ({ createClient: async () => client }));
vi.mock("./supabase/admin", () => ({ createAdminClient: () => client }));

const { getWages } = await import("./wages");
const { getCorrections, getPayPeople } = await import("./payroll");
const { getClockPeople, getEntriesToConfirm } = await import("./time-clock");
const { memberNames } = await import("./member-names");
const { getEmploymentPeriods, getPayrollDetails } = await import(
  "./payroll-details"
);
const { getChatAuthors, getChatDirectory } = await import("./chat");
const { getColleagues, getTeam } = await import("./team");
const { getBusinessLists, getListReadings, getListTemplates, getReadings } =
  await import("./lists");
const { getDepartments } = await import("./departments");
const { getWeekAvailability } = await import("./availability");

const BUSINESS = "9a9e5000-0000-4000-b000-000000000001";
/** The `n`th id of a kind (`a` people, `c` everything else). */
const id = (n: number, kind = "a") =>
  `9a9e5000-${kind}000-4000-a000-${n.toString(16).padStart(12, "0")}`;
const person = (n: number) => id(n, "a");
const many = <T>(count: number, row: (n: number) => T): T[] =>
  Array.from({ length: count }, (_, n) => row(n));
/** An instant `n` minutes into November. */
const minute = (n: number) =>
  new Date(Date.UTC(2026, 10, 1) + n * 60_000).toISOString();

/** The key each table's pages end their order with, so no row falls between two. */
const KEYS: Record<string, string> = {
  memberships: "user_id",
  member_names: "user_id",
  member_wages: "id",
  member_payroll_details: "user_id",
  employment_periods: "id",
  audit_log: "id",
  time_entries: "id",
  profiles: "id",
  invites: "id",
  team_phones: "user_id",
  department_members: "user_id",
  availability_submissions: "user_id",
  lists: "id",
  list_items: "id",
  list_people: "user_id",
  list_templates: "id",
  list_template_items: "id",
  list_schedules: "id",
};

/** The requests to `table`. */
const asked = (table: string) =>
  db.requests.filter((request) => request.table === table);

/** The size of each `in` the reads of `table` sent, largest first. */
const inSizes = (table: string) =>
  asked(table)
    .flatMap((r) => r.ins)
    .sort((a, b) => b - a);

const membership = (n: number, active = true) => ({
  business_id: BUSINESS,
  user_id: person(n),
  role: n === 0 ? "owner" : "worker",
  active,
  named_role: null,
  perms: [],
  created_at: minute(n),
  profiles: {
    full_name: `Person ${n}`,
    avatar_path: null,
    address_form: null,
  },
});

beforeEach(() => {
  db.tables = {};
  db.requests = [];
});

afterEach(() => {
  // Every request that paged ordered by its table's key last.
  for (const request of db.requests.filter((r) => r.range !== null)) {
    expect(request.orders.at(-1), request.table).toBe(KEYS[request.table]);
  }
});

describe("reads past PostgREST's 1000 rows", () => {
  it("every hourly wage, the newest last (A1)", async () => {
    db.tables.member_wages = many(1234, (n) => ({
      id: id(n, "c"),
      business_id: BUSINESS,
      user_id: person(n % 300),
      hourly_agorot: 3500 + n,
      effective_from: `2026-${String(1 + (n % 11)).padStart(2, "0")}-01`,
      set_at: minute(n),
      set_by: person(0),
      note: null,
    }));
    const wages = await getWages(BUSINESS);
    expect(wages).toHaveLength(1234);
    expect(wages.at(-1)?.from).toBe("2026-11-01");
    expect(asked("member_wages")).toHaveLength(2);
  });

  it("every correction of a month's entries, a hundred ids at a time (A2)", async () => {
    // 100 entries corrected 12 times each, 150 once: 1350 rows, 250 ids.
    const entries = many(250, (n) => id(n, "c"));
    db.tables.audit_log = [
      ...many(1200, (n) => ({
        id: n,
        business_id: BUSINESS,
        action: "clock.correct",
        created_at: minute(n),
        details: {
          entry: entries[n % 100],
          from: { clock_in: minute(n), clock_out: null },
        },
      })),
      ...many(150, (n) => ({
        id: 2000 + n,
        business_id: BUSINESS,
        action: "clock.correct",
        created_at: minute(n),
        details: {
          entry: entries[100 + n],
          from: { clock_in: minute(n), clock_out: null },
        },
      })),
    ];
    expect(await getCorrections(BUSINESS, entries)).toHaveLength(1350);
    expect(inSizes("audit_log")).toEqual([100, 100, 100, 50]);
  });

  it("every entry still to confirm (A3)", async () => {
    db.tables.time_entries = many(1500, (n) => ({
      id: id(n, "c"),
      business_id: BUSINESS,
      user_id: person(n % 400),
      clock_in: minute(n * 10),
      clock_out: minute(n * 10 + 5),
      source: "punch",
      in_proof: "none",
      out_proof: "scan",
      confirmed_at: null,
      note: null,
      edited_by: null,
      edited_at: null,
      created_at: minute(n * 10),
      restored_at: null,
      time_breaks: [],
    }));
    expect(
      await getEntriesToConfirm(BUSINESS, new Date(minute(0))),
    ).toHaveLength(1500);
  });

  it("everyone who was ever on the clock and in pay (A4, A5)", async () => {
    db.tables.memberships = many(1100, (n) => membership(n, n % 3 !== 0));
    expect(await getClockPeople(BUSINESS)).toHaveLength(1100);
    expect(await getPayPeople(BUSINESS)).toHaveLength(1100);
  });

  it("every name the business keeps, and many people's in parts (A6)", async () => {
    db.tables.member_names = many(1050, (n) => ({
      business_id: BUSINESS,
      user_id: person(n),
      name: `Name ${n}`,
    }));
    expect((await memberNames(client as never, BUSINESS)).size).toBe(1050);
    db.requests = [];
    const people = many(250, person);
    expect((await memberNames(client as never, BUSINESS, people)).size).toBe(
      250,
    );
    expect(inSizes("member_names")).toEqual([100, 100, 50]);
  });

  it("every employment period and payroll detail (A7, A8)", async () => {
    db.tables.employment_periods = many(1100, (n) => ({
      id: id(n, "c"),
      business_id: BUSINESS,
      user_id: person(n % 700),
      started_on: `2025-${String(1 + (n % 12)).padStart(2, "0")}-01`,
      ended_on: null,
      last_paid_on: null,
      source: "joined",
    }));
    db.tables.member_payroll_details = many(1100, (n) => ({
      business_id: BUSINESS,
      user_id: person(n),
      payroll_number: String(n),
      rest_day: 6,
      hours_law: "general",
      youth_until: null,
      compulsory_education: false,
    }));
    const periods = await getEmploymentPeriods(BUSINESS);
    expect([...periods.values()].flat()).toHaveLength(1100);
    expect((await getPayrollDetails(BUSINESS)).size).toBe(1100);
  });

  it("the chat's directory and its authors (A9, A10)", async () => {
    db.tables.memberships = many(1100, (n) => membership(n, n % 4 !== 0));
    expect((await getChatDirectory(BUSINESS)).members.size).toBe(1100);
    db.tables.profiles = many(250, (n) => ({
      id: person(n),
      full_name: `Person ${n}`,
      avatar_path: null,
    }));
    const authors = await getChatAuthors(BUSINESS, many(250, person));
    expect(authors.filter((author) => author.name !== null)).toHaveLength(250);
    expect(inSizes("profiles")).toEqual([100, 100, 50]);
  });

  it("the team, its numbers and every invite nobody claimed (B1, B2, A11)", async () => {
    db.tables.memberships = many(1100, (n) => membership(n));
    db.tables.team_phones = many(1100, (n) => ({
      user_id: person(n),
      phone: `+9725${String(n).padStart(8, "0")}`,
    }));
    db.tables.invites = many(1200, (n) => ({
      id: id(n, "c"),
      business_id: BUSINESS,
      full_name: null,
      phone: `+9725${String(n).padStart(8, "0")}`,
      role: "worker",
      named_role: null,
      expires_at: minute(n),
    }));
    const team = await getTeam(BUSINESS);
    expect(team.members).toHaveLength(1100);
    expect(team.members.every((member) => member.phone !== null)).toBe(true);
    expect(team.invites).toHaveLength(1200);
    expect(await getColleagues(BUSINESS)).toHaveLength(1100);
  });

  it("every department's people (B3)", async () => {
    db.tables.departments = many(30, (n) => ({
      id: id(n, "d"),
      business_id: BUSINESS,
      key: `d${n}`,
      name: `Department ${n}`,
      position: n,
      archived_at: null,
    }));
    db.tables.department_members = many(1300, (n) => ({
      business_id: BUSINESS,
      department_id: id(n % 30, "d"),
      user_id: person(n),
    }));
    const departments = await getDepartments(BUSINESS);
    if (departments === "notYet") throw new Error("notYet");
    expect(departments.flatMap((d) => d.members)).toHaveLength(1300);
    for (const [n, department] of departments.entries()) {
      expect(department.members).toHaveLength(n < 10 ? 44 : 43);
    }
  });

  it("a week's availability (B6)", async () => {
    db.tables.availability_submissions = many(1100, (n) => ({
      week_id: "week",
      user_id: person(n),
      note: null,
      submitted_at: minute(n),
      updated_at: minute(n),
      availability_ranges: [],
    }));
    expect(await getWeekAvailability("week")).toHaveLength(1100);
  });
});

describe("the lists' reads past 1000 rows", () => {
  const list = (n: number) => ({
    id: id(n, "c"),
    business_id: BUSINESS,
    name: `List ${n}`,
    status: "open",
    origin: "sent",
    recipient_kind: "person",
    recipient_department: null,
    recipient_role: null,
    from_department: null,
    template_id: null,
    sent_by: person(0),
    opens_at: minute(n),
    due_at: null,
    finished_at: null,
    finished_by: null,
    closed_at: null,
    closed_by: null,
  });

  it("a day's lists with their people and items, in parts (A16, A17)", async () => {
    db.tables.lists = many(150, list);
    db.tables.list_people = many(1500, (n) => ({
      list_id: id(n % 150, "c"),
      user_id: person(n),
    }));
    db.tables.list_items = many(1500, (n) => ({
      id: id(n, "e"),
      list_id: id(n % 150, "c"),
      required: true,
      done: n % 2 === 0,
    }));
    const lists = await getBusinessLists(BUSINESS, {
      from: minute(0),
      to: minute(2000),
    });
    if (lists === "notYet") throw new Error("notYet");
    expect(lists).toHaveLength(150);
    for (const summary of lists) {
      expect(summary.holder).toMatchObject({ kind: "person" });
      expect(
        summary.holder.kind === "person" ? summary.holder.people : [],
      ).toHaveLength(10);
      expect(summary.progress.total).toBe(10);
    }
    expect(Math.max(...inSizes("list_people"), ...inSizes("list_items"))).toBe(
      100,
    );
  });

  it("a week's number items, in each list's order (A15)", async () => {
    const ids = many(150, (n) => id(n, "c"));
    db.tables.list_items = many(1500, (n) => ({
      id: id(n, "e"),
      list_id: ids[n % 150],
      template_item_id: null,
      kind: "number",
      position: Math.floor(n / 150),
      label: `Item ${n}`,
      unit: null,
      min_value: null,
      max_value: null,
      reading: n,
      done_at: minute(n),
      done_by: person(1),
      fixed_at: null,
    }));
    const readings = await getListReadings(ids);
    if (readings === "notYet") throw new Error("notYet");
    expect(readings).toHaveLength(1500);
    // A list's items come together, in their order.
    const first = readings.slice(0, 10);
    expect(new Set(first.map((r) => r.listId)).size).toBe(1);
    expect(inSizes("list_items")).toEqual([100, 100, 50]);
  });

  it("a template item's readings across a long window (A14)", async () => {
    db.tables.list_items = many(1200, (n) => ({
      id: id(n, "e"),
      list_id: id(n, "c"),
      template_item_id: "fridge",
      reading: 4,
      min_value: 0,
      max_value: 5,
      done_at: minute(n),
      done_by: person(1),
    }));
    const readings = await getReadings("fridge", {
      from: minute(0),
      to: minute(2000),
    });
    if (readings === "notYet") throw new Error("notYet");
    expect(readings).toHaveLength(1200);
    expect(readings.at(-1)?.doneAt).toBe(minute(1199));
  });

  it("a hundred templates of 60 items each, with their times (A12, A13)", async () => {
    db.tables.list_templates = many(100, (n) => ({
      id: id(n, "f"),
      business_id: BUSINESS,
      key: `t${n}`,
      name: `Template ${n}`,
      note: null,
      recipient_kind: null,
      recipient_department: null,
      recipient_shift: null,
      recipient_role: null,
      recipient_named_role: null,
      from_department: null,
      asks_quantities: false,
      version: 1,
      archived_at: null,
      position: n,
    }));
    db.tables.list_template_items = many(6000, (n) => ({
      id: id(n, "e"),
      template_id: id(n % 100, "f"),
      position: Math.floor(n / 100),
      kind: "check",
      label: `Item ${n}`,
      hint: null,
      required: false,
      unit: null,
      min_value: null,
      max_value: null,
      default_quantity: null,
    }));
    const templates = await getListTemplates(BUSINESS);
    if (templates === "notYet") throw new Error("notYet");
    expect(templates).toHaveLength(100);
    for (const template of templates) {
      expect(template.items).toHaveLength(60);
    }
    expect(Math.max(...inSizes("list_template_items"))).toBe(100);
  });
});
