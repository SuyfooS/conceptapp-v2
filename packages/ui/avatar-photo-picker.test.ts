import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import he from "../../messages/he.json";
import { photoPickerLine } from "./avatar-photo-picker";

/*
 * The photo picker's line (accessibility, part 1): while the photo is made
 * ready it says so, and once it is, that it can be saved or another chosen,
 * so a screen reader hears the pick end; before a pick it says nothing.
 */

describe("photoPickerLine", () => {
  it("says the photo being made ready, then ready, and nothing before", () => {
    expect(photoPickerLine("idle")).toBeNull();
    expect(photoPickerLine("preparing")).toBe("preparing");
    expect(photoPickerLine("preview")).toBe("ready");
  });

  it("has its words in both languages", () => {
    for (const line of ["preparing", "ready"] as const) {
      expect(he.ui.photoPicker[line]).toBeTruthy();
      expect(en.ui.photoPicker[line]).toBeTruthy();
    }
  });
});
