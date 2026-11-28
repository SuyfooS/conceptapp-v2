import type { ListItem } from "@domain/lists";
import { describe, expect, it } from "vitest";
import { KeptTyped, needsMinus, typedBack } from "./typed-back";

// What a list loaded again for a release puts back of what was typed on the
// page before (closing the pilot, PR 1b): only on a list that takes it, its
// own items, each as its kind does. A finished list being fixed opens being
// fixed again; one nobody fills or fixes takes nothing, so nothing unsaved
// reads as its answer.

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
    };
    expect(typedBack(elsewhere, list, filling)).toBeNull();
    // A minus only with its field, where one is needed.
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
    };
    expect(
      typedBack(counts, { ...list, asksQuantities: false }, filling),
    ).toBeNull();
    expect(typedBack(counts, list, filling)).toMatchObject({
      given: { milk: "4" },
    });
    expect(typedBack(null, list, filling)).toBeNull();
  });

  it("reads only what was kept as it keeps it, a fix's mark with it", () => {
    expect(KeptTyped.safeParse(typed).success).toBe(true);
    const { fix: _, ...withoutFix } = typed;
    expect(KeptTyped.safeParse(withoutFix).success).toBe(false);
    expect(KeptTyped.safeParse({ ...typed, fields: { note: 5 } }).success).toBe(
      false,
    );
  });
});
