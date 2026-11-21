import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  checkSentence,
  isEditableKey,
  type MessageTree,
} from "@domain/wording";
import { describe, expect, it } from "vitest";
import { restaurantWording } from "../app/design/order-taking/data";
import he from "../messages/he.json";
import { MIGRATIONS, withoutComments } from "./role-checks";

/**
 * A template's own sentences come from migrations while no screen edits them
 * (the first: 20261120000100_order_taking_screens.sql, the restaurant's and
 * the café's words for taking orders). Each is read here as the app reads
 * it (`shownWording` in @domain/wording, which drops a sentence that no
 * longer fits): a key a business may replace, the app's sentence it was
 * written against exactly he.json's now (so a change to the app's sentence
 * comes with the template's), its parts kept, and no exclamation mark. The
 * menu twin reads the restaurant's the same.
 */

type Row = { template: string; key: string; sentence: string; base: string };

/** A SQL string literal's text, its doubled apostrophes one again. */
const text = (literal: string) => literal.slice(1, -1).replaceAll("''", "'");
const LITERAL = "'(?:[^']|'')*'";

/**
 * Every row each migration writes to `public.template_wording`, in the form
 * the first one does: the templates as `(values ('…'), …) as t`, crossed
 * with `(key, sentence, base_sentence)` tuples. The newest row of a
 * template and key wins.
 */
function templateRows(): Row[] {
  const found = new Map<string, Row>();
  const files = readdirSync(MIGRATIONS)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const sql = withoutComments(readFileSync(join(MIGRATIONS, file), "utf8"));
    for (const insert of sql.matchAll(
      /insert\s+into\s+public\.template_wording\b[\s\S]*?;/gi,
    )) {
      const statement = insert[0];
      const templates = /from\s*\(values\s*((?:\('[^']+'\)\s*,?\s*)+)\)/i.exec(
        statement,
      );
      // The team's own writes (public.set_template_wording) insert from
      // their arguments, not from literals: only a migration's rows count.
      if (!templates) continue;
      const keys = [...(templates?.[1] ?? "").matchAll(/'([^']+)'/g)].map(
        ([, key = ""]) => key,
      );
      const tuples = [
        ...statement.matchAll(
          new RegExp(
            `\\(\\s*(${LITERAL})\\s*,\\s*(${LITERAL})\\s*,\\s*(${LITERAL})\\s*\\)`,
            "g",
          ),
        ),
      ];
      expect(tuples.length, `${file}: its rows`).toBeGreaterThan(0);
      for (const [, key = "", sentence = "", base = ""] of tuples) {
        for (const template of keys) {
          const row = {
            template,
            key: text(key),
            sentence: text(sentence),
            base: text(base),
          };
          found.set(`${template} ${row.key}`, row);
        }
      }
    }
  }
  return [...found.values()];
}

const rows = templateRows();
const tree = he as MessageTree;

describe("a template's own sentences", () => {
  it("are there for the restaurant and the café", () => {
    expect(rows.length).toBeGreaterThan(0);
    const of = (template: string) =>
      rows
        .filter((row) => row.template === template)
        .map((row) => row.key)
        .sort();
    expect(of("restaurant").length).toBeGreaterThan(0);
    expect(of("cafe-bar")).toEqual(of("restaurant"));
    expect(
      rows.filter((row) => !["restaurant", "cafe-bar"].includes(row.template)),
    ).toEqual([]);
  });

  it("each replace a sentence of the app a business may replace, written against it as it is now", () => {
    for (const row of rows) {
      expect(isEditableKey(row.key), row.key).toBe(true);
      const checked = checkSentence(tree, row.key, row.sentence);
      expect(checked, row.key).toMatchObject({ ok: true });
      if (checked.ok) {
        expect(row.base, row.key).toBe(checked.base);
        expect(checked.sentence, row.key).toBe(row.sentence);
      }
      expect(row.sentence, row.key).not.toBe(row.base);
      expect(row.sentence, row.key).not.toContain("!");
    }
  });

  it("name the module מצב מלצרות in the restaurant and the café", () => {
    for (const template of ["restaurant", "cafe-bar"]) {
      expect(
        rows.find(
          (row) =>
            row.template === template &&
            row.key === "modules.order_taking.name",
        )?.sentence,
      ).toBe("מצב מלצרות");
    }
  });

  it("are the menu twin's restaurant's words", () => {
    expect(restaurantWording).toEqual(
      Object.fromEntries(
        rows
          .filter((row) => row.template === "restaurant")
          .map((row) => [row.key, row.sentence]),
      ),
    );
  });
});
