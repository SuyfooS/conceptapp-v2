import { beforeEach, describe, expect, it, vi } from "vitest";

// Someone's file as a holder's screen reads it (profile H6a), with what it
// reads stood in for. It holds the order: nothing that logs is asked before
// its turn, so the file (`employee_file`, which logs a view) is read only for
// a holder who confirmed the duties and opened the files on this device,
// never in a view, never for a person who isn't a manager or a worker, and
// never on a deployment without the keys; a failure logs a code and a kind,
// never a message; and Next's own throws go on to Next.

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  currentFilesReader: vi.fn(),
  getTeamPerson: vi.fn(),
  getEmployeeFile: vi.fn(),
  getFileHolderState: vi.fn(),
  hasEmployeeKeys: vi.fn(),
  fileOpenFor: vi.fn(),
  getFileHistory: vi.fn(),
}));
vi.mock("../../file-access", () => ({
  currentFilesReader: mocks.currentFilesReader,
}));
vi.mock("@db/team", () => ({ getTeamPerson: mocks.getTeamPerson }));
vi.mock("@db/employee-files", () => ({
  getEmployeeFile: mocks.getEmployeeFile,
  getFileHolderState: mocks.getFileHolderState,
  hasEmployeeKeys: mocks.hasEmployeeKeys,
}));
vi.mock("./step-up", () => ({ fileOpenFor: mocks.fileOpenFor }));
vi.mock("@db/file-history", () => ({ getFileHistory: mocks.getFileHistory }));

const { currentHolderFile } = await import("./holder-file");
const { redirect } = await import("next/navigation");

const SHOP = "11111111-1111-4111-a111-111111111111";
const URI = "33333333-3333-4333-a333-333333333333";
const NOA = "44444444-4444-4444-a444-444444444444";

