import { beforeEach, describe, expect, it, vi } from "vitest";

// The codes a signed-in person proves their phone with (the hiring file's
// bank change, profile H5a), with the auth server and the counts stood in
// for. They hold: the code goes to the number the auth server has now,
// never the profile's copy; it is checked on a client that keeps no
// session, so this browser's cookies are never written and stay the
// person's whoever the number turns out to be; the session the check opened
// is ended at once; and every check is counted with the sign-in codes.

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  noteAuthAttempt: vi.fn(),
  getUserById: vi.fn(),
  verifyOtp: vi.fn(),
  signOut: vi.fn(),
  cookieClient: vi.fn(),
}));
vi.mock("next/headers", () => ({
  headers: async () => ({ get: () => null }),
}));
vi.mock("@db/auth-limits", () => ({
  noteAuthAttempt: mocks.noteAuthAttempt,
  forgetAuthAttempt: vi.fn(),
}));
vi.mock("@db/supabase/admin", () => ({
  createAdminClient: () => ({
    auth: { admin: { getUserById: mocks.getUserById } },
  }),
}));
vi.mock("@db/supabase/detached", () => ({
  createDetachedClient: () => ({
    auth: { verifyOtp: mocks.verifyOtp, admin: { signOut: mocks.signOut } },
  }),
}));
// The cookie-backed client: a step-up's check never makes one.
vi.mock("@db/supabase/server", () => ({ createClient: mocks.cookieClient }));

const { checkCode, signInPhoneOf } = await import("./otp");

const NOA = "33333333-3333-4333-a333-333333333333";

beforeEach(() => {
  mocks.noteAuthAttempt.mockReset().mockResolvedValue(0);
  mocks.getUserById.mockReset().mockResolvedValue({
    data: { user: { id: NOA, phone: "972500000003" } },
    error: null,
  });
  mocks.verifyOtp.mockReset().mockResolvedValue({
    data: {
      user: { id: NOA },
      session: { access_token: "the-check's-own-token" },
    },
    error: null,
  });
  mocks.signOut.mockReset().mockResolvedValue({ data: null, error: null });
  mocks.cookieClient.mockReset();
});

describe("signInPhoneOf", () => {
  it("is the number the auth server has now, in E.164", async () => {
    expect(await signInPhoneOf(NOA)).toBe("+972500000003");
    expect(mocks.getUserById).toHaveBeenCalledWith(NOA);
  });

  it("is null without one, and a failure throws its code only", async () => {
    mocks.getUserById.mockResolvedValue({
      data: { user: { id: NOA, phone: "" } },
      error: null,
    });
    expect(await signInPhoneOf(NOA)).toBeNull();
    mocks.getUserById.mockResolvedValue({
      data: { user: null },
      error: { code: "user_not_found", status: 404 },
    });
    await expect(signInPhoneOf(NOA)).rejects.toMatchObject({
      code: "user_not_found",
    });
  });
});

describe("checkCode", () => {
  it("names whose number it was, and ends the session the check opened", async () => {
    expect(await checkCode("+972500000003", "123456")).toEqual({
      userId: NOA,
    });
    expect(mocks.verifyOtp).toHaveBeenCalledWith({
      phone: "+972500000003",
      token: "123456",
      type: "sms",
    });
    expect(mocks.signOut).toHaveBeenCalledWith(
      "the-check's-own-token",
      "local",
    );
    // This browser's session was never touched.
    expect(mocks.cookieClient).not.toHaveBeenCalled();
  });

  it("is counted with the sign-in codes, and checks nothing past the count", async () => {
    await checkCode("050-000-0003", "123456");
    expect(mocks.noteAuthAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "verify", phone: "+972500000003" }),
    );
    mocks.noteAuthAttempt.mockResolvedValue(30);
    mocks.verifyOtp.mockClear();
    expect(await checkCode("+972500000003", "123456")).toEqual({
      error: "tooMany",
    });
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });

  it("says a wrong code, and leaves nothing to end", async () => {
    mocks.verifyOtp.mockResolvedValue({
      data: { user: null, session: null },
      error: { code: "otp_expired" },
    });
    expect(await checkCode("+972500000003", "000000")).toEqual({
      error: "wrongCode",
    });
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("names another account as it is, for the caller to refuse", async () => {
    mocks.verifyOtp.mockResolvedValue({
      data: {
        user: { id: "44444444-4444-4444-a444-444444444444" },
        session: { access_token: "another's" },
      },
      error: null,
    });
    expect(await checkCode("+972500000003", "123456")).toEqual({
      userId: "44444444-4444-4444-a444-444444444444",
    });
    // Its session ended too: nobody holds it.
    expect(mocks.signOut).toHaveBeenCalledWith("another's", "local");
    expect(mocks.cookieClient).not.toHaveBeenCalled();
  });

  it("still answers when the session couldn't be ended, and says so by its code", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.signOut.mockResolvedValue({
      data: null,
      error: { code: "session_not_found", status: 404 },
    });
    expect(await checkCode("+972500000003", "123456")).toEqual({
      userId: NOA,
    });
    expect(JSON.stringify(logged.mock.calls)).not.toContain("token");
    logged.mockRestore();
  });
});
