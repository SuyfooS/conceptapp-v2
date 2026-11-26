import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The Team screen's two link actions, "קישור חדש" (`resendInviteAction`)
// and "יצירת קישור" (`firstLinkAction`), with what they read and write stood
// in for: the session's member, the link writers of @db/invites, the
// request's origin and the refresh. Each row binds its invite's id in the
// browser, so the id is whatever a caller posts: anything but a uuid is
// refused before the session or the database is asked, and nothing of it
// reaches the log. A first link made meanwhile elsewhere ("linked") reads
// the list again, so the screen finds the invite open; another refusal
// reads nothing again.

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  currentMember: vi.fn(),
  issueFirstInviteLink: vi.fn(),
  issueTeamInviteLink: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("../member", () => ({ currentMember: mocks.currentMember }));
vi.mock("../team", () => ({ currentGivableNamedRoles: async () => [] }));
vi.mock("../../push/server", () => ({ pushSoon: vi.fn() }));
vi.mock("@/app/origin", () => ({ requestOrigin: async () => ORIGIN }));
vi.mock("next/cache", () => ({
  refresh: mocks.refresh,
  revalidatePath: vi.fn(),
}));
vi.mock("@db/invites", () => ({
  inviteToTeam: vi.fn(),
  issueFirstInviteLink: mocks.issueFirstInviteLink,
  issueTeamInviteLink: mocks.issueTeamInviteLink,
}));
vi.mock("@db/profile", () => ({ clearProfileBio: vi.fn() }));
vi.mock("@db/team", () => ({
  cancelTeamInvite: vi.fn(),
  removeMember: vi.fn(),
  setMemberName: vi.fn(),
  setMemberRole: vi.fn(),
}));

const ORIGIN = "https://app.example.test";

const { firstLinkAction, resendInviteAction } = await import("./actions");

const SHOP = "11111111-1111-4111-a111-111111111111";
const OWNER = "33333333-3333-4333-a333-333333333333";
const INVITE = "55555555-5555-4555-a555-555555555555";
const TOKEN = "a".repeat(43);
const PHONE = "+972500007618";

const actions = [
  ["firstLinkAction", firstLinkAction, mocks.issueFirstInviteLink],
  ["resendInviteAction", resendInviteAction, mocks.issueTeamInviteLink],
] as const;

const press = (
  action: (typeof actions)[number][1],
  inviteId: string,
): ReturnType<typeof firstLinkAction> => action(inviteId, {}, new FormData());

let logged: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mocks.currentMember.mockReset().mockResolvedValue({
    userId: OWNER,
    viewing: null,
    membership: { role: "owner", perms: [], business: { id: SHOP } },
  });
  for (const issue of [mocks.issueFirstInviteLink, mocks.issueTeamInviteLink]) {
    issue
      .mockReset()
      .mockResolvedValue({ ok: true, token: TOKEN, phone: PHONE });
  }
  mocks.refresh.mockReset();
  logged = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe.each(actions)("%s", (_name, action, issue) => {
  it("makes the link for the signed-in person, and the screen reads its list again", async () => {
    await expect(press(action, INVITE)).resolves.toEqual({
      link: `${ORIGIN}/join/${TOKEN}`,
    });
    expect(issue).toHaveBeenCalledWith(OWNER, INVITE);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("refuses an id that is no uuid before the session or the database is asked, and logs nothing of it", async () => {
    const posted = [
      "abc",
      `${INVITE}x`,
      "x".repeat(100_000),
      `'; drop table invites; --`,
    ];
    for (const id of posted) {
      await expect(press(action, id), id.slice(0, 20)).resolves.toEqual({
        failure: "notOpen",
      });
    }
    expect(mocks.currentMember).not.toHaveBeenCalled();
    expect(issue).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(logged).not.toHaveBeenCalled();
  });

  it("makes nothing for someone who doesn't edit the team", async () => {
    mocks.currentMember.mockResolvedValue({
      userId: OWNER,
      viewing: null,
      membership: { role: "worker", perms: [], business: { id: SHOP } },
    });
    await expect(press(action, INVITE)).resolves.toEqual({
      failure: "noPermission",
    });
    expect(issue).not.toHaveBeenCalled();
  });

  it("says a refusal as the screen explains it, and reads nothing again", async () => {
    issue.mockResolvedValueOnce({ ok: false, error: "notOpen" });
    await expect(press(action, INVITE)).resolves.toEqual({
      failure: "notOpen",
    });
    // The console's refusal of a second owner reads as not allowed here.
    issue.mockResolvedValueOnce({ ok: false, error: "hasOwner" });
    await expect(press(action, INVITE)).resolves.toEqual({
      failure: "notAllowed",
    });
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("logs a failure by the write that failed, and says it failed", async () => {
    issue.mockRejectedValueOnce(new Error("connection reset"));
    await expect(press(action, INVITE)).resolves.toEqual({
      failure: "failed",
    });
    expect(logged).toHaveBeenCalledWith(
      action === firstLinkAction
        ? "issueFirstInviteLink failed"
        : "issueTeamInviteLink failed",
      "connection reset",
    );
  });
});

describe("firstLinkAction", () => {
  it("a link made meanwhile elsewhere: 'linked', and the screen reads its list again, where the invite is open", async () => {
    mocks.issueFirstInviteLink.mockResolvedValueOnce({
      ok: false,
      error: "linked",
    });
    await expect(press(firstLinkAction, INVITE)).resolves.toEqual({
      failure: "linked",
    });
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(mocks.issueTeamInviteLink).not.toHaveBeenCalled();
  });
});
