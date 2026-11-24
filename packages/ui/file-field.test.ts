import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  FileField,
  type FileFieldChoice,
  type FileFieldProps,
} from "./file-field";

/*
 * The file of a form, heard (accessibility, part 1): one line a screen
 * reader hears is always there, empty, then the photo being made ready,
 * then the file ready, so each change is said; the visible "preparing"
 * line is no status of its own. The way to take the file out and the
 * pickers' buttons carry the marks the focus finds them by.
 */

const choices: FileFieldChoice[] = [
  {
    key: "camera",
    icon: null,
    label: "Camera",
    accept: "image/*",
    onPick: () => {},
  },
  {
    key: "pdf",
    icon: null,
    label: "PDF",
    accept: "application/pdf",
    onPick: () => {},
  },
];

const draw = (props: Partial<FileFieldProps>) =>
  renderToString(
    createElement(FileField, {
      legend: "The file",
      choices,
      chosen: null,
      chosenLabel: "The file you chose",
      readyLabel: "The file is ready to send",
      remove: { label: "Remove the file", onRemove: () => {} },
      ...props,
    }),
  );

/** What the live line says. */
const said = (html: string) =>
  html.match(/<p aria-live="polite" class="sr-only">(.*?)<\/p>/)?.[1];

describe("FileField", () => {
  it("draws its live line in every state: empty, preparing, ready", () => {
    expect(said(draw({}))).toBe("");
    expect(said(draw({ preparing: "Preparing the photo" }))).toBe(
      "Preparing the photo",
    );
    expect(
      said(draw({ chosen: { kind: "image", src: "data:,", alt: "Chosen" } })),
    ).toBe("The file is ready to send");
    expect(said(draw({ chosen: { kind: "pdf", name: "note.pdf" } }))).toBe(
      "The file is ready to send",
    );
  });

  it("says nothing ready with no words for it", () => {
    expect(
      said(
        draw({
          chosen: { kind: "pdf", name: "note.pdf" },
          readyLabel: undefined,
        }),
      ),
    ).toBe("");
  });

  it("keeps its visible preparing line out of what is read, and no status", () => {
    const html = draw({ preparing: "Preparing the photo" });
    expect(html).not.toContain('role="status"');
    expect(html).toMatch(/<p aria-hidden="true"[^>]*>.*Preparing the photo/);
  });

  it("marks the way to take the file out, and each picker's button", () => {
    const image = draw({
      chosen: { kind: "image", src: "data:,", alt: "Chosen" },
    });
    expect(image.match(/<button[^>]*data-file-remove=""[^>]*>/)?.[0]).toContain(
      'aria-label="Remove the file"',
    );
    const pdf = draw({ chosen: { kind: "pdf", name: "note.pdf" } });
    expect(pdf).toMatch(/<button[^>]*data-attachment-cancel=""/);
    const empty = draw({});
    expect(empty.match(/data-file-choice-button=""/g)).toHaveLength(2);
  });
});
