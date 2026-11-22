import { beforeEach, describe, expect, it, vi } from "vitest";

// A holder's actions on someone's hiring file (profile H6a), with what they
// read and write stood in for: the session's member, the modules on, the
// file's server code (@db/employee-files), the sign-in codes
// (app/(auth)/otp) and the request's cookies. The step-up's cookie is the
// real one, signed with a key of the test's own. They hold the rules: no
// action for a view session, another business than the screen's, the
// module off or someone without the files; the code only to the number the
// holder signs in with now and only after the duties; the files opened only
// by a right code for the holder's own number; a reveal that never reaches
// the database without a fresh step-up; keeping open that never opens; and
// nothing typed or shown in a log.

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  currentMember: vi.fn(),
  currentModules: vi.fn(),
  currentModuleSettings: vi.fn(),
  acknowledgeFileDuties: vi.fn(),
  getFileHolderState: vi.fn(),
  hasEmployeeKeys: vi.fn(),
  revealEmployeeFields: vi.fn(),
  sendCode: vi.fn(),
  checkCode: vi.fn(),
  signInPhoneOf: vi.fn(),
  refresh: vi.fn(),
  cookies: new Map<string, string>(),
  set: vi.fn(),
  deleted: vi.fn(),
}));
vi.mock("next/cache", () => ({ refresh: mocks.refresh }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = mocks.cookies.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set: (name: string, value: string, options: unknown) => {
      mocks.cookies.set(name, value);
      mocks.set(name, value, options);
    },
    delete: (options: { name: string }) => {
      mocks.cookies.delete(options.name);
      mocks.deleted(options);
    },
  }),
  headers: async () => new Headers({ host: "127.0.0.1:3000" }),
}));
vi.mock("../../../member", () => ({ currentMember: mocks.currentMember }));
vi.mock("../../../modules", () => ({
  currentModules: mocks.currentModules,
  currentModuleSettings: mocks.currentModuleSettings,
}));
vi.mock("@db/employee-files", () => ({
  acknowledgeFileDuties: mocks.acknowledgeFileDuties,
  getFileHolderState: mocks.getFileHolderState,
  hasEmployeeKeys: mocks.hasEmployeeKeys,
  revealEmployeeFields: mocks.revealEmployeeFields,
}));
vi.mock("../../../../(auth)/otp", () => ({
  sendCode: mocks.sendCode,
  checkCode: mocks.checkCode,
  signInPhoneOf: mocks.signInPhoneOf,
}));

const {
  acknowledgeDutiesAction,
  confirmFileCodeAction,
  keepFileOpenAction,
  lockFileAction,
  revealHolderFieldAction,
  sendFileCodeAction,
} = await import("./actions");
const { fileStepUpAt, sealFileStepUp } = await import("@db/file-step-up");
const { FILE_STEP_UP_COOKIE } = await import("@domain/file-holders");

const SHOP = "11111111-1111-4111-a111-111111111111";
const OTHER = "22222222-2222-4222-a222-222222222222";
const URI = "33333333-3333-4333-a333-333333333333";
const NOA = "44444444-4444-4444-a444-444444444444";
const SOMEONE = "55555555-5555-4555-a555-555555555555";
const URI_PHONE = "+972500000001";
const CODE = "123456";

/** Uri, the shop's owner, as the session reads him. */
const uri = (over: Record<string, unknown> = {}) => ({
  userId: URI,
  phone: "+972500000098",
  viewing: null,
  membership: {
    role: "owner",
    perms: [],
    business: {
      id: SHOP,
      name: "Shop",
      place: { timeZone: "Asia/Jerusalem" },
    },
  },
  ...over,
});

/** A step-up cookie as the server signs it, at `atMs`. */
const opened = (atMs = Date.now(), business = SHOP, holder = URI) =>
  mocks.cookies.set(
    FILE_STEP_UP_COOKIE,
    sealFileStepUp({ business, holder, atMs }),
  );

