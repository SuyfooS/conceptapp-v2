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
// the database without a fresh step-up; keeping open that never opens,
// under the same gate both ways, and slides only for activity (a tab's clock
// and another tab's word only read how long is left); and nothing typed or
// shown in a log. Each is a POST, which Next answers no-store. The
// database's step-up for this sign-in (20261127000400_file_step_up.sql) is
// stood in for, with the session's claims: opened before the cookie is set,
// slid with it, closed with it, and a cookie it no longer backs closed too;
// and in the week after a phone change no code goes and none is checked.

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  currentMember: vi.fn(),
  currentModules: vi.fn(),
  currentModuleSettings: vi.fn(),
  acknowledgeFileDuties: vi.fn(),
  getFileHolderState: vi.fn(),
  hasEmployeeKeys: vi.fn(),
  revealEmployeeFields: vi.fn(),
  acknowledgeBank: vi.fn(),
  markDirectGroup: vi.fn(),
  phoneChangeHold: vi.fn(),
  openFileStepUp: vi.fn(),
  keepFileStepUp: vi.fn(),
  closeFileStepUp: vi.fn(),
  currentAuthSession: vi.fn(),
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
  acknowledgeBank: mocks.acknowledgeBank,
  markDirectGroup: mocks.markDirectGroup,
  phoneChangeHold: mocks.phoneChangeHold,
  openFileStepUp: mocks.openFileStepUp,
  keepFileStepUp: mocks.keepFileStepUp,
  closeFileStepUp: mocks.closeFileStepUp,
}));
vi.mock("@db/session", () => ({
  currentAuthSession: mocks.currentAuthSession,
}));
vi.mock("../../../../(auth)/otp", () => ({
  sendCode: mocks.sendCode,
  checkCode: mocks.checkCode,
  signInPhoneOf: mocks.signInPhoneOf,
}));

const {
  acknowledgeBankAction,
  acknowledgeDutiesAction,
  confirmFileCodeAction,
  keepFileOpenAction,
  lockFileAction,
  markDirectGroupAction,
  revealHolderFieldAction,
  sendFileCodeAction,
} = await import("./actions");
const { fileStepUpAt, sealFileStepUp } = await import("@db/file-step-up");
const { FILE_IDLE_MS, FILE_STEP_UP_COOKIE } = await import(
  "@domain/file-holders"
);

const SHOP = "11111111-1111-4111-a111-111111111111";
const OTHER = "22222222-2222-4222-a222-222222222222";
const URI = "33333333-3333-4333-a333-333333333333";
const NOA = "44444444-4444-4444-a444-444444444444";
const SOMEONE = "55555555-5555-4555-a555-555555555555";
/** Uri's sign-in on this device, as the auth server names it. */
const SESSION = "66666666-6666-4666-a666-666666666666";
/** The week after a phone change, as `phoneChangeHold` reads it. */
const HOLD = { opensOn: "2026-11-30", opensAt: "2026-11-30T08:00:00.000Z" };
const URI_PHONE = "+972500000001";
const CODE = "123456";
/** The account's last change as the database writes it. */
const MOMENT = "2026-11-20T08:00:00.123456+00:00";

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
  mocks.acknowledgeBank.mockReset().mockResolvedValue({ ok: true });
  mocks.markDirectGroup
    .mockReset()
    .mockResolvedValue({ ok: true, changed: true });
  mocks.sendCode.mockReset().mockResolvedValue(null);
  mocks.checkCode.mockReset().mockResolvedValue({ userId: URI });
  mocks.signInPhoneOf.mockReset().mockResolvedValue(URI_PHONE);
  mocks.phoneChangeHold.mockReset().mockResolvedValue({ ok: true, hold: null });
  mocks.openFileStepUp.mockReset().mockResolvedValue({ ok: true });
  mocks.keepFileStepUp.mockReset().mockResolvedValue(true);
  mocks.closeFileStepUp.mockReset().mockResolvedValue(undefined);
  mocks.currentAuthSession
    .mockReset()
    .mockResolvedValue({ userId: URI, sessionId: SESSION });
});

/** Keeping open, for activity here and only to read, as the watch asks: closed both ways. */
const keepsClosed = async (business = SHOP) => {
  expect(await keepFileOpenAction(business, true)).toEqual({ open: false });
  expect(await keepFileOpenAction(business, false)).toEqual({ open: false });
};

