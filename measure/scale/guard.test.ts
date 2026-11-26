import postgres from "postgres";
import { describe, expect, it } from "vitest";
import {
  databaseUrl,
  driverRefusal,
  LOCAL_DATABASE,
  localDatabase,
  localRefusal,
  refuseUnlessLocal,
  refuseUnlessTestLogin,
} from "./guard";

const none = {};

/**
 * Two hosts, the hosted one first: the URL standard reads 127.0.0.1:54322
 * (the host after the last '@'), postgres.js the hosted project on 5432 and
 * then "x@127.0.0.1" (after the first '@', split at the ',').
 */
const MULTI_HOST =
  "postgresql://postgres:secret@db.abcdefghijklmnop.supabase.co,x@127.0.0.1:54322/postgres";

describe("refuseUnlessLocal", () => {
  it("refuses a hosted project, its pooler, another host and the machine's own Postgres", () => {
    for (const url of [
      "postgresql://postgres:secret@db.abcdefghijklmnop.supabase.co:5432/postgres",
      "postgresql://postgres.abcdefghijklmnop:secret@aws-0-eu-central-1.pooler.supabase.com:6543/postgres",
      "postgresql://postgres:postgres@10.0.0.5:54322/postgres",
      "postgresql://postgres:postgres@db.example.com:54322/postgres",
      "postgresql://postgres:postgres@localhost:5432/postgres",
      "postgresql://postgres:postgres@127.0.0.1/postgres",
      "postgresql://postgres:postgres@127.0.0.2:54322/postgres",
      "http://127.0.0.1:54322/postgres",
      "not a url",
    ]) {
      expect(localRefusal(url, none), url).not.toBeNull();
      expect(() => refuseUnlessLocal(url, none)).toThrow(/^Refused/);
    }
  });

  it("refuses a deployment, and an app pointed elsewhere", () => {
    expect(localRefusal(LOCAL_DATABASE, { VERCEL: "1" })).toMatch(/VERCEL/);
    expect(
      localRefusal(LOCAL_DATABASE, {
        NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnop.supabase.co",
      }),
    ).toMatch(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("takes 127.0.0.1, localhost and ::1 on 54322", () => {
    for (const url of [
      LOCAL_DATABASE,
      "postgresql://postgres:postgres@localhost:54322/postgres",
      "postgres://postgres:postgres@[::1]:54322/postgres",
    ]) {
      expect(localRefusal(url, none), url).toBeNull();
    }
    expect(
      localRefusal(LOCAL_DATABASE, {
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:3101",
      }),
    ).toBeNull();
  });

  it("refuses an address postgres.js reads other hosts from than the URL standard does", () => {
    expect(new URL(MULTI_HOST).hostname).toBe("127.0.0.1");
    for (const url of [
      MULTI_HOST,
      "postgresql://postgres:postgres@127.0.0.1:54322,db.example.com:5432/postgres",
      "postgresql://a@b@127.0.0.1:54322/postgres",
    ]) {
      expect(localRefusal(url, none), url).not.toBeNull();
      expect(() => refuseUnlessLocal(url, none)).toThrow(/^Refused/);
    }
    expect(localRefusal(MULTI_HOST, none)).toMatch(/postgres\.js/);
  });

  it("refuses a client whose own hosts or ports aren't the local stack's, before it connects", async () => {
    for (const [url, refusal] of [
      [MULTI_HOST, /db\.abcdefghijklmnop\.supabase\.co/],
      [
        "postgresql://postgres:secret@db.abcdefghijklmnop.supabase.co%2C127.0.0.1:54322/postgres",
        /db\.abcdefghijklmnop\.supabase\.co/,
      ],
      ["postgresql://postgres:postgres@127.0.0.1:5432/postgres", /port 5432/],
    ] as const) {
      const sql = postgres(url, { max: 1 });
      expect(driverRefusal(sql.options), url).toMatch(refusal);
      await sql.end();
    }
    const local = postgres(LOCAL_DATABASE, { max: 1 });
    expect(driverRefusal(local.options)).toBeNull();
    await local.end();

    expect(() => localDatabase({ DATABASE_URL: MULTI_HOST })).toThrow(
      /^Refused/,
    );
    const sql = localDatabase(none);
    expect(sql.options.host).toEqual(["127.0.0.1"]);
    expect(sql.options.port).toEqual([54322]);
    await sql.end();
  });

  it("uses the local stack's database when none is named", () => {
    expect(databaseUrl(none)).toBe(LOCAL_DATABASE);
    expect(
      databaseUrl({
        DATABASE_URL: "postgresql://x@127.0.0.1:54322/y",
      }),
    ).toBe("postgresql://x@127.0.0.1:54322/y");
  });
});

describe("refuseUnlessTestLogin", () => {
  it("signs in only the test business's people", () => {
    expect(() =>
      refuseUnlessTestLogin("p000001@scale.conceptapp.invalid"),
    ).not.toThrow();
    for (const email of [
      "owner@example.com",
      "p000001@scale.conceptapp.invalid.example.com",
      "x@y@scale.conceptapp.invalid",
      "p000001@conceptapp.invalid",
    ]) {
      expect(() => refuseUnlessTestLogin(email), email).toThrow(/^Refused/);
    }
  });
});
