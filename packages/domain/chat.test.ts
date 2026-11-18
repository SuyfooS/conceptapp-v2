import { describe, expect, it } from "vitest";
import {
  CHAT_MESSAGE_MAX,
  CHAT_RULES,
  type ChatInboxRow,
  charCount,
  chatCursor,
  chatPreview,
  checkMessage,
  cleanMessage,
  conversationTitle,
  directPair,
  groupMessages,
  messageParts,
  parseChatCursor,
  readChatInbox,
  sortInbox,
} from "./chat";

const A = "0a000000-0000-4000-a000-000000000001";
const B = "0b000000-0000-4000-a000-000000000002";
const C = "0c000000-0000-4000-a000-000000000003";

describe("cleanMessage", () => {
  it("trims, keeps line breaks and turns tabs into spaces", () => {
    expect(cleanMessage("  שלום\r\nלכולם\t!  ")).toBe("שלום\nלכולם !");
  });

  it("keeps at most one empty line in a row", () => {
    expect(cleanMessage("א\n\n\n\nב\n \n \nג")).toBe("א\n\nב\n\nג");
    expect(cleanMessage("א\n\nב")).toBe("א\n\nב");
  });

  it("drops controls and bidi overrides, and keeps what people type on purpose", () => {
    expect(cleanMessage("a\u0000b\u0007c")).toBe("abc");
    // An override could show "evil.exe" as something else.
    expect(cleanMessage("x\u202Eexe.txt\u202C")).toBe("xexe.txt");
    expect(cleanMessage("x\u2066y\u2069")).toBe("xy");
    // The maqaf, direction marks, other scripts' digits and emoji stay.
    expect(cleanMessage("תל־אביב \u200F٣ 👋")).toBe("תל־אביב \u200F٣ 👋");
  });

  it("reads composed and decomposed letters the same", () => {
    expect(cleanMessage("e\u0301")).toBe("\u00E9");
  });
});

describe("checkMessage", () => {
  it("refuses an empty message, whatever it is made of", () => {
    expect(checkMessage(" \n\t \u202E ")).toEqual({
      ok: false,
      reason: "empty",
    });
  });

  it("counts characters as the database does, so an emoji is one", () => {
    expect(charCount("👋")).toBe(1);
    const longest = "👋".repeat(CHAT_MESSAGE_MAX);
    expect(checkMessage(longest)).toEqual({ ok: true, body: longest });
    expect(checkMessage(`${longest}x`)).toEqual({
      ok: false,
      reason: "tooLong",
    });
  });

  it("gives back the body as it will be stored", () => {
    expect(checkMessage("  בוקר טוב  ")).toEqual({
      ok: true,
      body: "בוקר טוב",
    });
  });
});

describe("chatPreview", () => {
  it("is the whole message on one line when it is short", () => {
    expect(chatPreview("בוקר\nטוב")).toBe("בוקר טוב");
  });

  it("cuts a long one at a word, with an ellipsis", () => {
    const words = "מילה ".repeat(30).trim();
    const preview = chatPreview(words, 20);
    expect(preview.endsWith("…")).toBe(true);
    expect(charCount(preview)).toBeLessThanOrEqual(21);
    expect(preview).not.toMatch(/ …$/);
    expect(words.startsWith(preview.slice(0, -1))).toBe(true);
  });

  it("cuts inside a word only when there is no space to cut at", () => {
    expect(chatPreview("א".repeat(30), 10)).toBe(`${"א".repeat(10)}…`);
  });
});

