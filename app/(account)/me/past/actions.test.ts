import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A former worker's reveal of their own number (profile H5c), with what it
// reads stood in for: the session's member, the businesses they left and
// the file's server code. Never in a view session, never for a business
// they didn't leave, the person always the session's own, and the number
// in no log.

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  currentMember: vi.fn(),
  currentDepartures: vi.fn(),
  revealEmployeeFields: vi.fn(),
}));
vi.mock("../../../(app)/member", () => ({
  currentMember: mocks.currentMember,
}));
vi.mock("../../../(app)/departures", () => ({
  currentDepartures: mocks.currentDepartures,
}));
// The writer's own reads, which the reveal never reaches: only its `logged`.
vi.mock("../../../(app)/modules", () => ({
  currentModules: vi.fn(),
  currentModuleSettings: vi.fn(),
}));
vi.mock("@db/employee-files", () => ({
  getEmployeeFile: vi.fn(),
  revealEmployeeFields: mocks.revealEmployeeFields,
}));

const { revealPastAction } = await import("./actions");

const CAFE = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const NEVER = "cccccccc-cccc-4ccc-cccc-cccccccccccc";
const NOA = "33333333-3333-4333-a333-333333333333";

const noa = (over: Record<string, unknown> = {}) => ({
  userId: NOA,
  viewing: null,
  membership: null,
  profile: { locale: "he" },
  ...over,
});

beforeEach(() => {
  mocks.currentMember.mockReset().mockResolvedValue(noa());
  mocks.currentDepartures.mockReset().mockResolvedValue([
    {
      businessId: CAFE,
      name: "בית הקפה",
      accent: "#0f766e",
      leftAt: "2026-10-12T08:00:00.000Z",
    },
  ]);
  mocks.revealEmployeeFields
    .mockReset()
    .mockResolvedValue({ ok: true, id: "000000018", bankAccount: "100001" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("revealing a number of an old file", () => {
  it("gives the person's own, for the business they left", async () => {
    expect(await revealPastAction(CAFE, "id")).toEqual({
      ok: true,
      value: "000000018",
    });
    expect(mocks.revealEmployeeFields).toHaveBeenCalledWith(CAFE, NOA, ["id"]);
    expect(await revealPastAction(CAFE, "bank_account")).toEqual({
      ok: true,
      value: "100001",
    });
    expect(mocks.revealEmployeeFields).toHaveBeenLastCalledWith(CAFE, NOA, [
      "bank_account",
    ]);
  });

  it("reveals nothing for nobody signed in, or a business they didn't leave", async () => {
    expect(await revealPastAction(NEVER, "id")).toEqual({
      ok: false,
      failure: "failed",
    });
    expect(await revealPastAction("not-an-id", "id")).toEqual({
      ok: false,
      failure: "failed",
    });
    mocks.currentMember.mockResolvedValue(null);
    expect(await revealPastAction(CAFE, "id")).toEqual({
      ok: false,
      failure: "failed",
    });
    expect(mocks.revealEmployeeFields).not.toHaveBeenCalled();
  });

  it("reveals nothing in a view session", async () => {
    mocks.currentMember.mockResolvedValue(
      noa({ viewing: { business: CAFE }, membership: { role: "worker" } }),
    );
    expect(await revealPastAction(CAFE, "id")).toEqual({
      ok: false,
      failure: "viewOnly",
    });
    expect(mocks.revealEmployeeFields).not.toHaveBeenCalled();
  });

  it("takes only the two numbers", async () => {
    expect(await revealPastAction(CAFE, "file" as never)).toEqual({
      ok: false,
      failure: "invalid",
    });
    expect(mocks.revealEmployeeFields).not.toHaveBeenCalled();
  });

  it("says the database's refusal", async () => {
    mocks.revealEmployeeFields.mockResolvedValue({
      ok: false,
      failure: "denied",
      reason: "off",
    });
    expect(await revealPastAction(CAFE, "id")).toEqual({
      ok: false,
      failure: "denied",
    });
    mocks.revealEmployeeFields.mockResolvedValue({
      ok: false,
      failure: "keys",
    });
    expect(await revealPastAction(CAFE, "id")).toEqual({
      ok: false,
      failure: "keys",
    });
  });

  it("logs a failure by its code, never the number", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.revealEmployeeFields.mockRejectedValue(
      Object.assign(new Error("000000018"), { code: "XX000" }),
    );
    expect(await revealPastAction(CAFE, "id")).toEqual({
      ok: false,
      failure: "failed",
    });
    expect(error).toHaveBeenCalledWith(
      "revealing a past number failed",
      "XX000",
    );
    expect(JSON.stringify(error.mock.calls)).not.toContain("000000018");
  });

  it("fails closed when the departures can't be read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.currentDepartures.mockRejectedValue(new Error("down"));
    expect(await revealPastAction(CAFE, "id")).toEqual({
      ok: false,
      failure: "failed",
    });
    expect(mocks.revealEmployeeFields).not.toHaveBeenCalled();
  });
});
