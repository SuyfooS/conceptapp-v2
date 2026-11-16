import { beforeEach, describe, expect, it, vi } from "vitest";

// The owner's action on "תפקידים והרשאות" (the roles plan's R9) with what it
// reads and writes stood in for: the owner the session knows
// (`rolesAccess`), the member it opens (`currentMember`) and the write
// (`setRoleArea`). It holds the rules a change keeps: nothing is written
// for anyone but the owner of the business the screen was drawn for, nor in
// an area whose module is off, and a refusal after a switch of business says
// so rather than that only owners change permissions. Adding, renaming and
// archiving a role the business names (R11a) keep the same rules, and a name
// a built-in role goes by is refused before anything is written.

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  rolesAccess: vi.fn(),
  currentMember: vi.fn(),
  setRoleArea: vi.fn(),
  createBusinessRole: vi.fn(),
  renameBusinessRole: vi.fn(),
  archiveBusinessRole: vi.fn(),
  restoreBusinessRole: vi.fn(),
}));
vi.mock("./roles", () => ({ rolesAccess: mocks.rolesAccess }));
vi.mock("../../member", () => ({ currentMember: mocks.currentMember }));
vi.mock("../../current-wording", async () => {
  const { baseWording } = await import("../../wording");
  return { currentWording: async () => baseWording };
});
vi.mock("@db/roles", () => ({
  setRoleArea: mocks.setRoleArea,
  createBusinessRole: mocks.createBusinessRole,
  renameBusinessRole: mocks.renameBusinessRole,
  archiveBusinessRole: mocks.archiveBusinessRole,
  restoreBusinessRole: mocks.restoreBusinessRole,
}));

const {
  addRoleAction,
  archiveRoleAction,
  renameRoleAction,
  restoreRoleAction,
  setRoleAreaAction,
} = await import("./actions");

const SHOP = "11111111-1111-4111-a111-111111111111";
const OTHER = "22222222-2222-4222-a222-222222222222";
const OWNER = "33333333-3333-4333-a333-333333333333";
const LEAD = "44444444-4444-4444-a444-444444444444";

const on = (...keys: string[]) =>
  keys.map((key) => ({ key, enabled: true, settings: {} }));

/** The owner of the shop, with its modules, as `rolesAccess` gives them. */
const owner = (rows = on("scheduling", "time_clock", "lists")) => ({
  userId: OWNER,
  businessId: SHOP,
  rows,
  viewOnly: false,
});

/** Someone whose session opens `business` in `role`. */
const member = (business: string, role: string) => ({
  userId: OWNER,
  membership: { role, business: { id: business } },
});

const listsEdit = { level: "edit", extras: { "lists.send": true } } as const;

beforeEach(() => {
  mocks.rolesAccess.mockReset().mockResolvedValue(owner());
  mocks.currentMember.mockReset().mockResolvedValue(member(SHOP, "owner"));
  mocks.setRoleArea.mockReset().mockResolvedValue({ ok: true });
  mocks.createBusinessRole
    .mockReset()
    .mockResolvedValue({ ok: true, id: LEAD });
  for (const write of [
    mocks.renameBusinessRole,
    mocks.archiveBusinessRole,
    mocks.restoreBusinessRole,
  ]) {
    write.mockReset().mockResolvedValue({ ok: true });
  }
});