/** The moment the cookie says, for Uri in the shop. */
const openedAt = () =>
  fileStepUpAt(mocks.cookies.get(FILE_STEP_UP_COOKIE), {
    business: SHOP,
    holder: URI,
  });

beforeEach(() => {
  vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_file_actions_test");
  mocks.cookies.clear();
  mocks.set.mockReset();
  mocks.deleted.mockReset();
  mocks.refresh.mockReset();
  mocks.currentMember.mockReset().mockResolvedValue(uri());
  mocks.currentModules.mockReset().mockResolvedValue(["employee_files"]);
  mocks.currentModuleSettings.mockReset().mockResolvedValue({
    askBank: true,
    askAddress: true,
    form101: "print",
  });
  mocks.acknowledgeFileDuties.mockReset().mockResolvedValue(true);
  mocks.getFileHolderState.mockReset().mockResolvedValue("ready");
  mocks.hasEmployeeKeys.mockReset().mockReturnValue(true);
  mocks.revealEmployeeFields.mockReset().mockResolvedValue({
    ok: true,
    id: null,
    bankAccount: "100001",
  });
  mocks.sendCode.mockReset().mockResolvedValue(null);
  mocks.checkCode.mockReset().mockResolvedValue({ userId: URI });
  mocks.signInPhoneOf.mockReset().mockResolvedValue(URI_PHONE);
});

/** Every action that acts for a holder, bound as the page binds them. */
const actions = {
  acknowledge: (business: string) => acknowledgeDutiesAction(business),
  send: (business: string) => sendFileCodeAction(business),
  confirm: (business: string) => confirmFileCodeAction(business, CODE),
  reveal: (business: string) =>
    revealHolderFieldAction(business, NOA, "bank_account"),
};

describe("who may act on a file", () => {
  const refused = async (business = SHOP) => {
    const answers = await Promise.all(
      Object.values(actions).map((act) => act(business)),
    );
    return answers.map((answer) => (answer.ok ? "ok" : answer.failure));
  };

  it("nobody viewing as a role", async () => {
    mocks.currentMember.mockResolvedValue(
      uri({ viewing: { role: "owner", businessSlug: "shop" } }),
    );
    opened();
    expect(await refused()).toEqual([
      "viewOnly",
      "viewOnly",
      "viewOnly",
      "viewOnly",
    ]);
    expect(await keepFileOpenAction(SHOP)).toEqual({ open: false });
  });

  it("only in the business the screen was drawn for", async () => {
    opened();
    expect(await refused(OTHER)).toEqual([
      "businessChanged",
      "businessChanged",
      "businessChanged",
      "businessChanged",
    ]);
    expect(await keepFileOpenAction(OTHER)).toEqual({ open: false });
  });

  it("nothing with the module off", async () => {
    mocks.currentModules.mockResolvedValue(["scheduling"]);
    expect(await refused()).toEqual(["off", "off", "off", "off"]);
  });

  it("nothing for someone without the files", async () => {
    mocks.currentMember.mockResolvedValue(
      uri({
        membership: {
          role: "manager",
          perms: ["team.view", "team.edit"],
          business: {
            id: SHOP,
            name: "Shop",
            place: { timeZone: "Asia/Jerusalem" },
          },
        },
      }),
    );
    opened();
    expect(await refused()).toEqual([
      "noAccess",
      "noAccess",
      "noAccess",
      "noAccess",
    ]);
    expect(mocks.acknowledgeFileDuties).not.toHaveBeenCalled();
    expect(mocks.sendCode).not.toHaveBeenCalled();
    expect(mocks.checkCode).not.toHaveBeenCalled();
    expect(mocks.revealEmployeeFields).not.toHaveBeenCalled();
  });

  it("lets the accountant, who holds them by role", async () => {
    mocks.currentMember.mockResolvedValue(
      uri({
        membership: {
          role: "accountant",
          perms: ["clock.payroll", "people.files"],
          business: {
            id: SHOP,
            name: "Shop",
            place: { timeZone: "Asia/Jerusalem" },
          },
        },
      }),
    );
    expect(await acknowledgeDutiesAction(SHOP)).toEqual({
      ok: true,
      open: false,
    });
  });
});

