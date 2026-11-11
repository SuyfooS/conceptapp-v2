import { describe, expect, it } from "vitest";
import {
  announcementState,
  announcementsWaiting,
  mergePinned,
  messageActions,
  readersCount,
  shownPinned,
  sortAnnouncements,
  splitReaders,
  waitsFor,
} from "./chat-announce";
import type { ChatSyncMessage, PinnedAnnouncement } from "./chat-sync";

const ME = "0a000000-0000-4000-a000-000000000001";
const SHIRAN = "0b000000-0000-4000-a000-000000000002";
const URI = "0c000000-0000-4000-a000-000000000003";

let next = 0;
const message = (overrides: Partial<ChatSyncMessage>): ChatSyncMessage => {
  next += 1;
  return {
    id: `0d000000-0000-4000-a000-${String(next).padStart(12, "0")}`,
    authorId: SHIRAN,
    kind: "announcement",
    body: "מהשבוע הבא סוגרים את הקופה ב-22:00",
    fileKind: null,
    fileName: null,
    fileSize: null,
    fileGone: false,
    pinned: true,
    createdAt: "2026-11-11T08:10:00.000000+00:00",
    removed: false,
    removedBy: null,
    draft: null,
    ...overrides,
  };
};
const pinned = (
  overrides: Partial<ChatSyncMessage>,
  confirmed = false,
): PinnedAnnouncement => ({
  message: message(overrides),
  confirmed,
  readers: null,
});

describe("waitsFor and announcementState", () => {
  it("waits for someone else's announcement until they confirm it", () => {
    const one = pinned({});
    expect(waitsFor(one, ME)).toBe(true);
    expect(waitsFor({ ...one, confirmed: true }, ME)).toBe(false);
    expect(announcementState({ authorId: SHIRAN, confirmed: false }, ME)).toBe(
      "waiting",
    );
    expect(announcementState({ authorId: SHIRAN, confirmed: true }, ME)).toBe(
      "confirmed",
    );
  });

  it("never asks its author, whatever the case of the id", () => {
    const own = pinned({ authorId: SHIRAN.toUpperCase() });
    expect(waitsFor(own, SHIRAN)).toBe(false);
    expect(
      announcementState(
        { authorId: SHIRAN.toUpperCase(), confirmed: false },
        SHIRAN,
      ),
    ).toBe("own");
  });
});

describe("shownPinned", () => {
  it("shows the newest announcement waiting for the reader, and counts the others", () => {
    const older = pinned({ createdAt: "2026-11-10T08:00:00.000000+00:00" });
    const newer = pinned(
      { createdAt: "2026-11-11T09:00:00.000000+00:00" },
      true,
    );
    const middle = pinned({ createdAt: "2026-11-11T08:00:00.000000+00:00" });
    const { shown, more } = shownPinned([older, newer, middle], ME);
    expect(shown).toBe(middle);
    expect(more).toBe(2);
  });

  it("shows the newest when none waits, and nothing when none is pinned", () => {
    const a = pinned({ createdAt: "2026-11-10T08:00:00.000000+00:00" }, true);
    const b = pinned({
      authorId: ME,
      createdAt: "2026-11-11T08:00:00.000000+00:00",
    });
    expect(shownPinned([a, b], ME)).toEqual({ shown: b, more: 1 });
    expect(shownPinned([], ME)).toEqual({ shown: null, more: 0 });
  });

  it("orders two at the same time by id, as the database does", () => {
    const at = "2026-11-11T08:00:00.123456+00:00";
    const a = pinned({
      id: "0e000000-0000-4000-a000-000000000001",
      createdAt: at,
    });
    const b = pinned({
      id: "0e000000-0000-4000-a000-000000000002",
      createdAt: at,
    });
    expect(shownPinned([a, b], ME).shown).toBe(b);
  });
});

describe("mergePinned", () => {
  const at = (minute: number) =>
    `2026-11-11T08:${String(minute).padStart(2, "0")}:00.000000+00:00`;

  it("takes the server's, but keeps what the reader is changing as the screen has it", () => {
    const a = pinned({ createdAt: at(1) });
    const b = pinned({ createdAt: at(2) });
    const c = pinned({ createdAt: at(3) });
    // The screen has a and b, b confirmed here and not yet answered; the
    // server has b not confirmed yet, a gone (unpinned elsewhere), c new.
    const local = [{ ...b, confirmed: true }, a];
    const server = [c, b];
    const keep = (id: string) => id === b.message.id;
    expect(mergePinned(local, server, keep)).toEqual([
      c,
      { ...b, confirmed: true },
    ]);
  });

  it("keeps one the reader unpinned away, and one they pinned again there", () => {
    const a = pinned({ createdAt: at(1) });
    const b = pinned({ createdAt: at(2) });
    // b unpinned here: the server still has it, the screen doesn't.
    expect(mergePinned([a], [b, a], (id) => id === b.message.id)).toEqual([a]);
    // b pinned again here: the server doesn't have it yet.
    expect(mergePinned([b, a], [a], (id) => id === b.message.id)).toEqual([
      b,
      a,
    ]);
    // Nothing kept: the server's, newest first.
    expect(mergePinned([b], [a, b], () => false)).toEqual([b, a]);
  });
});

