import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The worker's own file's writes (profile H5a) with what they read and write
// stood in for: the session's member (`currentMember`), the modules on, the
// file's server code (@db/employee-files) and the sign-in codes
// (app/(auth)/otp). They hold the rules a write keeps: nothing for a view
// session or another business than the screen's, the person always the
// session's own, the bank's code only to their own number and noted only
// once it was right and theirs, and nothing typed in a log.

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  currentMember: vi.fn(),
  currentModules: vi.fn(),
  saveEmployeeDetails: vi.fn(),
  revealEmployeeFields: vi.fn(),
  noteStepUp: vi.fn(),
  setTaxYearStatus: vi.fn(),
  submitEmployeeFile: vi.fn(),
  sendCode: vi.fn(),
  verifyCode: vi.fn(),
  refresh: vi.fn(),
  order: [] as string[],
}));
vi.mock("next/cache", () => ({ refresh: mocks.refresh }));
vi.mock("../../member", () => ({ currentMember: mocks.currentMember }));
vi.mock("../../modules", () => ({ currentModules: mocks.currentModules }));
vi.mock("@db/employee-files", () => ({
  saveEmployeeDetails: mocks.saveEmployeeDetails,
  revealEmployeeFields: mocks.revealEmployeeFields,
  noteStepUp: mocks.noteStepUp,
  setTaxYearStatus: mocks.setTaxYearStatus,
  submitEmployeeFile: mocks.submitEmployeeFile,
}));
vi.mock("../../../(auth)/otp", () => ({
  sendCode: mocks.sendCode,
  verifyCode: mocks.verifyCode,
}));

const {
  confirmBankAction,
  handInForm101Action,
  revealOwnAction,
  saveFileStepAction,
  sendBankCodeAction,
  submitFileAction,
} = await import("./actions");

const SHOP = "11111111-1111-4111-a111-111111111111";
const OTHER = "22222222-2222-4222-a222-222222222222";
const NOA = "33333333-3333-4333-a333-333333333333";
const SOMEONE = "44444444-4444-4444-a444-444444444444";
const NOA_PHONE = "+972500000003";

/** Noa, a worker in the shop, as the session reads her. */
const noa = (over: Record<string, unknown> = {}) => ({
  userId: NOA,
  phone: NOA_PHONE,
  viewing: null,
  membership: {
    role: "worker",
    perms: [],
    business: { id: SHOP, place: { timeZone: "Asia/Jerusalem" } },
  },
  ...over,
});

/** Hapoalim 12, branch 600: an account the check passes, and one it warns about. */
const account = (number = "100001") => ({
  bank: 12,
  branch: 600,
  account: number,
  holder: "self",
  instruction: "v1",
});

const identity = {
  names: { first: "נועה", last: "כהן" },
  birthDate: { day: "1", month: "1", year: "1995" },
  identity: { kind: "il", number: "000000018" },
};

