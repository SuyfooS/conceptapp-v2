import { beforeEach, describe, expect, it, vi } from "vitest";

// Signing out on this device (`endSessionHere`), with what it forgets stood
// in for: the device's push, the business chosen, and, since the hiring
// file's holders' view (profile H6a), the step-up that keeps a holder's
// files open, deleted on the team's path it was set on, before the session
// ends; then only this device's session.

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  calls: [] as string[],
  deleted: [] as unknown[],
  signOut: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    delete: (options: unknown) => {
      mocks.calls.push("cookie");
      mocks.deleted.push(options);
    },
  }),
  headers: async () => new Headers({ host: "127.0.0.1:3000" }),
}));
vi.mock("../(app)/business-cookie", () => ({
  forgetBusiness: async () => {
    mocks.calls.push("business");
  },
}));
vi.mock("../push/server", () => ({
  forgetThisDevice: async () => {
    mocks.calls.push("device");
  },
}));
vi.mock("@db/supabase/server", () => ({
  createClient: async () => ({ auth: { signOut: mocks.signOut } }),
  sessionCookieUser: async () => null,
}));

const { endSessionHere } = await import("./end-session");
const { FILE_STEP_UP_COOKIE, FILE_STEP_UP_PATH } = await import(
  "@domain/file-holders"
);

beforeEach(() => {
  mocks.calls = [];
  mocks.deleted = [];
  mocks.signOut.mockReset().mockImplementation(async () => {
    mocks.calls.push("session");
    return { error: null };
  });
});

describe("signing out here", () => {
  it("forgets the device, the business and a holder's open files, then ends this session only", async () => {
    await endSessionHere();
    expect(mocks.calls).toEqual(["device", "business", "cookie", "session"]);
    expect(mocks.deleted).toEqual([
      { name: FILE_STEP_UP_COOKIE, path: FILE_STEP_UP_PATH },
    ]);
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});