describe("splitReaders and readersCount", () => {
  const readers = [
    { person: URI, ackedAt: null },
    { person: ME, ackedAt: "2026-11-11T08:35:00.000000+00:00" },
    { person: SHIRAN, ackedAt: "2026-11-11T08:20:00.000000+00:00" },
  ];

  it("lists who confirmed in the order they did, and who not yet", () => {
    const { confirmed, waiting } = splitReaders(readers);
    expect(confirmed.map((r) => r.person)).toEqual([SHIRAN, ME]);
    expect(waiting.map((r) => r.person)).toEqual([URI]);
  });

  it("counts who confirmed of everyone asked", () => {
    expect(readersCount(readers)).toEqual({ count: 2, total: 3 });
    expect(readersCount([])).toEqual({ count: 0, total: 0 });
  });
});

describe("sortAnnouncements", () => {
  it("puts pinned ones first, each newest first", () => {
    const old = { id: "a", createdAt: "2026-11-01T08:00:00Z", pinned: true };
    const fresh = { id: "b", createdAt: "2026-11-11T08:00:00Z", pinned: false };
    const pin = { id: "c", createdAt: "2026-11-05T08:00:00Z", pinned: true };
    const done = { id: "d", createdAt: "2026-11-02T08:00:00Z", pinned: false };
    expect(sortAnnouncements([old, fresh, pin, done]).map((a) => a.id)).toEqual(
      ["c", "a", "b", "d"],
    );
  });
});

describe("messageActions", () => {
  const group = {
    readerId: ME,
    chat: "team" as const,
    moderates: false,
    closed: false,
  };
  const text = {
    authorId: URI,
    kind: "text" as const,
    body: "בוקר טוב",
    pinned: false,
    removed: false,
  };

  it("lets anyone copy, and delete their own anywhere", () => {
    expect(messageActions(text, group)).toEqual(["copy"]);
    expect(messageActions({ ...text, authorId: ME }, group)).toEqual([
      "copy",
      "delete",
    ]);
    expect(
      messageActions({ ...text, authorId: ME }, { ...group, chat: "direct" }),
    ).toEqual(["copy", "delete"]);
  });

  it("lets management remove someone else's in a group, never in a private chat", () => {
    const moderator = { ...group, moderates: true };
    expect(messageActions(text, moderator)).toEqual(["copy", "remove"]);
    expect(messageActions(text, { ...moderator, chat: "department" })).toEqual([
      "copy",
      "remove",
    ]);
    expect(messageActions(text, { ...moderator, chat: "direct" })).toEqual([
      "copy",
    ]);
  });

  it("offers nothing for a removed message", () => {
    expect(
      messageActions(
        { ...text, authorId: ME, body: null, removed: true },
        { ...group, moderates: true },
      ),
    ).toEqual([]);
  });

  it("lets an announcement's author and management unpin it, and pin it again where people write", () => {
    const announcement = {
      ...text,
      authorId: SHIRAN,
      kind: "announcement" as const,
      pinned: true,
    };
    expect(messageActions(announcement, group)).toEqual(["copy"]);
    expect(
      messageActions(announcement, { ...group, readerId: SHIRAN }),
    ).toEqual(["copy", "unpin", "delete"]);
    expect(
      messageActions(
        { ...announcement, pinned: false },
        { ...group, moderates: true },
      ),
    ).toEqual(["copy", "pin", "remove"]);
    expect(
      messageActions(
        { ...announcement, pinned: false },
        { ...group, moderates: true, closed: true },
      ),
    ).toEqual(["copy", "remove"]);
  });
});

describe("announcementsWaiting", () => {
  it("adds up what waits in every chat", () => {
    expect(
      announcementsWaiting([
        { pinnedWaiting: 1 },
        { pinnedWaiting: 0 },
        { pinnedWaiting: 2 },
      ]),
    ).toBe(3);
  });
});
