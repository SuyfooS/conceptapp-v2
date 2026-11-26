import type { Role } from "@domain/modules";
import {
  type IgnoredColumn,
  importRolesOf,
  listRoleOf,
  parsePeopleList,
} from "@domain/people-import";
import { inviteChoices } from "@domain/team";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import he from "@/messages/he.json";
import { type ImportT, ignoredWords } from "./ignored-words";

// The line under the paste names the columns it leaves out: a header's by
// its words, and one with no header by its place, "עמודה 3", never "העמודה
// עמודה 3" ("The column column 3").

const heT = createTranslator({
  locale: "he",
  messages: he,
  namespace: "app.team.import",
}) as unknown as ImportT;
const enT = createTranslator({
  locale: "en",
  messages: en,
  namespace: "app.team.import",
}) as unknown as ImportT;

const LRI = String.fromCodePoint(0x2066);
const PDI = String.fromCodePoint(0x2069);
const held = (text: string) => `${LRI}${text}${PDI}`;

const LABELS: Record<Role, string> = {
  owner: "בעלים",
  manager: "ניהול",
  worker: "צוות",
  accountant: "הנהלת חשבונות",
};
const roles = importRolesOf({
  choices: inviteChoices({ role: "owner", perms: [] }, [], []),
  named: [],
  labels: LABELS,
});

function ignoredOf(text: string): IgnoredColumn[] {
  const fallback = listRoleOf(roles);
  if (!fallback) throw new Error("No role to give");
  return parsePeopleList(text, roles, fallback).ignored;
}

describe("ignoredWords", () => {
  it("names a column with no header by its place, once", () => {
    const ignored = ignoredOf("דנה כהן\t050-1234567\tמטבח");
    expect(ignored).toEqual([{ column: 3 }]);
    expect(ignoredWords(ignored, heT, "he")).toEqual([
      `עמודה ${held("3")} לא נקלטת.`,
    ]);
    expect(ignoredWords(ignored, enT, "en")).toEqual([
      `Column ${held("3")} is not read.`,
    ]);
  });

  it("names several by their places, in one sentence", () => {
    const ignored: IgnoredColumn[] = [{ column: 1 }, { column: 4 }];
    expect(ignoredWords(ignored, enT, "en")).toEqual([
      `Columns ${held("1")} and ${held("4")} are not read.`,
    ]);
    expect(ignoredWords(ignored, heT, "he")).toEqual([
      `עמודות ${new Intl.ListFormat("he", { type: "conjunction" }).format([
        held("1"),
        held("4"),
      ])} לא נקלטות.`,
    ]);
  });

  it("names a header's columns by its words, and the rest by their places", () => {
    const headed = ignoredOf(
      [
        ["שם", "נייד", "ת.ז.", "שכר לשעה"].join("\t"),
        ["דנה כהן", "050-1234567", "000000018", "48"].join("\t"),
      ].join("\n"),
    );
    expect(headed).toEqual([{ header: "ת.ז." }, { header: "שכר לשעה" }]);
    expect(ignoredWords(headed, heT, "he")).toEqual([
      "העמודות ת.ז. ושכר לשעה לא נקלטות.",
    ]);
    expect(
      ignoredWords([{ header: "ת.ז." }, { column: 4 }], heT, "he"),
    ).toEqual(["העמודה ת.ז. לא נקלטת.", `עמודה ${held("4")} לא נקלטת.`]);
    expect(ignoredWords([], heT, "he")).toEqual([]);
  });
});
