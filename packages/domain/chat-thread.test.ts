import { describe, expect, it } from "vitest";
import { groupMessages } from "./chat";
import {
  bubbleKey,
  changedMessage,
  compareInstants,
  compareMessages,
  draftKey,
  mergeMessages,
  newestFromOthers,
  type OutgoingMessage,
  outgoingAsMessage,
  runPlace,
  seenMessageId,
  shownMessages,
  stillOutgoing,
} from "./chat-thread";

const ME = "0a000000-0000-4000-a000-000000000001";
const NOA = "0b000000-0000-4000-a000-000000000002";

const message = (
  id: string,
  createdAt: string,
  authorId: string | null = NOA,
  removed = false,
) => ({ id, createdAt, authorId, removed });

describe("compareInstants", () => {
  it("keeps the order to the microsecond, which a Date would lose", () => {
    expect(
      compareInstants(
        "2026-11-11T08:05:00.123456+00:00",
        "2026-11-11T08:05:00.123457+00:00",
      ),
    ).toBeLessThan(0);
    expect(
      Date.parse("2026-11-11T08:05:00.123456+00:00") -
        Date.parse("2026-11-11T08:05:00.123457+00:00"),
    ).toBe(0);
  });

  it("reads the database's fractions however many digits they have", () => {
    expect(
      compareInstants(
        "2026-11-11T08:05:00.12+00:00",
        "2026-11-11T08:05:00.123+00:00",
      ),
    ).toBeLessThan(0);
    expect(
      compareInstants(
        "2026-11-11T08:05:00+00:00",
        "2026-11-11T08:05:00.000001+00:00",
      ),
    ).toBeLessThan(0);
    expect(
      compareInstants("2026-11-11T08:05:00.5+00:00", "2026-11-11T08:05:00.5Z"),
    ).toBe(0);
  });

  it("compares across zones by the instant", () => {
    expect(
      compareInstants("2026-11-11T10:05:00+02:00", "2026-11-11T08:05:00Z"),
    ).toBe(0);
    expect(
      compareInstants("2026-11-11T10:06:00+02:00", "2026-11-11T08:05:59.9Z"),
    ).toBeGreaterThan(0);
  });

  it("puts what isn't an instant first", () => {
    expect(compareInstants("soon", "2026-11-11T08:05:00Z")).toBeLessThan(0);
    expect(compareInstants("2026-11-11T08:05:00Z", "soon")).toBeGreaterThan(0);
  });
});

