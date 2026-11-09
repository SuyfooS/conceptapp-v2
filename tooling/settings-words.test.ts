import { BANKS } from "@domain/banks";
import { describeSettings } from "@domain/settings-form";
import { SHABBAT_CITIES } from "@domain/shabbat";
import { describe, expect, it } from "vitest";
import he from "../messages/he.json";
import { manifests } from "../modules/registry";

type Words = {
  label?: string;
  hint?: string;
  options?: Record<string, string>;
};

// A setting gets its place on screen from its module's manifest, so nothing else
// makes sure it has words. messages.test.ts keeps the English in step.
describe("settings", () => {
  for (const manifest of manifests) {
    const words = (he.modules[manifest.key] as { settings?: object })
      .settings as Record<string, Words> | undefined;

    it(`of ${manifest.key} can all be drawn and have their words`, () => {
      for (const field of describeSettings(manifest.settings)) {
        const own = words?.[field.key];
        expect(own?.label, field.key).toBeTruthy();
        if (field.kind !== "choice") continue;
        for (const option of field.options) {
          expect(own?.options?.[option], `${field.key} ${option}`).toBeTruthy();
        }
      }
    });
  }
});

// A business's Shabbat city is a key in the code's list; its name is in the
// messages, so a city added to the list needs its words.
describe("the cities for Shabbat times", () => {
  it("each have a name", () => {
    const names = he.cities as Record<string, string>;
    for (const city of SHABBAT_CITIES) {
      expect(names[city], city).toBeTruthy();
    }
    expect(Object.keys(names).sort()).toEqual([...SHABBAT_CITIES].sort());
  });
});

// A worker's bank is a code in the code's dated list; its name is in the
// messages, so a bank added to the list needs its words.
describe("the banks for wages", () => {
  it("each have a name", () => {
    const names = he.banks as Record<string, string>;
    for (const bank of BANKS) {
      expect(names[String(bank.code)], String(bank.code)).toBeTruthy();
    }
    // And no name for a bank that isn't in the list, as for the cities.
    expect(Object.keys(names).sort()).toEqual(
      BANKS.map((bank) => String(bank.code)).sort(),
    );
  });
});