describe("the duties", () => {
  it("are confirmed under the session, and say whether the files are open here", async () => {
    expect(await acknowledgeDutiesAction(SHOP)).toEqual({
      ok: true,
      open: false,
    });
    expect(mocks.acknowledgeFileDuties).toHaveBeenCalledWith(SHOP);
    opened();
    expect(await acknowledgeDutiesAction(SHOP)).toEqual({
      ok: true,
      open: true,
    });
  });

  it("refused by the database are no access", async () => {
    mocks.acknowledgeFileDuties.mockResolvedValue(false);
    expect(await acknowledgeDutiesAction(SHOP)).toEqual({
      ok: false,
      failure: "noAccess",
    });
  });
});

describe("the code", () => {
  it("goes to the number the holder signs in with now, never the profile's", async () => {
    expect(await sendFileCodeAction(SHOP)).toEqual({ ok: true, tail: "0001" });
    expect(mocks.signInPhoneOf).toHaveBeenCalledWith(URI);
    expect(mocks.sendCode).toHaveBeenCalledWith(URI_PHONE);
  });

  it("waits for the duties, and goes nowhere without the keys", async () => {
    mocks.getFileHolderState.mockResolvedValue("ack");
    expect(await sendFileCodeAction(SHOP)).toEqual({
      ok: false,
      failure: "ack",
    });
    mocks.getFileHolderState.mockResolvedValue("not_holder");
    expect(await sendFileCodeAction(SHOP)).toEqual({
      ok: false,
      failure: "noAccess",
    });
    mocks.hasEmployeeKeys.mockReturnValue(false);
    expect(await sendFileCodeAction(SHOP)).toEqual({
      ok: false,
      failure: "keys",
    });
    expect(mocks.sendCode).not.toHaveBeenCalled();
  });

  it("says what kept it back", async () => {
    mocks.sendCode.mockResolvedValue("rateLimit");
    expect(await sendFileCodeAction(SHOP)).toMatchObject({
      failure: "rateLimit",
    });
    mocks.sendCode.mockResolvedValue("invalidPhone");
    expect(await sendFileCodeAction(SHOP)).toMatchObject({
      failure: "noPhone",
    });
    mocks.signInPhoneOf.mockResolvedValue(null);
    expect(await sendFileCodeAction(SHOP)).toMatchObject({
      failure: "noPhone",
    });
  });

  it("opens the files on this device only once it is right and the holder's", async () => {
    expect(await confirmFileCodeAction(SHOP, "12")).toEqual({
      ok: false,
      failure: "wrongCode",
    });
    expect(mocks.checkCode).not.toHaveBeenCalled();
    mocks.checkCode.mockResolvedValueOnce({ error: "wrongCode" });
    expect(await confirmFileCodeAction(SHOP, CODE)).toEqual({
      ok: false,
      failure: "wrongCode",
    });
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.checkCode.mockResolvedValueOnce({ userId: SOMEONE });
    expect(await confirmFileCodeAction(SHOP, CODE)).toEqual({
      ok: false,
      failure: "failed",
    });
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.checkCode).toHaveBeenCalledWith(URI_PHONE, CODE);

    const before = Date.now();
    expect(await confirmFileCodeAction(SHOP, ` ${CODE} `)).toEqual({
      ok: true,
    });
    expect(openedAt()).toBeGreaterThanOrEqual(before);
    const [name, , options] = mocks.set.mock.calls[0] ?? [];
    expect(name).toBe(FILE_STEP_UP_COOKIE);
    expect(options).toMatchObject({
      httpOnly: true,
      sameSite: "strict",
      path: "/team",
      maxAge: 900,
    });
    expect(mocks.refresh).toHaveBeenCalled();
    expect(JSON.stringify(logged.mock.calls)).not.toContain(CODE);
  });
});

