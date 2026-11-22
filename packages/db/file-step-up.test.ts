import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/*
 * A holder's step-up cookie (profile H6a): only a value this server signed,
 * for this business and this holder, says a moment; anything else a browser
 * sends, changed, cut, added to or signed with another key, says nothing,
 * and never throws.
 */

const { fileStepUpAt, fileStepUpKeyFrom, sealFileStepUp } = await import(
  "./file-step-up"
);
const { punchKeyFrom } = await import("./punch-key");

const BUSINESS = "f6000000-0000-4000-b000-000000000001";
const OTHER_BUSINESS = "f6000000-0000-4000-b000-000000000002";
const HOLDER = "f6000000-0000-4000-a000-000000000001";
const OTHER_HOLDER = "f6000000-0000-4000-a000-000000000002";
const AT = Date.UTC(2026, 10, 22, 9, 0, 0);

const key = fileStepUpKeyFrom("sb_secret_file_step_up_one");
const whose = { business: BUSINESS, holder: HOLDER };
const sealed = sealFileStepUp({ ...whose, atMs: AT }, key);

describe("the step-up cookie", () => {
  it("says its moment back for its own business and holder", () => {
    expect(sealed.split(".")).toHaveLength(5);
    expect(sealed.startsWith(`v1.${BUSINESS}.${HOLDER}.${AT}.`)).toBe(true);
    expect(fileStepUpAt(sealed, whose, key)).toBe(AT);
  });

  it("holds ids and a moment, never anything else", () => {
    const [, business, holder, moment] = sealed.split(".");
    expect([business, holder, moment]).toEqual([BUSINESS, HOLDER, String(AT)]);
  });

  it("says nothing for another key", () => {
    const other = fileStepUpKeyFrom("sb_secret_file_step_up_two");
    expect(fileStepUpAt(sealed, whose, other)).toBeNull();
  });

  it("says nothing for a value changed anywhere", () => {
    const [version, business, holder, moment, mac] = sealed.split(".") as [
      string,
      string,
      string,
      string,
      string,
    ];
    const changed = [
      [version, OTHER_BUSINESS, holder, moment, mac],
      [version, business, OTHER_HOLDER, moment, mac],
      [version, business, holder, String(AT + 60_000), mac],
      [
        version,
        business,
        holder,
        moment,
        `${mac.slice(0, -1)}${mac.endsWith("A") ? "B" : "A"}`,
      ],
      ["v2", business, holder, moment, mac],
    ].map((parts) => parts.join("."));
    for (const value of changed) {
      expect(fileStepUpAt(value, whose, key), value).toBeNull();
    }
  });

  it("says nothing for a value cut, added to, or not one at all", () => {
    for (const value of [
      undefined,
      "",
      sealed.slice(0, -2),
      `${sealed}.x`,
      sealed.split(".").slice(0, 4).join("."),
      `v1.not-a-uuid.${HOLDER}.${AT}.${sealed.split(".")[4]}`,
      `v1.${BUSINESS}.${HOLDER}.NaN.${sealed.split(".")[4]}`,
      `v1.${BUSINESS}.${HOLDER}.-5.${sealed.split(".")[4]}`,
      "x".repeat(400),
    ]) {
      expect(fileStepUpAt(value, whose, key), String(value)).toBeNull();
    }
  });

  it("says nothing for another business's or another holder's step-up", () => {
    const theirs = sealFileStepUp(
      { business: OTHER_BUSINESS, holder: OTHER_HOLDER, atMs: AT },
      key,
    );
    expect(fileStepUpAt(theirs, whose, key)).toBeNull();
    expect(
      fileStepUpAt(theirs, { business: BUSINESS, holder: OTHER_HOLDER }, key),
    ).toBeNull();
    expect(
      fileStepUpAt(theirs, { business: OTHER_BUSINESS, holder: HOLDER }, key),
    ).toBeNull();
  });

  it("keys the same for one secret, another for another, and never the clock's", () => {
    expect(fileStepUpKeyFrom("sb_secret_one")).toEqual(
      fileStepUpKeyFrom("sb_secret_one"),
    );
    expect(fileStepUpKeyFrom("sb_secret_one")).not.toEqual(
      fileStepUpKeyFrom("sb_secret_two"),
    );
    expect(fileStepUpKeyFrom("sb_secret_one")).toHaveLength(32);
    expect(fileStepUpKeyFrom("sb_secret_one")).not.toEqual(
      punchKeyFrom("sb_secret_one"),
    );
  });
});
