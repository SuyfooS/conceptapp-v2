import { describe, expect, it } from "vitest";
import {
  baseSentence,
  checkSentence,
  editableKeys,
  fittingWording,
  isEditableKey,
  keptParts,
  layerWording,
  type MessageTree,
  mergeWording,
  placeholdersOf,
  searchable,
  sentenceFits,
  shownSentence,
  shownWording,
  WORDING_MAX,
  wordingEntries,
  wordingGroupOf,
} from "./wording";

// A small stand-in for messages/he.json.
const tree: MessageTree = {
  admin: { nav: { businesses: "עסקים" } },
  app: {
    loading: "טוען",
    notFound: { title: "לא נמצא" },
    nav: { home: "היום" },
    team: {
      title: "הצוות",
      metaTitle: "צוות",
      count: "{count, plural, one {אדם אחד} other {# אנשים}}",
      hint: "<ltr>{phone}</ltr> לא בצוות",
    },
  },
  modules: { scheduling: { name: "סידור" } },
};

describe("which sentences may be replaced", () => {
  it("offers the app's and the modules' copy", () => {
    expect(editableKeys(tree)).toEqual([
      "app.nav.home",
      "app.team.title",
      "app.team.count",
      "app.team.hint",
      "modules.scheduling.name",
    ]);
  });

  it("never what shows before or outside a business, or page titles", () => {
    for (const key of [
      "app.loading",
      "app.notFound.title",
      "app.noBusiness.title",
      "app.team.metaTitle",
      "admin.nav.businesses",
      "auth.enter.title",
      "app",
      "app..nav",
    ]) {
      expect(isEditableKey(key), key).toBe(false);
    }
  });

  it("finds the app's sentence at a key", () => {
    expect(baseSentence(tree, "app.team.title")).toBe("הצוות");
    expect(baseSentence(tree, "app.team")).toBeNull();
    expect(baseSentence(tree, "app.team.title.more")).toBeNull();
    expect(baseSentence(tree, "app.nothing")).toBeNull();
  });
});

describe("placeholders", () => {
  it("lists each argument with its kind, and every tag", () => {
    expect(
      placeholdersOf("{count, plural, one {אדם אחד} other {# אנשים}}"),
    ).toEqual({ args: ["{count,plural}"], tags: [] });
    expect(placeholdersOf("<ltr>{phone}</ltr> ו-<ltr>{other}</ltr>")).toEqual({
      args: ["{other}", "{phone}"],
      tags: ["</ltr>", "</ltr>", "<ltr>", "<ltr>"],
    });
  });

  it("lets a replacement move and repeat arguments, but not lose one", () => {
    expect(sentenceFits("{name} ב{day}", "ב{day}: {name}, {name}")).toBe(true);
    expect(sentenceFits("{name} ב{day}", "{name}")).toBe(false);
    expect(sentenceFits("{name}", "{name} {extra}")).toBe(false);
  });

  it("refuses a plural made plain, or a dropped closing tag", () => {
    expect(
      sentenceFits("{count, plural, one {אחד} other {#}}", "{count} אנשים"),
    ).toBe(false);
    expect(sentenceFits("<ltr>{phone}</ltr>", "<ltr>{phone}")).toBe(false);
  });

  it("doesn't count what an apostrophe quotes, which shows as written", () => {
    expect(sentenceFits("{count} משמרות", "'{count}' משמרות")).toBe(false);
    expect(
      sentenceFits("<ltr>{phone}</ltr> לא בצוות", "מס'<ltr>{phone}</ltr> לא"),
    ).toBe(false);
    // A doubled apostrophe is one apostrophe, and quotes nothing.
    expect(sentenceFits("{name}", "''{name}''")).toBe(true);
    // An apostrophe before a letter is just an apostrophe.
    expect(sentenceFits("{name} ברח' הרצל", "{name}, רח' הרצל")).toBe(true);
  });

  it("names what must stay, with an argument's kind", () => {
    expect(keptParts("{count, plural, one {אחד} other {#}} ב{day}")).toEqual([
      "{count, plural, …}",
      "{day}",
    ]);
    expect(keptParts("<ltr>{phone}</ltr> ו-<ltr>{other}</ltr>")).toEqual([
      "{other}",
      "{phone}",
      "<ltr>",
    ]);
    expect(keptParts("הצוות")).toEqual([]);
  });
});

describe("layers", () => {
  it("puts a business's sentence over its template's", () => {
    expect(
      layerWording(
        { "app.nav.home": "תבנית", "app.team.title": "תבנית" },
        { "app.nav.home": "עסק" },
      ),
    ).toEqual({ "app.nav.home": "עסק", "app.team.title": "תבנית" });
  });

  it("keeps only what can show", () => {
    expect(
      fittingWording(tree, {
        "app.nav.home": "הבית",
        "app.team.hint": "{phone} לא בצוות",
        "app.team.gone": "משפט שכבר אין",
        "app.loading": "רגע",
        "admin.nav.businesses": "חנויות",
      }),
    ).toEqual({ "app.nav.home": "הבית" });
  });

  it("checks each layer on its own, as the console shows it", () => {
    const template = { "app.team.hint": "<ltr>{phone}</ltr> לא בחנות" };
    // The business's sentence was written before the app's changed.
    const business = { "app.team.hint": "{number} לא בצוות" };
    expect(shownWording(tree, template, business)).toEqual(template);
    const entry = wordingEntries(tree, template, business).find(
      (e) => e.key === "app.team.hint",
    );
    expect(entry && shownSentence(entry)).toEqual({
      sentence: "<ltr>{phone}</ltr> לא בחנות",
      source: "template",
    });
  });
});

