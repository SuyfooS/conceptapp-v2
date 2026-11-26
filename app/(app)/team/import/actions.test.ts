import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The Team screen's people import (inviting from a list, part 5), with what
// it reads and writes stood in for: the session's member, the business's
// live named roles and the roles only an owner gives, the import and its
// undo in @db/people-import, and the page's refresh. Rows the screen
// couldn't have sent this person never reach the database, nor does a
// business the page wasn't drawn for; a role that sees pay is an owner's
// alone; the answer holds no link and no token; the database's refusals
// keep their words, never where else a number works (#80); and nothing
// with a name or a number is logged.

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  currentMember: vi.fn(),
  currentGivableNamedRoles: vi.fn(),
  currentOwnerOnlyRoles: vi.fn(),
  importPeopleToTeam: vi.fn(),
  undoTeamImport: vi.fn(),
  refresh: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("../../member", () => ({ currentMember: mocks.currentMember }));
vi.mock("../../team", () => ({
  currentGivableNamedRoles: mocks.currentGivableNamedRoles,
  currentOwnerOnlyRoles: mocks.currentOwnerOnlyRoles,
}));
vi.mock("@db/people-import", () => ({
  importPeopleToTeam: mocks.importPeopleToTeam,
  undoTeamImport: mocks.undoTeamImport,
}));
vi.mock("next/cache", () => ({
  refresh: mocks.refresh,
  revalidatePath: mocks.revalidatePath,
}));

const { importPeopleAction, undoPeopleImportAction } = await import(
  "./actions"
);

const SHOP = "11111111-1111-4111-a111-111111111111";
const OTHER = "99999999-9999-4999-a999-999999999999";
const OWNER = "33333333-3333-4333-a333-333333333333";
const IMPORT = "22222222-2222-4222-a222-222222222222";
const INVITE = "44444444-4444-4444-a444-444444444444";
const LEAD = "55555555-5555-4555-a555-555555555555";
const BAR = "66666666-6666-4666-a666-666666666666";

const person = (over: Record<string, unknown> = {}) => ({
  name: "דנה כהן",
  phone: "+972500007901",
  role: "worker",
  namedRole: null,
  roleFromLine: false,
  ...over,
});

const rows = [
  person(),
  person({
    name: "יוסי לוי",
    phone: "+972500007902",
    role: "manager",
    roleFromLine: true,
  }),
  person({
    name: "מיכל אברהם",
    phone: "+972500007903",
    namedRole: LEAD,
    roleFromLine: true,
  }),
];

const member = (role: string, perms: string[] = [], viewing = null) => ({
  userId: OWNER,
  viewing,
  membership: { role, perms, business: { id: SHOP } },
});

