import { sessionCookieName } from "@db/supabase/cookies";
import { AFTER_SIGN_IN_COOKIE } from "@domain/after-sign-in";
import {
  AuthApiError,
  AuthRefreshDiscardedError,
  AuthRetryableFetchError,
} from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SignInState } from "./actions";

// Signing in (`signIn`), with sending and checking the code stood in for:
// every valid number reaches the code step with the same answer, whether it
// has an account or not, and a resend or a check reads the number from the
// step's own state, never the form's. A send and a resend pass on the "אני
// לא רובוט" check's token, and one of another shape is dropped; a send the
// auth server refused for it stays on its step and says so, and so does
// one held by too many codes from this network, with its minutes, which a
// code checked next leaves behind. A right code
// lands on the page a link kept for after sign-in (known issue 21), taken
// from its cookie then and only then, and checked again: one that isn't a
// page to keep lands on Today, deleted all the same.
//
// Signing out (`signOut`), with ending the session and reading the device's
// station stood in for, and the session read (`sessionUserHere`) as it is,
// over a stand-in auth server (`getClaims`) and the request's cookies. It
// holds the order: the session ends first, and only then is where the device
// goes asked, so nothing that read can do keeps anyone signed in; and the
// answer is the one that read gives, the clock station's code or the door.
// It names whose session it ended, read before it ends, for the phone's
// records to go with it (waiter mode P7): as the auth server verifies it, or
// as the session cookie claims it where the server can't say, so a sign-out
// with the server out of reach still takes them; asked "who", it ends
// nothing and only names the person.

vi.mock("server-only", () => ({}));

const USER = "00000000-0000-4000-8000-000000000001";
const SUPABASE_URL = "http://127.0.0.1:54321";

const mocks = vi.hoisted(() => ({
  calls: [] as string[],
  cookies: [] as { name: string; value: string }[],
  deleted: [] as string[],
  endSessionHere: vi.fn(),
  getClaims: vi.fn(),
  signedOutPath: vi.fn(),
  sendSignInCode: vi.fn(),
  verifyCode: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => mocks.cookies,
    get: (name: string) => mocks.cookies.find((c) => c.name === name),
    delete: (name: string) => {
      mocks.deleted.push(name);
      mocks.cookies = mocks.cookies.filter((c) => c.name !== name);
    },
  }),
}));
vi.mock("@db/supabase/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@db/supabase/server")>()),
  createClient: async () => ({ auth: { getClaims: mocks.getClaims } }),
}));
vi.mock("../(app)/business-cookie", () => ({ forgetBusiness: vi.fn() }));
vi.mock("../push/server", () => ({ forgetThisDevice: vi.fn() }));
vi.mock("./end-session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./end-session")>()),
  endSessionHere: mocks.endSessionHere,
}));
vi.mock("../(app)/clock/station/station", () => ({
  signedOutPath: mocks.signedOutPath,
}));
vi.mock("./otp", () => ({
  sendSignInCode: mocks.sendSignInCode,
  verifyCode: mocks.verifyCode,
}));

const { signIn, signOut } = await import("./actions");

/** The sign-in form as it posts. */
const posted = (fields: Record<string, string>) => {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.set(name, value);
  return form;
};

const b64 = (text: string) => Buffer.from(text).toString("base64url");

/** The session cookie as @supabase/ssr writes it, its access token expired. */
const sessionCookie = (sub: string) => ({
  name: sessionCookieName(SUPABASE_URL),
  value: `base64-${b64(
    JSON.stringify({
      access_token: `${b64('{"alg":"ES256"}')}.${b64(JSON.stringify({ sub, exp: 1 }))}.c2ln`,
      refresh_token: "refresh",
      expires_at: 1,
      user: { id: sub },
    }),
  )}`,
});

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  mocks.calls.length = 0;
  mocks.cookies = [sessionCookie(USER)];
  mocks.deleted = [];
  mocks.endSessionHere.mockReset().mockImplementation(async () => {
    mocks.calls.push("end");
  });
  mocks.getClaims.mockReset().mockImplementation(async () => {
    mocks.calls.push("who");
    return { data: { claims: { sub: USER } }, error: null };
  });
  mocks.signedOutPath.mockReset();
  mocks.sendSignInCode.mockReset().mockResolvedValue(null);
  mocks.verifyCode.mockReset().mockResolvedValue({ userId: USER });
});

