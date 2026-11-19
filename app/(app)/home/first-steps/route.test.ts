import { FIRST_STEPS_HIDDEN_COOKIE } from "@domain/first-steps";
import { beforeEach, describe, expect, it, vi } from "vitest";

// POST /home/first-steps, Today's "הסתרה", with the session and the cookie
// jar stood in for. Its refusals are its own: a request another site sends is
// refused before the session is read; anyone but the business's owner, as
// themselves, is refused as `firstStepsHideRefusal` says, signed out with 401
// and the rest with 403; and a refused request keeps nothing on the device.
// The browser tests only press "הסתרה" where it shows, so they never reach
// these.

vi.mock("server-only", () => ({}));

const ORIGIN = "http://localhost:3000";
const BUSINESS = "10000000-0000-4000-b000-000000000001";
const HIDDEN_BEFORE = "10000000-0000-4000-b000-000000000002";

const mocks = vi.hoisted(() => ({
  currentMember: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "localhost:3000" }),
  cookies: async () => ({ get: mocks.get, set: mocks.set }),
}));
vi.mock("../../member", () => ({ currentMember: mocks.currentMember }));

const { POST } = await import("./route");

/** The hide as Today sends it, or with another site's headers. */
const hide = (
  headers: Record<string, string> = {
    "sec-fetch-site": "same-origin",
    origin: ORIGIN,
  },
) =>
  POST(new Request(`${ORIGIN}/home/first-steps`, { method: "POST", headers }));

/** Someone in the business open now, in `role`, or the team viewing as it. */
function asking(role: string, viewing = false) {
  mocks.currentMember.mockResolvedValue({
    viewing: viewing
      ? { role, namedRole: null, businessSlug: "first-steps" }
      : null,
    membership: { role, business: { id: BUSINESS } },
  });
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
});

describe("hiding the first steps", () => {
  it("keeps the business on this device for its owner, as themselves", async () => {
    asking("owner");
    mocks.get.mockReturnValue({ value: HIDDEN_BEFORE });
    const response = await hide();
    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.set).toHaveBeenCalledTimes(1);
    expect(mocks.set).toHaveBeenCalledWith(
      FIRST_STEPS_HIDDEN_COOKIE,
      `${HIDDEN_BEFORE},${BUSINESS}`,
      expect.objectContaining({ httpOnly: true, secure: false, path: "/" }),
    );
  });

  it("refuses another site's request before it reads the session", async () => {
    asking("owner");
    const elsewhere: Record<string, string>[] = [
      { "sec-fetch-site": "cross-site" },
      { "sec-fetch-site": "same-site", origin: ORIGIN },
      { origin: "https://elsewhere.test" },
    ];
    for (const headers of elsewhere) {
      const response = await hide(headers);
      expect(response.status, JSON.stringify(headers)).toBe(403);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    expect(mocks.currentMember).not.toHaveBeenCalled();
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("refuses anyone signed out with 401", async () => {
    mocks.currentMember.mockResolvedValue(null);
    expect((await hide()).status).toBe(401);
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("refuses the team viewing as the owner, and anyone but the owner, with 403", async () => {
    asking("owner", true);
    expect((await hide()).status).toBe(403);
    for (const role of ["manager", "worker", "accountant"]) {
      asking(role);
      expect((await hide()).status, role).toBe(403);
    }
    // Signed in before anyone added them to a business.
    mocks.currentMember.mockResolvedValue({ viewing: null, membership: null });
    expect((await hide()).status).toBe(403);
    expect(mocks.set).not.toHaveBeenCalled();
  });
});
