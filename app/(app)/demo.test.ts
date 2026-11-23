import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The demo week's renewal before Today (`renewDemoWeek`), with the session
// and the secret key's call stood in for: only the shop, whose week always
// shows, only on a site whose demo door is open (DEMO_DOOR unset or on), and
// Today opens whatever the renewal does.

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  currentMember: vi.fn(),
  renewDemoSchedules: vi.fn(),
}));
vi.mock("./member", () => ({ currentMember: mocks.currentMember }));
vi.mock("@db/demo", () => ({ renewDemoSchedules: mocks.renewDemoSchedules }));

const { renewDemoWeek } = await import("./demo");

/** Signed in to the business at `slug`, or with no business at all. */
function inBusiness(slug: string | null) {
  mocks.currentMember.mockResolvedValue(
    slug === null
      ? { membership: null }
      : { membership: { business: { slug } } },
  );
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.renewDemoSchedules.mockResolvedValue(1);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("the demo week", () => {
  it("renews the shop's week where the demo door is open", async () => {
    for (const setting of [undefined, "on"]) {
      if (setting) vi.stubEnv("DEMO_DOOR", setting);
      mocks.renewDemoSchedules.mockClear();
      inBusiness("demo-shop");
      await renewDemoWeek();
      expect(mocks.renewDemoSchedules).toHaveBeenCalledTimes(1);
    }
  });

  it("renews nothing for another business, or for nobody", async () => {
    for (const slug of ["demo-restaurant", "cafe-noa", null]) {
      inBusiness(slug);
      await renewDemoWeek();
    }
    mocks.currentMember.mockResolvedValue(null);
    await renewDemoWeek();
    expect(mocks.renewDemoSchedules).not.toHaveBeenCalled();
  });

  it("renews nothing where the demo door is closed", async () => {
    vi.stubEnv("DEMO_DOOR", "off");
    inBusiness("demo-shop");
    await renewDemoWeek();
    expect(mocks.renewDemoSchedules).not.toHaveBeenCalled();
    expect(mocks.currentMember).not.toHaveBeenCalled();
  });

  it("opens Today when the renewal fails, logging its message only", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    inBusiness("demo-shop");
    mocks.renewDemoSchedules.mockRejectedValue(
      Object.assign(new Error("renewal down"), { details: "a row's words" }),
    );
    await expect(renewDemoWeek()).resolves.toBeUndefined();
    expect(logged).toHaveBeenCalledWith(
      "demo schedule renewal failed",
      "renewal down",
    );
    expect(JSON.stringify(logged.mock.calls)).not.toContain("a row's words");
  });
});
