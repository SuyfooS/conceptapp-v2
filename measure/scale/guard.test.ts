import { describe, expect, it } from "vitest";
import {
  databaseUrl,
  LOCAL_DATABASE,
  localRefusal,
  refuseUnlessLocal,
  refuseUnlessTestLogin,
} from "./guard";

const none = {};

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
