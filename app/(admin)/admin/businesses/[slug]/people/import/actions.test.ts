import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The console's people import (inviting from a list, part 4), with what it
// reads and writes stood in for: the team member signed in, the business's
// live named roles, the import and its undo in @db/people-import, and the
// page's refresh. Rows the screen couldn't have sent never reach the
// database, nor does a business the page didn't bind; the answer holds no
// link and no token; the database's refusals keep their words, and nothing
// with a name or a number is logged.

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  getPlatformStaff: vi.fn(),
  getGivableNamedRoles: vi.fn(),
  importPeopleFromConsole: vi.fn(),
  undoConsoleImport: vi.fn(),
  refresh: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("@db/admin", () => ({ getPlatformStaff: mocks.getPlatformStaff }));
vi.mock("@db/roles", () => ({
  getGivableNamedRoles: mocks.getGivableNamedRoles,
}));
vi.mock("@db/people-import", () => ({
  importPeopleFromConsole: mocks.importPeopleFromConsole,
  undoConsoleImport: mocks.undoConsoleImport,
}));
vi.mock("next/cache", () => ({
  refresh: mocks.refresh,
  revalidatePath: mocks.revalidatePath,
}));

const { importConsolePeopleAction, undoConsoleImportAction } = await import(
  "./actions"
);

const STAFF = "00000000-0000-4000-a000-000000000005";
const SHOP = { id: "11111111-1111-4111-a111-111111111111", slug: "shop-one" };
const IMPORT = "22222222-2222-4222-a222-222222222222";
const INVITE = "33333333-3333-4333-a333-333333333333";
const LEAD = "44444444-4444-4444-a444-444444444444";

const person = (over: Record<string, unknown> = {}) => ({
  name: "דנה כהן",
  phone: "+972500007801",
  role: "worker",
  namedRole: null,
  roleFromLine: false,
  ...over,
});

const rows = [
  person(),
  person({
    name: "יוסי לוי",
    phone: "+972500007802",
    role: "manager",
    roleFromLine: true,
  }),
  person({
    name: "מיכל אברהם",
    phone: "+972500007803",
    namedRole: LEAD,
    roleFromLine: true,
  }),
];