const SETTINGS = {
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

const holder = {
  kind: "holder",
  holder: {
    userId: URI,
    businessId: SHOP,
    businessName: "Shop",
    timeZone: "Asia/Jerusalem",
    today: "2026-11-22",
    year: 2026,
    settings: SETTINGS,
    seesTeam: true,
  },
};

const noa = {
  userId: NOA,
  name: "נועה כהן",
  phone: null,
  role: "worker",
  namedRole: null,
  photo: null,
  addressForm: "f",
  bio: null,
  cover: "glow",
  since: "2026-03-01T08:00:00.000Z",
};

const fileRead = {
  ok: true,
  access: "holder",
  demo: true,
  file: null,
  address: null,
  email: null,
  workLanguage: null,
  documentName: null,
  holderName: null,
  emergency: null,
  masked: { id: "•••0018", bankAccount: "•••0001" },
  missing: ["address"],
  youthUntil: null,
  pensionDueOn: null,
  startedOn: null,
  taxYears: [],
};

const emptyHistory = {
  rows: [],
  more: false,
  lookups: {
    members: new Map(),
    invites: new Map(),
    shifts: new Map(),
    swaps: new Map(),
    departments: new Map(),
    stations: new Map(),
  },
};

beforeEach(() => {
  mocks.currentFilesReader.mockReset().mockResolvedValue(holder);
  mocks.getTeamPerson.mockReset().mockResolvedValue(noa);
  mocks.getEmployeeFile.mockReset().mockResolvedValue(fileRead);
  mocks.getFileHolderState.mockReset().mockResolvedValue("ready");
  mocks.hasEmployeeKeys.mockReset().mockReturnValue(true);
  mocks.fileOpenFor.mockReset().mockResolvedValue(true);
  mocks.getFileHistory.mockReset().mockResolvedValue(emptyHistory);
});

describe("a holder's file screen", () => {
  it("opens the file for a ready holder with the files open here, read once", async () => {
    const screen = await currentHolderFile(NOA);
    expect(screen.kind).toBe("open");
    expect(mocks.getEmployeeFile).toHaveBeenCalledTimes(1);
    expect(mocks.getEmployeeFile).toHaveBeenCalledWith(SHOP, NOA);
    if (screen.kind !== "open") return;
    expect(screen.head).toMatchObject({
      personId: NOA,
      businessId: SHOP,
      seesTeam: true,
    });
    // The numbers by their last digits alone.
    expect(screen.data.identity.masked).toBe("•••0018");
    expect(JSON.stringify(screen)).not.toMatch(/000000018|100001/);
  });

  it("shows the duties first, asked without a log, and reads no file", async () => {
    mocks.getFileHolderState.mockResolvedValue("ack");
    expect((await currentHolderFile(NOA)).kind).toBe("duties");
    expect(mocks.fileOpenFor).not.toHaveBeenCalled();
    expect(mocks.getEmployeeFile).not.toHaveBeenCalled();
  });

  it("is locked without a fresh step-up, and reads no file", async () => {
    mocks.fileOpenFor.mockResolvedValue(false);
    expect((await currentHolderFile(NOA)).kind).toBe("locked");
    expect(mocks.fileOpenFor).toHaveBeenCalledWith(SHOP, URI);
    expect(mocks.getEmployeeFile).not.toHaveBeenCalled();
  });

  it("can't open a file without the keys, before any state is asked", async () => {
    mocks.hasEmployeeKeys.mockReturnValue(false);
    expect((await currentHolderFile(NOA)).kind).toBe("unavailable");
    expect(mocks.getFileHolderState).not.toHaveBeenCalled();
    expect(mocks.getEmployeeFile).not.toHaveBeenCalled();
    mocks.hasEmployeeKeys.mockReturnValue(true);
    mocks.getFileHolderState.mockResolvedValue("unavailable");
    expect((await currentHolderFile(NOA)).kind).toBe("unavailable");
    expect(mocks.getEmployeeFile).not.toHaveBeenCalled();
  });

  it("says a view in words, and reads nothing of the file", async () => {
    mocks.currentFilesReader.mockResolvedValue({
      kind: "team",
      viewing: true,
      seesTeam: true,
      businessId: SHOP,
      businessName: "Shop",
      timeZone: "Asia/Jerusalem",
    });
    const screen = await currentHolderFile(NOA);
    expect(screen.kind).toBe("viewing");
    if (screen.kind === "viewing") expect(screen.head.seesTeam).toBe(true);
    expect(mocks.getFileHolderState).not.toHaveBeenCalled();
    expect(mocks.getEmployeeFile).not.toHaveBeenCalled();
  });

  // The second review: a view as the accountant reads the files alone, and
  // /team/<id> sends whoever doesn't see the team to the file again.
  it("leads a view as the accountant back to the team's files, not the profile", async () => {
    mocks.currentFilesReader.mockResolvedValue({
      kind: "team",
      viewing: true,
      seesTeam: false,
      businessId: SHOP,
      businessName: "Shop",
      timeZone: "Asia/Jerusalem",
    });
    const screen = await currentHolderFile(NOA);
    expect(screen.kind).toBe("viewing");
    if (screen.kind === "viewing") expect(screen.head.seesTeam).toBe(false);
    expect(mocks.getEmployeeFile).not.toHaveBeenCalled();
  });

  it("is no screen for a reader without the files, or a person who isn't staff", async () => {
    mocks.currentFilesReader.mockResolvedValue({
      kind: "team",
      viewing: false,
      seesTeam: true,
      businessId: SHOP,
      businessName: "Shop",
      timeZone: "Asia/Jerusalem",
    });
    expect((await currentHolderFile(NOA)).kind).toBe("closed");
    expect(mocks.getFileHolderState).not.toHaveBeenCalled();
    mocks.currentFilesReader.mockResolvedValue({ kind: "none" });
    expect((await currentHolderFile(NOA)).kind).toBe("closed");
    mocks.currentFilesReader.mockResolvedValue(holder);
    expect((await currentHolderFile("noa")).kind).toBe("closed");
    mocks.getTeamPerson.mockResolvedValue({ ...noa, role: "owner" });
    expect((await currentHolderFile(NOA)).kind).toBe("closed");
    mocks.getTeamPerson.mockResolvedValue(null);
    expect((await currentHolderFile(NOA)).kind).toBe("closed");
    for (const state of ["off", "not_member", "not_holder"]) {
      mocks.getTeamPerson.mockResolvedValue(noa);
      mocks.getFileHolderState.mockResolvedValue(state);
      expect((await currentHolderFile(NOA)).kind, state).toBe("closed");
    }
    expect(mocks.getEmployeeFile).not.toHaveBeenCalled();
  });

  it("reads the file's own refusal in its terms", async () => {
    mocks.getEmployeeFile.mockResolvedValue({
      ok: false,
      failure: "denied",
      reason: "ack",
    });
    expect((await currentHolderFile(NOA)).kind).toBe("duties");
    mocks.getEmployeeFile.mockResolvedValue({
      ok: false,
      failure: "denied",
      reason: "off",
    });
    expect((await currentHolderFile(NOA)).kind).toBe("closed");
    mocks.getEmployeeFile.mockResolvedValue({ ok: false, failure: "keys" });
    expect((await currentHolderFile(NOA)).kind).toBe("unavailable");
  });

  it("is locked when the database holds no step-up for this sign-in, the cookie notwithstanding", async () => {
    // 20261127000400_file_step_up.sql: a lapsed or other sign-in's step-up.
    mocks.getEmployeeFile.mockResolvedValue({
      ok: false,
      failure: "denied",
      reason: "step_up",
    });
    const screen = await currentHolderFile(NOA);
    expect(screen.kind).toBe("locked");
    expect(screen).toMatchObject({ head: { personId: NOA } });
    expect(mocks.getFileHistory).not.toHaveBeenCalled();
  });

  it("logs a failure by its code and kind, never its message", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getEmployeeFile.mockRejectedValue(
      Object.assign(new Error("noa@example.com"), { code: "XX000" }),
    );
    expect((await currentHolderFile(NOA)).kind).toBe("unavailable");
    expect(logged).toHaveBeenCalledWith(
      "reading a holder's file failed",
      "XX000",
      "Error",
    );
    expect(JSON.stringify(logged.mock.calls)).not.toContain("noa@example");
    logged.mockRestore();
  });

  it("lets Next's own throws go on to Next", async () => {
    mocks.currentFilesReader.mockImplementation(() => redirect("/enter"));
    await expect(currentHolderFile(NOA)).rejects.toThrow("NEXT_REDIRECT");
  });
});

