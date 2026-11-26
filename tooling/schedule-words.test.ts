import { MAX_PEOPLE_ON_A_SHIFT } from "@domain/staffing";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import en from "../messages/en.json";
import he from "../messages/he.json";

// Words of the builder and of availability that a screen reader hears
// (accessibility, part 4), against the real messages.
const heT = createTranslator({ locale: "he", messages: he });
const enT = createTranslator({ locale: "en", messages: en });

describe("what the builder's sheet says as someone goes on or off a shift", () => {
  const person = { name: "נועה כהן", assigned: 2, needed: 3 };

  it("writes about each person in their own form, and counts who is on it", () => {
    expect(heT("app.build.added", { ...person, form: "f" })).toBe(
      "נועה כהן נוספה למשמרת, 2 מתוך 3",
    );
    expect(heT("app.build.added", { ...person, form: "m" })).toBe(
      "נועה כהן נוסף למשמרת, 2 מתוך 3",
    );
    expect(heT("app.build.added", { ...person, form: "x" })).toBe(
      "נועה כהן נוסף/ה למשמרת, 2 מתוך 3",
    );
    expect(heT("app.build.removed", { ...person, form: "f" })).toBe(
      "נועה כהן הוסרה מהמשמרת, 2 מתוך 3",
    );
    expect(heT("app.build.removed", { ...person, form: "m" })).toBe(
      "נועה כהן הוסר מהמשמרת, 2 מתוך 3",
    );
    expect(heT("app.build.removed", { ...person, form: "x" })).toBe(
      "נועה כהן הוסר/ה מהמשמרת, 2 מתוך 3",
    );
  });

  it("says the same in English, whatever the form", () => {
    for (const form of ["f", "m", "x"]) {
      expect(enT("app.build.added", { ...person, name: "Noa", form })).toBe(
        "Noa was added to the shift, 2 of 3",
      );
      expect(enT("app.build.removed", { ...person, name: "Noa", form })).toBe(
        "Noa was removed from the shift, 2 of 3",
      );
    }
  });
});

describe("the availability's line for hours to fix", () => {
  it("quotes the words each day to fix carries, never a colour", () => {
    for (const { app } of [he, en]) {
      const { fix, dayProblem } = app.availability;
      expect(fix.endsWith(`${dayProblem}.`)).toBe(true);
    }
    expect(he.app.availability.fix).not.toMatch(/אדום/);
    expect(en.app.availability.fix).not.toMatch(/red/i);
  });
});

describe("the builder's words for a shift past the people it holds", () => {
  const values = {
    max: MAX_PEOPLE_ON_A_SHIFT,
    ltr: (chunks: string) => `[${chunks}]`,
  };

  const said = (intent: "save" | "publish") => ({
    he: heT.markup("app.build.errors.shiftFull", { ...values, intent }),
    en: enT.markup("app.build.errors.shiftFull", { ...values, intent }),
  });

  it("name the cap the app and the database hold, its number kept left to right", () => {
    expect(said("save").he).toMatch(
      /^במשמרת יכולים להיות עד \[50\] אנשים, ולכן הסידור לא נשמר\. מורידים אנשים מהמשמרת שיש בה יותר ושומרים שוב\./,
    );
    expect(said("save").en).toMatch(
      /^A shift can have at most \[50\] people, so the schedule was not saved\. Take people off the shift that has more, and save again\./,
    );
  });

  it("send a publish back to publishing, as a published week has no save", () => {
    const { he: heWords, en: enWords } = said("publish");
    expect(heWords).toMatch(
      /^במשמרת יכולים להיות עד \[50\] אנשים, ולכן הסידור לא פורסם\. מורידים אנשים מהמשמרת שיש בה יותר ומפרסמים שוב\./,
    );
    expect(heWords).not.toMatch(/נשמר|שומרים/);
    expect(enWords).toMatch(
      /^A shift can have at most \[50\] people, so the schedule was not published\. Take people off the shift that has more, and publish again\./,
    );
    expect(enWords).not.toMatch(/\bsaved?\b/);
  });

  it("say what to do when the screen shows no such shift, as when people were added meanwhile", () => {
    for (const intent of ["save", "publish"] as const) {
      expect(said(intent).he).toContain("רעננו את המסך");
      expect(said(intent).en).toContain("refresh the screen");
    }
  });
});
