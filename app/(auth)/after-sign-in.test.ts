import { AFTER_SIGN_IN_COOKIE } from "@domain/after-sign-in";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The page a link kept for after sign-in, as a door takes it: once, deleted
// whether it is one to keep or not, and checked again, since the browser can
// write the cookie too. With none, nothing is deleted. Forgetting it deletes
// it, kept or not.

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  jar: new Map<string, string>(),
  deleted: [] as unknown[],
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = mocks.jar.get(name);
      return value === undefined ? undefined : { name, value };
    },
    delete: (name: string) => {
      mocks.deleted.push(name);
      mocks.jar.delete(name);
    },
  }),
}));

const { forgetAfterSignIn, takeAfterSignIn } = await import("./after-sign-in");

beforeEach(() => {
  mocks.jar.clear();
  mocks.deleted = [];
});

describe("taking the page kept for after sign-in", () => {
  it("answers a page to keep, and deletes it", async () => {
    mocks.jar.set(AFTER_SIGN_IN_COOKIE, "/schedule?week=2026-11-22");
    expect(await takeAfterSignIn()).toBe("/schedule?week=2026-11-22");
    expect(mocks.deleted).toEqual([AFTER_SIGN_IN_COOKIE]);
    expect(await takeAfterSignIn()).toBeNull();
    expect(mocks.deleted).toEqual([AFTER_SIGN_IN_COOKIE]);
  });

  it("answers nothing for one that isn't kept, and deletes it all the same", async () => {
    for (const value of [
      "//evil.example",
      "https://evil.example/schedule",
      "/admin",
      "/clock/pay/export?month=2026-10",
      "",
    ]) {
      mocks.deleted = [];
      mocks.jar.set(AFTER_SIGN_IN_COOKIE, value);
      expect(await takeAfterSignIn(), value).toBeNull();
      expect(mocks.deleted, value).toEqual([AFTER_SIGN_IN_COOKIE]);
    }
  });

  it("answers nothing and deletes nothing where none was kept", async () => {
    expect(await takeAfterSignIn()).toBeNull();
    expect(mocks.deleted).toEqual([]);
  });
});

describe("forgetting it", () => {
  it("deletes it", async () => {
    mocks.jar.set(AFTER_SIGN_IN_COOKIE, "/lists");
    await forgetAfterSignIn();
    expect(mocks.deleted).toEqual([AFTER_SIGN_IN_COOKIE]);
    expect(await takeAfterSignIn()).toBeNull();
  });
});
