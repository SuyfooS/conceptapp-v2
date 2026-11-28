import type { ListItem } from "@domain/lists";
import { describe, expect, it } from "vitest";
import {
  countText,
  KeptTyped,
  needsMinus,
  type TypedNow,
  typedBack,
  typed as typedText,
  typedToKeep,
} from "./typed-back";

// What a list keeps of what was typed on a page of the release before, as a
// change on it meets the release (closing the pilot, PR 1b), and what the
// list loaded again puts back: only on a list that takes it, its own items,
// each as its kind does. A finished list being fixed opens being fixed
// again; one nobody fills or fixes takes nothing, so nothing unsaved reads
// as its answer.

function item(id: string, more: Partial<ListItem> = {}): ListItem {
  return {
    id,
    templateItemId: null,
    kind: "check",
    label: id,
    hint: null,
    required: false,
    unit: null,
    min: null,
    max: null,
    requested: null,
    given: null,
    checked: false,
    reading: null,
    answer: null,
    photo: null,
    photoRemoved: false,
    comment: null,
    done: false,
    doneBy: null,
    doneAt: null,
    fixedAt: null,
    ...more,
  };
}

const note = item("note", { kind: "note" });
const freezer = item("freezer", { kind: "number", min: -25, max: -15 });
const milk = item("milk", { kind: "check", requested: 6 });
const photo = item("photo", { kind: "photo" });
const list = {
  items: [note, freezer, milk, photo],
  asksQuantities: true,
};

const typed: KeptTyped = {
  fields: { note: "מה חסר במטבח", freezer: "18" },
  minus: { freezer: true },
  given: { milk: "4" },
  comment: { item: "milk", text: "רק שתיים מקוררות" },
  fix: false,
  at: { item: "note", part: "field" },
};

const filling = { fill: true, fix: false };
const finished = { fill: false, fix: true };
const readOnly = { fill: false, fix: false };

describe("what a list loaded again puts back of what was typed", () => {
  it("puts it all back on a list still being filled, not being fixed", () => {
    expect(typedBack(typed, list, filling)).toEqual({
      fields: typed.fields,
      minus: typed.minus,
      given: typed.given,
      comment: typed.comment,
      fixing: false,
      at: typed.at,
    });
  });

  it("opens a finished list being fixed again when it was typed in a fix, and it may still be", () => {
    const fixed = { ...typed, fix: true };
    expect(typedBack(fixed, list, finished)).toMatchObject({
      fields: typed.fields,
      comment: typed.comment,
      fixing: true,
    });
    // Opened again for everyone meanwhile: filled, not fixed.
    expect(typedBack(fixed, list, filling)).toMatchObject({ fixing: false });
  });

  it("puts nothing on a list nobody fills or fixes: a finished one, not typed in a fix, or no longer the person's to fix", () => {
    // Typed while it was open, finished since: it shows its answers as saved.
    expect(typedBack(typed, list, finished)).toBeNull();
    // Typed in a fix, and the fix is no longer theirs.
    expect(typedBack({ ...typed, fix: true }, list, readOnly)).toBeNull();
    expect(typedBack(typed, list, readOnly)).toBeNull();
  });

  it("puts back only on its own items, each as its kind takes it", () => {
    const elsewhere: KeptTyped = {
      // Another list's item, and a field on a tick or a photo.
      fields: { gone: "3", milk: "2", photo: "x" },
      minus: { gone: true, note: true },
      given: { gone: "1", note: "2" },
      comment: { item: "gone", text: "x" },
      fix: false,
      at: { item: "gone", part: "field" },
    };
    expect(typedBack(elsewhere, list, filling)).toBeNull();
    // A minus only with its field, where one is needed; the focus only to
    // an item of this list.
    expect(
      typedBack(
        { ...elsewhere, fields: { note: "a" }, minus: { note: true } },
        list,
        filling,
      ),
    ).toEqual({
      fields: { note: "a" },
      minus: {},
      given: {},
      comment: null,
      fixing: false,
      at: null,
    });
    expect(needsMinus(freezer)).toBe(true);
    expect(needsMinus(note)).toBe(false);
  });

  it("puts back no count on a list that asks for none, and nothing of nothing kept", () => {
    const counts: KeptTyped = {
      fields: {},
      minus: {},
      given: { milk: "4" },
      comment: null,
      fix: false,
      at: { item: "milk", part: "count" },
    };
    expect(
      typedBack(counts, { ...list, asksQuantities: false }, filling),
    ).toBeNull();
    expect(typedBack(counts, list, filling)).toMatchObject({
      given: { milk: "4" },
      at: { item: "milk", part: "count" },
    });
    expect(typedBack(null, list, filling)).toBeNull();
  });

  it("reads only what was kept as it keeps it, a fix's mark and where it was made with it", () => {
    expect(KeptTyped.safeParse(typed).success).toBe(true);
    expect(KeptTyped.safeParse({ ...typed, at: null }).success).toBe(true);
    const { fix: _, ...withoutFix } = typed;
    expect(KeptTyped.safeParse(withoutFix).success).toBe(false);
    const { at: __, ...withoutAt } = typed;
    expect(KeptTyped.safeParse(withoutAt).success).toBe(false);
    expect(
      KeptTyped.safeParse({ ...typed, at: { item: "note", part: "photo" } })
        .success,
    ).toBe(false);
    expect(KeptTyped.safeParse({ ...typed, fields: { note: 5 } }).success).toBe(
      false,
    );
  });
});

