import { beforeEach, describe, expect, it, vi } from "vitest";

// Signing out on this device (`endSessionHere`), with what it forgets stood
// in for: the device's push, the business chosen, the page a link kept for
// after sign-in (known issue 21), deleted by its name, and, since the hiring
// file's holders' view (profile H6a), the step-up that keeps a holder's
// files open: the database's for this sign-in first
// (20261127000400_file_step_up.sql), then the cookie, deleted on the team's
// path it was set on, before the session ends, even when the database can't
// be told; then only this device's session.

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  calls: [] as string[],
  deleted: [] as unknown[],
  signOut: vi.fn(),
  closeFileStepUp: vi.fn(),
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
vi.mock("@db/session", () => ({
  currentAuthSession: async () => ({ userId: USER, sessionId: SESSION }),
}));
vi.mock("@db/employee-files", () => ({
  closeFileStepUp: mocks.closeFileStepUp,
}));

const USER = "00000000-0000-4000-8000-000000000001";
const SESSION = "00000000-0000-4000-8000-0000000000aa";

const { endSessionHere } = await import("./end-session");
const { FILE_STEP_UP_COOKIE, FILE_STEP_UP_PATH } = await import(
  "@domain/file-holders"
);
const { AFTER_SIGN_IN_COOKIE } = await import("@domain/after-sign-in");

beforeEach(() => {
  mocks.calls = [];
  mocks.deleted = [];
  mocks.signOut.mockReset().mockImplementation(async () => {
    mocks.calls.push("session");
    return { error: null };
  });
  mocks.closeFileStepUp.mockReset().mockImplementation(async () => {
    mocks.calls.push("fileStepUp");
  });
});

describe("signing out here", () => {
  it("forgets the device, the business, a kept page and a holder's open files, then ends this session only", async () => {
    await endSessionHere();
    expect(mocks.calls).toEqual([
      "device",
      "business",
      "cookie",
      "fileStepUp",
      "cookie",
      "session",
    ]);
    expect(mocks.closeFileStepUp).toHaveBeenCalledWith(USER, SESSION);
    expect(mocks.deleted).toEqual([
      AFTER_SIGN_IN_COOKIE,
      { name: FILE_STEP_UP_COOKIE, path: FILE_STEP_UP_PATH },
    ]);
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("still ends the session when the database's step-up can't be closed", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.closeFileStepUp.mockRejectedValueOnce(
      Object.assign(new Error(SESSION), { code: "XX000" }),
    );
    await endSessionHere();
    expect(mocks.calls).toEqual([
      "device",
      "business",
      "cookie",
      "cookie",
      "session",
    ]);
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(JSON.stringify(logged.mock.calls)).not.toContain(SESSION);
    logged.mockRestore();
  });
});
