import { describe, expect, it } from "vitest";
import type { ChatInboxRow } from "./chat";
import {
  CHAT_SYNC_PATH,
  type ChatDirectory,
  chatListRows,
  chatSendInput,
  chatSyncAnswer,
  chatSyncHref,
  heldInWindow,
  newestCursor,
  nextSyncDelay,
  readChatSyncQuery,
  SYNC_BUSY_MS,
  SYNC_IDLE_MS,
  SYNC_LIST_MS,
  SYNC_OVERLAP_MS,
  SYNC_QUIET_MS,
  syncBrings,
  syncWindowStart,
  waitingChats,
} from "./chat-sync";

const A = "0a000000-0000-4000-a000-000000000001";
const B = "0b000000-0000-4000-a000-000000000002";
const C = "0c000000-0000-4000-a000-000000000003";
const D = "0d000000-0000-4000-d000-000000000004";
const AT = "2026-11-11T08:05:00.123456+00:00";

const conversation = (idleMs: number, failures = 0) =>
  nextSyncDelay({ visible: true, screen: "conversation", idleMs, failures });

describe("nextSyncDelay", () => {
  it("waits for the page to be visible again while it is hidden", () => {
    expect(
      nextSyncDelay({
        visible: false,
        screen: "conversation",
        idleMs: 0,
        failures: 0,
      }),
    ).toBeNull();
    expect(
      nextSyncDelay({ visible: false, screen: "list", idleMs: 0, failures: 3 }),
    ).toBeNull();
  });

  it("asks a moving conversation every 4 seconds for a minute", () => {
    expect(conversation(0)).toBe(4_000);
    expect(conversation(59_999)).toBe(SYNC_BUSY_MS);
  });

  it("then every 15 seconds up to 3 minutes, then once a minute", () => {
    expect(conversation(60_000)).toBe(15_000);
    expect(conversation(179_999)).toBe(SYNC_QUIET_MS);
    expect(conversation(180_000)).toBe(60_000);
    expect(conversation(24 * 60 * 60_000)).toBe(SYNC_IDLE_MS);
  });

  it("asks the list every 30 seconds, however long it has been", () => {
    for (const idleMs of [0, 60_000, 10 * 60_000]) {
      expect(
        nextSyncDelay({ visible: true, screen: "list", idleMs, failures: 0 }),
      ).toBe(SYNC_LIST_MS);
    }
  });

  it("doubles the wait for each failure in a row, up to a minute", () => {
    expect(conversation(0, 1)).toBe(8_000);
    expect(conversation(0, 2)).toBe(16_000);
    expect(conversation(0, 3)).toBe(32_000);
    expect(conversation(0, 4)).toBe(60_000);
    expect(conversation(0, 50)).toBe(60_000);
    expect(conversation(60_000, 1)).toBe(30_000);
    expect(conversation(60_000, 2)).toBe(60_000);
    expect(conversation(180_000, 3)).toBe(60_000);
    expect(
      nextSyncDelay({ visible: true, screen: "list", idleMs: 0, failures: 1 }),
    ).toBe(60_000);
  });

  it("reads a clock that went back, or counts that aren't, as nothing", () => {
    expect(conversation(-5_000)).toBe(4_000);
    expect(conversation(Number.NaN)).toBe(4_000);
    expect(conversation(0, -2)).toBe(4_000);
    expect(conversation(0, Number.NaN)).toBe(4_000);
    expect(conversation(0, 1.7)).toBe(8_000);
  });
});

