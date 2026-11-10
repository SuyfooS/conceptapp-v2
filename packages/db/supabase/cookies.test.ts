import { describe, expect, it } from "vitest";
import { authCookieOptions, authCookieOptionsFor } from "./cookies";

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
