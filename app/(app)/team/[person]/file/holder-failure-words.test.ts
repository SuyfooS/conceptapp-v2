import { describe, expect, it } from "vitest";
import he from "@/messages/he.json";
import { holderWordsOf } from "./holder-failure-words";

/*
 * A refusal on a holder's file in words (profile H6a), every key there in
 * the messages; none for what the screen answers by drawing itself again.
 */

const words = (key: string) =>
  key
    .split(".")
    .reduce<unknown>(
      (tree, part) => (tree as Record<string, unknown>)[part],
      he.app.team.file,
    );

describe("a holder's refusals", () => {
  it("say each in words that are there", () => {
    const failures = [
      "viewOnly",
      "businessChanged",
      "off",
      "noAccess",
      "failed",
      "wrongCode",
      "tooMany",
      "rateLimit",
      "noPhone",
      "invalidPhone",
      "limit",
      "keys",
      "unavailable",
      "moved",
      "settled",
      "demo",
      "closed",
      "notInTeam",
      "somethingNew",
    ];
    for (const when of [
      "send",
      "confirm",
      "reveal",
      "write",
      "other",
    ] as const) {
      for (const failure of failures) {
        const key = holderWordsOf(failure, when);
        expect(key, `${failure} ${when}`).not.toBeNull();
        expect(typeof words(key ?? ""), `${failure} ${when}`).toBe("string");
      }
    }
  });

  it("say nothing for the duties first or the files locked: the screen draws them", () => {
    expect(holderWordsOf("ack")).toBeNull();
    expect(holderWordsOf("stepUp", "reveal")).toBeNull();
  });

  it("say a failed send as the code not sent, anything else as not working", () => {
    expect(holderWordsOf("failed", "send")).toBe("code.failed");
    expect(holderWordsOf("failed", "confirm")).toBe("failures.failed");
    expect(holderWordsOf("invalidPhone", "send")).toBe("code.noPhone");
    expect(holderWordsOf("noAccess", "reveal")).toBe("reveal.noAccess");
    expect(holderWordsOf("limit", "reveal")).toBe("reveal.limit");
    expect(holderWordsOf("keys")).toBe("unavailable");
  });
});

// Profile H6b-1: a holder's writes.
describe("a holder's write refused", () => {
  it("says the account changed or confirmed meanwhile, and the database's refusals", () => {
    expect(holderWordsOf("moved", "write")).toBe("review.moved");
    expect(holderWordsOf("settled", "write")).toBe("review.settled");
    expect(holderWordsOf("demo", "write")).toBe("failures.demo");
    expect(holderWordsOf("closed", "write")).toBe("failures.closed");
    expect(holderWordsOf("notInTeam", "write")).toBe("failures.notInTeam");
    expect(holderWordsOf("unavailable", "write")).toBe("unavailable");
  });

  it("says nothing for no fresh step-up or the duties first", () => {
    expect(holderWordsOf("stepUp", "write")).toBeNull();
    expect(holderWordsOf("ack", "write")).toBeNull();
  });
});
