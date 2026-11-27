import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JoinState } from "./actions";

// Joining from an invite (`join`), with the invite, the code and the claim
// stood in for. The first send answers the same whether the invited number
// already had an account or not: sending clears a number's counts only
// while it has none (`sendJoinCode`), so too many and too soon, which only a
// number that kept its counts can meet, are the code step as for a code
// that went, never the invite step. A malformed number and a failure stay on
// the invite step. A new code asked for too soon reads as one asked for, as
// on sign-in, since the wait runs from a send that a number with an account
// kept and one with none had cleared; too many and a failure are said. A
// link that stopped working sends nothing. Each send passes on the "אני לא
// רובוט" check's token, and one the auth server refused for it is said on
// its own step, the same for every number. Too many codes from this network
// is said on either step, with its minutes: that count is the caller's,
// which joining never clears, so it is the same whether the number had an
// account or not. A right code with a claim that
// works forgets a page an earlier link kept for after sign-in (known issue
// 21) and lands where H5b says; a refused claim forgets nothing.

vi.mock("server-only", () => ({}));

const TOKEN_LINK = "t".repeat(43);

const mocks = vi.hoisted(() => ({
  findInvite: vi.fn(),
  ensurePhoneAccount: vi.fn(),
  claimInvite: vi.fn(),
  sendJoinCode: vi.fn(),
  verifyCode: vi.fn(),
  calls: [] as string[],
  forgetAfterSignIn: vi.fn(),
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
vi.mock("../after-sign-in", () => ({
  forgetAfterSignIn: mocks.forgetAfterSignIn,
}));
vi.mock("../otp", () => ({
  sendJoinCode: mocks.sendJoinCode,
  verifyCode: mocks.verifyCode,
}));

const { join } = await import("./actions");

/**
 * The join form as it posts, with the check's token and the code when it
 * has them.
 */
const posted = (intent: string, captcha?: string, code?: string) => {
  const form = new FormData();
  form.set("intent", intent);
  if (captcha !== undefined) form.set("captcha", captcha);
  if (code !== undefined) form.set("code", code);
  return form;
};

const TOKEN = "XXXX.DUMMY.TOKEN.XXXX";

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
  mocks.claimInvite.mockReset();
  mocks.calls = [];
  mocks.forgetAfterSignIn.mockReset().mockImplementation(async () => {
    mocks.calls.push("forget");
  });
  mocks.redirect.mockClear();
});

describe("the first send", () => {
  it("goes to the code step, the invite's number, its account made once the code may go", async () => {
    expect(await join(TOKEN_LINK, inviteStep, posted("send"))).toEqual({
      step: "code",
      error: undefined,
      resent: false,
    });
    expect(mocks.sendJoinCode).toHaveBeenCalledWith("+972500000801", {
      makeAccount: expect.any(Function),
      captcha: undefined,
    });
    await mocks.sendJoinCode.mock.calls[0]?.[1].makeAccount();
    expect(mocks.ensurePhoneAccount).toHaveBeenCalledWith("+972500000801");
  });

  it("passes the check's token on, and drops one of another shape", async () => {
    await join(TOKEN_LINK, inviteStep, posted("send", TOKEN));
    await join(TOKEN_LINK, codeStep, posted("resend", TOKEN));
    await join(TOKEN_LINK, inviteStep, posted("send", "a".repeat(3000)));
    expect(
      mocks.sendJoinCode.mock.calls.map((call) => call[1].captcha),
    ).toEqual([TOKEN, TOKEN, undefined]);
  });

  it("keeps a send refused for the check on the invite step, and says so", async () => {
    mocks.sendJoinCode.mockResolvedValueOnce("captcha");
    expect(await join(TOKEN_LINK, inviteStep, posted("send"))).toEqual({
      step: "invite",
      error: "captcha",
    });
  });

  it("answers too many and too soon word for word as a code that went", async () => {
    const sent = await join(TOKEN_LINK, inviteStep, posted("send"));
    for (const error of ["tooMany", "rateLimit"] as const) {
      mocks.sendJoinCode.mockResolvedValueOnce(error);
      expect(await join(TOKEN_LINK, inviteStep, posted("send"))).toEqual(sent);
    }
  });

  it("says too many from this network on the invite step, with its minutes, never as the code step", async () => {
    const held = { error: "tooManyNetwork", minutes: 12 } as const;
    // A number with an account and one without: sendJoinCode answers both
    // alike, the network's count being the caller's.
    for (const phone of ["+972500000801", "+972509999999"]) {
      mocks.findInvite.mockResolvedValueOnce({
        ...(await mocks.findInvite()),
        phone,
      });
      mocks.sendJoinCode.mockResolvedValueOnce(held);
      expect(await join(TOKEN_LINK, inviteStep, posted("send"))).toEqual({
        step: "invite",
        ...held,
      });
    }
  });

  it("keeps a malformed number and a failure on the invite step", async () => {
    for (const error of ["invalidPhone", "failed"] as const) {
      mocks.sendJoinCode.mockResolvedValueOnce(error);
      expect(await join(TOKEN_LINK, inviteStep, posted("send"))).toEqual({
        step: "invite",
        error,
      });
    }
  });

  it("is a failure on the invite step when sending throws, logged without the number", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.sendJoinCode.mockRejectedValueOnce(new Error("down"));
    expect(await join(TOKEN_LINK, inviteStep, posted("send"))).toEqual({
      step: "invite",
      error: "failed",
    });
    expect(JSON.stringify(logged.mock.calls)).not.toContain("500000801");
    logged.mockRestore();
  });
});

