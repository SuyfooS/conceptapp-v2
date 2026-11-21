import { describe, expect, it } from "vitest";
import { claimedSessionUser } from "./session-cookie";

// Whose session the cookies claim, read the way @supabase/ssr writes the
// cookie: whole or in pieces, base64url behind "base64-" (its default) or
// plain JSON (its older one). Unverified on purpose: only whose records on
// the device go is chosen by it (signing out, waiter mode P7).

const NAME = "sb-127-auth-token";
const USER = "00000000-0000-4000-a000-000000000011";

const b64 = (text: string) => Buffer.from(text).toString("base64url");

const token = (payload: unknown) =>
  `${b64(JSON.stringify({ alg: "ES256", typ: "JWT" }))}.${b64(JSON.stringify(payload))}.c2lnbmF0dXJl`;

const session = (accessToken: unknown = token({ sub: USER, exp: 1 })) =>
  JSON.stringify({
    access_token: accessToken,
    token_type: "bearer",
    expires_at: 1,
    refresh_token: "refresh",
    user: { id: USER },
  });

const cookie = (value: string, name = NAME) => ({ name, value });

describe("claimedSessionUser", () => {
  it("names the access token's person, from the cookie as @supabase/ssr writes it", async () => {
    expect(
      await claimedSessionUser([cookie(`base64-${b64(session())}`)], NAME),
    ).toBe(USER);
  });

  it("reads a cookie cut into pieces, in their order", async () => {
    const value = `base64-${b64(session())}`;
    const half = Math.floor(value.length / 2);
    expect(
      await claimedSessionUser(
        [
          cookie("other", "ca_business"),
          cookie(value.slice(half), `${NAME}.1`),
          cookie(value.slice(0, half), `${NAME}.0`),
        ],
        NAME,
      ),
    ).toBe(USER);
  });

  it("reads a cookie kept as plain JSON", async () => {
    expect(await claimedSessionUser([cookie(session())], NAME)).toBe(USER);
  });

  it("reads the claim only, never checks it: what it names is only deleted", async () => {
    const unsigned = `${b64("{}")}.${b64(JSON.stringify({ sub: USER }))}.`;
    expect(
      await claimedSessionUser(
        [cookie(`base64-${b64(session(unsigned))}`)],
        NAME,
      ),
    ).toBe(USER);
  });

  it("names nobody without this project's session cookie", async () => {
    expect(await claimedSessionUser([], NAME)).toBeNull();
    expect(
      await claimedSessionUser(
        [
          cookie(`base64-${b64(session())}`, "sb-other-auth-token"),
          cookie(`base64-${b64(session())}`, `${NAME}-code-verifier`),
          cookie("", NAME),
        ],
        NAME,
      ),
    ).toBeNull();
  });

  it("names nobody from a cookie it can't read", async () => {
    for (const value of [
      "base64-%%%",
      `base64-${b64("not json")}`,
      "not json",
      JSON.stringify({ refresh_token: "refresh" }),
      session(42),
      session("no-payload"),
      session(`${b64("{}")}.${b64("not json")}.`),
      session(token({ exp: 1 })),
      session(token({ sub: "someone" })),
      session(token({ sub: 42 })),
      "null",
    ]) {
      expect(await claimedSessionUser([cookie(value)], NAME), value).toBeNull();
    }
  });
});