describe("what a list keeps of what was typed as a change meets the release", () => {
  // The freezer as saved: -18, typed back as "18" with its minus on.
  const cold = item("freezer", {
    kind: "number",
    min: -25,
    max: -15,
    reading: -18,
  });
  const oil = item("oil", { kind: "check", requested: 6, given: 6 });
  const items = [note, cold, milk, oil, photo];
  /** The list as it was drawn: every field as saved, the sheet closed. */
  const asSaved: TypedNow = {
    drafts: { note: "", freezer: "18" },
    minus: { freezer: true },
    given: { milk: "", oil: "6" },
    comment: { item: null, text: "" },
  };
  const now = (more: Partial<TypedNow>): TypedNow => ({ ...asSaved, ...more });
  const filled = { fix: false, asksQuantities: true };
  const value = (kept: ReturnType<typeof typedToKeep>) =>
    KeptTyped.parse(kept?.value);

  it("keeps a note typed, which is the change itself: its words are what was typed", () => {
    const typing = now({ drafts: { ...asSaved.drafts, note: "שמן זית" } });
    const kept = typedToKeep(
      items,
      typing,
      note,
      { answer: "שמן זית" },
      filled,
    );
    expect(kept).toMatchObject({ of: "list", words: "typed" });
    expect(value(kept)).toEqual({
      fields: { note: "שמן זית" },
      minus: {},
      given: {},
      comment: null,
      fix: false,
      at: { item: "note", part: "field" },
    });
  });

  it("keeps a reading as typed, with its minus, and none as saved", () => {
    // "18" with the minus on is -18, as saved: nothing typed is lost.
    expect(
      typedToKeep(items, asSaved, cold, { reading: -18 }, filled),
    ).toBeUndefined();
    expect(typedText(-18, true)).toBe("18");
    // Typed 20, the minus still on: kept, with it.
    const typing = now({ drafts: { ...asSaved.drafts, freezer: "20" } });
    const kept = typedToKeep(items, typing, cold, { reading: -20 }, filled);
    expect(kept?.words).toBe("typed");
    expect(value(kept)).toMatchObject({
      fields: { freezer: "20" },
      minus: { freezer: true },
      at: { item: "freezer", part: "field" },
    });
    // The minus turned off on "18": 18 is not what was saved, so kept, off.
    const flipped = now({ minus: { freezer: false } });
    expect(
      value(typedToKeep(items, flipped, cold, { reading: 18 }, filled)),
    ).toMatchObject({ fields: { freezer: "18" }, minus: { freezer: false } });
  });

  it("keeps a count typed, but not the ticked item's own, and none on a list that asks for none", () => {
    const counting = now({ given: { ...asSaved.given, oil: "4" } });
    const counted = typedToKeep(items, counting, oil, { given: 4 }, filled);
    expect(counted?.words).toBe("typed");
    expect(value(counted)).toMatchObject({
      given: { oil: "4" },
      at: { item: "oil", part: "count" },
    });
    expect(countText(6)).toBe("6");
    // Ticked: its count goes with the tick, pressed again, so nothing typed
    // is lost, and the press's own words are said.
    expect(
      typedToKeep(items, counting, oil, { checked: false }, filled),
    ).toBeUndefined();
    // Asked for no counts: none kept.
    expect(
      typedToKeep(
        items,
        counting,
        oil,
        { given: 4 },
        {
          ...filled,
          asksQuantities: false,
        },
      ),
    ).toBeUndefined();
  });

  it("keeps the comment being saved, or one still written in its sheet", () => {
    const saving = typedToKeep(
      items,
      asSaved,
      milk,
      { comment: "רק שתיים מקוררות" },
      filled,
    );
    expect(saving?.words).toBe("typed");
    // Its sheet opens again, which takes the focus: no place to give it to.
    expect(value(saving)).toMatchObject({
      comment: { item: "milk", text: "רק שתיים מקוררות" },
      at: null,
    });
    // A tick pressed beside a sheet still open with words in it.
    const writing = now({ comment: { item: "milk", text: "שתיים" } });
    expect(
      value(typedToKeep(items, writing, oil, { checked: false }, filled)),
    ).toMatchObject({ comment: { item: "milk", text: "שתיים" } });
    // An empty sheet keeps nothing.
    const blank = now({ comment: { item: "milk", text: "  " } });
    expect(
      typedToKeep(items, blank, oil, { checked: false }, filled),
    ).toBeUndefined();
  });

  it("says the press wasn't recorded and the rest is back, for a press beside what was typed", () => {
    // A tick on the milk while a note is typed and not yet left.
    const typing = now({ drafts: { ...asSaved.drafts, note: "שמן זית" } });
    const kept = typedToKeep(items, typing, milk, { checked: true }, filled);
    expect(kept?.words).toBe("pressTyped");
    expect(value(kept)).toMatchObject({
      fields: { note: "שמן זית" },
      at: { item: "milk", part: "check" },
    });
    // The minus pressed beside it: a press again too.
    expect(
      typedToKeep(items, typing, cold, { reading: 18 }, filled)?.words,
    ).toBe("pressTyped");
  });

  it("carries whether the list was being fixed", () => {
    const typing = now({ drafts: { ...asSaved.drafts, note: "שמן זית" } });
    expect(
      value(
        typedToKeep(
          items,
          typing,
          note,
          { answer: "שמן זית" },
          {
            ...filled,
            fix: true,
          },
        ),
      ).fix,
    ).toBe(true);
  });

  it("reads the changed item as it was before the change, not as the screen shows it", () => {
    // The screen already shows the note saved with its new words; as it was
    // before, they differ, so they are kept.
    const shown = [item("note", { kind: "note", answer: "שמן זית" })];
    const typing = now({ drafts: { note: "שמן זית" } });
    expect(
      value(typedToKeep(shown, typing, note, { answer: "שמן זית" }, filled))
        .fields,
    ).toEqual({ note: "שמן זית" });
  });
});
