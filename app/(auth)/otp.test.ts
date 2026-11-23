import { beforeEach, describe, expect, it, vi } from "vitest";

// The codes sent and checked, with the auth server and the counts stood in
// for. Sign-in answers every valid number the same, whether it has an
// account or not (`sendSignInCode`). A send within the app's own wait of the
// number's last counted one asks the auth server nothing, for every number
// alike: sign-in answers it as a code sent, and `sendCode` says it, which
// joining answers as sign-in does and the file's codes say. Past that wait, the auth server's limits on everyone
// and a failing SMS provider are a failure, with the try given back for the
// number and the caller. Joining clears the counts of a number with no
// account first, since none of them reached anyone (`sendJoinCode`). A check
// with no code sent to the number lately is a wrong code, and the auth
// server isn't asked.
//
// The codes a signed-in person proves their phone with (the hiring file's
// bank change, profile H5a) hold too: the code goes to the number the auth
// server has now, never the profile's copy; it is checked on a client that
// keeps no session, so this browser's cookies are never written and stay
// the person's whoever the number turns out to be; the session the check
// opened is ended at once; and every check is counted with the sign-in codes.

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  noteAuthAttempt: vi.fn(),
  forgetAuthAttempt: vi.fn(),
  forgetNumberAttempts: vi.fn(),
  signInWithOtp: vi.fn(),
  cookieVerifyOtp: vi.fn(),
  order: [] as string[],
  getUserById: vi.fn(),
  verifyOtp: vi.fn(),
  signOut: vi.fn(),
  cookieClient: vi.fn(),
}));
vi.mock("next/headers", () => ({
  headers: async () => ({ get: () => null }),
}));
vi.mock("@db/auth-limits", () => ({
  NO_CODE_WAITING: -1,
  CODE_JUST_SENT: -2,
  noteAuthAttempt: mocks.noteAuthAttempt,
  forgetAuthAttempt: mocks.forgetAuthAttempt,
  forgetNumberAttempts: mocks.forgetNumberAttempts,
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
// The cookie-backed client: sign-in's and joining's, never a step-up's.
vi.mock("@db/supabase/server", () => ({ createClient: mocks.cookieClient }));

const {
  checkCode,
  sendCode,
  sendJoinCode,
  sendSignInCode,
  signInPhoneOf,
  verifyCode,
} = await import("./otp");

const NOA = "33333333-3333-4333-a333-333333333333";

beforeEach(() => {
  mocks.order.length = 0;
  mocks.noteAuthAttempt.mockReset().mockImplementation(async () => {
    mocks.order.push("count");
    return 0;
  });
  mocks.forgetAuthAttempt.mockReset().mockResolvedValue(undefined);
  mocks.forgetNumberAttempts.mockReset().mockImplementation(async () => {
    mocks.order.push("clear");
  });
  mocks.signInWithOtp.mockReset().mockImplementation(async () => {
    mocks.order.push("send");
    return { data: {}, error: null };
  });
  mocks.cookieVerifyOtp.mockReset().mockResolvedValue({
    data: { user: { id: NOA }, session: { access_token: "a-cookie-token" } },
    error: null,
  });
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
  mocks.cookieClient.mockReset().mockResolvedValue({
    auth: {
      signInWithOtp: mocks.signInWithOtp,
      verifyOtp: mocks.cookieVerifyOtp,
    },
  });
});

/** The auth server refusing a code, with its error code. */
const refused = (code: string) => ({
  data: {},
  error: { code, status: code.startsWith("over_") ? 429 : 422 },
});

describe("sendSignInCode", () => {
  it("answers a number with an account and one without the same, both counted", async () => {
    for (const answer of [
      { data: {}, error: null },
      refused("otp_disabled"),
      refused("signup_disabled"),
    ]) {
      mocks.signInWithOtp.mockResolvedValueOnce(answer);
      expect(await sendSignInCode("050-999-9999")).toBeNull();
    }
    expect(mocks.noteAuthAttempt).toHaveBeenCalledTimes(3);
    expect(mocks.noteAuthAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "send", phone: "+972509999999" }),
    );
    expect(mocks.signInWithOtp).toHaveBeenCalledWith({
      phone: "+972509999999",
      options: { shouldCreateUser: false },
    });
    expect(mocks.forgetAuthAttempt).not.toHaveBeenCalled();
  });

  it("answers a second send within the app's own wait as a code sent, for any number, asking the auth server nothing", async () => {
    for (const phone of ["+972500000003", "+972509999999"]) {
      // Counted for the caller only, by the database.
      mocks.noteAuthAttempt.mockResolvedValueOnce(-2);
      expect(await sendSignInCode(phone)).toBeNull();
    }
    expect(mocks.noteAuthAttempt).toHaveBeenCalledTimes(2);
    expect(mocks.signInWithOtp).not.toHaveBeenCalled();
    // Nothing to give back: the number was never counted.
    expect(mocks.forgetAuthAttempt).not.toHaveBeenCalled();
  });

  it("past the app's own wait, fails on the auth server's limits on everyone and gives the try back, logged by its code", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const code of [
      "over_sms_send_rate_limit",
      "over_request_rate_limit",
    ]) {
      mocks.signInWithOtp.mockResolvedValueOnce(refused(code));
      expect(await sendSignInCode("050-000-0003")).toBe("failed");
    }
    expect(mocks.forgetAuthAttempt).toHaveBeenCalledTimes(2);
    for (const [index, call] of mocks.noteAuthAttempt.mock.calls.entries()) {
      // The very try that was counted, for the number and the caller.
      expect(mocks.forgetAuthAttempt).toHaveBeenNthCalledWith(
        index + 1,
        call[0],
      );
      expect(call[0]).toMatchObject({ kind: "send", phone: "+972500000003" });
    }
    const said = JSON.stringify(logged.mock.calls);
    expect(said).toContain("over_sms_send_rate_limit");
    expect(said).not.toContain("500000003");
    logged.mockRestore();
  });

  it("still fails when giving the try back fails, logged without the number", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.signInWithOtp.mockResolvedValue(refused("over_sms_send_rate_limit"));
    mocks.forgetAuthAttempt.mockRejectedValue(new Error("down"));
    expect(await sendSignInCode("+972500000003")).toBe("failed");
    expect(JSON.stringify(logged.mock.calls)).not.toContain("500000003");
    logged.mockRestore();
  });

  it("sends nothing past too many", async () => {
    mocks.noteAuthAttempt.mockResolvedValue(30);
    expect(await sendSignInCode("+972500000003")).toBe("tooMany");
    expect(mocks.signInWithOtp).not.toHaveBeenCalled();
  });

  it("sends nothing when the count fails", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.noteAuthAttempt.mockRejectedValue(new Error("down"));
    expect(await sendSignInCode("+972500000003")).toBe("failed");
    expect(mocks.signInWithOtp).not.toHaveBeenCalled();
    logged.mockRestore();
  });

  it("catches a malformed number before anything is counted", async () => {
    expect(await sendSignInCode("123")).toBe("invalidPhone");
    expect(mocks.noteAuthAttempt).not.toHaveBeenCalled();
    expect(mocks.signInWithOtp).not.toHaveBeenCalled();
  });

  it("fails when the SMS provider does, gives the try back, logged by its code and never the number", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.signInWithOtp.mockResolvedValue(refused("sms_send_failed"));
    expect(await sendSignInCode("+972500000003")).toBe("failed");
    expect(mocks.forgetAuthAttempt).toHaveBeenCalledWith(
      mocks.noteAuthAttempt.mock.calls[0]?.[0],
    );
    const said = JSON.stringify(logged.mock.calls);
    expect(said).toContain("sms_send_failed");
    expect(said).not.toContain("500000003");
    logged.mockRestore();
  });
});

