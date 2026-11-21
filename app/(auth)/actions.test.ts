import { sessionCookieName } from "@db/supabase/cookies";
import {
  AuthApiError,
  AuthRefreshDiscardedError,
  AuthRetryableFetchError,
} from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
  endSessionHere: vi.fn(),
  getClaims: vi.fn(),
  signedOutPath: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => mocks.cookies }),
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
vi.mock("./otp", () => ({ sendCode: vi.fn(), verifyCode: vi.fn() }));

const { signOut } = await import("./actions");

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
  mocks.endSessionHere.mockReset().mockImplementation(async () => {
    mocks.calls.push("end");
  });
  mocks.getClaims.mockReset().mockImplementation(async () => {
    mocks.calls.push("who");
    return { data: { claims: { sub: USER } }, error: null };
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
