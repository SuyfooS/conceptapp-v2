import { beforeEach, describe, expect, it, vi } from "vitest";

// The route of the file for payroll (payroll P8) with what it reads and
// writes stood in for: who may take the month's file (`currentPayrollFile`)
// and the row of the log (`notePayrollExport`). It holds the rules a
// download keeps: a prefetch or another site's link gets nothing and reads
// nothing, nobody gets a file without its row, and the row comes first.

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  currentPayrollFile: vi.fn(),
  notePayrollExport: vi.fn(),
}));
vi.mock("./export-data", () => ({
  currentPayrollFile: mocks.currentPayrollFile,
}));
vi.mock("@db/payroll", () => ({
  notePayrollExport: mocks.notePayrollExport,
}));

const { GET, HEAD } = await import("./route");
const { XLSX_TYPE } = await import("./xlsx");

const FILE = {
  bytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
  fileName: "hours-demo-shop-2026-10.xlsx",
  title: "Hours for payroll, Demo, October 2026.xlsx",
  people: 3,
  shifts: 8,
  engineVersion: "payroll-1",
  businessId: "11111111-1111-4111-a111-111111111111",
  month: "2026-10",
};

const asked = (
  headers: Record<string, string> = {},
  query = "?month=2026-10",
) => new Request(`http://localhost:3000/clock/pay/export${query}`, { headers });

/** A promise and the hand that settles it, to see what waits for it. */
function deferred() {
  let resolve: (value?: unknown) => void = () => {};
  let reject: (reason: unknown) => void = () => {};
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const expectPrivate = (response: Response) => {
  expect(response.headers.get("cache-control")).toBe("private, no-store");
};

beforeEach(() => {
  mocks.currentPayrollFile.mockReset().mockResolvedValue(FILE);
  mocks.notePayrollExport.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /clock/pay/export", () => {
  it("answers a prefetch with nothing, and reads nothing", async () => {
    const prefetches: Record<string, string>[] = [
      { "next-router-prefetch": "1" },
      { rsc: "1" },
      { "sec-purpose": "prefetch" },
      { "sec-purpose": "prefetch;prerender" },
      { purpose: "prefetch" },
    ];
    for (const headers of prefetches) {
      const response = await GET(asked(headers));
      expect(response.status, JSON.stringify(headers)).toBe(204);
      expectPrivate(response);
      expect(await response.text()).toBe("");
    }
    expect(mocks.currentPayrollFile).not.toHaveBeenCalled();
    expect(mocks.notePayrollExport).not.toHaveBeenCalled();
  });

  it("refuses another site's link without reading anything", async () => {
    for (const site of ["cross-site", "same-site"]) {
      const response = await GET(asked({ "sec-fetch-site": site }));
      expect(response.status, site).toBe(404);
      expectPrivate(response);
      expect(await response.text()).toBe("");
    }
    expect(mocks.currentPayrollFile).not.toHaveBeenCalled();
    expect(mocks.notePayrollExport).not.toHaveBeenCalled();
  });

  it("goes on for the app itself, an address typed in, or a browser that doesn't say", async () => {
    const own: Record<string, string>[] = [
      { "sec-fetch-site": "same-origin" },
      { "sec-fetch-site": "none" },
      {},
    ];
    for (const headers of own) {
      const response = await GET(asked(headers));
      expect(response.status, JSON.stringify(headers)).toBe(200);
    }
    expect(mocks.currentPayrollFile).toHaveBeenCalledTimes(3);
    expect(mocks.currentPayrollFile).toHaveBeenCalledWith("2026-10");
  });

  it("gives 404 to someone without pay access, or for no such month, and logs nothing", async () => {
    mocks.currentPayrollFile.mockResolvedValue(null);
    const none = await GET(asked({}, ""));
    expect(mocks.currentPayrollFile).toHaveBeenLastCalledWith(null);
    expect(none.status).toBe(404);
    expectPrivate(none);
    const refused = await GET(asked());
    expect(refused.status).toBe(404);
    expect(await refused.text()).toBe("");
    expect(mocks.notePayrollExport).not.toHaveBeenCalled();
  });

  it("gives 404 and no file when the database refuses the row (42501)", async () => {
    mocks.notePayrollExport.mockRejectedValue({ code: "42501" });
    const response = await GET(asked());
    expect(response.status).toBe(404);
    expectPrivate(response);
    expect(await response.text()).toBe("");
    expect(response.headers.get("content-disposition")).toBeNull();
  });

  it("gives 500 and no file when the row can't be written", async () => {
    for (const error of [
      new Error("connection reset"),
      { code: "22023" },
      null,
    ]) {
      mocks.notePayrollExport.mockRejectedValueOnce(error);
      const response = await GET(asked());
      expect(response.status).toBe(500);
      expectPrivate(response);
      expect(await response.text()).toBe("");
      expect(response.headers.get("content-disposition")).toBeNull();
    }
  });

  it("logs the file, and only then sends it: an attachment, kept by nobody on the way", async () => {
    const row = deferred();
    mocks.notePayrollExport.mockReturnValue(row.promise);
    let answered = false;
    const answer = GET(asked()).then((response) => {
      answered = true;
      return response;
    });
    await vi.waitFor(() =>
      expect(mocks.notePayrollExport).toHaveBeenCalledTimes(1),
    );
    expect(mocks.notePayrollExport).toHaveBeenCalledWith(FILE.businessId, {
      month: "2026-10",
      people: 3,
      shifts: 8,
      engineVersion: "payroll-1",
    });
    // The row isn't written yet: no answer, so no file.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(answered).toBe(false);
    row.resolve();
    const response = await answer;
    expect(response.status).toBe(200);
    expectPrivate(response);
    expect(response.headers.get("content-type")).toBe(XLSX_TYPE);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-length")).toBe("4");
    expect(response.headers.get("content-disposition")).toBe(
      `attachment; filename="hours-demo-shop-2026-10.xlsx"; filename*=UTF-8''${encodeURIComponent(FILE.title)}`,
    );
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(FILE.bytes);
  });

  it("sends no file when the row fails after a wait", async () => {
    const row = deferred();
    mocks.notePayrollExport.mockReturnValue(row.promise);
    const answer = GET(asked());
    await vi.waitFor(() =>
      expect(mocks.notePayrollExport).toHaveBeenCalledTimes(1),
    );
    row.reject(new Error("timeout"));
    const response = await answer;
    expect(response.status).toBe(500);
    expect(await response.text()).toBe("");
  });
});

describe("HEAD /clock/pay/export", () => {
  it("is refused: only GET takes the file, so nothing is built or logged", async () => {
    const response = HEAD();
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET");
    expectPrivate(response);
    expect(mocks.currentPayrollFile).not.toHaveBeenCalled();
    expect(mocks.notePayrollExport).not.toHaveBeenCalled();
  });
});