/** Every action that acts for a holder, bound as the page binds them. */
const actions = {
  acknowledge: (business: string) => acknowledgeDutiesAction(business),
  send: (business: string) => sendFileCodeAction(business),
  confirm: (business: string) => confirmFileCodeAction(business, CODE),
  reveal: (business: string) =>
    revealHolderFieldAction(business, NOA, "bank_account"),
  confirmAccount: (business: string) =>
    acknowledgeBankAction(business, NOA, MOMENT),
  mark: (business: string) =>
    markDirectGroupAction(business, NOA, "bank", true),
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
      "viewOnly",
      "viewOnly",
    ]);
    await keepsClosed();
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("only in the business the screen was drawn for", async () => {
    opened();
    expect(await refused(OTHER)).toEqual([
      "businessChanged",
      "businessChanged",
      "businessChanged",
      "businessChanged",
      "businessChanged",
      "businessChanged",
    ]);
    await keepsClosed(OTHER);
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("nothing with the module off", async () => {
    mocks.currentModules.mockResolvedValue(["scheduling"]);
    opened();
    expect(await refused()).toEqual(["off", "off", "off", "off", "off", "off"]);
    await keepsClosed();
    expect(mocks.set).not.toHaveBeenCalled();
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
      "noAccess",
      "noAccess",
    ]);
    await keepsClosed();
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.acknowledgeFileDuties).not.toHaveBeenCalled();
    expect(mocks.sendCode).not.toHaveBeenCalled();
    expect(mocks.checkCode).not.toHaveBeenCalled();
    expect(mocks.revealEmployeeFields).not.toHaveBeenCalled();
    expect(mocks.acknowledgeBank).not.toHaveBeenCalled();
    expect(mocks.markDirectGroup).not.toHaveBeenCalled();
    expect(mocks.phoneChangeHold).not.toHaveBeenCalled();
    expect(mocks.openFileStepUp).not.toHaveBeenCalled();
    expect(mocks.keepFileStepUp).not.toHaveBeenCalled();
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
    expect(mocks.openFileStepUp).not.toHaveBeenCalled();
    expect(mocks.checkCode).toHaveBeenCalledWith(URI_PHONE, CODE);

    const before = Date.now();
    expect(await confirmFileCodeAction(SHOP, ` ${CODE} `)).toEqual({
      ok: true,
    });
    expect(openedAt()).toBeGreaterThanOrEqual(before);
    // On this sign-in in the database first, and only then on this device.
    expect(mocks.openFileStepUp).toHaveBeenCalledWith(URI, SHOP, SESSION);
    expect(mocks.openFileStepUp.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.set.mock.invocationCallOrder[0] ?? 0,
    );
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

  it("goes nowhere in the week after the holder's own phone change, and says when it ends", async () => {
    mocks.phoneChangeHold.mockResolvedValue({ ok: true, hold: HOLD });
    expect(await sendFileCodeAction(SHOP)).toEqual({
      ok: false,
      failure: "phoneHold",
      ...HOLD,
    });
    expect(mocks.phoneChangeHold).toHaveBeenCalledWith(SHOP, URI);
    // A week that can't be read sends nothing either.
    mocks.phoneChangeHold.mockResolvedValue({ ok: false, failure: "failed" });
    expect(await sendFileCodeAction(SHOP)).toEqual({
      ok: false,
      failure: "failed",
    });
    expect(mocks.signInPhoneOf).not.toHaveBeenCalled();
    expect(mocks.sendCode).not.toHaveBeenCalled();
  });

  it("checks no code in that week, so none is spent and nothing opens", async () => {
    mocks.phoneChangeHold.mockResolvedValue({ ok: true, hold: HOLD });
    expect(await confirmFileCodeAction(SHOP, CODE)).toEqual({
      ok: false,
      failure: "phoneHold",
      ...HOLD,
    });
    expect(mocks.checkCode).not.toHaveBeenCalled();
    expect(mocks.openFileStepUp).not.toHaveBeenCalled();
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("opens nothing on this device when the database doesn't open the files", async () => {
    const cases = [
      [{ failure: "phoneHold", opensOn: "2026-11-30" }, "phoneHold"],
      [{ failure: "off" }, "off"],
      [{ failure: "ack" }, "ack"],
      [{ failure: "noAccess" }, "noAccess"],
      [{ failure: "unavailable" }, "unavailable"],
      [{ failure: "demo" }, "failed"],
      [{ failure: "failed" }, "failed"],
    ] as const;
    for (const [refused, said] of cases) {
      mocks.openFileStepUp.mockResolvedValueOnce({ ok: false, ...refused });
      const answer = await confirmFileCodeAction(SHOP, CODE);
      expect(answer, refused.failure).toEqual(
        said === "phoneHold"
          ? { ok: false, failure: said, opensOn: "2026-11-30" }
          : { ok: false, failure: said },
      );
    }
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.cookies.has(FILE_STEP_UP_COOKIE)).toBe(false);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("opens nothing without this sign-in's own id", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.currentAuthSession.mockResolvedValueOnce(null);
    expect(await confirmFileCodeAction(SHOP, CODE)).toEqual({
      ok: false,
      failure: "failed",
    });
    // Claims of someone else than the session's member: nothing either.
    mocks.currentAuthSession.mockResolvedValueOnce({
      userId: SOMEONE,
      sessionId: SESSION,
    });
    expect(await confirmFileCodeAction(SHOP, CODE)).toEqual({
      ok: false,
      failure: "failed",
    });
    expect(mocks.openFileStepUp).not.toHaveBeenCalled();
    expect(mocks.set).not.toHaveBeenCalled();
    expect(JSON.stringify(logged.mock.calls)).not.toContain(SESSION);
    logged.mockRestore();
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
    expect(mocks.keepFileStepUp).toHaveBeenCalledWith(URI, SHOP, SESSION);
  });

  it("closes the cookie too when the database holds no step-up for this sign-in", async () => {
    opened();
    mocks.revealEmployeeFields.mockResolvedValueOnce({
      ok: false,
      failure: "denied",
      reason: "step_up",
    });
    expect(await revealHolderFieldAction(SHOP, NOA, "bank_account")).toEqual({
      ok: false,
      failure: "stepUp",
    });
    expect(mocks.deleted).toHaveBeenCalledWith({
      name: FILE_STEP_UP_COOKIE,
      path: "/team",
    });
    expect(mocks.cookies.has(FILE_STEP_UP_COOKIE)).toBe(false);
    expect(mocks.keepFileStepUp).not.toHaveBeenCalled();
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
  it("slides only a fresh step-up, for activity, and never makes one", async () => {
    await keepsClosed();
    expect(mocks.set).not.toHaveBeenCalled();
    opened(Date.now() - 16 * 60_000);
    await keepsClosed();
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.keepFileStepUp).not.toHaveBeenCalled();

    const earlier = Date.now() - 60_000;
    opened(earlier);
    expect(await keepFileOpenAction(SHOP, true)).toEqual({
      open: true,
      leftMs: FILE_IDLE_MS,
    });
    expect(mocks.keepFileStepUp).toHaveBeenCalledWith(URI, SHOP, SESSION);
    expect(mocks.set).toHaveBeenCalledTimes(1);
    expect(openedAt()).toBeGreaterThan(earlier);
    expect(mocks.openFileStepUp).not.toHaveBeenCalled();
  });

  it("closes the cookie when the database no longer holds the step-up", async () => {
    opened(Date.now() - 60_000);
    mocks.keepFileStepUp.mockResolvedValueOnce(false);
    expect(await keepFileOpenAction(SHOP, true)).toEqual({ open: false });
    expect(mocks.cookies.has(FILE_STEP_UP_COOKIE)).toBe(false);
    expect(mocks.set).not.toHaveBeenCalled();

    // Nor without this sign-in's own id, which slides nothing there.
    opened(Date.now() - 60_000);
    mocks.currentAuthSession.mockResolvedValueOnce(null);
    expect(await keepFileOpenAction(SHOP, true)).toEqual({ open: false });
    expect(mocks.cookies.has(FILE_STEP_UP_COOKIE)).toBe(false);
    expect(mocks.keepFileStepUp).toHaveBeenCalledTimes(1);
    expect(mocks.openFileStepUp).not.toHaveBeenCalled();
  });

  it("only reads the step-up for a tab's clock or another tab's word, saying how long it has left", async () => {
    const earlier = Date.now() - 10 * 60_000;
    opened(earlier);
    const before = mocks.cookies.get(FILE_STEP_UP_COOKIE);
    const answer = await keepFileOpenAction(SHOP, false);
    expect(answer.open).toBe(true);
    const left = answer.open ? answer.leftMs : Number.NaN;
    // 5 minutes left, less the moment the test took.
    expect(left).toBeLessThanOrEqual(5 * 60_000);
    expect(left).toBeGreaterThan(4 * 60_000);
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.cookies.get(FILE_STEP_UP_COOKIE)).toBe(before);
    expect(openedAt()).toBe(earlier);
    // The database is asked nothing, and nothing is written there.
    expect(mocks.currentAuthSession).not.toHaveBeenCalled();
    expect(mocks.keepFileStepUp).not.toHaveBeenCalled();

    // A moment a little ahead (another server's clock): 15 minutes, no more.
    opened(Date.now() + 30_000);
    expect(await keepFileOpenAction(SHOP, false)).toEqual({
      open: true,
      leftMs: FILE_IDLE_MS,
    });
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("refuses a slide that isn't true or false, sliding nothing", async () => {
    opened(Date.now() - 60_000);
    for (const slide of ["true", 1, null, undefined, { slide: true }]) {
      expect(
        await keepFileOpenAction(SHOP, slide as unknown as boolean),
      ).toEqual({ open: false });
    }
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("locks by closing this sign-in's step-up and deleting the cookie, on the team's path", async () => {
    opened();
    expect(await lockFileAction(SHOP)).toEqual({ ok: true });
    expect(mocks.closeFileStepUp).toHaveBeenCalledWith(URI, SESSION);
    expect(mocks.closeFileStepUp.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.deleted.mock.invocationCallOrder[0] ?? 0,
    );
    expect(mocks.deleted).toHaveBeenCalledWith({
      name: FILE_STEP_UP_COOKIE,
      path: "/team",
    });
    expect(mocks.cookies.has(FILE_STEP_UP_COOKIE)).toBe(false);
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("locks this device even when the database can't be told", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    opened();
    mocks.currentAuthSession.mockRejectedValueOnce(
      Object.assign(new Error(SESSION), { code: "XX000" }),
    );
    expect(await lockFileAction(SHOP)).toEqual({ ok: true });
    expect(mocks.cookies.has(FILE_STEP_UP_COOKIE)).toBe(false);
    expect(JSON.stringify(logged.mock.calls)).not.toContain(SESSION);
    logged.mockRestore();
  });
});

// Profile H6b-1: a holder's writes, gated like the reveal.
describe("a holder's writes", () => {
  it("never reach the database without a fresh step-up", async () => {
    expect(await acknowledgeBankAction(SHOP, NOA, MOMENT)).toEqual({
      ok: false,
      failure: "stepUp",
    });
    expect(await markDirectGroupAction(SHOP, NOA, "bank", true)).toEqual({
      ok: false,
      failure: "stepUp",
    });
    opened(Date.now() - FILE_IDLE_MS - 1000);
    expect((await markDirectGroupAction(SHOP, NOA, "bank", true)).ok).toBe(
      false,
    );
    expect(mocks.acknowledgeBank).not.toHaveBeenCalled();
    expect(mocks.markDirectGroup).not.toHaveBeenCalled();
  });

  it("never write the session's own file", async () => {
    opened();
    expect(await acknowledgeBankAction(SHOP, URI, MOMENT)).toEqual({
      ok: false,
      failure: "noAccess",
    });
    expect(await markDirectGroupAction(SHOP, URI, "bank", true)).toEqual({
      ok: false,
      failure: "noAccess",
    });
    expect(mocks.acknowledgeBank).not.toHaveBeenCalled();
    expect(mocks.markDirectGroup).not.toHaveBeenCalled();
  });

  it("refuse what isn't a person, a moment, a part or a yes or no", async () => {
    opened();
    for (const answer of [
      await acknowledgeBankAction(SHOP, "noa", MOMENT),
      await acknowledgeBankAction(SHOP, NOA, "yesterday"),
      await acknowledgeBankAction(SHOP, NOA, `${MOMENT}0`),
      await markDirectGroupAction(SHOP, NOA, "salary", true),
      await markDirectGroupAction(SHOP, NOA, "bank", "yes" as never),
    ]) {
      expect(answer).toEqual({ ok: false, failure: "failed" });
    }
    expect(mocks.acknowledgeBank).not.toHaveBeenCalled();
    expect(mocks.markDirectGroup).not.toHaveBeenCalled();
  });
});

describe("confirming an account", () => {
  it("sends the moment as it came, slides the 15 minutes and draws the page again", async () => {
    const at = Date.now() - 5 * 60_000;
    opened(at);
    expect(await acknowledgeBankAction(SHOP, NOA, MOMENT)).toEqual({
      ok: true,
    });
    expect(mocks.acknowledgeBank).toHaveBeenCalledWith(URI, SHOP, NOA, MOMENT);
    expect(openedAt()).toBeGreaterThan(at);
    expect(mocks.keepFileStepUp).toHaveBeenCalledWith(URI, SHOP, SESSION);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("says a change since and a confirmation since, drawing the page with what is there now", async () => {
    opened();
    mocks.acknowledgeBank.mockResolvedValue({ ok: false, failure: "moved" });
    expect(await acknowledgeBankAction(SHOP, NOA, MOMENT)).toEqual({
      ok: false,
      failure: "moved",
    });
    mocks.acknowledgeBank.mockResolvedValue({ ok: false, failure: "invalid" });
    expect(await acknowledgeBankAction(SHOP, NOA, MOMENT)).toEqual({
      ok: false,
      failure: "settled",
    });
    expect(mocks.refresh).toHaveBeenCalledTimes(2);
  });

  it("puts the database's refusals in the screen's terms", async () => {
    opened();
    const cases = [
      ["ack", "ack"],
      ["own", "noAccess"],
      ["ownerOnly", "noAccess"],
      ["demo", "demo"],
      ["closed", "closed"],
      ["notStaff", "notInTeam"],
      ["notInTeam", "notInTeam"],
      ["keys", "unavailable"],
      ["stepUp", "failed"],
    ] as const;
    for (const [failure, said] of cases) {
      mocks.acknowledgeBank.mockResolvedValue({ ok: false, failure });
      expect(await acknowledgeBankAction(SHOP, NOA, MOMENT), failure).toEqual({
        ok: false,
        failure: said,
      });
    }
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});

describe("marking a part handed directly", () => {
  it("sends this one part, marked or taken off, never a set, and says it changed", async () => {
    const at = Date.now() - 5 * 60_000;
    opened(at);
    expect(await markDirectGroupAction(SHOP, NOA, "bank", true)).toEqual({
      ok: true,
      changed: true,
    });
    expect(mocks.markDirectGroup).toHaveBeenLastCalledWith(
      URI,
      SHOP,
      NOA,
      "bank",
      true,
    );
    expect(await markDirectGroupAction(SHOP, NOA, "pension", false)).toEqual({
      ok: true,
      changed: true,
    });
    expect(mocks.markDirectGroup).toHaveBeenLastCalledWith(
      URI,
      SHOP,
      NOA,
      "pension",
      false,
    );
    expect(openedAt()).toBeGreaterThan(at);
    expect(mocks.keepFileStepUp).toHaveBeenCalledTimes(2);
    expect(mocks.keepFileStepUp).toHaveBeenLastCalledWith(URI, SHOP, SESSION);
    expect(mocks.refresh).toHaveBeenCalledTimes(2);
  });

  it("says a press found the part already so, offering nothing to undo, and still draws the page again", async () => {
    opened();
    // Another holder marked it first, on a screen this one hadn't seen.
    mocks.markDirectGroup.mockResolvedValue({ ok: true, changed: false });
    expect(await markDirectGroupAction(SHOP, NOA, "bank", true)).toEqual({
      ok: true,
      changed: false,
    });
    // And an undo after someone else took the change back.
    expect(await markDirectGroupAction(SHOP, NOA, "bank", false)).toEqual({
      ok: true,
      changed: false,
    });
    expect(mocks.refresh).toHaveBeenCalledTimes(2);
  });

  it("says what the database refused, a part it doesn't ask among them", async () => {
    opened();
    const cases = [
      ["invalid", "failed"],
      ["ack", "ack"],
      ["off", "off"],
      ["demo", "demo"],
      ["closed", "closed"],
      ["notStaff", "notInTeam"],
      ["notInTeam", "notInTeam"],
      ["ownerOnly", "noAccess"],
      ["keys", "unavailable"],
      ["unavailable", "unavailable"],
      ["failed", "failed"],
    ] as const;
    for (const [failure, said] of cases) {
      mocks.markDirectGroup.mockResolvedValue({ ok: false, failure });
      expect(
        await markDirectGroupAction(SHOP, NOA, "bank", true),
        failure,
      ).toEqual({ ok: false, failure: said });
    }
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("logs no person, part or moment", async () => {
    opened();
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.acknowledgeBank.mockRejectedValue(
      Object.assign(new Error(MOMENT), { code: "XX000" }),
    );
    mocks.markDirectGroup.mockRejectedValue(
      Object.assign(new Error(NOA), { code: "XX000" }),
    );
    expect(await acknowledgeBankAction(SHOP, NOA, MOMENT)).toEqual({
      ok: false,
      failure: "failed",
    });
    expect(await markDirectGroupAction(SHOP, NOA, "bank", true)).toEqual({
      ok: false,
      failure: "failed",
    });
    const said = JSON.stringify(logged.mock.calls);
    for (const value of [NOA, MOMENT, "bank"]) {
      expect(said).not.toContain(value);
    }
    logged.mockRestore();
  });
});