describe("the sync's question", () => {
  const version = "0123456789abcdef0123456789abcdef";

  it("asks with what the screen has, and only the route", () => {
    expect(
      chatSyncHref({
        version: null,
        conversation: null,
        after: null,
        held: null,
      }),
    ).toBe(CHAT_SYNC_PATH);
    const href = chatSyncHref({
      version,
      conversation: A,
      after: { at: AT, id: B },
      held: 3,
    });
    expect(href.startsWith(`${CHAT_SYNC_PATH}?`)).toBe(true);
    const params = new URL(href, "https://example.invalid").searchParams;
    expect(readChatSyncQuery(params)).toEqual({
      version,
      conversation: A,
      after: { at: AT, id: B },
      held: 3,
    });
  });

  it("leaves out a cursor and its count without a conversation", () => {
    expect(
      chatSyncHref({
        version,
        conversation: null,
        after: { at: AT, id: B },
        held: 2,
      }),
    ).toBe(`${CHAT_SYNC_PATH}?v=${version}`);
    expect(
      chatSyncHref({ version: null, conversation: A, after: null, held: 2 }),
    ).toBe(`${CHAT_SYNC_PATH}?c=${A}`);
  });

  it("reads a version that isn't one as none, so the list comes", () => {
    expect(readChatSyncQuery(new URLSearchParams("v=x"))?.version).toBeNull();
    expect(
      readChatSyncQuery(new URLSearchParams(`v=${version.toUpperCase()}`))
        ?.version,
    ).toBeNull();
    expect(readChatSyncQuery(new URLSearchParams(""))).toEqual({
      version: null,
      conversation: null,
      after: null,
      held: null,
    });
  });

  it("refuses a conversation or a cursor that isn't one", () => {
    expect(readChatSyncQuery(new URLSearchParams("c=nope"))).toBeNull();
    expect(
      readChatSyncQuery(new URLSearchParams(`c=${A}&after=yesterday`)),
    ).toBeNull();
    expect(readChatSyncQuery(new URLSearchParams(`c=${A}&after=`))).toBeNull();
    expect(
      readChatSyncQuery(new URLSearchParams(`after=${AT}~${B}`)),
    ).toBeNull();
  });

  it("refuses a count that isn't one, or comes without a cursor", () => {
    const cursor = `c=${A}&after=${encodeURIComponent(`${AT}~${B}`)}`;
    expect(readChatSyncQuery(new URLSearchParams(`${cursor}&n=0`))?.held).toBe(
      0,
    );
    for (const n of ["-1", "1.5", "two", "", "10000", "1001"]) {
      expect(
        readChatSyncQuery(new URLSearchParams(`${cursor}&n=${n}`)),
        n,
      ).toBeNull();
    }
    expect(readChatSyncQuery(new URLSearchParams(`c=${A}&n=1`))).toBeNull();
  });

  it("reads ids in either case as the database keeps them", () => {
    expect(
      readChatSyncQuery(new URLSearchParams(`c=${A.toUpperCase()}`))
        ?.conversation,
    ).toBe(A);
  });
});

const row = (overrides: Partial<ChatInboxRow>): ChatInboxRow => ({
  conversation: A,
  kind: "team",
  department: null,
  otherPerson: null,
  lastAt: AT,
  lastAuthor: null,
  lastKind: "text",
  lastPreview: "שלום",
  lastFileKind: null,
  unread: 0,
  muted: false,
  closed: false,
  pinnedWaiting: 0,
  ...overrides,
});

const directory: ChatDirectory = {
  departments: new Map([[D, "מטבח"]]),
  members: new Map([
    [B, { active: true, name: "נועה כהן", photo: "/photos/b/x.webp" }],
    [C, { active: false, name: "רינה", photo: "/photos/c/y.webp" }],
  ]),
};

describe("chatListRows", () => {
  it("names each row from the directory, in the order they came", () => {
    const rows = chatListRows(
      [
        row({ conversation: A }),
        row({ conversation: B, kind: "department", department: D }),
        row({ conversation: C, kind: "direct", otherPerson: B }),
      ],
      directory,
    );
    expect(rows.map((r) => r.title)).toEqual([
      { kind: "team" },
      { kind: "department", name: "מטבח" },
      { kind: "direct", person: { kind: "member", name: "נועה כהן" } },
    ]);
    expect(rows.map((r) => r.photo)).toEqual([null, null, "/photos/b/x.webp"]);
  });

  it("names someone who left as such, and someone unknown as nobody", () => {
    const [left, unknown] = chatListRows(
      [
        row({ kind: "direct", otherPerson: C }),
        row({ kind: "direct", otherPerson: A }),
      ],
      directory,
    );
    expect(left?.title).toEqual({ kind: "direct", person: { kind: "former" } });
    expect(left?.photo).toBe("/photos/c/y.webp");
    expect(unknown?.title).toEqual({
      kind: "direct",
      person: { kind: "unknown" },
    });
    expect(unknown?.photo).toBeNull();
  });
});

describe("chatSyncAnswer", () => {
  const message = {
    id: B,
    authorId: C,
    kind: "text",
    body: "שלום",
    fileKind: null,
    fileName: null,
    fileSize: null,
    fileGone: false,
    pinned: false,
    createdAt: AT,
    removed: false,
    removedBy: null,
    draft: null,
  };

  it("reads what the route sends", () => {
    const [listed] = chatListRows([row({})], directory);
    const answer = {
      inbox: { version: "v", rows: [listed] },
      open: {
        conversation: A,
        messages: [message],
        gap: false,
        people: [{ id: C, name: null, photo: null }],
        seenUpTo: AT,
        cursor: newestCursor([message], null),
      },
    };
    expect(chatSyncAnswer.parse(answer)).toEqual(answer);
    expect(chatSyncAnswer.parse({})).toEqual({});
  });

  it("refuses a message that isn't one", () => {
    const open = (m: Record<string, unknown>) => ({
      open: {
        conversation: A,
        messages: [m],
        gap: false,
        people: [],
        seenUpTo: null,
        cursor: null,
      },
    });
    expect(chatSyncAnswer.safeParse(open(message)).success).toBe(true);
    expect(
      chatSyncAnswer.safeParse(open({ ...message, id: "x" })).success,
    ).toBe(false);
    expect(
      chatSyncAnswer.safeParse(open({ ...message, kind: "poll" })).success,
    ).toBe(false);
    expect(
      chatSyncAnswer.safeParse(open({ ...message, createdAt: "soon" })).success,
    ).toBe(false);
    expect(
      chatSyncAnswer.safeParse(open({ ...message, draft: "draft-1" })).success,
    ).toBe(false);
  });
});