let logged: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mocks.getPlatformStaff
    .mockReset()
    .mockResolvedValue({ userId: STAFF, role: "onboarder" });
  mocks.getGivableNamedRoles.mockReset().mockResolvedValue([
    {
      id: LEAD,
      name: "אחראי משמרת",
      nameEn: "Shift lead",
      base: "worker",
      holds: ["clock.payroll"],
    },
  ]);
  mocks.importPeopleFromConsole.mockReset().mockResolvedValue({
    ok: true,
    importId: IMPORT,
    rows: [
      { i: 1, status: "created", invite: INVITE },
      { i: 2, status: "updated", invite: INVITE },
      { i: 3, status: "member", invite: null },
    ],
  });
  mocks.undoConsoleImport
    .mockReset()
    .mockResolvedValue({ ok: true, cancelled: 2, kept: 1, joined: 1 });
  mocks.refresh.mockReset();
  mocks.revalidatePath.mockReset();
  logged = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("importConsolePeopleAction", () => {
  it("sends the rows as the screen read them, as the team member, and the pages read the team again", async () => {
    await expect(importConsolePeopleAction(SHOP, rows)).resolves.toEqual({
      ok: true,
      importId: IMPORT,
      rows: [
        { i: 1, status: "created", invite: INVITE },
        { i: 2, status: "updated", invite: INVITE },
        { i: 3, status: "member", invite: null },
      ],
    });
    expect(mocks.importPeopleFromConsole).toHaveBeenCalledWith(
      STAFF,
      SHOP.id,
      rows,
    );
    expect(mocks.getGivableNamedRoles).toHaveBeenCalledWith(SHOP.id);
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      `/admin/businesses/${SHOP.slug}`,
    );
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("answers with no link and no token, whatever the database adds", async () => {
    mocks.importPeopleFromConsole.mockResolvedValue({
      ok: true,
      importId: IMPORT,
      rows: [
        {
          i: 1,
          status: "created",
          invite: INVITE,
          token: "a".repeat(43),
          link: "https://app.example.test/join/aaa",
        },
      ],
    });
    const answer = await importConsolePeopleAction(SHOP, [person()]);
    expect(answer).toEqual({
      ok: true,
      importId: IMPORT,
      rows: [{ i: 1, status: "created", invite: INVITE }],
    });
    expect(JSON.stringify(answer)).not.toMatch(/token|link|join/);
  });

  it("invites nobody for someone off the ConceptApp team", async () => {
    mocks.getPlatformStaff.mockResolvedValue(null);
    await expect(importConsolePeopleAction(SHOP, rows)).resolves.toEqual({
      ok: false,
      failure: "noPermission",
    });
    expect(mocks.importPeopleFromConsole).not.toHaveBeenCalled();
    expect(mocks.getGivableNamedRoles).not.toHaveBeenCalled();
  });

  it("never sends rows the screen couldn't have sent, and logs nothing of them", async () => {
    const refused: [string, unknown][] = [
      ["no rows", []],
      ["not a list", { rows }],
      ["a name not as the screen keeps it", [person({ name: " דנה כהן" })]],
      ["an empty name", [person({ name: "" })]],
      ["a landline", [person({ phone: "+97236100000" })]],
      ["a local number", [person({ phone: "050-000-7801" })]],
      ["an owner", [person({ role: "owner" })]],
      ["an accountant", [person({ role: "accountant" })]],
      [
        "a number twice",
        [person(), person({ name: "יוסי לוי", roleFromLine: true })],
      ],
      ["a row with its line", [{ ...person(), line: 3 }]],
      ["a named role that is no id", [person({ namedRole: "shift-lead" })]],
      [
        "301 rows",
        Array.from({ length: 301 }, (_, i) =>
          person({ phone: `+9725000${70_000 + i}` }),
        ),
      ],
    ];
    for (const [what, input] of refused) {
      await expect(
        importConsolePeopleAction(SHOP, input),
        what,
      ).resolves.toEqual({ ok: false, failure: "changed" });
    }
    expect(mocks.importPeopleFromConsole).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(logged).not.toHaveBeenCalled();
  });

  it("takes 300 rows", async () => {
    const many = Array.from({ length: 300 }, (_, i) =>
      person({ phone: `+9725000${70_000 + i}` }),
    );
    mocks.importPeopleFromConsole.mockResolvedValue({
      ok: true,
      importId: IMPORT,
      rows: many.map((_, i) => ({ i: i + 1, status: "created", invite: null })),
    });
    const answer = await importConsolePeopleAction(SHOP, many);
    expect(answer.ok).toBe(true);
    expect(mocks.importPeopleFromConsole).toHaveBeenCalledTimes(1);
  });

  it("writes into no business the page didn't bind", async () => {
    const posted = [
      { id: "abc", slug: SHOP.slug },
      { id: SHOP.id, slug: "../../team" },
      { id: SHOP.id, slug: "Shop One" },
      { ...SHOP, extra: true },
      null,
    ];
    for (const business of posted) {
      await expect(
        importConsolePeopleAction(
          business as unknown as { id: string; slug: string },
          rows,
        ),
      ).resolves.toEqual({ ok: false, failure: "changed" });
    }
    expect(mocks.importPeopleFromConsole).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("holds each row to the console's own form: a named role gone, or on another base", async () => {
    mocks.getGivableNamedRoles.mockResolvedValue([]);
    await expect(importConsolePeopleAction(SHOP, rows)).resolves.toEqual({
      ok: false,
      failure: "roleGone",
    });
    mocks.getGivableNamedRoles.mockResolvedValue([
      {
        id: LEAD,
        name: "אחראי משמרת",
        nameEn: null,
        base: "manager",
        holds: [],
      },
    ]);
    await expect(importConsolePeopleAction(SHOP, rows)).resolves.toEqual({
      ok: false,
      failure: "changed",
    });
    expect(mocks.importPeopleFromConsole).not.toHaveBeenCalled();
  });

  it("gives a role that sees pay, as an owner does", async () => {
    // The named role holds payroll: the console isn't held to who sees pay.
    await importConsolePeopleAction(SHOP, [rows[2]]);
    expect(mocks.importPeopleFromConsole).toHaveBeenCalledWith(STAFF, SHOP.id, [
      rows[2],
    ]);
  });

  it("keeps the database's refusals, the rows on another staff with them", async () => {
    const said = [
      [{ ok: false, failure: "elsewhere", rows: [2, 3] }, { rows: [2, 3] }],
      [{ ok: false, failure: "tooManyOpen", open: 499 }, { open: 499 }],
      [{ ok: false, failure: "tooManyOpen", open: null }, {}],
      [{ ok: false, failure: "demo" }, {}],
      [{ ok: false, failure: "roleGone" }, {}],
      [{ ok: false, failure: "tooMany" }, {}],
      [{ ok: false, failure: "changed" }, {}],
      [{ ok: false, failure: "failed" }, {}],
    ] as const;
    for (const [result, more] of said) {
      mocks.importPeopleFromConsole.mockResolvedValueOnce(result);
      await expect(importConsolePeopleAction(SHOP, rows)).resolves.toEqual({
        ok: false,
        failure: result.failure,
        ...more,
      });
    }
    // Nothing was written: the pages read nothing again.
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("answers a throw as failed, logging its message alone", async () => {
    mocks.importPeopleFromConsole.mockRejectedValue(
      new Error("Could not import: something"),
    );
    await expect(importConsolePeopleAction(SHOP, rows)).resolves.toEqual({
      ok: false,
      failure: "failed",
    });
    expect(logged).toHaveBeenCalledWith(
      "importPeopleFromConsole failed",
      "Could not import: something",
    );
    const written = JSON.stringify(logged.mock.calls);
    expect(written).not.toContain("+97250000780");
    expect(written).not.toContain("דנה");
  });
});

describe("undoConsoleImportAction", () => {
  it("takes the import back as the team member, and the pages read the team again", async () => {
    await expect(undoConsoleImportAction(SHOP, IMPORT)).resolves.toEqual({
      ok: true,
      cancelled: 2,
      kept: 1,
    });
    expect(mocks.undoConsoleImport).toHaveBeenCalledWith(
      STAFF,
      SHOP.id,
      IMPORT,
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      `/admin/businesses/${SHOP.slug}`,
    );
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("takes nothing back for someone off the team, an id that is no id, or another business", async () => {
    mocks.getPlatformStaff.mockResolvedValueOnce(null);
    await expect(undoConsoleImportAction(SHOP, IMPORT)).resolves.toEqual({
      ok: false,
      failure: "noPermission",
    });
    for (const id of ["abc", `${IMPORT}x`, 42, null]) {
      await expect(undoConsoleImportAction(SHOP, id)).resolves.toEqual({
        ok: false,
        failure: "changed",
      });
    }
    await expect(
      undoConsoleImportAction({ id: "abc", slug: SHOP.slug }, IMPORT),
    ).resolves.toEqual({ ok: false, failure: "changed" });
    expect(mocks.undoConsoleImport).not.toHaveBeenCalled();
  });

  it("keeps the database's refusals, and a throw is failed", async () => {
    mocks.undoConsoleImport.mockResolvedValueOnce({
      ok: false,
      failure: "notAllowed",
    });
    await expect(undoConsoleImportAction(SHOP, IMPORT)).resolves.toEqual({
      ok: false,
      failure: "notAllowed",
    });
    mocks.undoConsoleImport.mockRejectedValueOnce(new Error("Could not"));
    await expect(undoConsoleImportAction(SHOP, IMPORT)).resolves.toEqual({
      ok: false,
      failure: "failed",
    });
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