describe("a new code", () => {
  it("says it went", async () => {
    expect(await join(TOKEN_LINK, codeStep, posted("resend"))).toEqual({
      step: "code",
      error: undefined,
      resent: true,
    });
  });

  it("reads too soon word for word as a new code that went, as sign-in does", async () => {
    const sent = await join(TOKEN_LINK, codeStep, posted("resend"));
    mocks.sendJoinCode.mockResolvedValueOnce("rateLimit");
    const tooSoon = await join(TOKEN_LINK, codeStep, posted("resend"));
    expect(tooSoon).toEqual(sent);
    expect(tooSoon).toEqual({ step: "code", error: undefined, resent: true });
  });

  it("says too many, a failure and a refusal for the check on the code step", async () => {
    for (const error of ["tooMany", "failed", "captcha"] as const) {
      mocks.sendJoinCode.mockResolvedValueOnce(error);
      expect(await join(TOKEN_LINK, codeStep, posted("resend"))).toEqual({
        step: "code",
        error,
        resent: false,
      });
    }
  });

  it("says too many from this network on the code step, with its minutes", async () => {
    const held = { error: "tooManyNetwork", minutes: 3 } as const;
    mocks.sendJoinCode.mockResolvedValueOnce(held);
    expect(await join(TOKEN_LINK, codeStep, posted("resend"))).toEqual({
      step: "code",
      ...held,
      resent: false,
    });
  });
});

describe("a link that stopped working", () => {
  it("goes back to its page before anything is sent", async () => {
    mocks.findInvite.mockResolvedValue(null);
    await expect(join(TOKEN_LINK, inviteStep, posted("send"))).rejects.toThrow(
      `redirect /join/${TOKEN_LINK}`,
    );
    expect(mocks.sendJoinCode).not.toHaveBeenCalled();
  });
});

describe("a right code", () => {
  it("forgets a page kept for after sign-in, and lands where joining does", async () => {
    mocks.verifyCode.mockResolvedValue({
      userId: "00000000-0000-4000-8000-000000000801",
    });
    mocks.claimInvite.mockResolvedValue({
      ok: true,
      businessId: "00000000-0000-4000-b000-000000000001",
    });
    mocks.redirect.mockImplementationOnce((to: string) => {
      mocks.calls.push(`redirect ${to}`);
      throw new Error(`redirect ${to}`);
    });
    await expect(
      join(TOKEN_LINK, codeStep, posted("verify", undefined, "123456")),
    ).rejects.toThrow("redirect /home");
    expect(mocks.forgetAfterSignIn).toHaveBeenCalledTimes(1);
    expect(mocks.calls).toEqual(["forget", "redirect /home"]);
  });

  it("forgets nothing when the claim is refused", async () => {
    mocks.verifyCode.mockResolvedValue({
      userId: "00000000-0000-4000-8000-000000000801",
    });
    mocks.claimInvite.mockResolvedValue({ ok: false, error: "shiftsLeft" });
    expect(
      await join(TOKEN_LINK, codeStep, posted("verify", undefined, "123456")),
    ).toEqual({ step: "code", error: "shiftsLeft" });
    mocks.claimInvite.mockResolvedValue({ ok: false, error: "notOpen" });
    await expect(
      join(TOKEN_LINK, codeStep, posted("verify", undefined, "123456")),
    ).rejects.toThrow(`redirect /join/${TOKEN_LINK}`);
    expect(mocks.forgetAfterSignIn).not.toHaveBeenCalled();
  });
});
