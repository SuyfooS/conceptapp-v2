import { describeSettings } from "@domain/settings-form";
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
