import { beforeEach, describe, expect, it, vi } from "vitest";

// Signing out (`signOut`), with ending the session and reading the device's
// station stood in for. It holds the order: the session ends first, and only
// then is where the device goes asked, so nothing that read can do keeps
// anyone signed in; and the answer is the one that read gives, the clock
// station's code or the door.

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  calls: [] as string[],
  endSessionHere: vi.fn(),
  signedOutPath: vi.fn(),
}));
vi.mock("./end-session", () => ({ endSessionHere: mocks.endSessionHere }));
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
  mocks.signedOutPath.mockReset();
});

describe("signing out", () => {
  it("ends the session here before it asks where the device goes", async () => {
    mocks.signedOutPath.mockImplementation(async () => {
      mocks.calls.push("where");
      return "/station";
    });
    expect(await signOut()).toBe("/station");
    expect(mocks.calls).toEqual(["end", "where"]);
    expect(mocks.endSessionHere).toHaveBeenCalledTimes(1);
  });

  it("answers the door where the device is no running station", async () => {
    mocks.signedOutPath.mockResolvedValue("/enter");
    expect(await signOut()).toBe("/enter");
  });

  it("answers nowhere to go when the session couldn't be ended", async () => {
    mocks.endSessionHere.mockRejectedValue(new Error("down"));
    await expect(signOut()).rejects.toThrow("down");
    expect(mocks.signedOutPath).not.toHaveBeenCalled();
  });
});