describe("messageParts", () => {
  it("makes http and https addresses links, and keeps the rest as text", () => {
    expect(messageParts("ראו https://example.com/a?b=1 ותגידו")).toEqual([
      { kind: "text", text: "ראו " },
      {
        kind: "link",
        text: "https://example.com/a?b=1",
        href: "https://example.com/a?b=1",
      },
      { kind: "text", text: " ותגידו" },
    ]);
  });

  it("leaves the punctuation that ends a sentence outside the link", () => {
    expect(messageParts("ב-http://example.com.")).toEqual([
      { kind: "text", text: "ב-" },
      { kind: "link", text: "http://example.com", href: "http://example.com/" },
      { kind: "text", text: "." },
    ]);
  });

  it("never links another scheme", () => {
    for (const text of [
      "javascript:alert(1)",
      "data:text/html,hi",
      "file:///etc/passwd",
      "ftp://example.com",
    ]) {
      expect(messageParts(text)).toEqual([{ kind: "text", text }]);
    }
  });

  it("gives nothing for nothing", () => {
    expect(messageParts("")).toEqual([]);
  });
});

describe("groupMessages", () => {
  const message = (
    authorId: string | null,
    createdAt: string,
    kind: "text" | "announcement" = "text",
  ) => ({ authorId, createdAt, kind });

  it("divides days in the business's clock and runs one author's messages", () => {
    const messages = [
      // 23:30 in Israel on the 4th.
      message(A, "2026-11-04T21:30:00Z"),
      // 00:10 on the 5th.
      message(A, "2026-11-04T22:10:00Z"),
      message(A, "2026-11-04T22:12:00Z"),
      message(B, "2026-11-04T22:13:00Z"),
      message(B, "2026-11-04T22:30:00Z"),
    ];
    const days = groupMessages(messages, "Asia/Jerusalem");
    expect(days.map((d) => d.day)).toEqual(["2026-11-04", "2026-11-05"]);
    expect(days[1]?.runs.map((r) => [r.authorId, r.messages.length])).toEqual([
      [A, 2],
      [B, 1],
      [B, 1],
    ]);
  });

  it("keeps an announcement alone, and a message with no author", () => {
    const days = groupMessages(
      [
        message(A, "2026-11-05T08:00:00Z"),
        message(A, "2026-11-05T08:01:00Z", "announcement"),
        message(A, "2026-11-05T08:02:00Z"),
        message(null, "2026-11-05T08:02:30Z"),
        message(null, "2026-11-05T08:03:00Z"),
      ],
      "UTC",
    );
    expect(days[0]?.runs.map((r) => r.messages.length)).toEqual([
      1, 1, 1, 1, 1,
    ]);
  });
});

describe("chat cursors", () => {
  it("read back what they write", () => {
    const cursor = { at: "2026-11-05T08:00:00.123456+00:00", id: A };
    expect(parseChatCursor(chatCursor(cursor))).toEqual(cursor);
  });

  it("survive a plus read back as a space, and lower an id's case", () => {
    expect(
      parseChatCursor(`2026-11-05T08:00:00 02:00~${A.toUpperCase()}`),
    ).toEqual({ at: "2026-11-05T08:00:00+02:00", id: A });
  });

  it("refuse anything else", () => {
    for (const value of [
      null,
      42,
      "",
      `yesterday~${A}`,
      `2026-11-05T08:00:00Z~not-an-id`,
      `2026-11-05T08:00:00Z~${A}~more`,
      `2026-13-45T08:00:00Z~${A}`,
    ]) {
      expect(parseChatCursor(value)).toBeNull();
    }
  });
});

describe("directPair", () => {
  it("puts the lower id first, as the database keeps a private chat", () => {
    expect(directPair(B, A)).toEqual([A, B]);
    expect(directPair(A, B)).toEqual([A, B]);
    expect(directPair(B.toUpperCase(), A)).toEqual([A, B]);
  });
});

const row = (over: Partial<ChatInboxRow>): ChatInboxRow => ({
  conversation: A,
  kind: "team",
  department: null,
  otherPerson: null,
  lastAt: null,
  lastAuthor: null,
  lastKind: null,
  lastPreview: null,
  lastFileKind: null,
  lastFileName: null,
  unread: 0,
  muted: false,
  closed: false,
  pinnedWaiting: 0,
  ...over,
});

