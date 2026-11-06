import { describe, expect, it } from "vitest";
import { globalErrorCopy } from "../app/global-error-copy";
import en from "../messages/en.json";
import he from "../messages/he.json";

type Tree = { [key: string]: string | Tree };

/** Every leaf as [dotted key, value]. */
function leaves(tree: Tree, prefix = ""): [string, string][] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === "string"
      ? [[`${prefix}${key}`, value] as [string, string]]
      : leaves(value, `${prefix}${key}.`),
  );
}

/** ICU arguments and rich-text tags a message uses, e.g. {count} or <ltr>. */
function placeholders(message: string): string[] {
  const args = [...message.matchAll(/\{\s*(\w+)\s*[,}]/g)].map(
    (m) => `{${m[1]}}`,
  );
  const tags = [...message.matchAll(/<(\w+)>/g)].map((m) => `<${m[1]}>`);
  return [...new Set([...args, ...tags])].sort();
}

const heLeaves = new Map(leaves(he));
const enLeaves = new Map(leaves(en));

describe("messages", () => {
  it("have the same keys in Hebrew and English", () => {
    expect([...enLeaves.keys()].sort()).toEqual([...heLeaves.keys()].sort());
  });

  it("use the same placeholders in both languages", () => {
    for (const [key, heMessage] of heLeaves) {
      expect(placeholders(enLeaves.get(key) ?? ""), key).toEqual(
        placeholders(heMessage),
      );
    }
  });

  it("are never empty", () => {
    for (const [key, value] of [...heLeaves, ...enLeaves]) {
      expect(value.trim(), key).not.toBe("");
    }
  });

  it("give global-error the same words as the error screen", () => {
    const { title, body, retry, home } = he.errors;
    expect(globalErrorCopy).toEqual({ title, body, retry, home });
  });
});
