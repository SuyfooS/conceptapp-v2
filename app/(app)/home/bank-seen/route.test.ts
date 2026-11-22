import { BANK_CHANGE_SEEN_COOKIE } from "@domain/employee-file-settings";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// POST /home/bank-seen, Today's "אני שיניתי" and "הבנתי" once their undo's
// time is up (profile H5b), with the session, the modules, the file's read
// and the cookie jar stood in for. It keeps seen only the change the card
// was drawn for: the moment the card sends is compared with the file's,
// read again now, so a change made while the card was on screen (someone
// who took over the number, a moment ago) is never the one kept, and Today
// tells it. Its refusals are a write's (`fileWriter`): another site's
// request, a view session, a business other than the one open, the module
// off; and a refused request keeps nothing on the device.

vi.mock("server-only", () => ({}));

const ORIGIN = "http://localhost:3000";
const SHOP = "11111111-1111-4111-a111-111111111111";
const OTHER = "22222222-2222-4222-a222-222222222222";
const NOA = "33333333-3333-4333-a333-333333333333";
/** The change the card told (A), and one made while it was on screen (B). */
const DRAWN = "2026-11-20T08:00:00.123456+00:00";
const NEWER = "2026-11-21T19:30:00.5+00:00";

const mocks = vi.hoisted(() => ({
  currentMember: vi.fn(),
  currentModules: vi.fn(),
  currentModuleSettings: vi.fn(),
  getEmployeeFile: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "localhost:3000" }),
  cookies: async () => ({ get: mocks.get, set: mocks.set }),
}));
vi.mock("../../member", () => ({ currentMember: mocks.currentMember }));
vi.mock("../../modules", () => ({
  currentModules: mocks.currentModules,
  currentModuleSettings: mocks.currentModuleSettings,
}));
vi.mock("@db/employee-files", () => ({
  getEmployeeFile: mocks.getEmployeeFile,
}));

const { POST } = await import("./route");

const SAME_SITE = { "sec-fetch-site": "same-origin", origin: ORIGIN };

/** The hide as the card sends it, or with another body or site's headers. */
const seen = (
  body: unknown = { business: SHOP, changedAt: DRAWN },
  headers: Record<string, string> = SAME_SITE,
) =>
  POST(
    new Request(`${ORIGIN}/home/bank-seen`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

/** Noa, a worker in the shop, as the session reads her. */
const noa = (over: Record<string, unknown> = {}) => ({
  userId: NOA,
  viewing: null,
  membership: {
    role: "worker",
    perms: [],
    business: { id: SHOP, place: { timeZone: "Asia/Jerusalem" } },
  },
  ...over,
});

/** The file as the database holds it now: its account last changed `at`. */
const fileChanged = (at: string | null) =>
  mocks.getEmployeeFile.mockResolvedValue({
    ok: true,
    file: { bank_changed_at: at },
  });

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.currentMember.mockResolvedValue(noa());
  mocks.currentModules.mockResolvedValue(["employee_files"]);
  mocks.currentModuleSettings.mockResolvedValue({});
  fileChanged(DRAWN);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a bank change kept seen", () => {
  it("keeps the change the card told, for its person, on this device", async () => {
    const response = await seen();
    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.getEmployeeFile).toHaveBeenCalledWith(SHOP, NOA);
    expect(mocks.set).toHaveBeenCalledTimes(1);
    expect(mocks.set).toHaveBeenCalledWith(
      BANK_CHANGE_SEEN_COOKIE,
      `${SHOP}.${NOA}.${Date.parse(DRAWN)}`,
      expect.objectContaining({ httpOnly: true, path: "/" }),
    );
    // The same moment, written another way, is the same change.
    expect(
      (await seen({ business: SHOP, changedAt: "2026-11-20T08:00:00.123Z" }))
        .status,
    ).toBe(204);
  });

  it("keeps nothing when the account changed again since the card was drawn", async () => {
    // Drawn for A; the database holds B, made while the card was open.
    fileChanged(NEWER);
    const response = await seen();
    expect(response.status).toBe(409);
    expect(mocks.set).not.toHaveBeenCalled();
    // Nor with no change at all any more.
    fileChanged(null);
    expect((await seen()).status).toBe(409);
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("refuses another site's request before it reads the session", async () => {
    const elsewhere: Record<string, string>[] = [
      { "sec-fetch-site": "cross-site" },
      { "sec-fetch-site": "same-site", origin: ORIGIN },
      { origin: "https://elsewhere.test" },
    ];
    for (const headers of elsewhere) {
      const response = await seen(undefined, headers);
      expect(response.status, JSON.stringify(headers)).toBe(403);
    }
    expect(mocks.currentMember).not.toHaveBeenCalled();
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("takes only the card's own body", async () => {
    for (const body of [
      "not json",
      {},
      { business: SHOP },
      { business: SHOP, changedAt: "yesterday" },
      { business: SHOP, changedAt: "2026-11-20" },
      { business: SHOP, changedAt: DRAWN, person: OTHER },
    ]) {
      expect((await seen(body)).status, JSON.stringify(body)).toBe(400);
    }
    expect(mocks.currentMember).not.toHaveBeenCalled();
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("refuses a view session, another business and the module off, and reads nothing", async () => {
    mocks.currentMember.mockResolvedValue(noa({ viewing: { role: "worker" } }));
    expect((await seen()).status).toBe(403);
    mocks.currentMember.mockResolvedValue(noa());
    expect((await seen({ business: OTHER, changedAt: DRAWN })).status).toBe(
      403,
    );
    mocks.currentModules.mockResolvedValue([]);
    expect((await seen()).status).toBe(403);
    mocks.currentModules.mockResolvedValue(["employee_files"]);
    mocks.currentMember.mockResolvedValue(null);
    expect((await seen()).status).toBe(403);
    expect(mocks.getEmployeeFile).not.toHaveBeenCalled();
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("keeps nothing when the file can't be read, and logs only a code", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getEmployeeFile.mockResolvedValue({ ok: false, failure: "keys" });
    expect((await seen()).status).toBe(503);
    mocks.getEmployeeFile.mockResolvedValue({
      ok: false,
      failure: "denied",
      reason: "off",
    });
    expect((await seen()).status).toBe(403);
    mocks.getEmployeeFile.mockRejectedValue(
      Object.assign(new Error("100001"), { code: "XX000" }),
    );
    expect((await seen()).status).toBe(500);
    expect(mocks.set).not.toHaveBeenCalled();
    const said = JSON.stringify(logged.mock.calls);
    expect(said).toContain("XX000");
    expect(said).not.toContain("100001");
  });
});