describe("mergeMessages", () => {
  const a = message("a", "2026-11-11T08:00:00+00:00");
  const b = message("b", "2026-11-11T08:01:00+00:00");
  const c = message("c", "2026-11-11T08:02:00+00:00");

  it("adds what came after, and older pages before, each once", () => {
    expect(mergeMessages([a, b], [b, c]).map((m) => m.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(mergeMessages([b, c], [a]).map((m) => m.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("takes the newer copy of a message that came again", () => {
    const removed = { ...b, removed: true };
    const merged = mergeMessages([a, b, c], [removed]);
    expect(merged).toHaveLength(3);
    expect(merged[1]?.removed).toBe(true);
  });

  it("orders one instant's messages by id, as the database does", () => {
    const at = "2026-11-11T08:00:00.5+00:00";
    expect(
      [message("y", at), message("x", at)]
        .sort(compareMessages)
        .map((m) => m.id),
    ).toEqual(["x", "y"]);
  });
});

describe("seenMessageId", () => {
  const thread = [
    message("1", "2026-11-11T08:00:00+00:00", ME),
    message("2", "2026-11-11T08:01:00+00:00", NOA),
    message("3", "2026-11-11T08:02:00+00:00", ME),
    message("4", "2026-11-11T08:03:00+00:00", ME, true),
    message("5", "2026-11-11T08:04:00+00:00", ME),
  ];

  it("marks the newest of the reader's own the other read up to", () => {
    expect(seenMessageId(thread, ME, "2026-11-11T08:02:30+00:00")).toBe("3");
    expect(seenMessageId(thread, ME, "2026-11-11T08:02:00+00:00")).toBe("3");
    expect(seenMessageId(thread, ME, "2026-11-11T09:00:00+00:00")).toBe("5");
  });

  it("skips a removed message, and says nothing before anything is read", () => {
    expect(seenMessageId(thread, ME, "2026-11-11T08:03:30+00:00")).toBe("3");
    expect(seenMessageId(thread, ME, null)).toBeNull();
    expect(seenMessageId(thread, ME, "2026-11-11T07:00:00+00:00")).toBeNull();
  });

  it("never marks someone else's message", () => {
    expect(seenMessageId(thread, NOA, "2026-11-11T09:00:00+00:00")).toBe("2");
  });
});

describe("newestFromOthers", () => {
  it("is the newest message the reader didn't write", () => {
    const thread = [
      message("1", "2026-11-11T08:00:00+00:00", NOA),
      message("2", "2026-11-11T08:01:00+00:00", ME),
    ];
    expect(newestFromOthers(thread, ME)?.id).toBe("1");
    expect(newestFromOthers(thread.slice(1), ME)).toBeNull();
    expect(newestFromOthers([], ME)).toBeNull();
  });
});

describe("changedMessage", () => {
  const shown = {
    body: "שלום",
    removed: false,
    removedBy: null,
    fileGone: false,
    pinned: false,
    draft: null,
  };

  it("is false for the same message brought again", () => {
    expect(changedMessage(shown, { ...shown })).toBe(false);
  });

  it("is true once it was removed, its file went, or it is known as one's own", () => {
    expect(
      changedMessage(shown, {
        ...shown,
        body: null,
        removed: true,
        removedBy: ME,
      }),
    ).toBe(true);
    expect(changedMessage(shown, { ...shown, fileGone: true })).toBe(true);
    expect(changedMessage(shown, { ...shown, draft: "d1" })).toBe(true);
  });
});

describe("messages on their way", () => {
  const outgoing: OutgoingMessage[] = [
    {
      draft: "d1",
      body: "שלום",
      at: "2026-11-11T08:00:00.000Z",
      state: "sent",
      message: "m1",
    },
    {
      draft: "d2",
      body: "עוד",
      at: "2026-11-11T08:00:01.000Z",
      state: "sending",
      message: null,
    },
  ];

  it("stop showing as being sent once the screen holds them", () => {
    expect(
      stillOutgoing(outgoing, shownMessages([{ id: "m1", draft: null }])).map(
        (m) => m.draft,
      ),
    ).toEqual(["d2"]);
    expect(stillOutgoing(outgoing, shownMessages([]))).toHaveLength(2);
  });

  it("are known by their draft too, so a lost answer leaves no failed copy", () => {
    // The answer to d2 never came back, and it says it failed; the sync
    // brought the message the database wrote, with its draft.
    const failed: OutgoingMessage[] = outgoing.map((m) =>
      m.draft === "d2" ? { ...m, state: "failed" } : m,
    );
    expect(
      stillOutgoing(failed, shownMessages([{ id: "m2", draft: "D2" }])).map(
        (m) => m.draft,
      ),
    ).toEqual(["d1"]);
  });

  it("keep one key from being sent to being shown", () => {
    const [, sending] = outgoing;
    expect(sending).toBeDefined();
    if (!sending) return;
    expect(outgoingAsMessage(sending, ME).id).toBe(
      bubbleKey({ id: "m2", draft: "D2" }),
    );
    expect(bubbleKey({ id: "m3", draft: null })).toBe("m3");
    expect(draftKey("D2")).toBe("draft:d2");
  });

  it("join the reader's run of messages", () => {
    const days = groupMessages(
      [
        { authorId: ME, createdAt: "2026-11-11T07:59:30.000Z", kind: "text" },
        ...outgoing.map((m) => outgoingAsMessage(m, ME)),
      ],
      "Asia/Jerusalem",
    );
    expect(days).toHaveLength(1);
    expect(days[0]?.runs).toHaveLength(1);
    expect(days[0]?.runs[0]?.messages).toHaveLength(3);
  });
});

describe("runPlace", () => {
  it("names where a message sits in its run", () => {
    expect(runPlace(0, 1)).toBe("single");
    expect(runPlace(0, 3)).toBe("first");
    expect(runPlace(1, 3)).toBe("middle");
    expect(runPlace(2, 3)).toBe("last");
  });
});