describe("the owner's change of a role's area", () => {
  it("writes it as the owner, in the business the session opens", async () => {
    await expect(
      setRoleAreaAction(SHOP, "worker", "lists", listsEdit),
    ).resolves.toEqual({ ok: true });
    expect(mocks.setRoleArea).toHaveBeenCalledWith(
      OWNER,
      SHOP,
      "worker",
      "lists",
      listsEdit,
    );
  });

  it("writes nothing in an area whose module is off, which the screen hides", async () => {
    mocks.rolesAccess.mockResolvedValue(owner(on("scheduling", "time_clock")));
    await expect(
      setRoleAreaAction(SHOP, "worker", "lists", listsEdit),
    ).resolves.toEqual({ ok: false, failure: "closed" });
    await expect(
      setRoleAreaAction(SHOP, "manager", "chat", {
        level: "view",
        extras: {},
      }),
    ).resolves.toEqual({ ok: false, failure: "closed" });
    expect(mocks.setRoleArea).not.toHaveBeenCalled();
    // Team and manage are always there.
    await expect(
      setRoleAreaAction(SHOP, "worker", "team", { level: "view", extras: {} }),
    ).resolves.toEqual({ ok: true });
  });

  it("says the business changed when the session now opens one the person doesn't own", async () => {
    // The shop's owner moved to a business where they are the accountant.
    mocks.rolesAccess.mockResolvedValue(null);
    mocks.currentMember.mockResolvedValue(member(OTHER, "accountant"));
    await expect(
      setRoleAreaAction(SHOP, "worker", "lists", listsEdit),
    ).resolves.toEqual({ ok: false, failure: "businessChanged" });
    expect(mocks.setRoleArea).not.toHaveBeenCalled();
  });

  it("says the business changed when the owner opens another business they own", async () => {
    mocks.rolesAccess.mockResolvedValue({ ...owner(), businessId: OTHER });
    await expect(
      setRoleAreaAction(SHOP, "worker", "lists", listsEdit),
    ).resolves.toEqual({ ok: false, failure: "businessChanged" });
    expect(mocks.setRoleArea).not.toHaveBeenCalled();
  });

  it("refuses anyone but an owner of the business the screen was drawn for", async () => {
    mocks.rolesAccess.mockResolvedValue(null);
    mocks.currentMember.mockResolvedValue(member(SHOP, "manager"));
    await expect(
      setRoleAreaAction(SHOP, "worker", "lists", listsEdit),
    ).resolves.toEqual({ ok: false, failure: "noAccess" });
    mocks.currentMember.mockResolvedValue(null);
    await expect(
      setRoleAreaAction(SHOP, "worker", "lists", listsEdit),
    ).resolves.toEqual({ ok: false, failure: "noAccess" });
    expect(mocks.setRoleArea).not.toHaveBeenCalled();
  });

  it("writes nothing in a view as the owner, or for a change it can't read", async () => {
    mocks.rolesAccess.mockResolvedValue({ ...owner(), viewOnly: true });
    await expect(
      setRoleAreaAction(SHOP, "worker", "lists", listsEdit),
    ).resolves.toEqual({ ok: false, failure: "viewOnly" });
    mocks.rolesAccess.mockResolvedValue(owner());
    await expect(
      setRoleAreaAction(SHOP, "owner", "lists", listsEdit),
    ).resolves.toEqual({ ok: false, failure: "failed" });
    await expect(
      setRoleAreaAction("shop", "worker", "lists", listsEdit),
    ).resolves.toEqual({ ok: false, failure: "failed" });
    expect(mocks.setRoleArea).not.toHaveBeenCalled();
  });
});

describe("the owner's change of a role the business named", () => {
  it("writes its area as any role's, by its id", async () => {
    await expect(
      setRoleAreaAction(SHOP, LEAD, "lists", listsEdit),
    ).resolves.toEqual({ ok: true });
    expect(mocks.setRoleArea).toHaveBeenCalledWith(
      OWNER,
      SHOP,
      LEAD,
      "lists",
      listsEdit,
    );
    // Not an id, nor a role the screen changes: nothing is written.
    await expect(
      setRoleAreaAction(SHOP, "shift-lead", "lists", listsEdit),
    ).resolves.toEqual({ ok: false, failure: "failed" });
    expect(mocks.setRoleArea).toHaveBeenCalledTimes(1);
  });
});

