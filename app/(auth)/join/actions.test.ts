import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JoinState } from "./actions";

// Joining from an invite (`join`), with the invite, the code and the claim
// stood in for. The first send answers the same whether the invited number
// already had an account or not: sending clears a number's counts only
// while it has none (`sendJoinCode`), so too many and too soon, which only a
// number that kept its counts can meet, are the code step as for a code
// that went, never the invite step. A malformed number and a failure stay on
// the invite step. A new code asked for says each as it is. A link that
// stopped working sends nothing.

vi.mock("server-only", () => ({}));

const TOKEN = "t".repeat(43);

const mocks = vi.hoisted(() => ({
  findInvite: vi.fn(),
  ensurePhoneAccount: vi.fn(),
  claimInvite: vi.fn(),
  sendJoinCode: vi.fn(),
  verifyCode: vi.fn(),
  redirect: vi.fn((to: string) => {
    throw new Error(`redirect ${to}`);
  }),
}));
vi.mock("@db/invites", () => ({
  findInvite: mocks.findInvite,
  ensurePhoneAccount: mocks.ensurePhoneAccount,
  claimInvite: mocks.claimInvite,
}));
vi.mock("@db/module-settings", () => ({
  getBusinessModulesForTeam: vi.fn(async () => []),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("../../(app)/business-cookie", () => ({ rememberBusiness: vi.fn() }));
vi.mock("../../push/server", () => ({ pushSoon: vi.fn() }));
vi.mock("../otp", () => ({
  sendJoinCode: mocks.sendJoinCode,
  verifyCode: mocks.verifyCode,
}));

const { join } = await import("./actions");

/** The join form as it posts. */
const posted = (intent: string) => {
  const form = new FormData();
  form.set("intent", intent);
  return form;
};

const inviteStep: JoinState = { step: "invite" };
const codeStep: JoinState = { step: "code" };

beforeEach(() => {
  mocks.findInvite.mockReset().mockResolvedValue({
    id: "11111111-1111-4111-a111-111111111111",
    phone: "+972500000801",
    role: "worker",
    namedRole: null,
    name: null,
    business: {
      id: "00000000-0000-4000-b000-000000000001",
      name: "Demo",
      accent: "#8b2635",
    },
    status: "open",
  });
  mocks.sendJoinCode.mockReset().mockResolvedValue(null);
  mocks.verifyCode.mockReset();
  mocks.redirect.mockClear();
});

describe("the first send", () => {
  it("goes to the code step, the invite's number, its account made once the code may go", async () => {
    expect(await join(TOKEN, inviteStep, posted("send"))).toEqual({
      step: "code",
      error: undefined,
      resent: false,
    });
    expect(mocks.sendJoinCode).toHaveBeenCalledWith(
      "+972500000801",
      expect.any(Function),
    );
    await mocks.sendJoinCode.mock.calls[0]?.[1]();
    expect(mocks.ensurePhoneAccount).toHaveBeenCalledWith("+972500000801");
  });

  it("answers too many and too soon word for word as a code that went", async () => {
    const sent = await join(TOKEN, inviteStep, posted("send"));
    for (const error of ["tooMany", "rateLimit"] as const) {
      mocks.sendJoinCode.mockResolvedValueOnce(error);
      expect(await join(TOKEN, inviteStep, posted("send"))).toEqual(sent);
    }
  });

  it("keeps a malformed number and a failure on the invite step", async () => {
    for (const error of ["invalidPhone", "failed"] as const) {
      mocks.sendJoinCode.mockResolvedValueOnce(error);
      expect(await join(TOKEN, inviteStep, posted("send"))).toEqual({
        step: "invite",
        error,
      });
    }
  });

  it("is a failure on the invite step when sending throws, logged without the number", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.sendJoinCode.mockRejectedValueOnce(new Error("down"));
    expect(await join(TOKEN, inviteStep, posted("send"))).toEqual({
      step: "invite",
      error: "failed",
    });
    expect(JSON.stringify(logged.mock.calls)).not.toContain("500000801");
    logged.mockRestore();
  });
});

describe("a new code", () => {
  it("says it went", async () => {
    expect(await join(TOKEN, codeStep, posted("resend"))).toEqual({
      step: "code",
      error: undefined,
      resent: true,
    });
  });

  it("says too soon, too many and a failure on the code step", async () => {
    for (const error of ["rateLimit", "tooMany", "failed"] as const) {
      mocks.sendJoinCode.mockResolvedValueOnce(error);
      expect(await join(TOKEN, codeStep, posted("resend"))).toEqual({
        step: "code",
        error,
        resent: false,
      });
    }
  });
});

describe("a link that stopped working", () => {
  it("goes back to its page before anything is sent", async () => {
    mocks.findInvite.mockResolvedValue(null);
    await expect(join(TOKEN, inviteStep, posted("send"))).rejects.toThrow(
      `redirect /join/${TOKEN}`,
    );
    expect(mocks.sendJoinCode).not.toHaveBeenCalled();
  });
});
