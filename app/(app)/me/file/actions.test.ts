import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The worker's own file's writes (profile H5a) with what they read and write
// stood in for: the session's member (`currentMember`), the modules on, the
// file's server code (@db/employee-files) and the sign-in codes
// (app/(auth)/otp). They hold the rules a write keeps: nothing for a view
// session or another business than the screen's, the person always the
// session's own, the bank's code only to the number they sign in with now
// (never the profile's copy) and only for an account that could be kept,
// checked without touching the browser's session, noted only once it was
// right and theirs, and nothing typed in a log. H5b: step 2's work language
// and emergency contact, the 101's route from the business's settings,
// "לא שיניתי", and the account just added kept seen by its own save's
// moment, never one read afterwards. Today's "אני שיניתי" is a route's
// (home/bank-seen/route.test.ts).

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  currentMember: vi.fn(),
  currentModules: vi.fn(),
  currentModuleSettings: vi.fn(),
  saveEmployeeDetails: vi.fn(),
  saveEmergencyContact: vi.fn(),
  disputeBankChange: vi.fn(),
  getEmployeeFile: vi.fn(),
  rememberBankChangeSeen: vi.fn(),
  checkBankChange: vi.fn(),
  revealEmployeeFields: vi.fn(),
  noteStepUp: vi.fn(),
  setTaxYearStatus: vi.fn(),
  submitEmployeeFile: vi.fn(),
  sendCode: vi.fn(),
  checkCode: vi.fn(),
  signInPhoneOf: vi.fn(),
  refresh: vi.fn(),
  order: [] as string[],
}));
vi.mock("next/cache", () => ({ refresh: mocks.refresh }));
vi.mock("../../member", () => ({ currentMember: mocks.currentMember }));
vi.mock("../../modules", () => ({
  currentModules: mocks.currentModules,
  currentModuleSettings: mocks.currentModuleSettings,
}));
vi.mock("../../business-cookie", () => ({
  rememberBankChangeSeen: mocks.rememberBankChangeSeen,
}));
vi.mock("@db/employee-files", () => ({
  saveEmployeeDetails: mocks.saveEmployeeDetails,
  saveEmergencyContact: mocks.saveEmergencyContact,
  disputeBankChange: mocks.disputeBankChange,
  getEmployeeFile: mocks.getEmployeeFile,
  checkBankChange: mocks.checkBankChange,
  revealEmployeeFields: mocks.revealEmployeeFields,
  noteStepUp: mocks.noteStepUp,
  setTaxYearStatus: mocks.setTaxYearStatus,
  submitEmployeeFile: mocks.submitEmployeeFile,
}));
vi.mock("../../../(auth)/otp", () => ({
  sendCode: mocks.sendCode,
  checkCode: mocks.checkCode,
  signInPhoneOf: mocks.signInPhoneOf,
}));

const {
  confirmBankAction,
  disputeBankChangeAction,
  handInForm101Action,
  revealOwnAction,
  saveFileStepAction,
  sendBankCodeAction,
  submitFileAction,
} = await import("./actions");

/** The file's settings as the manifest defaults them: everything asked, Form 101 on paper. */
const DEFAULTS = {
  askBank: true,
  askAddress: true,
  askEmergencyContact: false,
  askWorkLanguage: false,
  form101: "print",
  form101Provider: "",
  form101Link: "",
  payrollProvider: "",
  employerName: "",
  employerPhone: "",
  deductionsFile: "",
};

/** When the database says Noa's account last changed: someone else's change, read after hers. */
const CHANGED_AT = "2026-11-20T08:00:00.123456+00:00";

const SHOP = "11111111-1111-4111-a111-111111111111";
const OTHER = "22222222-2222-4222-a222-222222222222";
const NOA = "33333333-3333-4333-a333-333333333333";
const SOMEONE = "44444444-4444-4444-a444-444444444444";
const NOA_PHONE = "+972500000003";
/** The profile's copy of her number, from before the team changed it. */
const NOA_OLD_PHONE = "+972500000098";

