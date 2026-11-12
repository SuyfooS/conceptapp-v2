import {
  NOTIFICATION_GROUPS,
  NOTIFICATION_KIND_KEYS,
} from "@domain/notifications";
import { describe, expect, it } from "vitest";
import en from "../messages/en.json";
import he from "../messages/he.json";

type Tree = { [key: string]: string | Tree };

const at = (tree: Tree, path: string[]): Tree | string | undefined =>
  path.reduce<Tree | string | undefined>(
    (node, key) => (typeof node === "object" ? node[key] : undefined),
    tree,
  );

// A kind of notification gets its place in the inbox from @domain/notifications,
// so nothing else makes sure it has words. messages.test.ts keeps the English
// in step with the Hebrew.
describe("notifications", () => {
  for (const [language, messages] of [
    ["he", he],
    ["en", en],
  ] as const) {
    const words = messages.app.notifications as unknown as Tree;

    it(`have a title for every kind in ${language}`, () => {
      for (const kind of NOTIFICATION_KIND_KEYS) {
        const own = at(words, ["kinds", ...kind.split(".")]);
        expect(typeof own, kind).toBe("object");
        const titles = Object.keys(own as Tree).filter((key) =>
          key.startsWith("title"),
        );
        expect(titles, kind).toContain("title");
      }
      expect(at(words, ["kinds", "other", "title"])).toBeTruthy();
    });

    it(`name every group in ${language}`, () => {
      for (const group of NOTIFICATION_GROUPS) {
        expect(at(words, ["groups", group, "name"]), group).toBeTruthy();
        expect(at(words, ["groups", group, "hint"]), group).toBeTruthy();
      }
    });

    it(`say every group alone for a lock screen without details in ${language}`, () => {
      for (const group of [...NOTIFICATION_GROUPS, "other"]) {
        expect(
          at(words, ["push", "notice", "hidden", group]),
          group,
        ).toBeTruthy();
      }
    });
  }
});
