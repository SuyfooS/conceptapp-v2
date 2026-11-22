import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A former worker's old file (profile H5c), with what it reads stood in
// for: the session's member, the businesses they left (`own_departures`)
// and the file's server code (@db/employee-files). They hold the gates in
// their order: an id, someone signed in, a business they left, never a
// view session, the person always the session's own; and what each answer
// of the database draws. Nothing of the file in a log.

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  currentMember: vi.fn(),
  currentDepartures: vi.fn(),
  getEmployeeFile: vi.fn(),
}));
vi.mock("../../../(app)/member", () => ({
  currentMember: mocks.currentMember,
}));
vi.mock("../../../(app)/departures", () => ({
  currentDepartures: mocks.currentDepartures,
}));
vi.mock("@db/employee-files", () => ({
  getEmployeeFile: mocks.getEmployeeFile,
}));

const { redirect } = await import("next/navigation");
const { currentPastFile, currentPastJobs, pastReader } = await import(
  "./past-file"
);

const CAFE = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const SHOP = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
const NEVER = "cccccccc-cccc-4ccc-cccc-cccccccccccc";
const NOA = "33333333-3333-4333-a333-333333333333";

const cafe = {
  businessId: CAFE,
  name: "בית הקפה",
  accent: "#0f766e",
  leftAt: "2026-10-12T08:00:00.000Z",
};
const shop = {
  businessId: SHOP,
  name: "החנות",
  accent: "#7c3aed",
  leftAt: "2026-09-01T08:00:00.000Z",
};

/** Noa, with no business now, as the session reads her. */
const noa = (over: Record<string, unknown> = {}) => ({
  userId: NOA,
  viewing: null,
  membership: null,
  profile: { locale: "he" },
  ...over,
});

const ROW = {
  legal_first_name: "נועה",
  legal_last_name: "כהן",
  city_code: 5000,
  id_hint: "0018",
};

/** Her file as the database answers it, opened. */
const read = (over: Record<string, unknown> = {}) => ({
  ok: true,
  access: "self",
  demo: false,
  file: ROW,
  address: { kind: "street", cityCode: 5000, street: "הרצל", number: "12" },
  email: "noa@demo.conceptapp.invalid",
  workLanguage: null,
  documentName: null,
  holderName: null,
  emergency: null,
  masked: { id: "•••0018", bankAccount: null },
  missing: [],
  youthUntil: null,
  pensionDueOn: null,
  taxYears: [],
  ...over,
});

beforeEach(() => {
  mocks.currentMember.mockReset().mockResolvedValue(noa());
  mocks.currentDepartures.mockReset().mockResolvedValue([cafe, shop]);
  mocks.getEmployeeFile.mockReset().mockResolvedValue(read());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the old file's screen", () => {
  it("is not found for what isn't an id, and reads nothing", async () => {
    for (const business of ["not-an-id", "", null, 7, `${CAFE}x`]) {
      expect(await currentPastFile(business)).toEqual({ kind: "closed" });
    }
    expect(mocks.currentMember).not.toHaveBeenCalled();
    expect(mocks.currentDepartures).not.toHaveBeenCalled();
    expect(mocks.getEmployeeFile).not.toHaveBeenCalled();
  });

  it("is not found for nobody signed in", async () => {
    mocks.currentMember.mockResolvedValue(null);
    expect(await currentPastFile(CAFE)).toEqual({ kind: "closed" });
    expect(mocks.getEmployeeFile).not.toHaveBeenCalled();
  });

  it("is not found for a business they didn't leave, and reads no file", async () => {
    expect(await currentPastFile(NEVER)).toEqual({ kind: "closed" });
    expect(mocks.getEmployeeFile).not.toHaveBeenCalled();
  });

  it("takes the id in any case", async () => {
    const screen = await currentPastFile(CAFE.toUpperCase());
    expect(screen.kind).toBe("file");
    expect(mocks.getEmployeeFile).toHaveBeenCalledWith(CAFE, NOA);
  });

  it("reads no file in a view session", async () => {
    mocks.currentMember.mockResolvedValue(
      noa({ viewing: { business: SHOP }, membership: { role: "worker" } }),
    );
    expect(await currentPastFile(CAFE)).toEqual({
      kind: "viewing",
      job: cafe,
      locale: "he",
      back: "profile",
    });
    expect(mocks.getEmployeeFile).not.toHaveBeenCalled();
  });

  it("says each answer of the database in its own words", async () => {
    const frame = { job: cafe, locale: "he", back: "list" };
    mocks.getEmployeeFile.mockResolvedValueOnce({
      ok: false,
      failure: "denied",
      reason: "off",
    });
    expect(await currentPastFile(CAFE)).toEqual({ kind: "off", ...frame });
    mocks.getEmployeeFile.mockResolvedValueOnce({
      ok: false,
      failure: "denied",
      reason: "viewing",
    });
    expect(await currentPastFile(CAFE)).toEqual({ kind: "viewing", ...frame });
    for (const reason of ["not_member", "not_holder", "ack", "limit"]) {
      mocks.getEmployeeFile.mockResolvedValueOnce({
        ok: false,
        failure: "denied",
        reason,
      });
      expect(await currentPastFile(CAFE), reason).toEqual({ kind: "closed" });
    }
    for (const failure of ["keys", "unavailable", "failed"]) {
      mocks.getEmployeeFile.mockResolvedValueOnce({ ok: false, failure });
      expect(await currentPastFile(CAFE), failure).toEqual({
        kind: "unavailable",
        ...frame,
      });
    }
  });

  it("never draws a holder's read", async () => {
    mocks.getEmployeeFile.mockResolvedValue(read({ access: "holder" }));
    expect(await currentPastFile(CAFE)).toEqual({ kind: "closed" });
  });

  it("says so when nothing of theirs is in it", async () => {
    mocks.getEmployeeFile.mockResolvedValue(
      read({ file: null, address: null, email: null, masked: { id: null } }),
    );
    expect((await currentPastFile(CAFE)).kind).toBe("empty");
  });

  it("draws their own file, back where they came from, in their language", async () => {
    const screen = await currentPastFile(CAFE);
    expect(screen).toMatchObject({
      kind: "file",
      data: {
        job: cafe,
        locale: "he",
        back: "list",
        file: ROW,
        email: "noa@demo.conceptapp.invalid",
        masked: { id: "•••0018", bankAccount: null },
        taxYears: [],
      },
    });
    if (screen.kind !== "file") throw new Error("a file");
    expect(screen.data.city?.code).toBe(5000);

    mocks.currentMember.mockResolvedValue(
      noa({ membership: { role: "worker" }, profile: { locale: "en" } }),
    );
    expect(await currentPastFile(CAFE)).toMatchObject({
      kind: "file",
      data: { locale: "en", back: "profile" },
    });
  });

  it("logs only a failure's code and kind, and lets Next's own throws through", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getEmployeeFile.mockRejectedValue(
      Object.assign(new Error("noa 000000018"), { code: "XX000" }),
    );
    expect(await currentPastFile(CAFE)).toMatchObject({
      kind: "unavailable",
      job: cafe,
    });
    expect(error).toHaveBeenCalledWith(
      "reading a past file failed",
      "XX000",
      "Error",
    );
    expect(JSON.stringify(error.mock.calls)).not.toContain("000000018");

    mocks.currentDepartures.mockRejectedValue(new Error("down"));
    expect(await currentPastFile(CAFE)).toEqual({ kind: "closed" });

    mocks.currentDepartures.mockImplementation(() => redirect("/sign-in"));
    await expect(currentPastFile(CAFE)).rejects.toThrow();
  });
});

