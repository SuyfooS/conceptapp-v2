import { describe, expect, it } from "vitest";
import { pastFileDemo } from "../../../design/shell/me/file/data";
import {
  contactTitleKey,
  fileHolds,
  pastBackHref,
  pastPartsOf,
} from "./past-file-parts";

// What a former worker's old file holds and which of its parts show
// (profile H5c), on Noa's twin and pieces of it.

const noa = pastFileDemo("he");
const row = noa.file;
if (!row) throw new Error("The twin's file has a row");

const nothing = {
  file: null,
  address: null,
  email: null,
  workLanguage: null,
  emergency: null,
  taxYears: [],
};

describe("a former worker's old file", () => {
  it("holds something with its row, a Form 101 year or an emergency contact", () => {
    expect(fileHolds(nothing)).toBe(false);
    expect(fileHolds({ ...nothing, file: row })).toBe(true);
    expect(
      fileHolds({
        ...nothing,
        taxYears: [
          {
            year: 2026,
            status: "handed_in",
            route: "print",
            returnedReason: null,
            changeDueBy: null,
          },
        ],
      }),
    ).toBe(true);
    expect(
      fileHolds({
        ...nothing,
        emergency: { name: "דוד כהן", phone: "+972500000099" },
      }),
    ).toBe(true);
  });

  it("always shows who they are and the pension, and the rest where it holds them", () => {
    expect(pastPartsOf(noa)).toEqual({
      identity: true,
      contact: true,
      bank: true,
      pension: true,
      form101: true,
    });
    expect(pastPartsOf(nothing)).toEqual({
      identity: true,
      contact: false,
      bank: false,
      pension: true,
      form101: false,
    });
  });

  it("shows the ways to reach them with any one of them", () => {
    expect(pastPartsOf({ ...nothing, email: "a@b.invalid" }).contact).toBe(
      true,
    );
    expect(pastPartsOf({ ...nothing, workLanguage: "ערבית" }).contact).toBe(
      true,
    );
    expect(
      pastPartsOf({
        ...nothing,
        emergency: { name: "דוד כהן", phone: "+972500000099" },
      }).contact,
    ).toBe(true);
    expect(
      pastPartsOf({
        ...nothing,
        address: noa.address,
      }).contact,
    ).toBe(true);
  });

  it("shows a part a holder handed on directly, with nothing in it", () => {
    const direct = {
      ...nothing,
      file: {
        ...row,
        bank_code: null,
        bank_branch: null,
        bank_account_hint: null,
        bank_holder_kind: null,
        city_code: null,
        direct_groups: ["bank", "address"] as ("bank" | "address")[],
      },
    };
    expect(pastPartsOf(direct)).toMatchObject({ bank: true, contact: true });
    expect(contactTitleKey(direct)).toBe("steps.name.address");
  });

  it("has no account part without an account", () => {
    expect(
      pastPartsOf({
        ...noa,
        file: {
          ...row,
          bank_code: null,
          bank_branch: null,
          bank_account_hint: null,
          bank_holder_kind: null,
        },
      }).bank,
    ).toBe(false);
  });

  it("names the contact part by whether it holds an address", () => {
    expect(contactTitleKey(noa)).toBe("steps.name.address");
    expect(contactTitleKey({ ...noa, address: null })).toBe(
      "steps.name.contact",
    );
  });

  it("goes back to the profile, or to Home's screen with no business", () => {
    expect(pastBackHref("profile")).toBe("/me");
    expect(pastBackHref("list")).toBe("/home");
  });
});
