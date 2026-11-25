import { NextIntlClientProvider } from "next-intl";
import { createElement, Fragment } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
// The words a screen's provider gives it.
import en from "../../messages/en.json";
import he from "../../messages/he.json";
import {
  ChecklistItem,
  type ChecklistItemProps,
  LIST_ITEM,
} from "./checklist-item";

/*
 * A list's item, heard (accessibility, part 1): a number's range is one
 * line that describes its field and turns into the warning in place, said
 * whole each time (its range in a node of its own); a
 * check only read says whether it is ticked; a photo's remove stays while
 * the photo saves, doing nothing, so the focus on it stays too.
 */

const MESSAGES = { he, en };

function draw(props: Partial<ChecklistItemProps>, locale: "he" | "en" = "he") {
  const provider = {
    locale,
    timeZone: "Asia/Jerusalem",
    messages: MESSAGES[locale],
  } as unknown as Parameters<typeof NextIntlClientProvider>[0];
  return renderToString(
    createElement(
      NextIntlClientProvider,
      provider,
      createElement(ChecklistItem, {
        kind: "check",
        label: "Main fridge",
        required: true,
        optionalLabel: "Optional",
        done: false,
        ...props,
      }),
    ),
  );
}

const reading = (outOfRange: string | null) =>
  draw({
    kind: "number",
    hint: "In degrees",
    number: {
      value: outOfRange ? "9" : "4",
      onValueChange: () => {},
      onCommit: () => {},
      fieldLabel: "Reading of Main fridge",
      unit: "°C",
      range: "2 – 8",
      outOfRange,
    },
  });

describe("a number item", () => {
  it("is described by its hint and by its range line", () => {
    const html = reading(null);
    const hint = html.match(/<span id="([^"]+)"[^>]*>In degrees<\/span>/)?.[1];
    const range = html.match(
      /<span id="([^"]+)" aria-live="polite" aria-atomic="true"[^>]*>2 – 8<\/span>/,
    )?.[1];
    expect(hint).toBeDefined();
    expect(range).toBeDefined();
    const field = html.match(/<input id="[^"]+"[^>]*>/)?.[0] ?? "";
    expect(field).toContain(`aria-describedby="${hint} ${range}"`);
  });

  it("says a reading out of range in the same line, no status of its own", () => {
    const html = reading("Outside 2 – 8");
    expect(html).toMatch(
      /<span id="[^"]+" aria-live="polite" aria-atomic="true" class="[^"]*text-warning[^"]*">Outside 2 – 8<\/span>/,
    );
    expect(html).not.toContain('role="status"');
    expect(html).not.toContain(">2 – 8</span>");
  });

  it("says its line whole, its range with it, when the range is a node of its own", () => {
    const html = draw({
      kind: "number",
      number: {
        value: "9",
        onValueChange: () => {},
        onCommit: () => {},
        fieldLabel: "Reading of Main fridge",
        range: createElement(
          Fragment,
          null,
          "Between ",
          createElement("span", { dir: "ltr" }, "2–8"),
        ),
        outOfRange: createElement(
          Fragment,
          null,
          "Outside ",
          createElement("span", { dir: "ltr" }, "2–8"),
        ),
      },
    });
    expect(html).toMatch(
      /<span id="[^"]+" aria-live="polite" aria-atomic="true"[^>]*>Outside <span dir="ltr">2–8<\/span><\/span>/,
    );
  });
});

describe("a check only read", () => {
  for (const [locale, words] of [
    ["he", he.ui.checklist],
    ["en", en.ui.checklist],
  ] as const) {
    it(`says whether it is ticked (${locale})`, () => {
      expect(draw({ readOnly: true, done: true }, locale)).toContain(
        `<span class="sr-only">${words.checked}</span>`,
      );
      expect(draw({ readOnly: true, done: false }, locale)).toContain(
        `<span class="sr-only">${words.notChecked}</span>`,
      );
    });
  }

  it("leaves it to the checkbox where it can be ticked", () => {
    const html = draw({ check: { checked: true, onToggle: () => {} } });
    expect(html).toContain('type="checkbox"');
    expect(html).not.toContain(`>${he.ui.checklist.checked}</span>`);
  });
});

describe("a photo item", () => {
  const photo = (busy: string | null) =>
    draw({
      kind: "photo",
      photo: {
        src: "/list-photo.webp",
        alt: "The fridge's photo",
        busy,
        take: {
          label: "Add a photo",
          replaceLabel: "Replace the photo",
          onPick: () => {},
        },
        remove: { label: "Remove the photo", onRemove: () => {} },
      },
    });
  const removeButton = (html: string) =>
    html.match(
      /<button[^>]*aria-label="Remove the photo: Main fridge"[^>]*>/,
    )?.[0];

  it("keeps its remove while it saves, dimmed and doing nothing", () => {
    const button = removeButton(photo("Saving the photo")) ?? "";
    expect(button).toContain('aria-disabled="true"');
    expect(button).not.toMatch(/\sdisabled=""/);
  });

  it("offers its remove as before once it is saved", () => {
    const button = removeButton(photo(null)) ?? "";
    expect(button).not.toContain("aria-disabled=");
  });
});

// Two items can share a label: a screen finds an item's buttons by its id,
// on its root (accessibility, part 8, the photo's way back).
describe("an item's id", () => {
  const root = (html: string) => html.match(/^<div[^>]*>/)?.[0] ?? "";

  it(`is on its root, whatever its kind (${LIST_ITEM})`, () => {
    const kinds: Partial<ChecklistItemProps>[] = [
      { kind: "check", check: { checked: false, onToggle: () => {} } },
      {
        kind: "check",
        history: {
          line: "Noa · 07:42",
          label: "What happened",
          onOpen: () => {},
        },
      },
      {
        kind: "note",
        note: {
          value: "",
          onValueChange: () => {},
          onCommit: () => {},
          fieldLabel: "Main fridge",
        },
      },
      {
        kind: "photo",
        photo: {
          src: "/list-photo.webp",
          alt: "The fridge's photo",
          remove: { label: "Remove the photo", onRemove: () => {} },
        },
      },
    ];
    for (const props of kinds) {
      expect(root(draw({ ...props, itemId: "item-7" }))).toContain(
        `${LIST_ITEM}="item-7"`,
      );
    }
  });

  it("is not drawn without one", () => {
    expect(draw({})).not.toContain(LIST_ITEM);
  });
});
