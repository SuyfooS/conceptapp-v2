import { describe, expect, it } from "vitest";
import { type GivenBack, wordsBack } from "./words-back";

/*
 * A chat's messages sent from a page of the release before come back to the
 * field (closing the pilot, PR 1b): the person may send a second before the
 * first came back, and the actions run one after the other, so they come
 * back in the order they were sent. In the field they read in that order,
 * before whatever was written since.
 */

const A: GivenBack = { at: "2026-11-28T08:00:01.000Z", body: "לא אגיע מחר" };
const B: GivenBack = { at: "2026-11-28T08:00:04.000Z", body: "אני חולה" };
const C: GivenBack = { at: "2026-11-28T08:00:09.000Z", body: "סליחה" };

/** Gives back each in turn, the person typing `typed[i]` before each one. */
function giveBack(items: GivenBack[], typed: string[] = []) {
  let field = "";
  let given: GivenBack[] = [];
  items.forEach((item, i) => {
    field += typed[i] ?? "";
    ({ field, given } = wordsBack(field, given, item));
  });
  return field;
}

describe("the words of messages that met a page from the release before", () => {
  it("come back alone to an empty field", () => {
    expect(wordsBack("", [], A)).toEqual({ field: A.body, given: [A] });
    expect(wordsBack("  \n", [], A).field).toBe(A.body);
  });

  it("come back before what was written since, on a line of their own", () => {
    expect(wordsBack("עוד משהו", [], A).field).toBe(`${A.body}\nעוד משהו`);
  });

  it("read in the order they were sent, two or three of them", () => {
    expect(giveBack([A, B])).toBe(`${A.body}\n${B.body}`);
    expect(giveBack([A, B, C])).toBe(`${A.body}\n${B.body}\n${C.body}`);
  });

  it("keep what was written since after them all", () => {
    // Typed before the first came back, then more before the second did.
    expect(giveBack([A, B], ["רגע", ", תודה"])).toBe(
      `${A.body}\n${B.body}\nרגע, תודה`,
    );
    expect(giveBack([A, B], ["", "\nרגע"])).toBe(`${A.body}\n${B.body}\nרגע`);
  });

  it("go in by when they were written, one tried again later among them", () => {
    // A failed for another reason first, and was tried again after B came back.
    expect(giveBack([B, A])).toBe(`${A.body}\n${B.body}`);
    expect(giveBack([C, A, B])).toBe(`${A.body}\n${B.body}\n${C.body}`);
  });

  it("start again in a field emptied meanwhile", () => {
    const first = wordsBack("", [], A);
    expect(wordsBack("", first.given, B)).toEqual({
      field: B.body,
      given: [B],
    });
  });

  it("follow words given back that were changed meanwhile, in the order written", () => {
    const first = wordsBack("", [], A);
    const changed = wordsBack("לא אגיע מחר בבוקר", first.given, B);
    expect(changed.field).toBe(`לא אגיע מחר בבוקר\n${B.body}`);
    // And a third after both.
    expect(wordsBack(changed.field, changed.given, C).field).toBe(
      `לא אגיע מחר בבוקר\n${B.body}\n${C.body}`,
    );
  });
});
