import { beforeEach, describe, expect, it, vi } from "vitest";

// Signing out (`signOut`), with ending the session and reading the device's
// station stood in for. It holds the order: the session ends first, and only
// then is where the device goes asked, so nothing that read can do keeps
// anyone signed in; and the answer is the one that read gives, the clock
// station's code or the door. It names whose session it ended, read before
// it ends, for the phone's records to go with it (waiter mode P7); asked
// "who", it ends nothing and only names the person.

vi.mock("server-only", () => ({}));

const USER = "00000000-0000-4000-8000-000000000001";

const mocks = vi.hoisted(() => ({
  calls: [] as string[],
  endSessionHere: vi.fn(),
  sessionUserHere: vi.fn(),
  signedOutPath: vi.fn(),
}));
vi.mock("./end-session", () => ({
  endSessionHere: mocks.endSessionHere,
  sessionUserHere: mocks.sessionUserHere,
}));
vi.mock("../(app)/clock/station/station", () => ({
  signedOutPath: mocks.signedOutPath,
}));
vi.mock("./otp", () => ({ sendCode: vi.fn(), verifyCode: vi.fn() }));

const { signOut } = await import("./actions");

beforeEach(() => {
  mocks.calls.length = 0;
  mocks.endSessionHere.mockReset().mockImplementation(async () => {
    mocks.calls.push("end");
  });
  mocks.sessionUserHere.mockReset().mockImplementation(async () => {
    mocks.calls.push("who");
    return USER;
  });
  mocks.signedOutPath.mockReset();
});

describe("signing out", () => {
  it("ends the session here before it asks where the device goes", async () => {
    mocks.signedOutPath.mockImplementation(async () => {
      mocks.calls.push("where");
      return "/station";
    });
    expect(await signOut()).toEqual({ to: "/station", user: USER });
    expect(mocks.calls).toEqual(["who", "end", "where"]);
    expect(mocks.endSessionHere).toHaveBeenCalledTimes(1);
  });

  it("answers the door where the device is no running station", async () => {
    mocks.signedOutPath.mockResolvedValue("/enter");
    expect(await signOut()).toEqual({ to: "/enter", user: USER });
  });

  it("names nobody where nobody was signed in, and signs out all the same", async () => {
    mocks.sessionUserHere.mockResolvedValue(null);
    mocks.signedOutPath.mockResolvedValue("/enter");
    expect(await signOut()).toEqual({ to: "/enter", user: null });
    expect(mocks.endSessionHere).toHaveBeenCalledTimes(1);
  });

  it("asked who, names the session's person and ends nothing", async () => {
    expect(await signOut("who")).toEqual({ to: null, user: USER });
    expect(mocks.endSessionHere).not.toHaveBeenCalled();
    expect(mocks.signedOutPath).not.toHaveBeenCalled();
  });

  it("answers nowhere to go when the session couldn't be ended", async () => {
    mocks.endSessionHere.mockRejectedValue(new Error("down"));
    await expect(signOut()).rejects.toThrow("down");
    expect(mocks.signedOutPath).not.toHaveBeenCalled();
  });
});
