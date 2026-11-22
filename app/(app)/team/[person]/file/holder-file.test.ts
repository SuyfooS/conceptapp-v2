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
  taxYears: [],
};

beforeEach(() => {
  mocks.currentFilesReader.mockReset().mockResolvedValue(holder);
  mocks.getTeamPerson.mockReset().mockResolvedValue(noa);
  mocks.getEmployeeFile.mockReset().mockResolvedValue(fileRead);
  mocks.getFileHolderState.mockReset().mockResolvedValue("ready");
  mocks.hasEmployeeKeys.mockReset().mockReturnValue(true);
  mocks.fileOpenFor.mockReset().mockResolvedValue(true);
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
