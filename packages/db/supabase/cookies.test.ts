import { describe, expect, it } from "vitest";
import {
  authCookieOptions,
  authCookieOptionsFor,
  isSessionCookie,
  sessionCookieName,
} from "./cookies";

const headers = (values: Record<string, string>) => ({
  get: (name: string) => values[name] ?? null,
});

describe("authCookieOptions", () => {
  it("keeps the session from scripts and other sites, Secure over https", () => {
    expect(authCookieOptions("www.conceptapp.co.il", "https")).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
    });
  });

  it("is not Secure on the browser tests' http://127.0.0.1", () => {
    expect(authCookieOptions("127.0.0.1:3100", "http")).toMatchObject({
      httpOnly: true,
      secure: false,
      sameSite: "lax",
    });
  });

  it("leaves the cookie's name and lifetime to @supabase/ssr", () => {
    const options = authCookieOptions("www.conceptapp.co.il", "https");
    expect(options).not.toHaveProperty("name");
    expect(options).not.toHaveProperty("maxAge");
  });
});

describe("authCookieOptionsFor", () => {
  it("reads the forwarded host and protocol first", () => {
    expect(
      authCookieOptionsFor(
        headers({
          host: "127.0.0.1:3000",
          "x-forwarded-host": "www.conceptapp.co.il",
          "x-forwarded-proto": "https",
        }),
      ).secure,
    ).toBe(true);
  });

  it("falls back to the Host header", () => {
    expect(
      authCookieOptionsFor(headers({ host: "localhost:3000" })).secure,
    ).toBe(false);
    expect(
      authCookieOptionsFor(headers({ host: "conceptapp-v2.vercel.app" }))
        .secure,
    ).toBe(true);
  });
});

describe("the session's cookie", () => {
  it("is named after the project, as @supabase/ssr names it", () => {
    expect(sessionCookieName("https://abcdefgh.supabase.co")).toBe(
      "sb-abcdefgh-auth-token",
    );
    // The local stack, as the browser tests run it.
    expect(sessionCookieName("http://127.0.0.1:54321")).toBe(
      "sb-127-auth-token",
    );
  });

  it("is the session whole or in pieces, never the code verifier or another", () => {
    const name = "sb-abcdefgh-auth-token";
    for (const cookie of [name, `${name}.0`, `${name}.1`, `${name}.12`]) {
      expect(isSessionCookie(cookie, name), cookie).toBe(true);
    }
    for (const cookie of [
      `${name}-code-verifier`,
      `${name}.01`,
      `${name}.x`,
      "sb-other-auth-token",
      "ca_station",
      "ca_business",
    ]) {
      expect(isSessionCookie(cookie, name), cookie).toBe(false);
    }
  });
});
