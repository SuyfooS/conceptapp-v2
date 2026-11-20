import { readyNews } from "@domain/order-screens";
import type { MyOrders } from "@domain/orders";
import { describe, expect, it } from "vitest";
import { readyMarks } from "./ready-marks";

const ORDER = "00000000-0000-4000-8000-000000000001";
const BAR = "00000000-0000-4000-8000-000000000002";

/** One's own rounds as a sync reads them: bar 3 in the state given. */
const mine = (status: "new" | "ready", version: number): MyOrders => ({
  version,
  now: "2026-11-21T19:00:00.000Z",
  day: "2026-11-21",
  rounds: [
    {
      id: "round",
      order: ORDER,
      placeName: "4",
      takeaway: null,
      orderStatus: "open",
      sentAt: "2026-11-21T18:50:00.000Z",
      tickets: [
        {
          id: "bar-3",
          department: BAR,
          status,
          held: false,
          kitchenSeenAt: null,
          readyAt: status === "ready" ? "2026-11-21T18:58:00.000Z" : null,
          servedAt: null,
          lines: 1,
          items: [],
        },
      ],
    },
  ],
});

describe("what this phone said of a ticket's ready", () => {
  it("leaves out what was marked ready here, whichever read", () => {
    const marks = readyMarks();
    const read = marks.started();
    marks.said("bar-3", true);
    expect(marks.quietFor(read).has("bar-3")).toBe(true);
    expect(marks.quietFor(marks.started()).has("bar-3")).toBe(true);
    expect(marks.quiet("bar-3")).toBe(true);
  });

  it("keeps a ticket put back out of a sync that started before the put-back answered", () => {
    const marks = readyMarks();
    // "מוכן" on bar 3, and the sync after it starts (it reads it ready).
    marks.said("bar-3", true);
    const before = marks.started();
    // "ביטול" at once: the put-back answers while that sync still reads.
    marks.said("bar-3", false);
    const after = marks.started();
    // The slower sync answers last, still seeing it ready: no news.
    expect(marks.quietFor(before).has("bar-3")).toBe(true);
    expect(marks.quiet("bar-3")).toBe(true);
    // The sync after the put-back is newer: whatever it reads is so.
    expect(marks.quietFor(after).has("bar-3")).toBe(false);
    expect(marks.quiet("bar-3")).toBe(false);
    // Made ready again elsewhere, a later read tells it.
    expect(marks.quietFor(marks.started()).has("bar-3")).toBe(false);
  });

  it("counts the next sync as newer when none ran at the put-back", () => {
    const marks = readyMarks();
    marks.said("bar-3", true);
    marks.said("bar-3", false);
    expect(marks.quiet("bar-3")).toBe(true);
    expect(marks.quietFor(marks.started()).has("bar-3")).toBe(false);
  });

  it("leaves out a ticket marked ready again after it was put back", () => {
    const marks = readyMarks();
    const first = marks.started();
    marks.said("bar-3", false);
    marks.said("bar-3", true);
    expect(marks.quietFor(first).has("bar-3")).toBe(true);
    expect(marks.quietFor(marks.started()).has("bar-3")).toBe(true);
  });

  it("tells a ticket marked ready here once it was put back elsewhere and made ready again", () => {
    const marks = readyMarks();
    // A sync is reading as "מוכן" on bar 3 answers here.
    const during = marks.started();
    marks.said("bar-3", true);
    // That sync read before the mark: it still shows bar 3 not ready, and
    // the mark stays.
    marks.seen(during, mine("new", 1));
    expect(marks.quiet("bar-3")).toBe(true);
    // The next sync reads it ready: this phone's own, no news.
    const marked = marks.started();
    marks.seen(marked, mine("ready", 2));
    expect(
      readyNews(mine("new", 1), mine("ready", 2), marks.quietFor(marked)),
    ).toEqual([]);
    // A colleague puts it back on another device: a read after the mark
    // sees it not ready, and the mark goes.
    const putBack = marks.started();
    marks.seen(putBack, mine("new", 3));
    expect(marks.quiet("bar-3")).toBe(false);
    // Made ready again elsewhere: news for the person whose order it is.
    const again = marks.started();
    marks.seen(again, mine("ready", 4));
    expect(
      readyNews(mine("new", 3), mine("ready", 4), marks.quietFor(again)).map(
        (news) => news.ticket,
      ),
    ).toEqual(["bar-3"]);
  });
});