describe("mergeWording", () => {
  it("replaces sentences in a new tree and leaves the app's alone", () => {
    const merged = mergeWording(tree, {
      "app.nav.home": "הבית",
      "app.team.title": "החנות",
    });
    expect(baseSentence(merged, "app.nav.home")).toBe("הבית");
    expect(baseSentence(merged, "app.team.title")).toBe("החנות");
    expect(baseSentence(merged, "app.team.count")).toBe(
      "{count, plural, one {אדם אחד} other {# אנשים}}",
    );
    expect(baseSentence(tree, "app.nav.home")).toBe("היום");
    expect(baseSentence(tree, "app.team.title")).toBe("הצוות");
    // Untouched branches are shared, not copied.
    expect(merged.modules).toBe(tree.modules);
  });

  it("returns the tree itself when nothing is replaced", () => {
    expect(mergeWording(tree, {})).toBe(tree);
  });

  it("adds nothing at a key the app doesn't have", () => {
    const merged = mergeWording(tree, {
      "app.team.gone": "x",
      "app.nav.home.deeper": "y",
    });
    expect(baseSentence(merged, "app.team.gone")).toBeNull();
    expect(baseSentence(merged, "app.nav.home")).toBe("היום");
  });
});

describe("checkSentence", () => {
  it("tidies a sentence that fits", () => {
    expect(checkSentence(tree, "app.team.title", "  הצוות של החנות ")).toEqual({
      ok: true,
      sentence: "הצוות של החנות",
      base: "הצוות",
    });
  });

  it("says what is wrong", () => {
    expect(checkSentence(tree, "app.loading", "רגע")).toEqual({
      ok: false,
      problem: "notEditable",
    });
    expect(checkSentence(tree, "app.team.title", "   ")).toEqual({
      ok: false,
      problem: "empty",
    });
    expect(checkSentence(tree, "app.team.title", 7)).toEqual({
      ok: false,
      problem: "empty",
    });
    expect(
      checkSentence(tree, "app.team.title", "א".repeat(WORDING_MAX + 1)),
    ).toEqual({ ok: false, problem: "tooLong" });
    expect(checkSentence(tree, "app.team.hint", "{phone} לא כאן")).toEqual({
      ok: false,
      problem: "placeholders",
    });
    expect(
      checkSentence(tree, "app.team.hint", "מס'<ltr>{phone}</ltr> לא בצוות"),
    ).toEqual({ ok: false, problem: "apostrophe" });
  });
});

describe("the editor's groups and search", () => {
  it("puts role, module and tab names first, then each screen", () => {
    expect(wordingGroupOf("app.team.roles.worker")).toBe("common");
    expect(wordingGroupOf("app.nav.home")).toBe("common");
    expect(wordingGroupOf("modules.scheduling.name")).toBe("common");
    expect(wordingGroupOf("modules.scheduling.settings.positions.label")).toBe(
      "schedule",
    );
    expect(wordingGroupOf("app.home.greeting")).toBe("home");
    expect(wordingGroupOf("app.build.title")).toBe("schedule");
    expect(wordingGroupOf("app.clock.title")).toBe("clock");
    expect(wordingGroupOf("app.team.title")).toBe("team");
    expect(wordingGroupOf("app.manage.title")).toBe("manage");
    expect(wordingGroupOf("app.viewAs.label")).toBe("other");
  });

  it("finds a sentence without its slashes, geresh or niqqud", () => {
    expect(searchable("עוֹבֵד/ת  בצוות")).toBe("עובדת בצוות");
    expect(searchable("מוצ״ש")).toBe("מוצש");
    expect(searchable("Shift  Lead")).toBe("shift lead");
  });

  it("lists every sentence with what the business shows and from where", () => {
    const entries = wordingEntries(
      tree,
      { "app.team.title": "צוות החנות", "app.team.hint": "{phone} לא כאן" },
      { "app.nav.home": "הבית" },
    );
    expect(entries.map((e) => e.key)).toEqual(editableKeys(tree));
    const byKey = new Map(entries.map((e) => [e.key, shownSentence(e)]));
    expect(byKey.get("app.nav.home")).toEqual({
      sentence: "הבית",
      source: "business",
    });
    expect(byKey.get("app.team.title")).toEqual({
      sentence: "צוות החנות",
      source: "template",
    });
    // A template sentence that no longer fits is left out.
    expect(byKey.get("app.team.hint")?.source).toBe("app");
  });
});
