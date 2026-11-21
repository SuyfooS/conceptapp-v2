import { beforeEach, describe, expect, it, vi } from "vitest";

// The chat sync's look again at a conversation (`r=1`), with the database
// stood in for: who confirmed a pinned announcement is counted for the
// moderators as the database says they are (`public.my_permissions`, through
// `getOwnPlace`'s `permissions`, which a business's denial for managers
// reaches), never from the role alone but for an owner; and a private chat,
// which has no announcements, never asks what they hold.

vi.mock("server-only", () => ({}));

const BUSINESS = "10000000-0000-4000-b000-000000000001";
const PERSON = "00000000-0000-4000-a000-000000000012";
const CONVERSATION = "40000000-0000-4000-a000-000000000001";
const VERSION = "0123456789abcdef0123456789abcdef";

const mocks = vi.hoisted(() => ({
  getOwnPlace: vi.fn(),
  permissions: vi.fn(),
  getConversationStamp: vi.fn(),
  getPinnedState: vi.fn(),
}));
vi.mock("@/app/origin", () => ({ sameOriginRequest: async () => true }));
vi.mock("@db/session", () => ({ getOwnPlace: mocks.getOwnPlace }));
vi.mock("@db/chat", () => ({
  CHAT_PAGE_SIZE: 50,
  chatSeen: async () => null,
  chatVersion: async () => VERSION,
  getChatAuthors: async () => ({}),
  getChatList: async () => [],
  getConversationStamp: mocks.getConversationStamp,
  getMarkedMessages: async () => [],
  getMessages: async () => [],
  getMessagesById: async () => [],
  getPinnedState: mocks.getPinnedState,
  withOwnDrafts: async (messages: unknown[]) => messages,
}));

const { GET } = await import("./route");
const { permissions: catalogue } = await import("@modules/registry");

/** Someone on the staff in role `role`, whom the database says holds `held`. */
function signedIn(role: string, held: string[]) {
  mocks.permissions.mockResolvedValue(held);
  mocks.getOwnPlace.mockResolvedValue({
    userId: PERSON,
    viewing: false,
    place: {
      businessId: BUSINESS,
      role,
      permissions: mocks.permissions,
      enabled: ["chat"],
    },
  });
}

/** The screen looking again at the conversation, a group or a private chat. */
function lookAgain(kind: "team" | "direct") {
  mocks.getConversationStamp.mockResolvedValue({
    kind,
    changed: "2026-11-15T08:00:00+00:00",
  });
  return GET(
    new Request(
      `http://localhost:3000/chat-sync?v=${VERSION}&c=${CONVERSATION}&m=00000000&r=1`,
    ),
  );
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.getPinnedState.mockResolvedValue([]);
});

describe("the chat sync's look again", () => {
  it("counts readers for a manager the database says moderates", async () => {
    signedIn("manager", ["chat.announce", "chat.moderate"]);
    expect((await lookAgain("team")).status).toBe(200);
    expect(mocks.permissions).toHaveBeenCalledTimes(1);
    expect(mocks.permissions).toHaveBeenCalledWith(catalogue);
    expect(mocks.getPinnedState).toHaveBeenCalledWith(
      BUSINESS,
      CONVERSATION,
      PERSON,
      true,
    );
  });

  it("and not for a manager the business denied moderating, nor a worker", async () => {
    signedIn("manager", ["chat.announce", "chat.send_documents"]);
    await lookAgain("team");
    expect(mocks.getPinnedState).toHaveBeenLastCalledWith(
      BUSINESS,
      CONVERSATION,
      PERSON,
      false,
    );
    signedIn("worker", []);
    await lookAgain("team");
    expect(mocks.getPinnedState).toHaveBeenLastCalledWith(
      BUSINESS,
      CONVERSATION,
      PERSON,
      false,
    );
  });

  it("while an owner moderates always", async () => {
    signedIn("owner", []);
    await lookAgain("team");
    expect(mocks.getPinnedState).toHaveBeenCalledWith(
      BUSINESS,
      CONVERSATION,
      PERSON,
      true,
    );
  });

  it("never asks what they hold in a private chat", async () => {
    signedIn("manager", ["chat.moderate"]);
    expect((await lookAgain("direct")).status).toBe(200);
    expect(mocks.permissions).not.toHaveBeenCalled();
    expect(mocks.getPinnedState).not.toHaveBeenCalled();
  });
});

describe("the chat sync's session", () => {
  it("is signed out only when nobody is, and fails, to be asked again, when it couldn't be read now", async () => {
    mocks.getOwnPlace.mockResolvedValue(null);
    expect((await lookAgain("team")).status).toBe(401);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getOwnPlace.mockRejectedValue(
      Object.assign(new Error("fetch failed"), {
        name: "AuthRetryableFetchError",
      }),
    );
    const out = await lookAgain("team");
    expect(out.status).toBe(500);
    expect(mocks.getConversationStamp).not.toHaveBeenCalled();
    log.mockRestore();
  });
});
