import { describe, expect, it } from "vitest";
import { fileScreenDemo } from "../../../design/shell/me/file/data";
import { completeHref, pensionLeftOf } from "./file-parts";
import type { FileScreenData } from "./file-types";

// Where the ways that ask to complete the file (Today's card, the
// profile's) open it (profile H5b), on Noa's twin files.

/** The same file, not sent yet. */
const unsent = (data: FileScreenData): FileScreenData => ({
  ...data,
  file: data.file ? { ...data.file, submitted_at: null } : null,
});

describe("a fund chosen 'later' all that is left", () => {
  it("opens the pension's step once the file is sent", () => {
    const { data } = fileScreenDemo("later", "he");
    expect(data.file?.submitted_at).not.toBeNull();
    const left = pensionLeftOf(data);
    expect(left).toEqual({ kind: "open", dueOn: "2026-12-24" });
    expect(completeHref("", left)).toBe("/me/file?step=pension");
  });

  it("leaves a file not sent yet to the flow, whose done screen sends it first", () => {
    for (const form101 of ["print", "off"] as const) {
      const data = unsent(fileScreenDemo("later", "he", { form101 }).data);
      expect(data.missing).toEqual(["pension"]);
      const left = pensionLeftOf(data);
      expect(left).toBeNull();
      expect(completeHref("", left)).toBe("/me/file");
    }
  });

  it("is nothing while a step is still open, or once nothing is missing", () => {
    expect(pensionLeftOf(fileScreenDemo("stopped", "he").data)).toBeNull();
    expect(pensionLeftOf(fileScreenDemo("done", "he").data)).toBeNull();
  });
});

describe("the twin's way in", () => {
  it("carries the state of the file it told", () => {
    const left = pensionLeftOf(fileScreenDemo("later", "he").data);
    expect(completeHref("/design/shell", left, "state=later")).toBe(
      "/design/shell/me/file?step=pension&state=later",
    );
    expect(completeHref("/design/shell", null, "ask=lean")).toBe(
      "/design/shell/me/file?ask=lean",
    );
    expect(completeHref("/design/shell", null)).toBe("/design/shell/me/file");
  });
});
