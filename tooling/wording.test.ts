import {
  editableKeys,
  messageLeaves,
  placeholdersOf,
  sentenceFits,
} from "@domain/wording";
import { describe, expect, it } from "vitest";
import en from "../messages/en.json";
import he from "../messages/he.json";

// The wording rules (@domain/wording) against the real messages, so a new
// message that the replacement check would misread fails here first.
describe("wording against messages/he.json", () => {
  const keys = editableKeys(he);
  const heLeaves = new Map(messageLeaves(he));
  const enLeaves = new Map(messageLeaves(en));

  it("offers the business's copy for replacing", () => {
    expect(keys.length).toBeGreaterThan(600);
    expect(keys.every((key) => /^(app|modules)\./.test(key))).toBe(true);
  });

  it("accepts every sentence of the app as a replacement for itself", () => {
    for (const key of keys) {
      const sentence = heLeaves.get(key) ?? "";
      expect(sentenceFits(sentence, sentence), key).toBe(true);
    }
  });

  it("finds the same arguments, kinds and tags in the English twin", () => {
    for (const key of keys) {
      expect(placeholdersOf(enLeaves.get(key) ?? ""), key).toEqual(
        placeholdersOf(heLeaves.get(key) ?? ""),
      );
    }
  });
});