// Profile H6b-1: "מה קרה בתיק", read only for the open file.
describe("what happened in the file", () => {
  it("is read for the open file only, never before its turn", async () => {
    mocks.getFileHolderState.mockResolvedValue("ack");
    await currentHolderFile(NOA);
    mocks.getFileHolderState.mockResolvedValue("ready");
    mocks.fileOpenFor.mockResolvedValue(false);
    await currentHolderFile(NOA);
    mocks.fileOpenFor.mockResolvedValue(true);
    mocks.hasEmployeeKeys.mockReturnValue(false);
    await currentHolderFile(NOA);
    mocks.hasEmployeeKeys.mockReturnValue(true);
    mocks.getEmployeeFile.mockResolvedValue({
      ok: false,
      failure: "denied",
      reason: "viewing",
    });
    await currentHolderFile(NOA);
    mocks.currentFilesReader.mockResolvedValue({
      kind: "team",
      viewing: true,
      seesTeam: true,
      businessId: SHOP,
      businessName: "Shop",
      timeZone: "Asia/Jerusalem",
    });
    await currentHolderFile(NOA);
    expect(mocks.getFileHistory).not.toHaveBeenCalled();
  });

  it("comes through as lines: a reveal and a change, by whom", async () => {
    mocks.getFileHistory.mockResolvedValue({
      ...emptyHistory,
      rows: [
        {
          id: 2,
          action: "employee.view",
          details: { person: NOA, fields: ["bank_account"] },
          createdAt: "2026-11-22T10:00:00+00:00",
          actorId: URI,
        },
        {
          id: 1,
          action: "employee.details",
          details: { person: NOA, fields: ["bank"] },
          createdAt: "2026-11-21T10:00:00+00:00",
          actorId: NOA,
        },
      ],
      more: true,
      lookups: {
        ...emptyHistory.lookups,
        members: new Map([
          [URI, { active: true, name: "אורי" }],
          [NOA, { active: true, name: "נועה כהן" }],
        ]),
      },
    });
    const screen = await currentHolderFile(NOA);
    expect(mocks.getFileHistory).toHaveBeenCalledWith(SHOP, NOA);
    if (screen.kind !== "open") throw new Error(screen.kind);
    expect(screen.history?.more).toBe(true);
    expect(
      screen.history?.entries.map((entry) => [entry.line.action, entry.actor]),
    ).toEqual([
      ["employee.view", { kind: "member", name: "אורי" }],
      ["employee.details", { kind: "member", name: "נועה כהן" }],
    ]);
  });

  // The review: the address may hold the id in upper case, which the file's
  // reads take as a uuid, while the log names the person in lower case.
  it("is read by the id the database returned, not the address as typed", async () => {
    const screen = await currentHolderFile(NOA.toUpperCase());
    expect(screen.kind).toBe("open");
    expect(mocks.getFileHistory).toHaveBeenCalledWith(SHOP, NOA);
  });

  it("says it couldn't be read by a code and a kind, and the file still opens", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getFileHistory.mockRejectedValue(
      Object.assign(new Error("noa@example.com"), { code: "42501" }),
    );
    const screen = await currentHolderFile(NOA);
    expect(screen.kind).toBe("open");
    if (screen.kind === "open") expect(screen.history).toBeNull();
    expect(logged).toHaveBeenCalledWith(
      "reading a file's history failed",
      "42501",
      "Error",
    );
    expect(JSON.stringify(logged.mock.calls)).not.toContain("noa@example");
    logged.mockRestore();
  });

  it("lets Next's own throws go on to Next", async () => {
    mocks.getFileHistory.mockImplementation(() => redirect("/enter"));
    await expect(currentHolderFile(NOA)).rejects.toThrow("NEXT_REDIRECT");
  });
});