describe("sendCode", () => {
  it("says a second send within the app's own wait, and asks and runs nothing", async () => {
    const prepare = vi.fn();
    mocks.noteAuthAttempt.mockResolvedValue(-2);
    expect(await sendCode("+972500000003", prepare)).toBe("rateLimit");
    expect(prepare).not.toHaveBeenCalled();
    expect(mocks.signInWithOtp).not.toHaveBeenCalled();
    expect(mocks.forgetAuthAttempt).not.toHaveBeenCalled();
  });

  it("past the app's own wait, fails on the auth server's limits and gives the try back", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const code of [
      "over_sms_send_rate_limit",
      "over_request_rate_limit",
      "sms_send_failed",
    ]) {
      mocks.signInWithOtp.mockResolvedValueOnce(refused(code));
      expect(await sendCode("+972500000003")).toBe("failed");
    }
    const counted = mocks.noteAuthAttempt.mock.calls.map((call) => call[0]);
    expect(counted[0]).toMatchObject({ kind: "send", phone: "+972500000003" });
    expect(mocks.forgetAuthAttempt.mock.calls.map((call) => call[0])).toEqual(
      counted,
    );
    logged.mockRestore();
  });

  it("fails for a number with no account, logged without the number", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.signInWithOtp.mockResolvedValue(refused("otp_disabled"));
    expect(await sendCode("+972500000003")).toBe("failed");
    expect(JSON.stringify(logged.mock.calls)).not.toContain("500000003");
    expect(mocks.forgetAuthAttempt).not.toHaveBeenCalled();
    logged.mockRestore();
  });

  it("runs `prepare` after the count and before the send", async () => {
    expect(
      await sendCode("+972500000003", async () => {
        mocks.order.push("prepare");
      }),
    ).toBeNull();
    expect(mocks.order).toEqual(["count", "prepare", "send"]);
  });

  it("runs nothing past too many", async () => {
    const prepare = vi.fn();
    mocks.noteAuthAttempt.mockResolvedValue(30);
    expect(await sendCode("+972500000003", prepare)).toBe("tooMany");
    expect(prepare).not.toHaveBeenCalled();
    expect(mocks.signInWithOtp).not.toHaveBeenCalled();
  });
});