describe("readChatInbox", () => {
  it("reads the database's rows, and leaves out what isn't one", () => {
    expect(
      readChatInbox([
        {
          conversation: A.toUpperCase(),
          kind: "direct",
          department: null,
          other_person: B,
          last_at: "2026-11-05T08:00:00+00:00",
          last_author: B,
          last_kind: "text",
          last_preview: "שלום",
          last_file_kind: null,
          unread: 2,
          muted: true,
          closed: false,
          pinned_waiting: 0,
        },
        { conversation: "nope", kind: "team" },
        { conversation: C, kind: "channel" },
      ]),
    ).toEqual([
      row({
        conversation: A,
        kind: "direct",
        otherPerson: B,
        lastAt: "2026-11-05T08:00:00+00:00",
        lastAuthor: B,
        lastKind: "text",
        lastPreview: "שלום",
        unread: 2,
        muted: true,
      }),
    ]);
    expect(readChatInbox(null)).toEqual([]);
  });

  it("reads a field that is off as nothing", () => {
    expect(
      readChatInbox([
        {
          conversation: C,
          kind: "department",
          department: "kitchen",
          unread: -3,
          last_kind: "poll",
        },
      ]),
    ).toEqual([row({ conversation: C, kind: "department" })]);
  });

  it("reads a PDF's name (C5), and none from a project before it", () => {
    const base = {
      conversation: A,
      kind: "team",
      unread: 0,
      pinned_waiting: 0,
    };
    expect(
      readChatInbox([
        { ...base, last_file_kind: "pdf", last_file_name: "תפריט.pdf" },
      ]),
    ).toEqual([row({ lastFileKind: "pdf", lastFileName: "תפריט.pdf" })]);
    expect(readChatInbox([{ ...base, last_file_kind: "pdf" }])).toEqual([
      row({ lastFileKind: "pdf" }),
    ]);
  });
});

describe("sortInbox", () => {
  it("puts waiting announcements first, then the newest, then the groups", () => {
    const rows = [
      row({ conversation: A, kind: "direct", lastAt: "2026-11-05T09:00:00Z" }),
      row({ conversation: B, kind: "team", lastAt: null }),
      row({
        conversation: C,
        kind: "department",
        lastAt: "2026-11-05T07:00:00Z",
        pinnedWaiting: 1,
      }),
      row({
        conversation: "0d000000-0000-4000-a000-000000000004",
        kind: "department",
        lastAt: null,
      }),
    ];
    expect(sortInbox(rows).map((r) => r.conversation)).toEqual([
      C,
      A,
      B,
      "0d000000-0000-4000-a000-000000000004",
    ]);
  });
});

describe("conversationTitle", () => {
  const lookups = {
    departments: new Map([[C, "מטבח"]]),
    members: new Map([
      [A, { active: true, name: "נועה" }],
      [B, { active: false, name: "רינה" }],
    ]),
  };

  it("names the team's group, a department and the other person", () => {
    expect(conversationTitle(row({ kind: "team" }), lookups)).toEqual({
      kind: "team",
    });
    expect(
      conversationTitle(row({ kind: "department", department: C }), lookups),
    ).toEqual({ kind: "department", name: "מטבח" });
    expect(
      conversationTitle(row({ kind: "direct", otherPerson: A }), lookups),
    ).toEqual({ kind: "direct", person: { kind: "member", name: "נועה" } });
  });

  it("says no more than the reader may know", () => {
    expect(
      conversationTitle(row({ kind: "direct", otherPerson: B }), lookups),
    ).toEqual({ kind: "direct", person: { kind: "former" } });
    expect(
      conversationTitle(row({ kind: "direct", otherPerson: null }), lookups),
    ).toEqual({ kind: "direct", person: { kind: "unknown" } });
    expect(
      conversationTitle(row({ kind: "department", department: A }), lookups),
    ).toEqual({ kind: "department", name: null });
  });
});

describe("Orel's defaults", () => {
  it("are those of §17 of the chat plan", () => {
    expect(CHAT_RULES).toEqual({
      historyFromJoining: true,
      readMarks: true,
      demoKeepMinutes: 60,
      demoMessagesPerHour: 100,
    });
  });
});
