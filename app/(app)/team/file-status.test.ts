import { beforeEach, describe, expect, it, vi } from "vitest";

// The hiring file's status for the team's screens and the accountant's Home
// (profile H6a), with what it reads stood in for: nothing with the module
// off or for someone who neither sees the team nor holds the files; a
// holder's words only for a holder who isn't viewing; the files alone for
// the accountant; and a read that fails leaves the lines out, logged by its
// code and kind.

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  currentMember: vi.fn(),
  currentModules: vi.fn(),
  currentModuleSettings: vi.fn(),
  getEmployeeFileStatus: vi.fn(),
}));
vi.mock("../member", () => ({ currentMember: mocks.currentMember }));
vi.mock("../modules", () => ({
  currentModules: mocks.currentModules,
  currentModuleSettings: mocks.currentModuleSettings,
}));
vi.mock("@db/employee-files", () => ({
  getEmployeeFileStatus: mocks.getEmployeeFileStatus,
}));

const { currentFilesHome, currentTeamFiles } = await import("./file-status");

const SHOP = "11111111-1111-4111-a111-111111111111";
const NOA = "44444444-4444-4444-a444-444444444444";

const member = (
  role: string,
  perms: string[] = [],
  viewing: unknown = null,
) => ({
  userId: "33333333-3333-4333-a333-333333333333",
  viewing,
  membership: {
    role,
    perms,
    business: { id: SHOP, place: { timeZone: "Asia/Jerusalem" } },
  },
});

const row = {
  user_id: NOA,
  complete: false,
  missing: 2,
  form101_in: false,
  detail: {
    missing: ["bank", "pension"],
    tax_year: 2026,
    status: null,
    returned_reason: null,
    change_due_by: null,
    pension_due_on: null,
    bank_review: "new",
    youth_until: null,
    submitted_at: null,
  },
};

beforeEach(() => {
  mocks.currentMember.mockReset().mockResolvedValue(member("owner"));
  mocks.currentModules.mockReset().mockResolvedValue(["employee_files"]);
  mocks.currentModuleSettings
    .mockReset()
    .mockResolvedValue({ form101: "print", form101Link: "" });
  mocks.getEmployeeFileStatus
    .mockReset()
    .mockResolvedValue(new Map([[NOA, row]]));
});

describe("the team's file status", () => {
  it("is a holder's for an owner, by person", async () => {
    expect(await currentTeamFiles()).toEqual({
      reader: "holder",
      filesOnly: false,
      year: expect.any(Number),
      form101: true,
      byPerson: { [NOA]: row },
    });
  });

  it("is counts for a manager and for any view, the files alone for the accountant", async () => {
    mocks.currentMember.mockResolvedValue(member("manager", ["team.view"]));
    expect(await currentTeamFiles()).toMatchObject({
      reader: "team",
      filesOnly: false,
    });
    mocks.currentMember.mockResolvedValue(
      member("owner", [], { role: "owner" }),
    );
    expect(await currentTeamFiles()).toMatchObject({ reader: "team" });
    mocks.currentMember.mockResolvedValue(
      member("accountant", ["clock.payroll", "people.files"]),
    );
    expect(await currentTeamFiles()).toMatchObject({
      reader: "holder",
      filesOnly: true,
    });
  });

  it("is nothing with the module off, or for someone who neither sees the team nor holds the files", async () => {
    mocks.currentModules.mockResolvedValue(["scheduling"]);
    expect(await currentTeamFiles()).toBeNull();
    mocks.currentModules.mockResolvedValue(["employee_files"]);
    mocks.currentMember.mockResolvedValue(member("worker"));
    expect(await currentTeamFiles()).toBeNull();
    expect(mocks.getEmployeeFileStatus).not.toHaveBeenCalled();
  });

  it("says no 101 while the business takes it outside the app", async () => {
    mocks.currentModuleSettings.mockResolvedValue({ form101: "off" });
    expect(await currentTeamFiles()).toMatchObject({ form101: false });
  });

  it("leaves the lines out when the read fails, logged by its code", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getEmployeeFileStatus.mockRejectedValue(
      Object.assign(new Error("noa"), { code: "57014" }),
    );
    expect(await currentTeamFiles()).toBeNull();
    expect(logged).toHaveBeenCalledWith(
      "reading the files' status failed",
      "57014",
      "Error",
    );
    logged.mockRestore();
  });
});

describe("the accountant's Home card", () => {
  it("counts a holder's files", async () => {
    mocks.currentMember.mockResolvedValue(
      member("accountant", ["clock.payroll", "people.files"]),
    );
    expect(await currentFilesHome()).toEqual({
      files: 1,
      missing: 1,
      form101Open: 1,
      bankReviews: 1,
      form101: true,
    });
  });

  it("is nothing in a view, for whoever doesn't hold the files, or with the module off", async () => {
    mocks.currentMember.mockResolvedValue(
      member("accountant", ["clock.payroll", "people.files"], {
        role: "accountant",
      }),
    );
    expect(await currentFilesHome()).toBeNull();
    mocks.currentMember.mockResolvedValue(member("manager", ["team.view"]));
    expect(await currentFilesHome()).toBeNull();
    mocks.currentModules.mockResolvedValue([]);
    mocks.currentMember.mockResolvedValue(member("owner"));
    expect(await currentFilesHome()).toBeNull();
  });
});
