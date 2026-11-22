import { describe, expect, it } from "vitest";
import he from "@/messages/he.json";
import { GROUP_SECTION, marksAfter, writeOutcome } from "./file-edits-rules";

/*
 * What the open file's islands do with a holder's write (profile H6b-1):
 * no fresh step-up and the duties first draw the page again and say
 * nothing; a confirmation by someone else meanwhile goes with the review;
 * every other refusal is said in words that are there; the focus goes back
 * to the part's own heading; and the twin's address carries the marks.
 */

const words = (key: string) =>
  key
    .split(".")
    .reduce<unknown>(
      (tree, part) => (tree as Record<string, unknown>)[part],
      he.app.team.file,
    );

describe("a holder's write, on the screen", () => {
  it("draws the page again for no fresh step-up or the duties, and says nothing", () => {
    expect(writeOutcome({ ok: false, failure: "stepUp" })).toEqual({
      kind: "redraw",
      failure: "stepUp",
    });
    expect(writeOutcome({ ok: false, failure: "ack" })).toEqual({
      kind: "redraw",
      failure: "ack",
    });
    expect(writeOutcome({ ok: true })).toEqual({ kind: "done" });
  });

  it("lets a confirmation by someone else go with the review", () => {
    expect(writeOutcome({ ok: false, failure: "settled" })).toEqual({
      kind: "settled",
    });
  });

  it("says every other refusal in words that are there", () => {
    const failures = [
      "moved",
      "demo",
      "closed",
      "notInTeam",
      "viewOnly",
      "businessChanged",
      "off",
      "noAccess",
      "keys",
      "unavailable",
      "failed",
    ] as const;
    for (const failure of failures) {
      const outcome = writeOutcome({ ok: false, failure });
      expect(outcome.kind, failure).toBe("refused");
      if (outcome.kind === "refused") {
        expect(typeof words(outcome.key), failure).toBe("string");
      }
    }
    expect(writeOutcome({ ok: false, failure: "moved" })).toEqual({
      kind: "refused",
      key: "review.moved",
    });
  });

  it("puts the focus back on the part's own heading", () => {
    expect(GROUP_SECTION).toEqual({
      identity: "file-identity",
      address: "file-contact",
      bank: "file-bank",
      pension: "file-pension",
    });
  });

  it("carries the marks in the twin's address, in the groups' order", () => {
    expect(marksAfter(["pension"], "bank", true)).toEqual(["bank", "pension"]);
    expect(marksAfter(["bank", "pension"], "bank", false)).toEqual(["pension"]);
    expect(marksAfter([], "identity", false)).toEqual([]);
  });
});
