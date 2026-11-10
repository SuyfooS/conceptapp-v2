import { ONE_OFF_REST_DAYS, PAID_HOLIDAYS } from "@domain/payroll-calendar";
import { PAYROLL_FLAG_CODES, PAYROLL_NOTE_CODES } from "@domain/payroll-flags";
import { describe, expect, it } from "vitest";
import en from "../messages/en.json";
import he from "../messages/he.json";

type Tree = { [key: string]: string | Tree };

const words = (messages: typeof he, group: string): Tree =>
  ((messages.modules.time_clock as unknown as Tree)[group] ?? {}) as Tree;

// The payroll engine names its flags, notes, holidays and one-off rest days
// by code (@domain/payroll-flags, @domain/payroll-calendar), so nothing else
// makes sure each has its words. messages.test.ts keeps the English in step.
describe("payroll's words", () => {
  for (const [language, messages] of [
    ["he", he],
    ["en", en],
  ] as const) {
    it(`name every flag and note in ${language}`, () => {
      const payroll = words(messages, "payroll");
      const flags = payroll.flags as Tree;
      const notes = payroll.notes as Tree;
      for (const code of PAYROLL_FLAG_CODES) {
        expect(typeof flags[code], code).toBe("string");
      }
      for (const code of PAYROLL_NOTE_CODES) {
        expect(typeof notes[code], code).toBe("string");
      }
      // And none for a code the engine doesn't have.
      expect(Object.keys(flags).sort()).toEqual([...PAYROLL_FLAG_CODES].sort());
      expect(Object.keys(notes).sort()).toEqual([...PAYROLL_NOTE_CODES].sort());
    });

    it(`name every paid holiday and one-off rest day in ${language}`, () => {
      expect(Object.keys(words(messages, "holidays")).sort()).toEqual(
        [...PAID_HOLIDAYS].sort(),
      );
      expect(Object.keys(words(messages, "oneOffRestDays")).sort()).toEqual(
        ONE_OFF_REST_DAYS.map((day) => day.key).sort(),
      );
    });
  }

  it("have no exclamation marks in Hebrew", () => {
    const all = JSON.stringify([
      words(he, "payroll"),
      words(he, "holidays"),
      words(he, "oneOffRestDays"),
    ]);
    expect(all).not.toContain("!");
  });
});