describe("the previous jobs", () => {
  it("are none for nobody signed in and in a view session, with no read", async () => {
    mocks.currentMember.mockResolvedValue(null);
    expect(await currentPastJobs()).toEqual([]);
    mocks.currentMember.mockResolvedValue(
      noa({ viewing: { business: SHOP }, membership: { role: "worker" } }),
    );
    expect(await currentPastJobs()).toEqual([]);
    expect(mocks.currentDepartures).not.toHaveBeenCalled();
    expect(mocks.getEmployeeFile).not.toHaveBeenCalled();
  });

  it("list the businesses left whose file is theirs to read and holds something, in order", async () => {
    mocks.getEmployeeFile.mockImplementation(async (business: string) =>
      business === SHOP
        ? { ok: false, failure: "denied", reason: "off" }
        : read(),
    );
    expect(await currentPastJobs()).toEqual([cafe]);
    mocks.getEmployeeFile.mockResolvedValue(read());
    expect(await currentPastJobs()).toEqual([cafe, shop]);
    for (const [business] of mocks.getEmployeeFile.mock.calls) {
      expect([CAFE, SHOP]).toContain(business);
    }
    for (const [, person] of mocks.getEmployeeFile.mock.calls) {
      expect(person).toBe(NOA);
    }
  });

  it("leave out a file with nothing of theirs, a holder's read and one that failed", async () => {
    mocks.getEmployeeFile.mockResolvedValueOnce(
      read({ file: null, emergency: null, taxYears: [] }),
    );
    mocks.getEmployeeFile.mockResolvedValueOnce(read());
    expect(await currentPastJobs()).toEqual([shop]);
    mocks.getEmployeeFile.mockResolvedValueOnce(read({ access: "holder" }));
    mocks.getEmployeeFile.mockResolvedValueOnce({ ok: false, failure: "keys" });
    expect(await currentPastJobs()).toEqual([]);
  });

  it("leave out only the one whose read threw", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getEmployeeFile.mockImplementation(async (business: string) => {
      if (business === CAFE) throw Object.assign(new Error("x"), { code: "1" });
      return read();
    });
    expect(await currentPastJobs()).toEqual([shop]);
    expect(error).toHaveBeenCalledWith(
      "reading a past file for the list failed",
      "1",
      "Error",
    );
  });

  it("are none when the departures can't be read", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.currentDepartures.mockRejectedValue(new TypeError("down"));
    expect(await currentPastJobs()).toEqual([]);
    expect(error).toHaveBeenCalledWith(
      "listing past files failed",
      "without a code",
      "TypeError",
    );
  });
});

describe("who reveals an old file's number", () => {
  it("is the session's own person, for a business they left", async () => {
    expect(await pastReader(CAFE)).toEqual({ userId: NOA, businessId: CAFE });
    expect(mocks.getEmployeeFile).not.toHaveBeenCalled();
  });

  it("is nobody for anything else, and never in a view session", async () => {
    expect(await pastReader("x")).toEqual({ failure: "failed" });
    expect(await pastReader(NEVER)).toEqual({ failure: "failed" });
    mocks.currentMember.mockResolvedValue(null);
    expect(await pastReader(CAFE)).toEqual({ failure: "failed" });
    mocks.currentMember.mockResolvedValue(
      noa({ viewing: { business: SHOP }, membership: { role: "worker" } }),
    );
    expect(await pastReader(CAFE)).toEqual({ failure: "viewOnly" });
  });
});