let logged: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mocks.currentMember.mockReset().mockResolvedValue(member("owner"));
  mocks.currentGivableNamedRoles.mockReset().mockResolvedValue([
    {
      id: LEAD,
      name: "אחראי משמרת",
      nameEn: "Shift lead",
      base: "worker",
      holds: [],
    },
    {
      id: BAR,
      name: "ראש בר",
      nameEn: null,
      base: "worker",
      holds: ["lists.fix"],
    },
  ]);
  mocks.currentOwnerOnlyRoles.mockReset().mockResolvedValue([]);
  mocks.importPeopleToTeam.mockReset().mockResolvedValue({
    ok: true,
    importId: IMPORT,
    rows: [
      { i: 1, status: "created", invite: INVITE },
      { i: 2, status: "updated", invite: INVITE },
      { i: 3, status: "member", invite: null },
    ],
  });
  mocks.undoTeamImport
    .mockReset()
    .mockResolvedValue({ ok: true, cancelled: 2, kept: 1, joined: 1 });
  mocks.refresh.mockReset();
  mocks.revalidatePath.mockReset();
  logged = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("importPeopleAction", () => {
  it("sends the rows as the screen read them, as the signed-in person, and the pages read the team again", async () => {
    await expect(importPeopleAction(SHOP, rows)).resolves.toEqual({
      ok: true,
      importId: IMPORT,
      rows: [
        { i: 1, status: "created", invite: INVITE },
        { i: 2, status: "updated", invite: INVITE },
        { i: 3, status: "member", invite: null },
      ],
    });
    expect(mocks.importPeopleToTeam).toHaveBeenCalledWith(OWNER, SHOP, rows);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/team");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("answers with no link and no token, whatever the database adds", async () => {
    mocks.importPeopleToTeam.mockResolvedValue({
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
    const answer = await importPeopleAction(SHOP, [person()]);
    expect(answer).toEqual({
      ok: true,
      importId: IMPORT,
      rows: [{ i: 1, status: "created", invite: INVITE }],
    });
    expect(JSON.stringify(answer)).not.toMatch(/token|link|join/);
  });

  it("invites nobody for someone who doesn't edit the team, nor while viewing as someone", async () => {
    const refused = [
      [null, "noPermission"],
      [{ userId: OWNER, viewing: null, membership: null }, "noPermission"],
      [member("manager", ["team.view"]), "noPermission"],
      [member("worker"), "noPermission"],
      [member("owner", [], { role: "manager" } as never), "viewOnly"],
    ] as const;
    for (const [signedIn, failure] of refused) {
      mocks.currentMember.mockResolvedValueOnce(signedIn);
      await expect(importPeopleAction(SHOP, rows)).resolves.toEqual({
        ok: false,
        failure,
      });
    }
    expect(mocks.importPeopleToTeam).not.toHaveBeenCalled();
    expect(mocks.currentGivableNamedRoles).not.toHaveBeenCalled();
  });

  it("writes into no business but the one the page was drawn for", async () => {
    await expect(importPeopleAction(OTHER, rows)).resolves.toEqual({
      ok: false,
      failure: "businessChanged",
    });
    for (const business of ["abc", "", `${SHOP}x`, 42, null]) {
      await expect(
        importPeopleAction(business as unknown as string, rows),
      ).resolves.toEqual({ ok: false, failure: "changed" });
    }
    // The same business however its id is written.
    await importPeopleAction(SHOP.toUpperCase(), rows);
    expect(mocks.importPeopleToTeam).toHaveBeenCalledTimes(1);
    expect(mocks.revalidatePath).toHaveBeenCalledTimes(1);
  });

  it("never sends rows the screen couldn't have sent, and logs nothing of them", async () => {
    const refused: [string, unknown][] = [
      ["no rows", []],
      ["not a list", { rows }],
      ["a name not as the screen keeps it", [person({ name: " דנה כהן" })]],
      ["an empty name", [person({ name: "" })]],
      ["a landline", [person({ phone: "+97236100000" })]],
      ["a local number", [person({ phone: "050-000-7901" })]],
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
      await expect(importPeopleAction(SHOP, input), what).resolves.toEqual({
        ok: false,
        failure: "changed",
      });
    }
    expect(mocks.importPeopleToTeam).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(logged).not.toHaveBeenCalled();
  });

  it("takes 300 rows", async () => {
    const many = Array.from({ length: 300 }, (_, i) =>
      person({ phone: `+9725000${70_000 + i}` }),
    );
    mocks.importPeopleToTeam.mockResolvedValue({
      ok: true,
      importId: IMPORT,
      rows: many.map((_, i) => ({ i: i + 1, status: "created", invite: null })),
    });
    const answer = await importPeopleAction(SHOP, many);
    expect(answer.ok).toBe(true);
    expect(mocks.importPeopleToTeam).toHaveBeenCalledTimes(1);
  });

  it("gives a role that sees pay only as an owner: a manager's row to it is refused, and nothing is asked", async () => {
    mocks.currentMember.mockResolvedValue(
      member("manager", ["team.view", "team.edit"]),
    );
    mocks.currentOwnerOnlyRoles.mockResolvedValue(["manager"]);
    await expect(importPeopleAction(SHOP, rows)).resolves.toEqual({
      ok: false,
      failure: "changed",
    });
    expect(mocks.importPeopleToTeam).not.toHaveBeenCalled();
    // The same manager, the same pay rule, a list of workers and the shift
    // lead (a named role never holds pay): sent.
    await importPeopleAction(SHOP, [rows[0], rows[2]]);
    expect(mocks.importPeopleToTeam).toHaveBeenCalledWith(OWNER, SHOP, [
      rows[0],
      rows[2],
    ]);
  });

  it("holds each row to the rank rule and to what a named role holds", async () => {
    // A worker who edits the team gives workers alone, and no named role
    // that holds what they don't.
    mocks.currentMember.mockResolvedValue(
      member("worker", ["team.view", "team.edit"]),
    );
    const said = [
      [rows[1], "changed"],
      [person({ namedRole: BAR, roleFromLine: true }), "changed"],
    ] as const;
    for (const [row, failure] of said) {
      await expect(importPeopleAction(SHOP, [row])).resolves.toEqual({
        ok: false,
        failure,
      });
    }
    expect(mocks.importPeopleToTeam).not.toHaveBeenCalled();
    await importPeopleAction(SHOP, [rows[0], rows[2]]);
    expect(mocks.importPeopleToTeam).toHaveBeenCalledTimes(1);
  });

  it("says a named role removed since in the invite form's words, and one on another base is a screen gone stale", async () => {
    mocks.currentGivableNamedRoles.mockResolvedValue([]);
    await expect(importPeopleAction(SHOP, rows)).resolves.toEqual({
      ok: false,
      failure: "roleGone",
    });
    mocks.currentGivableNamedRoles.mockResolvedValue([
      {
        id: LEAD,
        name: "אחראי משמרת",
        nameEn: null,
        base: "manager",
        holds: [],
      },
    ]);
    await expect(importPeopleAction(SHOP, rows)).resolves.toEqual({
      ok: false,
      failure: "changed",
    });
    expect(mocks.importPeopleToTeam).not.toHaveBeenCalled();
  });

  it("keeps the database's refusals, and never says a number is on another staff", async () => {
    const said = [
      [{ ok: false, failure: "tooManyOpen", open: 499 }, { open: 499 }],
      [{ ok: false, failure: "tooManyOpen", open: null }, {}],
      [{ ok: false, failure: "demo" }, {}],
      [{ ok: false, failure: "notAllowed" }, {}],
      [{ ok: false, failure: "givesPay" }, {}],
      [{ ok: false, failure: "roleGone" }, {}],
      [{ ok: false, failure: "tooMany" }, {}],
      [{ ok: false, failure: "changed" }, {}],
      [{ ok: false, failure: "failed" }, {}],
    ] as const;
    for (const [result, more] of said) {
      mocks.importPeopleToTeam.mockResolvedValueOnce(result);
      await expect(importPeopleAction(SHOP, rows)).resolves.toEqual({
        ok: false,
        failure: result.failure,
        ...more,
      });
    }
    mocks.importPeopleToTeam.mockResolvedValueOnce({
      ok: false,
      failure: "elsewhere",
      rows: [2],
    });
    const elsewhere = await importPeopleAction(SHOP, rows);
    expect(elsewhere).toEqual({ ok: false, failure: "failed" });
    expect(JSON.stringify(elsewhere)).not.toContain("rows");
    // Nothing was written: the pages read nothing again.
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("answers a throw as failed, logging its message alone", async () => {
    mocks.importPeopleToTeam.mockRejectedValue(
      new Error("Could not import: something"),
    );
    await expect(importPeopleAction(SHOP, rows)).resolves.toEqual({
      ok: false,
      failure: "failed",
    });
    expect(logged).toHaveBeenCalledWith(
      "importPeopleToTeam failed",
      "Could not import: something",
    );
    const written = JSON.stringify(logged.mock.calls);
    expect(written).not.toContain("+97250000790");
    expect(written).not.toContain("דנה");
  });
});

describe("undoPeopleImportAction", () => {
  it("takes the import back as the signed-in person, and the pages read the team again", async () => {
    await expect(undoPeopleImportAction(SHOP, IMPORT)).resolves.toEqual({
      ok: true,
      cancelled: 2,
      kept: 1,
    });
    expect(mocks.undoTeamImport).toHaveBeenCalledWith(OWNER, SHOP, IMPORT);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/team");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("takes nothing back for someone who doesn't edit the team, a session viewing as someone, another business or an id that is no id", async () => {
    mocks.currentMember.mockResolvedValueOnce(member("worker"));
    await expect(undoPeopleImportAction(SHOP, IMPORT)).resolves.toEqual({
      ok: false,
      failure: "noPermission",
    });
    mocks.currentMember.mockResolvedValueOnce(
      member("owner", [], { role: "manager" } as never),
    );
    await expect(undoPeopleImportAction(SHOP, IMPORT)).resolves.toEqual({
      ok: false,
      failure: "viewOnly",
    });
    await expect(undoPeopleImportAction(OTHER, IMPORT)).resolves.toEqual({
      ok: false,
      failure: "businessChanged",
    });
    for (const id of ["abc", `${IMPORT}x`, 42, null]) {
      await expect(undoPeopleImportAction(SHOP, id)).resolves.toEqual({
        ok: false,
        failure: "changed",
      });
    }
    expect(mocks.undoTeamImport).not.toHaveBeenCalled();
  });

  it("keeps the database's refusals, and a throw is failed", async () => {
    mocks.undoTeamImport.mockResolvedValueOnce({
      ok: false,
      failure: "notAllowed",
    });
    await expect(undoPeopleImportAction(SHOP, IMPORT)).resolves.toEqual({
      ok: false,
      failure: "notAllowed",
    });
    mocks.undoTeamImport.mockRejectedValueOnce(new Error("Could not"));
    await expect(undoPeopleImportAction(SHOP, IMPORT)).resolves.toEqual({
      ok: false,
      failure: "failed",
    });
    expect(logged).toHaveBeenCalledWith("undoTeamImport failed", "Could not");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