describe("a reveal", () => {
  it("never reaches the database without a fresh step-up", async () => {
    expect(await revealHolderFieldAction(SHOP, NOA, "bank_account")).toEqual({
      ok: false,
      failure: "stepUp",
    });
    opened(Date.now() - 16 * 60_000);
    expect(await revealHolderFieldAction(SHOP, NOA, "bank_account")).toEqual({
      ok: false,
      failure: "stepUp",
    });
    // Another holder's on this device opens nothing for Uri.
    opened(Date.now(), SHOP, SOMEONE);
    expect(await revealHolderFieldAction(SHOP, NOA, "bank_account")).toEqual({
      ok: false,
      failure: "stepUp",
    });
    expect(mocks.revealEmployeeFields).not.toHaveBeenCalled();
  });

  it("shows one number, and slides the 15 minutes", async () => {
    const earlier = Date.now() - 10 * 60_000;
    opened(earlier);
    expect(await revealHolderFieldAction(SHOP, NOA, "bank_account")).toEqual({
      ok: true,
      value: "100001",
    });
    expect(mocks.revealEmployeeFields).toHaveBeenCalledWith(SHOP, NOA, [
      "bank_account",
    ]);
    expect(openedAt()).toBeGreaterThan(earlier);
  });

  it("says the hour's limit and the duties, and refuses what isn't a person or a number", async () => {
    opened();
    mocks.revealEmployeeFields.mockResolvedValueOnce({
      ok: false,
      failure: "denied",
      reason: "limit",
    });
    expect(await revealHolderFieldAction(SHOP, NOA, "id")).toEqual({
      ok: false,
      failure: "limit",
    });
    mocks.revealEmployeeFields.mockResolvedValueOnce({
      ok: false,
      failure: "denied",
      reason: "not_member",
    });
    expect(await revealHolderFieldAction(SHOP, NOA, "id")).toEqual({
      ok: false,
      failure: "noAccess",
    });
    expect(await revealHolderFieldAction(SHOP, "noa", "id")).toMatchObject({
      ok: false,
    });
    expect(await revealHolderFieldAction(SHOP, NOA, "address")).toMatchObject({
      ok: false,
    });
    expect(mocks.revealEmployeeFields).toHaveBeenCalledTimes(2);
  });

  it("logs no number", async () => {
    opened();
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.revealEmployeeFields.mockRejectedValueOnce(
      Object.assign(new Error("100001"), { code: "XX000" }),
    );
    expect(await revealHolderFieldAction(SHOP, NOA, "bank_account")).toEqual({
      ok: false,
      failure: "failed",
    });
    expect(JSON.stringify(logged.mock.calls)).not.toContain("100001");
  });
});

describe("keeping a file open and locking it", () => {
  it("keeps open only a fresh step-up, and never makes one", async () => {
    expect(await keepFileOpenAction(SHOP)).toEqual({ open: false });
    expect(mocks.set).not.toHaveBeenCalled();
    opened(Date.now() - 60_000);
    expect(await keepFileOpenAction(SHOP)).toEqual({ open: true });
    expect(mocks.set).toHaveBeenCalledTimes(1);
  });

  it("locks by deleting the cookie, on the team's path", async () => {
    opened();
    expect(await lockFileAction(SHOP)).toEqual({ ok: true });
    expect(mocks.deleted).toHaveBeenCalledWith({
      name: FILE_STEP_UP_COOKIE,
      path: "/team",
    });
    expect(mocks.cookies.has(FILE_STEP_UP_COOKIE)).toBe(false);
    expect(mocks.refresh).toHaveBeenCalled();
  });
});
