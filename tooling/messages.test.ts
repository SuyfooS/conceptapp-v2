import { PENSION_FUND_KEYS } from "@domain/pension-funds";
import { PROFILE_LOCALES } from "@domain/profile";
import { describe, expect, it } from "vitest";
import { globalErrorCopy } from "../app/global-error-copy";
import { locales } from "../i18n/config";
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

  it("in Hebrew, end an address outside <ltr> on a letter or a digit", () => {
    // In right-to-left words, what follows a Latin run up to a Hebrew one or
    // the end (":", "/", ",") takes the paragraph's direction and lands on
    // the run's other side: "ב-https://," reads "//:https".
    const addresses = (message: string) =>
      message
        .replace(/<ltr>.*?<\/ltr>/g, "")
        .match(/[a-z][a-z0-9+.-]*:\/\/[^\s֐-׿]*/gi) ?? [];
    for (const [key, message] of heLeaves) {
      for (const address of addresses(message)) {
        expect(address, key).toMatch(/[a-z0-9]$/i);
      }
    }
    expect(addresses("כתובת שמתחילה ב-https://, של מערכת")).toEqual([
      "https://,",
    ]);
  });

  it("are never empty", () => {
    for (const [key, value] of [...heLeaves, ...enLeaves]) {
      expect(value.trim(), key).not.toBe("");
    }
  });

  it("name every pension fund on the list, in both languages", () => {
    for (const key of PENSION_FUND_KEYS) {
      expect(he.pensionFunds[key], key).toBeTruthy();
      expect(en.pensionFunds[key], key).toBeTruthy();
    }
    expect(Object.keys(he.pensionFunds).sort()).toEqual(
      [...PENSION_FUND_KEYS].sort(),
    );
  });

  it("are in the languages a person may choose", () => {
    // The profile's languages (@domain/profile) are the app's, which the
    // domain can't import.
    expect([...PROFILE_LOCALES]).toEqual([...locales]);
  });

  it("give global-error the same words as the error screen", () => {
    const { title, body, retry, home } = he.errors;
    expect(globalErrorCopy).toEqual({ title, body, retry, home });
  });
});