describe("the owner's roles the business names (R11a)", () => {
  it("adds one as the owner, its name tidied, copied from the role chosen", async () => {
    await expect(
      addRoleAction(SHOP, {
        name: "  אחראי   משמרת ",
        base: "worker",
        copyFrom: "worker",
      }),
    ).resolves.toEqual({ ok: true, key: LEAD });
    expect(mocks.createBusinessRole).toHaveBeenCalledWith(OWNER, SHOP, {
      name: "אחראי משמרת",
      base: "worker",
      copyFrom: "worker",
    });
  });

  it("refuses a name a built-in role goes by, or none, before writing", async () => {
    await expect(
      addRoleAction(SHOP, {
        name: "מנהל/ת",
        base: "worker",
        copyFrom: "worker",
      }),
    ).resolves.toEqual({ ok: false, failure: "taken" });
    await expect(
      addRoleAction(SHOP, { name: "  ", base: "worker", copyFrom: "worker" }),
    ).resolves.toEqual({ ok: false, failure: "failed" });
    await expect(
      addRoleAction(SHOP, {
        name: "אחראי",
        base: "owner" as "worker",
        copyFrom: "worker",
      }),
    ).resolves.toEqual({ ok: false, failure: "failed" });
    expect(mocks.createBusinessRole).not.toHaveBeenCalled();
  });

  it("says what the database refused", async () => {
    mocks.createBusinessRole.mockResolvedValue({ ok: false, failure: "limit" });
    await expect(
      addRoleAction(SHOP, {
        name: "אחראי בר",
        base: "manager",
        copyFrom: LEAD,
      }),
    ).resolves.toEqual({ ok: false, failure: "limit" });
  });

  it("renames, archives and restores one in the business the screen was drawn for", async () => {
    await expect(renameRoleAction(SHOP, LEAD, "אחראית משמרת")).resolves.toEqual(
      { ok: true },
    );
    expect(mocks.renameBusinessRole).toHaveBeenCalledWith(
      OWNER,
      SHOP,
      LEAD,
      "אחראית משמרת",
    );
    await expect(archiveRoleAction(SHOP, LEAD)).resolves.toEqual({ ok: true });
    expect(mocks.archiveBusinessRole).toHaveBeenCalledWith(OWNER, SHOP, LEAD);
    await expect(restoreRoleAction(SHOP, LEAD)).resolves.toEqual({ ok: true });
    expect(mocks.restoreBusinessRole).toHaveBeenCalledWith(OWNER, SHOP, LEAD);
  });

  it("passes on a refusal to archive a role people hold", async () => {
    mocks.archiveBusinessRole.mockResolvedValue({ ok: false, failure: "held" });
    await expect(archiveRoleAction(SHOP, LEAD)).resolves.toEqual({
      ok: false,
      failure: "held",
    });
  });

  it("writes nothing for anyone but the owner, in a view, after a switch, or for what it can't read", async () => {
    mocks.rolesAccess.mockResolvedValue(null);
    mocks.currentMember.mockResolvedValue(member(SHOP, "manager"));
    await expect(
      addRoleAction(SHOP, {
        name: "אחראי",
        base: "worker",
        copyFrom: "worker",
      }),
    ).resolves.toEqual({ ok: false, failure: "noAccess" });
    await expect(archiveRoleAction(SHOP, LEAD)).resolves.toEqual({
      ok: false,
      failure: "noAccess",
    });
    mocks.rolesAccess.mockResolvedValue({ ...owner(), viewOnly: true });
    await expect(renameRoleAction(SHOP, LEAD, "אחראי")).resolves.toEqual({
      ok: false,
      failure: "viewOnly",
    });
    mocks.rolesAccess.mockResolvedValue({ ...owner(), businessId: OTHER });
    await expect(restoreRoleAction(SHOP, LEAD)).resolves.toEqual({
      ok: false,
      failure: "businessChanged",
    });
    mocks.rolesAccess.mockResolvedValue(owner());
    await expect(archiveRoleAction(SHOP, "worker")).resolves.toEqual({
      ok: false,
      failure: "failed",
    });
    await expect(renameRoleAction(SHOP, LEAD, "")).resolves.toEqual({
      ok: false,
      failure: "failed",
    });
    expect(mocks.createBusinessRole).not.toHaveBeenCalled();
    expect(mocks.renameBusinessRole).not.toHaveBeenCalled();
    expect(mocks.archiveBusinessRole).not.toHaveBeenCalled();
    expect(mocks.restoreBusinessRole).not.toHaveBeenCalled();
  });
});
