import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The demo week's renewal before Today (`renewDemoWeek`), with the session
// and the secret key's calls stood in for: the shop's week, whose week always
// shows, and next week's sample availability in either demo business (the
// database writes it only where a definition names it), only on a site whose
// demo door is open (DEMO_DOOR unset or on), and Today opens whatever the
// renewals do.

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  currentMember: vi.fn(),
  renewDemoSchedules: vi.fn(),
  renewDemoAvailability: vi.fn(),
}));
vi.mock("./member", () => ({ currentMember: mocks.currentMember }));
vi.mock("@db/demo", () => ({
  renewDemoSchedules: mocks.renewDemoSchedules,
  renewDemoAvailability: mocks.renewDemoAvailability,
}));

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
  mocks.renewDemoAvailability.mockResolvedValue(3);
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

  it("renews no week for another business, or for nobody", async () => {
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
    for (const slug of ["demo-shop", "demo-restaurant"]) {
      inBusiness(slug);
      await renewDemoWeek();
    }
    expect(mocks.renewDemoSchedules).not.toHaveBeenCalled();
    expect(mocks.renewDemoAvailability).not.toHaveBeenCalled();
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
    // The sample is sent all the same.
    expect(mocks.renewDemoAvailability).toHaveBeenCalledTimes(1);
  });
});

describe("the sample availability", () => {
  it("is sent in either demo business, past the week's turn too", async () => {
    // Signed in at the door last week and back on Today after the turn: the
    // restaurant's week doesn't renew, but its new next week gets the sample.
    for (const slug of ["demo-restaurant", "demo-shop"]) {
      mocks.renewDemoAvailability.mockClear();
      inBusiness(slug);
      await renewDemoWeek();
      expect(mocks.renewDemoAvailability, slug).toHaveBeenCalledTimes(1);
    }
  });

  it("is sent after the shop's week, which it waits for", async () => {
    const order: string[] = [];
    mocks.renewDemoSchedules.mockImplementation(async () => {
      order.push("week");
      return 1;
    });
    mocks.renewDemoAvailability.mockImplementation(async () => {
      order.push("sample");
      return 0;
    });
    inBusiness("demo-shop");
    await renewDemoWeek();
    expect(order).toEqual(["week", "sample"]);
  });

  it("is never sent for another business, or for nobody", async () => {
    for (const slug of ["cafe-noa", null]) {
      inBusiness(slug);
      await renewDemoWeek();
    }
    mocks.currentMember.mockResolvedValue(null);
    await renewDemoWeek();
    expect(mocks.renewDemoAvailability).not.toHaveBeenCalled();
  });

  it("opens Today when it fails, logging its message only", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    inBusiness("demo-restaurant");
    mocks.renewDemoAvailability.mockRejectedValue(
      Object.assign(new Error("sample down"), { details: "a row's words" }),
    );
    await expect(renewDemoWeek()).resolves.toBeUndefined();
    expect(logged).toHaveBeenCalledWith(
      "demo availability renewal failed",
      "sample down",
    );
    expect(JSON.stringify(logged.mock.calls)).not.toContain("a row's words");
  });
});