describe("the second look before the cursor", () => {
  const at = (seconds: number, micro = "000000") =>
    `2026-11-11T08:05:${String(seconds).padStart(2, "0")}.${micro}+00:00`;
  const cursor = { at: at(30, "123456"), id: C };

  it("starts a moment before the cursor, to the microsecond", () => {
    expect(SYNC_OVERLAP_MS).toBe(10_000);
    expect(syncWindowStart(cursor.at)).toBe("2026-11-11T08:05:20.123456Z");
    expect(syncWindowStart("2026-11-11T10:05:30+02:00")).toBe(
      "2026-11-11T08:05:20.000000Z",
    );
    expect(syncWindowStart("soon")).toBeNull();
  });

  it("counts what the screen holds inside it", () => {
    expect(
      heldInWindow(
        [
          { id: A, createdAt: at(10) },
          { id: B, createdAt: at(25) },
          { id: C, createdAt: cursor.at },
        ],
        cursor,
      ),
    ).toBe(2);
  });

  it("brings what came after the cursor, or arrived late inside the look", () => {
    const held = [
      { id: B, createdAt: at(25) },
      { id: C, createdAt: cursor.at },
    ];
    // Nothing new: the same two.
    expect(syncBrings(held, cursor, 2)).toBe(false);
    // One after the cursor.
    expect(syncBrings([{ id: D, createdAt: at(31) }], cursor, 0)).toBe(true);
    // One stamped before the newest on screen, written after the screen asked.
    expect(syncBrings([...held, { id: A, createdAt: at(28) }], cursor, 2)).toBe(
      true,
    );
    // One the screen holds and the route no longer has (the demo's clean-up).
    expect(syncBrings([{ id: C, createdAt: cursor.at }], cursor, 2)).toBe(
      false,
    );
  });
});

describe("newestCursor", () => {
  it("is after the last message, keeping its microseconds", () => {
    expect(
      newestCursor(
        [
          { id: A, createdAt: "2026-11-11T08:00:00+00:00" },
          { id: B, createdAt: AT },
        ],
        null,
      ),
    ).toBe(`${AT}~${B}`);
  });

  it("stays where it was when nothing came", () => {
    expect(newestCursor([], { at: AT, id: C })).toBe(`${AT}~${C}`);
    expect(newestCursor([], null)).toBeNull();
  });
});

describe("chatSendInput", () => {
  const draft = "0e000000-0000-4000-a000-00000000000e";

  it("takes a message to a conversation or to someone", () => {
    expect(
      chatSendInput.parse({ draft, words: "שלום", conversation: A }),
    ).toEqual({ draft, words: "שלום", conversation: A });
    expect(
      chatSendInput.parse({ draft, words: "שלום", toPerson: B.toUpperCase() }),
    ).toEqual({ draft, words: "שלום", toPerson: B });
  });

  it("refuses both, neither, a draft that is no id, and anything more", () => {
    for (const input of [
      { draft, words: "x", conversation: A, toPerson: B },
      { draft, words: "x" },
      { draft: "draft-1", words: "x", conversation: A },
      { draft, words: "x", conversation: A, announce: true },
      { draft, words: "x".repeat(8_001), conversation: A },
      { draft, words: 5, conversation: A },
      null,
    ]) {
      expect(chatSendInput.safeParse(input).success).toBe(false);
    }
  });
});

describe("waitingChats", () => {
  it("counts the chats with messages waiting for the reader", () => {
    expect(
      waitingChats([
        row({ unread: 0 }),
        row({ unread: 3 }),
        row({ unread: 2 }),
      ]),
    ).toBe(2);
    expect(waitingChats([])).toBe(0);
  });

  it("doesn't count an announcement nothing on screen can settle yet (C3)", () => {
    expect(waitingChats([row({ unread: 0, pinnedWaiting: 1 })])).toBe(0);
  });
});
