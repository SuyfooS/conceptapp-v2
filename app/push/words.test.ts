import type {
  NotificationEntry,
  NotificationLine,
} from "@domain/notifications";
import { describe, expect, it, vi } from "vitest";
import he from "@/messages/he.json";

vi.mock("server-only", () => ({}));

const { pushWords } = await import("./words");
const { baseWording } = await import("@/app/(app)/wording");

const words = he.app.notifications.kinds.chat;

const entry = (line: NotificationLine, settled = false): NotificationEntry => ({
  id: "0a000000-0000-4000-a000-000000000001",
  at: "2026-11-11T08:10:00.000Z",
  read: false,
  settled,
  actor: { kind: "member", name: "שירן הדגמה" },
  group: "chat",
  href: "/chat/0b000000-0000-4000-a000-000000000002",
  line,
});

const say = (line: NotificationLine, settled = false) =>
  pushWords(entry(line, settled), baseWording, "Asia/Jerusalem");

// What a chat's lines say on a phone (chat C1 and C3): who and where, and that
// an announcement waits for "קראתי", never a word of any message, since the
// lines hold none and a lock screen is seen by whoever is near the phone.
describe("a chat's words on the phone", () => {
  const from = { kind: "member", name: "שירן הדגמה" } as const;

  it("names an announcement and its group, and asks for the confirmation", () => {
    expect(
      say({ kind: "chat.announcement", from, chat: { kind: "team" } }),
    ).toEqual({
      title: words.announcement.title,
      body: words.announcement.bodyTeam,
    });
    expect(
      say({
        kind: "chat.announcement",
        from,
        chat: { kind: "department", name: "מטבח" },
      }),
    ).toEqual({
      title: words.announcement.title,
      body: words.announcement.body.replace("{group}", "מטבח"),
    });
    expect(say({ kind: "chat.announcement", from, chat: null }).body).toBe(
      words.announcement.bodyPlain,
    );
  });

  it("says once it was settled that it no longer waits", () => {
    expect(
      say({ kind: "chat.announcement", from, chat: { kind: "team" } }, true)
        .body,
    ).toBe(words.announcement.settledNote);
  });

  it("names who wrote and how many wait in a private chat and a group", () => {
    const direct = say({ kind: "chat.direct", from, count: 3 });
    expect(direct.title).toBe("שירן הדגמה");
    expect(direct.body).toContain("3");
    const group = say({
      kind: "chat.group",
      from,
      count: 1,
      chat: { kind: "team" },
    });
    expect(group.title).toBe(words.group.titleTeam);
    expect(group.body).toContain("שירן הדגמה");
  });
});