describe("signing in", () => {
  const phoneStep: SignInState = { step: "phone" };
  const codeStep: SignInState = { step: "code", phone: "+972500000003" };

  it("takes any valid number to the code step, with the same answer", async () => {
    for (const [phone, e164] of [
      ["050-000-0003", "+972500000003"],
      ["050-999-9999", "+972509999999"],
    ] as const) {
      expect(
        await signIn(phoneStep, posted({ intent: "send", phone })),
      ).toEqual({ step: "code", phone: e164, error: undefined, resent: false });
    }
    expect(mocks.sendSignInCode).toHaveBeenCalledWith(
      "+972509999999",
      undefined,
    );
  });

  it("asks again for the step's own number, never the form's, and says it asked", async () => {
    expect(
      await signIn(
        codeStep,
        posted({ intent: "resend", phone: "050-999-9999" }),
      ),
    ).toEqual({
      step: "code",
      phone: "+972500000003",
      error: undefined,
      resent: true,
    });
    expect(mocks.sendSignInCode).toHaveBeenCalledWith(
      "+972500000003",
      undefined,
    );
  });

  it("passes the check's token on a send and a resend, and drops one of another shape", async () => {
    const token = "XXXX.DUMMY.TOKEN.XXXX";
    await signIn(
      phoneStep,
      posted({ intent: "send", phone: "050-000-0003", captcha: token }),
    );
    await signIn(codeStep, posted({ intent: "resend", captcha: token }));
    expect(mocks.sendSignInCode.mock.calls).toEqual([
      ["+972500000003", token],
      ["+972500000003", token],
    ]);
    mocks.sendSignInCode.mockClear();
    for (const captcha of ["", "a".repeat(3000), "two words"]) {
      await signIn(
        phoneStep,
        posted({ intent: "send", phone: "050-000-0003", captcha }),
      );
    }
    await signIn(codeStep, posted({ intent: "resend" }));
    expect(mocks.sendSignInCode.mock.calls.map((call) => call[1])).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });

  it("keeps a send refused for the check on its step, and says so", async () => {
    mocks.sendSignInCode.mockResolvedValueOnce("captcha");
    expect(
      await signIn(
        phoneStep,
        posted({ intent: "send", phone: "050-000-0003" }),
      ),
    ).toEqual({ step: "phone", error: "captcha" });
    mocks.sendSignInCode.mockResolvedValueOnce("captcha");
    expect(await signIn(codeStep, posted({ intent: "resend" }))).toEqual({
      step: "code",
      phone: "+972500000003",
      error: "captcha",
      resent: false,
    });
  });

  it("keeps too many and a failure on the phone step, and on the code step for a resend", async () => {
    for (const error of ["tooMany", "failed"] as const) {
      mocks.sendSignInCode.mockResolvedValueOnce(error);
      expect(
        await signIn(
          phoneStep,
          posted({ intent: "send", phone: "050-000-0003" }),
        ),
      ).toEqual({ step: "phone", error });
      mocks.sendSignInCode.mockResolvedValueOnce(error);
      expect(await signIn(codeStep, posted({ intent: "resend" }))).toEqual({
        step: "code",
        phone: "+972500000003",
        error,
        resent: false,
      });
    }
  });

  it("keeps too many from this network on its step, with its minutes, the same for every number", async () => {
    const held = { error: "tooManyNetwork", minutes: 12 } as const;
    for (const phone of ["050-000-0003", "050-999-9999"]) {
      mocks.sendSignInCode.mockResolvedValueOnce(held);
      expect(
        await signIn(phoneStep, posted({ intent: "send", phone })),
      ).toEqual({ step: "phone", ...held });
    }
    mocks.sendSignInCode.mockResolvedValueOnce(held);
    expect(await signIn(codeStep, posted({ intent: "resend" }))).toEqual({
      step: "code",
      phone: "+972500000003",
      ...held,
      resent: false,
    });
  });

  it("leaves a network's minutes behind once a code is checked", async () => {
    const held: SignInState = {
      ...codeStep,
      error: "tooManyNetwork",
      minutes: 12,
    };
    mocks.verifyCode.mockResolvedValueOnce({ error: "wrongCode" });
    for (const [code, error] of [
      ["123456", "wrongCode"],
      ["12", "invalidCode"],
    ] as const) {
      const after = await signIn(held, posted({ intent: "verify", code }));
      expect(after).toMatchObject({ error });
      expect(after.minutes, code).toBeUndefined();
    }
    const right = await signIn(
      held,
      posted({ intent: "verify", code: "123456" }),
    );
    expect(right).toMatchObject({ error: undefined, to: "/home" });
    expect(right.minutes).toBeUndefined();
  });

  it("catches a malformed number before anything is asked", async () => {
    expect(
      await signIn(phoneStep, posted({ intent: "send", phone: "123" })),
    ).toEqual({ step: "phone", error: "invalidPhone" });
    expect(mocks.sendSignInCode).not.toHaveBeenCalled();
  });

  it("checks the code for the step's own number", async () => {
    mocks.verifyCode.mockResolvedValueOnce({ error: "wrongCode" });
    expect(
      await signIn(
        codeStep,
        posted({ intent: "verify", code: "123456", phone: "050-999-9999" }),
      ),
    ).toEqual({ ...codeStep, error: "wrongCode", resent: false });
    expect(mocks.verifyCode).toHaveBeenCalledWith("+972500000003", "123456");
    expect(
      await signIn(codeStep, posted({ intent: "verify", code: "123456" })),
    ).toEqual({ ...codeStep, error: undefined, resent: false, to: "/home" });
  });

  it("lands on the page a link kept for after sign-in, and takes it", async () => {
    const week = "/schedule?week=2026-11-22";
    mocks.cookies.push({ name: AFTER_SIGN_IN_COOKIE, value: week });
    expect(
      await signIn(codeStep, posted({ intent: "verify", code: "123456" })),
    ).toEqual({ ...codeStep, error: undefined, resent: false, to: week });
    expect(mocks.deleted).toEqual([AFTER_SIGN_IN_COOKIE]);
    expect(
      await signIn(codeStep, posted({ intent: "verify", code: "123456" })),
    ).toMatchObject({ to: "/home" });
  });

  it("lands on Today for a kept page that isn't one to keep, and takes it all the same", async () => {
    for (const value of [
      "//evil.example",
      "https://evil.example",
      "/\\evil.example",
      "/admin",
      "/clock/pay/export?month=2026-10",
      "/api/x",
      "/cron/notifications",
    ]) {
      mocks.deleted = [];
      mocks.cookies.push({ name: AFTER_SIGN_IN_COOKIE, value });
      expect(
        await signIn(codeStep, posted({ intent: "verify", code: "123456" })),
        value,
      ).toMatchObject({ to: "/home" });
      expect(mocks.deleted, value).toEqual([AFTER_SIGN_IN_COOKIE]);
    }
  });

  it("leaves a kept page for a wrong code, a malformed one, a new code and another number", async () => {
    mocks.cookies.push({ name: AFTER_SIGN_IN_COOKIE, value: "/lists" });
    mocks.verifyCode.mockResolvedValueOnce({ error: "wrongCode" });
    await signIn(codeStep, posted({ intent: "verify", code: "123456" }));
    await signIn(codeStep, posted({ intent: "verify", code: "12" }));
    await signIn(phoneStep, posted({ intent: "send", phone: "050-000-0003" }));
    await signIn(codeStep, posted({ intent: "resend" }));
    await signIn(codeStep, posted({ intent: "change" }));
    expect(mocks.deleted).toEqual([]);
    expect(
      await signIn(codeStep, posted({ intent: "verify", code: "123456" })),
    ).toMatchObject({ to: "/lists" });
  });

  it("goes back to the phone step for another number", async () => {
    expect(await signIn(codeStep, posted({ intent: "change" }))).toEqual({
      step: "phone",
    });
  });

  it("has no answer that says a number isn't registered", () => {
    // @ts-expect-error unknownPhone is no answer any more
    const said: SignInState = { step: "phone", error: "unknownPhone" };
    expect(said.step).toBe("phone");
  });
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
    mocks.cookies = [];
    mocks.getClaims.mockResolvedValue({ data: null, error: null });
    mocks.signedOutPath.mockResolvedValue("/enter");
    expect(await signOut()).toEqual({ to: "/enter", user: null });
    expect(mocks.endSessionHere).toHaveBeenCalledTimes(1);
  });

  it("names the cookie's person where the auth server can't be reached, and signs out all the same", async () => {
    mocks.getClaims.mockResolvedValue({
      data: null,
      error: new AuthRetryableFetchError("fetch failed", 0),
    });
    mocks.signedOutPath.mockResolvedValue("/enter");
    expect(await signOut()).toEqual({ to: "/enter", user: USER });
    expect(mocks.endSessionHere).toHaveBeenCalledTimes(1);
    expect(await signOut("who")).toEqual({ to: null, user: USER });
  });

  it("names the cookie's person for any session the server can't vouch for, read before the read can delete it", async () => {
    mocks.signedOutPath.mockResolvedValue("/enter");
    for (const error of [
      new AuthApiError("Too many requests", 429, "over_request_rate_limit"),
      new AuthRefreshDiscardedError(),
      new AuthApiError("Invalid Refresh Token", 400, "refresh_token_not_found"),
    ]) {
      mocks.cookies = [sessionCookie(USER)];
      mocks.getClaims.mockImplementationOnce(async () => {
        // A refused refresh deletes the session cookie as it answers.
        mocks.cookies = [];
        return { data: null, error };
      });
      expect(await signOut(), error.name).toEqual({ to: "/enter", user: USER });
    }
    // Or a read that throws.
    mocks.cookies = [sessionCookie(USER)];
    mocks.getClaims.mockRejectedValueOnce(new Error("down"));
    expect(await signOut()).toEqual({ to: "/enter", user: USER });
  });

  it("names nobody where the server can't say and no cookie claims anyone", async () => {
    mocks.signedOutPath.mockResolvedValue("/enter");
    mocks.getClaims.mockResolvedValue({
      data: null,
      error: new AuthRetryableFetchError("fetch failed", 0),
    });
    for (const cookies of [
      [],
      [{ name: sessionCookieName(SUPABASE_URL), value: "base64-%%%" }],
      [{ ...sessionCookie(USER), name: "sb-other-auth-token" }],
    ]) {
      mocks.cookies = cookies;
      expect(await signOut()).toEqual({ to: "/enter", user: null });
    }
  });

  it("takes the verified person over the cookie's claim", async () => {
    mocks.cookies = [sessionCookie("00000000-0000-4000-8000-000000000002")];
    expect(await signOut("who")).toEqual({ to: null, user: USER });
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
