import { beforeEach, describe, expect, it, vi } from "vitest";

// POST /home/push-ask, Today's "לא עכשיו" on the card that offers
// notifications on the phone (closing the pilot, PR 6), once its "ביטול"
// went, with the session and the database stood in for. It keeps the
// person's mark (`seePushAsk`) and says whether it was kept, so the card can
// come back and say so when it wasn't. Its refusals are its own: a request
// another site sends is refused before the session is read, signed out with
// 401, the team viewing as someone with 403; and a refused request keeps
// nothing. The browser tests only press "לא עכשיו" where the card shows.

vi.mock("server-only", () => ({}));

const ORIGIN = "http://localhost:3000";

const mocks = vi.hoisted(() => ({
  currentMember: vi.fn(),
  seePushAsk: vi.fn(),
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "localhost:3000" }),
}));
vi.mock("../../member", () => ({ currentMember: mocks.currentMember }));
vi.mock("@db/notification-preferences", () => ({
  seePushAsk: mocks.seePushAsk,
}));

const { POST } = await import("./route");

/** "לא עכשיו" as the card sends it, or with another site's headers. */
const putAway = (
  headers: Record<string, string> = {
    "sec-fetch-site": "same-origin",
    origin: ORIGIN,
  },
) => POST(new Request(`${ORIGIN}/home/push-ask`, { method: "POST", headers }));

/** Someone in the business open now, as themselves or viewed as by the team. */
function asking(viewing = false) {
  mocks.currentMember.mockResolvedValue({
    userId: "10000000-0000-4000-a000-000000000001",
    viewing: viewing
      ? { role: "worker", namedRole: null, businessSlug: "a-real-shop" }
      : null,
    membership: { role: "worker", business: { id: "b" } },
  });
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  asking();
  mocks.seePushAsk.mockResolvedValue(true);
});

describe("'לא עכשיו' on Today's notifications card", () => {
  it("keeps the person's mark, and says it was kept", async () => {
    const response = await putAway();
    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.seePushAsk).toHaveBeenCalledTimes(1);
  });

  it("says so when the mark couldn't be kept", async () => {
    mocks.seePushAsk.mockResolvedValue(false);
    const response = await putAway();
    expect(response.ok).toBe(false);
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("refuses another site's request before it reads the session", async () => {
    const elsewhere: Record<string, string>[] = [
      { "sec-fetch-site": "cross-site" },
      { "sec-fetch-site": "same-site", origin: ORIGIN },
      { origin: "https://elsewhere.test" },
    ];
    for (const headers of elsewhere) {
      const response = await putAway(headers);
      expect(response.status, JSON.stringify(headers)).toBe(403);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    expect(mocks.currentMember).not.toHaveBeenCalled();
    expect(mocks.seePushAsk).not.toHaveBeenCalled();
  });

  it("refuses anyone signed out, or in no business, with 401", async () => {
    mocks.currentMember.mockResolvedValue(null);
    expect((await putAway()).status).toBe(401);
    mocks.currentMember.mockResolvedValue({ viewing: null, membership: null });
    expect((await putAway()).status).toBe(401);
    expect(mocks.seePushAsk).not.toHaveBeenCalled();
  });

  it("refuses the team viewing as someone with 403", async () => {
    asking(true);
    expect((await putAway()).status).toBe(403);
    expect(mocks.seePushAsk).not.toHaveBeenCalled();
  });
});