beforeEach(() => {
  mocks.order = [];
  mocks.currentMember.mockReset().mockResolvedValue(noa());
  mocks.currentModules.mockReset().mockResolvedValue(["employee_files"]);
  mocks.saveEmployeeDetails.mockReset().mockImplementation(async () => {
    mocks.order.push("save");
    return { ok: true, changed: ["bank"], changeDueBy: null };
  });
  mocks.revealEmployeeFields
    .mockReset()
    .mockResolvedValue({ ok: true, id: "000000018", bankAccount: null });
  mocks.noteStepUp.mockReset().mockImplementation(async () => {
    mocks.order.push("stepUp");
    return { ok: true };
  });
  mocks.setTaxYearStatus.mockReset().mockResolvedValue({ ok: true });
  mocks.submitEmployeeFile.mockReset().mockResolvedValue({ ok: true });
  mocks.sendCode.mockReset().mockResolvedValue(null);
  mocks.verifyCode.mockReset().mockImplementation(async () => {
    mocks.order.push("verify");
    return { userId: NOA };
  });
  mocks.refresh.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Every write, each as the screen calls it, for one business. */
const everyWrite = (business: string) => [
  saveFileStepAction(business, "identity", identity),
  revealOwnAction(business, "id"),
  sendBankCodeAction(business),
  confirmBankAction(business, { code: "123456", bank: account() }),
  handInForm101Action(business),
  submitFileAction(business),
];

const nothingCalled = () => {
  for (const fn of [
    mocks.saveEmployeeDetails,
    mocks.revealEmployeeFields,
    mocks.noteStepUp,
    mocks.setTaxYearStatus,
    mocks.submitEmployeeFile,
    mocks.sendCode,
    mocks.verifyCode,
  ]) {
    expect(fn).not.toHaveBeenCalled();
  }
};

describe("who may write", () => {
  it("refuses every write while viewing as a role, and calls nothing", async () => {
    mocks.currentMember.mockResolvedValue(noa({ viewing: { role: "worker" } }));
    for (const answer of await Promise.all(everyWrite(SHOP))) {
      expect(answer).toEqual({ ok: false, failure: "viewOnly" });
    }
    nothingCalled();
  });

  it("refuses a write for a business other than the screen's", async () => {
    for (const answer of await Promise.all(everyWrite(OTHER))) {
      expect(answer).toEqual({ ok: false, failure: "businessChanged" });
    }
    nothingCalled();
  });

  it("refuses with the module off, or for someone off the staff", async () => {
    mocks.currentModules.mockResolvedValue([]);
    for (const answer of await Promise.all(everyWrite(SHOP))) {
      expect(answer).toEqual({ ok: false, failure: "off" });
    }
    mocks.currentModules.mockResolvedValue(["employee_files"]);
    mocks.currentMember.mockResolvedValue(
      noa({
        membership: {
          role: "accountant",
          perms: ["people.files"],
          business: { id: SHOP, place: { timeZone: "Asia/Jerusalem" } },
        },
      }),
    );
    for (const answer of await Promise.all(everyWrite(SHOP))) {
      expect(answer).toEqual({ ok: false, failure: "off" });
    }
    nothingCalled();
  });

  it("writes the session's own file, never an id the call carries", async () => {
    await saveFileStepAction(SHOP, "identity", identity);
    expect(mocks.saveEmployeeDetails).toHaveBeenCalledWith(
      NOA,
      SHOP,
      NOA,
      identity,
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    );
    await revealOwnAction(SHOP, "id");
    expect(mocks.revealEmployeeFields).toHaveBeenCalledWith(SHOP, NOA, ["id"]);
    await handInForm101Action(SHOP);
    expect(mocks.setTaxYearStatus).toHaveBeenCalledWith(
      NOA,
      SHOP,
      NOA,
      expect.objectContaining({ status: "handed_in", route: "print" }),
    );
    await submitFileAction(SHOP);
    expect(mocks.submitEmployeeFile).toHaveBeenCalledWith(NOA, SHOP);
  });
});

describe("a step's save", () => {
  it("takes only that step's groups", async () => {
    expect(
      await saveFileStepAction(SHOP, "identity", {
        ...identity,
        bank: account(),
      }),
    ).toEqual({ ok: false, failure: "invalid" });
    expect(await saveFileStepAction(SHOP, "pension", identity)).toEqual({
      ok: false,
      failure: "invalid",
    });
    expect(
      await saveFileStepAction(SHOP, "bank" as never, { bank: account() }),
    ).toEqual({ ok: false, failure: "invalid" });
    expect(mocks.saveEmployeeDetails).not.toHaveBeenCalled();
    expect(
      await saveFileStepAction(SHOP, "address", {
        address: {
          kind: "street",
          cityCode: 5000,
          street: "הרצל",
          number: "12",
        },
        email: null,
      }),
    ).toEqual({ ok: true, changeDueBy: null });
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("says when an updated 101 is due", async () => {
    mocks.saveEmployeeDetails.mockResolvedValue({
      ok: true,
      changed: ["names"],
      changeDueBy: "2026-12-01",
    });
    expect(await saveFileStepAction(SHOP, "identity", identity)).toEqual({
      ok: true,
      changeDueBy: "2026-12-01",
    });
  });
});

describe("the bank's code", () => {
  it("goes to the person's own number, whatever the call carries", async () => {
    expect(await sendBankCodeAction(SHOP)).toEqual({ ok: true, tail: "0003" });
    expect(mocks.sendCode).toHaveBeenCalledWith(NOA_PHONE);
    // A number from the browser is no part of the call.
    expect(
      await confirmBankAction(SHOP, {
        code: "123456",
        bank: account(),
        phone: "+972500000999",
      } as never),
    ).toEqual({ ok: false, failure: "invalid" });
    await confirmBankAction(SHOP, { code: "123456", bank: account() });
    expect(mocks.verifyCode).toHaveBeenCalledWith(NOA_PHONE, "123456");
  });

  it("goes nowhere without a number", async () => {
    mocks.currentMember.mockResolvedValue(noa({ phone: null }));
    expect(await sendBankCodeAction(SHOP)).toEqual({
      ok: false,
      failure: "noPhone",
    });
    expect(mocks.sendCode).not.toHaveBeenCalled();
  });

  it("says the auth server's wait and the counts in their own words", async () => {
    mocks.sendCode.mockResolvedValue("rateLimit");
    expect(await sendBankCodeAction(SHOP)).toEqual({
      ok: false,
      failure: "rateLimit",
    });
    mocks.sendCode.mockResolvedValue("tooMany");
    expect(await sendBankCodeAction(SHOP)).toEqual({
      ok: false,
      failure: "tooMany",
    });
    mocks.sendCode.mockResolvedValue("unknownPhone");
    expect(await sendBankCodeAction(SHOP)).toEqual({
      ok: false,
      failure: "failed",
    });
  });

  it("is noted only after it was right, and then the account is saved", async () => {
    expect(
      await confirmBankAction(SHOP, { code: "123456", bank: account() }),
    ).toEqual({ ok: true, review: "new" });
    expect(mocks.order).toEqual(["verify", "stepUp", "save"]);
    expect(mocks.noteStepUp).toHaveBeenCalledWith(NOA, "bank");
    expect(mocks.saveEmployeeDetails).toHaveBeenCalledWith(
      NOA,
      SHOP,
      NOA,
      { bank: account() },
      expect.any(String),
    );
  });

  it("says an account the check doubts is saved with a note", async () => {
    expect(
      await confirmBankAction(SHOP, {
        code: "123456",
        bank: account("100002"),
      }),
    ).toEqual({ ok: true, review: "warned" });
  });

  it("saves nothing for a wrong code, and notes nothing", async () => {
    mocks.verifyCode.mockResolvedValue({ error: "wrongCode" });
    expect(
      await confirmBankAction(SHOP, { code: "123456", bank: account() }),
    ).toEqual({ ok: false, failure: "wrongCode" });
    mocks.verifyCode.mockResolvedValue({ error: "tooMany" });
    expect(
      await confirmBankAction(SHOP, { code: "123456", bank: account() }),
    ).toEqual({ ok: false, failure: "tooMany" });
    expect(
      await confirmBankAction(SHOP, { code: "12a456", bank: account() }),
    ).toEqual({ ok: false, failure: "wrongCode" });
    expect(mocks.noteStepUp).not.toHaveBeenCalled();
    expect(mocks.saveEmployeeDetails).not.toHaveBeenCalled();
  });

  it("notes nothing when the code was someone else's account", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.verifyCode.mockResolvedValue({ userId: SOMEONE });
    expect(
      await confirmBankAction(SHOP, { code: "123456", bank: account() }),
    ).toEqual({ ok: false, failure: "failed" });
    expect(mocks.noteStepUp).not.toHaveBeenCalled();
    expect(mocks.saveEmployeeDetails).not.toHaveBeenCalled();
  });

  it("spends no code on an account that can't be kept", async () => {
    expect(
      await confirmBankAction(SHOP, {
        code: "123456",
        bank: { ...account(), holder: "friend" },
      }),
    ).toEqual({ ok: false, failure: "invalid" });
    expect(
      await confirmBankAction(SHOP, { code: "123456", bank: null }),
    ).toEqual({ ok: false, failure: "invalid" });
    expect(mocks.verifyCode).not.toHaveBeenCalled();
  });

  it("says the day a change opens again after a phone change", async () => {
    mocks.saveEmployeeDetails.mockResolvedValue({
      ok: false,
      failure: "phoneHold",
      opensOn: "2026-11-30",
    });
    expect(
      await confirmBankAction(SHOP, { code: "123456", bank: account() }),
    ).toEqual({ ok: false, failure: "phoneHold", opensOn: "2026-11-30" });
  });
});

describe("the log", () => {
  it("holds a failure's code and nothing typed", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = Object.assign(new Error("000000018 100001 נועה"), {
      code: "XX000",
    });
    mocks.saveEmployeeDetails.mockRejectedValue(failing);
    expect(await saveFileStepAction(SHOP, "identity", identity)).toEqual({
      ok: false,
      failure: "failed",
    });
    expect(
      await confirmBankAction(SHOP, { code: "123456", bank: account() }),
    ).toEqual({ ok: false, failure: "failed" });
    const said = JSON.stringify(logged.mock.calls);
    for (const value of ["000000018", "100001", "נועה", "123456"]) {
      expect(said).not.toContain(value);
    }
    expect(said).toContain("XX000");
  });
});