/** Noa, a worker in the shop, as the session reads her. */
const noa = (over: Record<string, unknown> = {}) => ({
  userId: NOA,
  phone: NOA_OLD_PHONE,
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
  mocks.currentModuleSettings.mockReset().mockResolvedValue(DEFAULTS);
  mocks.saveEmergencyContact.mockReset().mockImplementation(async () => {
    mocks.order.push("contact");
    return { ok: true };
  });
  mocks.disputeBankChange.mockReset().mockResolvedValue({ ok: true });
  mocks.getEmployeeFile.mockReset().mockResolvedValue({
    ok: true,
    file: { bank_changed_at: CHANGED_AT },
  });
  mocks.rememberBankChangeSeen.mockReset().mockResolvedValue(undefined);
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
  mocks.checkBankChange.mockReset().mockImplementation(async () => {
    mocks.order.push("try");
    return { ok: true };
  });
  mocks.signInPhoneOf.mockReset().mockResolvedValue(NOA_PHONE);
  mocks.sendCode.mockReset().mockImplementation(async () => {
    mocks.order.push("send");
    return null;
  });
  mocks.checkCode.mockReset().mockImplementation(async () => {
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
  sendBankCodeAction(business, { bank: account() }),
  confirmBankAction(business, { code: "123456", bank: account() }),
  handInForm101Action(business),
  submitFileAction(business),
  disputeBankChangeAction(business),
];

const nothingCalled = () => {
  for (const fn of [
    mocks.saveEmployeeDetails,
    mocks.revealEmployeeFields,
    mocks.noteStepUp,
    mocks.setTaxYearStatus,
    mocks.submitEmployeeFile,
    mocks.checkBankChange,
    mocks.signInPhoneOf,
    mocks.sendCode,
    mocks.checkCode,
    mocks.saveEmergencyContact,
    mocks.disputeBankChange,
    mocks.getEmployeeFile,
    mocks.rememberBankChangeSeen,
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
  const send = () => sendBankCodeAction(SHOP, { bank: account() });

  it("goes to the number she signs in with now, never the profile's copy or the call's", async () => {
    expect(await send()).toEqual({ ok: true, tail: "0003" });
    expect(mocks.signInPhoneOf).toHaveBeenCalledWith(NOA);
    expect(mocks.sendCode).toHaveBeenCalledWith(NOA_PHONE);
    expect(mocks.sendCode).not.toHaveBeenCalledWith(NOA_OLD_PHONE);
    // A number from the browser is no part of either call.
    expect(
      await sendBankCodeAction(SHOP, {
        bank: account(),
        phone: "+972500000999",
      } as never),
    ).toEqual({ ok: false, failure: "invalid" });
    expect(
      await confirmBankAction(SHOP, {
        code: "123456",
        bank: account(),
        phone: "+972500000999",
      } as never),
    ).toEqual({ ok: false, failure: "invalid" });
    await confirmBankAction(SHOP, { code: "123456", bank: account() });
    expect(mocks.checkCode).toHaveBeenCalledWith(NOA_PHONE, "123456");
  });

  it("goes only for an account that could be kept, tried before any SMS", async () => {
    await send();
    expect(mocks.order).toEqual(["try", "send"]);
    expect(mocks.checkBankChange).toHaveBeenCalledWith(
      NOA,
      SHOP,
      account(),
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    );
    // Not an account at all: nothing tried, nothing sent.
    mocks.order = [];
    expect(
      await sendBankCodeAction(SHOP, {
        bank: { ...account(), holder: "friend" },
      }),
    ).toEqual({ ok: false, failure: "invalid" });
    expect(mocks.order).toEqual([]);
  });

  // The week after a phone change: said with the day it opens, before an
  // SMS goes to a number the hold doesn't trust, and counted nowhere.
  it("goes nowhere in the week after a phone change, and says the day and the moment", async () => {
    mocks.checkBankChange.mockResolvedValue({
      ok: false,
      failure: "phoneHold",
      opensOn: "2026-11-30",
      opensAt: "2026-11-30T08:00:00.000Z",
    });
    expect(await send()).toEqual({
      ok: false,
      failure: "phoneHold",
      opensOn: "2026-11-30",
      opensAt: "2026-11-30T08:00:00.000Z",
    });
    mocks.checkBankChange.mockResolvedValue({ ok: false, failure: "demo" });
    expect(await send()).toEqual({ ok: false, failure: "demo" });
    expect(mocks.signInPhoneOf).not.toHaveBeenCalled();
    expect(mocks.sendCode).not.toHaveBeenCalled();
  });

  it("goes nowhere without a number", async () => {
    mocks.signInPhoneOf.mockResolvedValue(null);
    expect(await send()).toEqual({ ok: false, failure: "noPhone" });
    expect(
      await confirmBankAction(SHOP, { code: "123456", bank: account() }),
    ).toEqual({ ok: false, failure: "noPhone" });
    expect(mocks.sendCode).not.toHaveBeenCalled();
    expect(mocks.checkCode).not.toHaveBeenCalled();
  });

  it("says the auth server's wait and the counts in their own words", async () => {
    mocks.sendCode.mockResolvedValue("rateLimit");
    expect(await send()).toEqual({ ok: false, failure: "rateLimit" });
    mocks.sendCode.mockResolvedValue("tooMany");
    expect(await send()).toEqual({ ok: false, failure: "tooMany" });
    mocks.sendCode.mockResolvedValue("failed");
    expect(await send()).toEqual({ ok: false, failure: "failed" });
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
      { atTime: expect.any(Date) },
    );
  });

  it("keeps the account just added as seen on this device, by its own save's moment", async () => {
    // Read afterwards, the file would hold someone else's change made a
    // moment later: it is never read.
    mocks.getEmployeeFile.mockResolvedValue({
      ok: true,
      file: { bank_changed_at: CHANGED_AT },
    });
    const before = Date.now();
    expect(
      await confirmBankAction(SHOP, { code: "123456", bank: account() }),
    ).toEqual({ ok: true, review: "new" });
    expect(mocks.order).toEqual(["verify", "stepUp", "save"]);
    expect(mocks.getEmployeeFile).not.toHaveBeenCalled();
    // The moment the save was dated with, which the database keeps as the
    // change's (`set_employee_details` dates it by `at_time`).
    const at = mocks.saveEmployeeDetails.mock.calls[0]?.[5]?.atTime as Date;
    expect(at.getTime()).toBeGreaterThanOrEqual(before);
    expect(at.getTime()).toBeLessThanOrEqual(Date.now());
    // Made here: the bank step on this device doesn't ask "לא שיניתי" of it.
    expect(mocks.rememberBankChangeSeen).toHaveBeenCalledWith(
      { business: SHOP, person: NOA, changedAt: at.toISOString() },
      "made",
    );
    expect(mocks.rememberBankChangeSeen).not.toHaveBeenCalledWith(
      expect.objectContaining({ changedAt: CHANGED_AT }),
      expect.anything(),
    );
  });

  it("keeps nothing seen when the save changed no account", async () => {
    mocks.saveEmployeeDetails.mockResolvedValue({
      ok: true,
      changed: [],
      changeDueBy: null,
    });
    expect(
      await confirmBankAction(SHOP, { code: "123456", bank: account() }),
    ).toEqual({ ok: true, review: "new" });
    expect(mocks.rememberBankChangeSeen).not.toHaveBeenCalled();
  });

  it("says the account is in though its change couldn't be kept seen", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.rememberBankChangeSeen.mockRejectedValue(
      Object.assign(new Error("100001"), { code: "XX000" }),
    );
    expect(
      await confirmBankAction(SHOP, { code: "123456", bank: account() }),
    ).toEqual({ ok: true, review: "new" });
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    const said = JSON.stringify(logged.mock.calls);
    expect(said).toContain("XX000");
    expect(said).not.toContain("100001");
  });

  it("keeps nothing seen when the account wasn't saved", async () => {
    mocks.saveEmployeeDetails.mockResolvedValue({
      ok: false,
      failure: "invalid",
    });
    expect(
      await confirmBankAction(SHOP, { code: "123456", bank: account() }),
    ).toEqual({ ok: false, failure: "invalid" });
    expect(mocks.getEmployeeFile).not.toHaveBeenCalled();
    expect(mocks.rememberBankChangeSeen).not.toHaveBeenCalled();
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
    mocks.checkCode.mockResolvedValue({ error: "wrongCode" });
    expect(
      await confirmBankAction(SHOP, { code: "123456", bank: account() }),
    ).toEqual({ ok: false, failure: "wrongCode" });
    mocks.checkCode.mockResolvedValue({ error: "tooMany" });
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
    mocks.checkCode.mockResolvedValue({ userId: SOMEONE });
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
    expect(mocks.checkCode).not.toHaveBeenCalled();
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

describe("step 2's ways to reach the person", () => {
  const contact = { name: "דוד כהן", phone: "052-000-0099" };

  it("saves the details first, then the contact apart from them", async () => {
    expect(
      await saveFileStepAction(SHOP, "address", {
        email: null,
        workLanguage: "ערבית",
        emergency: contact,
      }),
    ).toEqual({ ok: true, changeDueBy: null });
    expect(mocks.order).toEqual(["save", "contact"]);
    expect(mocks.saveEmployeeDetails).toHaveBeenCalledWith(
      NOA,
      SHOP,
      NOA,
      { email: null, workLanguage: "ערבית" },
      expect.any(String),
    );
    expect(mocks.saveEmergencyContact).toHaveBeenCalledWith(NOA, SHOP, contact);
  });

  it("removes the contact with null, and leaves it alone when it isn't sent", async () => {
    await saveFileStepAction(SHOP, "address", { email: null, emergency: null });
    expect(mocks.saveEmergencyContact).toHaveBeenCalledWith(NOA, SHOP, null);
    mocks.saveEmergencyContact.mockClear();
    await saveFileStepAction(SHOP, "address", { email: null });
    expect(mocks.saveEmergencyContact).not.toHaveBeenCalled();
  });

  it("says a contact refused, after the details went in", async () => {
    mocks.saveEmergencyContact.mockResolvedValue({
      ok: false,
      failure: "invalid",
    });
    expect(
      await saveFileStepAction(SHOP, "address", {
        email: null,
        emergency: { name: "ד", phone: "03-123-4567" },
      }),
    ).toEqual({ ok: false, failure: "invalid" });
    expect(mocks.saveEmployeeDetails).toHaveBeenCalled();
  });

  it("saves no contact when the details were refused", async () => {
    mocks.saveEmployeeDetails.mockResolvedValue({
      ok: false,
      failure: "invalid",
    });
    expect(
      await saveFileStepAction(SHOP, "address", {
        email: "x",
        emergency: contact,
      }),
    ).toEqual({ ok: false, failure: "invalid" });
    expect(mocks.saveEmergencyContact).not.toHaveBeenCalled();
  });

  it("takes a contact of its own shape only", async () => {
    expect(
      await saveFileStepAction(SHOP, "address", {
        email: null,
        emergency: { ...contact, relation: "אח" },
      }),
    ).toEqual({ ok: false, failure: "invalid" });
    expect(mocks.saveEmployeeDetails).not.toHaveBeenCalled();
  });
});

describe("Form 101's route", () => {
  it("is the business's way, never the screen's", async () => {
    mocks.currentModuleSettings.mockResolvedValue({
      ...DEFAULTS,
      form101: "link",
      form101Link: "https://101.example/noa",
    });
    expect(await handInForm101Action(SHOP)).toEqual({ ok: true });
    expect(mocks.setTaxYearStatus).toHaveBeenCalledWith(
      NOA,
      SHOP,
      NOA,
      expect.objectContaining({ status: "handed_in", route: "link" }),
    );
  });

  it("is on paper while a link is chosen but none is set", async () => {
    mocks.currentModuleSettings.mockResolvedValue({
      ...DEFAULTS,
      form101: "link",
    });
    await handInForm101Action(SHOP);
    expect(mocks.setTaxYearStatus).toHaveBeenCalledWith(
      NOA,
      SHOP,
      NOA,
      expect.objectContaining({ route: "print" }),
    );
  });

  it("marks nothing while the business takes it outside the app", async () => {
    mocks.currentModuleSettings.mockResolvedValue({
      ...DEFAULTS,
      form101: "off",
    });
    expect(await handInForm101Action(SHOP)).toEqual({
      ok: false,
      failure: "invalid",
    });
    expect(mocks.setTaxYearStatus).not.toHaveBeenCalled();
  });
});

describe("a bank change said not theirs", () => {
  it("is disputed for the session's own file, and keeps nothing seen", async () => {
    expect(await disputeBankChangeAction(SHOP)).toEqual({ ok: true });
    expect(mocks.disputeBankChange).toHaveBeenCalledWith(NOA, SHOP);
    expect(mocks.refresh).toHaveBeenCalled();
    mocks.disputeBankChange.mockResolvedValue({ ok: false, failure: "demo" });
    expect(await disputeBankChangeAction(SHOP)).toEqual({
      ok: false,
      failure: "demo",
    });
    expect(mocks.rememberBankChangeSeen).not.toHaveBeenCalled();
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
    mocks.saveEmployeeDetails.mockResolvedValue({
      ok: true,
      changed: [],
      changeDueBy: null,
    });
    mocks.saveEmergencyContact.mockRejectedValue(
      Object.assign(new Error("דוד 0520000099"), { code: "XX000" }),
    );
    expect(
      await saveFileStepAction(SHOP, "address", {
        email: null,
        workLanguage: "ערבית",
        emergency: { name: "דוד", phone: "0520000099" },
      }),
    ).toEqual({ ok: false, failure: "failed" });
    const said = JSON.stringify(logged.mock.calls);
    for (const value of [
      "000000018",
      "100001",
      "נועה",
      "123456",
      "דוד",
      "0520000099",
      "ערבית",
    ]) {
      expect(said).not.toContain(value);
    }
    expect(said).toContain("XX000");
  });
});
