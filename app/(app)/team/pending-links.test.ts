import { describe, expect, it } from "vitest";
import {
  leftToLink,
  nextToLink,
  PENDING_CREATE,
  PENDING_LIST,
  type PendingRow,
  pendingCreateTarget,
  pendingShown,
} from "./pending-links";

// "עוד לא קיבלו קישור" on the Team screen (inviting from a list, part 2):
// which rows it lists as links are made, whom the focus goes to next, and
// how many are left. The screens' own checks are in team-view.test.ts and
// e2e/team-pending-links.spec.ts.

const row = (
  id: string,
  name: string | null,
  send: PendingRow["send"] = "link",
): PendingRow => ({
  id,
  name,
  shown: name ?? "בלי שם",
  phone: "+972500007441",
  role: "עובד/ת",
  send,
  cancels: true,
});

const DANA = row("dana", "דנה אברהם");
const ORI = row("ori", "אורי לוי");
const TAL = row("tal", "טל כהן");
const NONE = row("none", null);

const ids = (rows: readonly { id: string }[]) => rows.map((r) => r.id);

describe("pendingShown", () => {
  it("lists what the screen read, by name, unnamed last", () => {
    expect(ids(pendingShown([TAL, NONE, DANA, ORI], new Map()))).toEqual([
      "ori",
      "dana",
      "tal",
      "none",
    ]);
  });

  it("keeps a row whose link was asked for here in its place once the screen reads it as open", () => {
    // Tal's link was made here; the screen, read again, lists only the rest.
    const held = new Map([[TAL.id, TAL]]);
    expect(ids(pendingShown([DANA, ORI], held))).toEqual([
      "ori",
      "dana",
      "tal",
    ]);
    // Read again while still pending: once, the screen's own copy.
    const renamed = { ...TAL, role: "מנהל/ת" };
    const shown = pendingShown([DANA, renamed], held);
    expect(ids(shown)).toEqual(["dana", "tal"]);
    expect(shown.find((r) => r.id === "tal")?.role).toBe("מנהל/ת");
  });

  it("drops a row whose link was made elsewhere: nothing held keeps it", () => {
    expect(ids(pendingShown([DANA], new Map()))).toEqual(["dana"]);
    expect(pendingShown([], new Map())).toEqual([]);
  });

  it("changes neither list it was given", () => {
    const rows = [TAL, DANA];
    pendingShown(rows, new Map([[ORI.id, ORI]]));
    expect(ids(rows)).toEqual(["tal", "dana"]);
  });
});

describe("nextToLink", () => {
  const rows = [ORI, DANA, TAL, NONE];
  const waitingBut =
    (...done: string[]) =>
    (r: PendingRow) =>
      r.send === "link" && !done.includes(r.id);

  it("goes to the next row whose link isn't made yet", () => {
    expect(nextToLink(rows, "ori", waitingBut("ori"))?.id).toBe("dana");
    expect(nextToLink(rows, "dana", waitingBut("ori", "dana"))?.id).toBe("tal");
  });

  it("skips rows done already and rows the viewer can't link", () => {
    const mixed = [ORI, row("boss", "בעלים", "ownerSends"), DANA, TAL];
    expect(nextToLink(mixed, "ori", waitingBut("ori", "dana"))?.id).toBe("tal");
  });

  it("comes round to the first one left above, after the last", () => {
    expect(nextToLink(rows, "none", waitingBut("none", "dana"))?.id).toBe(
      "ori",
    );
    // Out of order: the third made first, so the first is next.
    expect(nextToLink(rows, "tal", waitingBut("tal"))?.id).toBe("none");
    expect(nextToLink(rows, "none", waitingBut("tal", "none"))?.id).toBe("ori");
  });

  it("is nobody once every link is made, and never the row itself", () => {
    expect(
      nextToLink(rows, "dana", waitingBut("ori", "dana", "tal", "none")),
    ).toBeNull();
    // Its own link not yet counted as made: still not the next.
    expect(nextToLink([DANA], "dana", () => true)).toBeNull();
    expect(nextToLink([], "dana", () => true)).toBeNull();
  });

  it("starts from the top for a row no longer listed", () => {
    expect(nextToLink(rows, "gone", waitingBut())?.id).toBe("ori");
  });
});

describe("leftToLink", () => {
  it("counts the rows still on screen with no link made", () => {
    const rows = [ORI, DANA, TAL, row("boss", "בעלים", "ownerSends")];
    const linked = (id: string) => id === "ori";
    expect(leftToLink(rows, linked, new Set())).toBe(3);
    // A deleted one is no longer counted; one the viewer can't link still is.
    expect(leftToLink(rows, linked, new Set(["dana"]))).toBe(2);
    expect(leftToLink(rows, () => true, new Set())).toBe(0);
  });
});

describe("pendingCreateTarget", () => {
  it("finds each shape's button for the invite by its id", () => {
    expect(PENDING_CREATE).toBe("data-pending-create");
    expect(PENDING_LIST).toBe("data-pending-links");
    expect(pendingCreateTarget("dana")).toBe('[data-pending-create="dana"]');
    expect(pendingCreateTarget('a"b\\c')).toBe(
      '[data-pending-create="a\\"b\\\\c"]',
    );
  });
});