describe("sendJoinCode", () => {
  const makeAccount = async () => {
    mocks.order.push("account");
  };

  it("clears a number's counts before it counts, then makes the account and sends", async () => {
    expect(await sendJoinCode("050-000-0003", makeAccount)).toBeNull();
    expect(mocks.order).toEqual(["clear", "count", "account", "send"]);
    // One spelling per number: the one its counts are kept by.
    expect(mocks.forgetNumberAttempts).toHaveBeenCalledWith("+972500000003");
    expect(mocks.noteAuthAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "send", phone: "+972500000003" }),
    );
  });

  it("answers as sendCode does once cleared", async () => {
    // A number with an account keeps its counts: a code went to it within
    // the wait, or too many.
    mocks.noteAuthAttempt.mockResolvedValueOnce(-2);
    expect(await sendJoinCode("+972500000003", makeAccount)).toBe("rateLimit");
    expect(mocks.order).toEqual(["clear"]);
    mocks.noteAuthAttempt.mockResolvedValue(30);
    mocks.order.length = 0;
    expect(await sendJoinCode("+972500000003", makeAccount)).toBe("tooMany");
    expect(mocks.order).toEqual(["clear"]);
    expect(mocks.signInWithOtp).not.toHaveBeenCalled();
  });

  it("still counts and sends when the clear fails, logged without the number", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.forgetNumberAttempts.mockRejectedValue(new Error("down"));
    expect(await sendJoinCode("+972500000003", makeAccount)).toBeNull();
    expect(mocks.order).toEqual(["count", "account", "send"]);
    expect(JSON.stringify(logged.mock.calls)).not.toContain("500000003");
    logged.mockRestore();
  });

  it("clears nothing for a malformed number", async () => {
    expect(await sendJoinCode("123", makeAccount)).toBe("invalidPhone");
    expect(mocks.order).toEqual([]);
  });
});

describe("verifyCode", () => {
  it("checks the code on the cookie's client, counted first", async () => {
    expect(await verifyCode("050-000-0003", "123456")).toEqual({
      userId: NOA,
    });
    expect(mocks.noteAuthAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "verify", phone: "+972500000003" }),
    );
    expect(mocks.cookieVerifyOtp).toHaveBeenCalledWith({
      phone: "+972500000003",
      token: "123456",
      type: "sms",
    });
  });

  it("with no code sent to the number lately, is a wrong code, and the auth server isn't asked", async () => {
    mocks.noteAuthAttempt.mockResolvedValue(-1);
    expect(await verifyCode("+972500000003", "123456")).toEqual({
      error: "wrongCode",
    });
    expect(mocks.cookieVerifyOtp).not.toHaveBeenCalled();
  });
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

  it("with no code sent to the number lately, is a wrong code, and the auth server isn't asked", async () => {
    mocks.noteAuthAttempt.mockResolvedValue(-1);
    expect(await checkCode("+972500000003", "123456")).toEqual({
      error: "wrongCode",
    });
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.cookieClient).not.toHaveBeenCalled();
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
