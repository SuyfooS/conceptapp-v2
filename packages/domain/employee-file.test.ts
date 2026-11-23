import { describe, expect, it } from "vitest";
import {
  addressFromText,
  addressText,
  BANK_INSTRUCTION_VERSION,
  bankParts,
  contactFromText,
  contactText,
  DENIAL_REASONS,
  emergencyContactInput,
  employeeDetailsInput,
  exportReply,
  FILE_DETAIL_FIELDS,
  FILE_DUTIES_VERSION,
  FILE_GROUPS,
  FILE_HOLDER_STATES,
  FILE_TEXT_MAX,
  fileFailureOf,
  fileReply,
  holderStateReply,
  identityParts,
  maskedHint,
  revealReply,
  statusRow,
} from "./employee-file";

const TODAY = "2026-11-26";
const input = employeeDetailsInput(TODAY);
const BUSINESS = "f1000000-0000-4000-b000-000000000001";
const PERSON = "f1000000-0000-4000-a000-000000000001";

/** Whether the input parses, and the first issue's message when it doesn't. */
const tried = (value: unknown) => {
  const result = input.safeParse(value);
  return result.success ? "ok" : (result.error.issues[0]?.message ?? "?");
};

describe("the file's constants", () => {
  it("name the groups, the log's fields and the refusals as the database does", () => {
    expect(FILE_GROUPS).toEqual(["identity", "address", "bank", "pension"]);
    expect(FILE_DETAIL_FIELDS).toEqual([
      "names",
      "birth_date",
      "identity",
      "address",
      "email",
      "work_language",
      "bank",
      "pension",
    ]);
    expect(DENIAL_REASONS).toContain("not_holder");
    expect(FILE_DUTIES_VERSION).toBe("2026-11-v1");
    expect(BANK_INSTRUCTION_VERSION).toBe("v1");
  });
});

describe("employeeDetailsInput", () => {
  it("takes names, tidied, each 1 to 60 characters on one line", () => {
    expect(input.parse({ names: { first: "  נועה ", last: "כהן" } })).toEqual({
      names: { first: "נועה", last: "כהן" },
    });
    expect(tried({ names: { first: "", last: "כהן" } })).not.toBe("ok");
    expect(tried({ names: { first: "נועה\nכהן", last: "כהן" } })).toBe(
      "oneLine",
    );
    expect(tried({ names: { first: "א".repeat(61), last: "כהן" } })).not.toBe(
      "ok",
    );
  });

  it("refuses a group it doesn't know", () => {
    expect(tried({ religion: "x" })).not.toBe("ok");
  });

  it("holds each line to the most a screen says before sending", () => {
    const name = (length: number) =>
      tried({ names: { first: "א".repeat(length), last: "כהן" } });
    expect(name(FILE_TEXT_MAX.name)).toBe("ok");
    expect(name(FILE_TEXT_MAX.name + 1)).not.toBe("ok");
    const email = (length: number) =>
      tried({ email: `${"a".repeat(length - "@b.co".length)}@b.co` });
    expect(email(FILE_TEXT_MAX.email)).toBe("ok");
    expect(email(FILE_TEXT_MAX.email + 1)).not.toBe("ok");
    const holder = (length: number) =>
      tried({
        bank: {
          bank: 12,
          branch: 600,
          account: "100001",
          holder: "family",
          holderName: "א".repeat(length),
          instruction: BANK_INSTRUCTION_VERSION,
        },
      });
    expect(holder(FILE_TEXT_MAX.holderName)).toBe("ok");
    expect(holder(FILE_TEXT_MAX.holderName + 1)).not.toBe("ok");
  });

  it("takes a birth date as three typed numbers, not after today, within 100 years", () => {
    expect(
      input.parse({ birthDate: { day: "4", month: "2", year: "2009" } })
        .birthDate,
    ).toBe("2009-02-04");
    expect(input.parse({ birthDate: null }).birthDate).toBeNull();
    expect(tried({ birthDate: { day: "27", month: "11", year: "2026" } })).toBe(
      "birthDateRange",
    );
    expect(tried({ birthDate: { day: "25", month: "11", year: "1926" } })).toBe(
      "birthDateRange",
    );
    expect(tried({ birthDate: { day: "30", month: "2", year: "2000" } })).toBe(
      "birthDate",
    );
  });

  it("takes an Israeli ID only with its check digit", () => {
    expect(
      input.parse({ identity: { kind: "il", number: "18" } }).identity,
    ).toEqual({ kind: "il", number: "000000018" });
    expect(tried({ identity: { kind: "il", number: "000000019" } })).toBe(
      "israeliId",
    );
  });

  it("takes a passport only with its country, and another document only with its name", () => {
    expect(
      tried({ identity: { kind: "passport", number: "P1234567" } }),
    ).not.toBe("ok");
    expect(
      tried({
        identity: { kind: "passport", number: "P1234567", country: "PH" },
      }),
    ).toBe("ok");
    expect(tried({ identity: { kind: "other", number: "A1234" } })).not.toBe(
      "ok",
    );
    expect(
      tried({
        identity: { kind: "other", number: "A1234", name: "תעודת מבקש מקלט" },
      }),
    ).toBe("ok");
  });

  it("takes an address with a street, an area without one, or a P.O. box", () => {
    expect(
      tried({
        address: {
          kind: "street",
          cityCode: 5000,
          street: "הרצל",
          number: "12",
        },
      }),
    ).toBe("ok");
    expect(
      tried({
        address: { kind: "area", cityCode: 5000, area: "שכונת התקווה" },
      }),
    ).toBe("ok");
    expect(
      tried({ address: { kind: "street", cityCode: 5000, number: "12" } }),
    ).not.toBe("ok");
    expect(
      tried({ address: { kind: "poBox", cityCode: 5000, poBox: "1234" } }),
    ).toBe("ok");
    expect(tried({ address: null })).toBe("ok");
  });

  it("takes an email and a work language, or null for none", () => {
    expect(input.parse({ email: " a@b.co " }).email).toBe("a@b.co");
    expect(tried({ email: "not an email" })).not.toBe("ok");
    expect(tried({ workLanguage: "русский" })).toBe("ok");
    expect(tried({ workLanguage: null })).toBe("ok");
  });

  it("takes a family account only with the holder's name, and this instruction only", () => {
    const bank = {
      bank: 12,
      branch: 600,
      account: "100001",
      holder: "self",
      instruction: BANK_INSTRUCTION_VERSION,
    };
    expect(tried({ bank })).toBe("ok");
    expect(tried({ bank: { ...bank, holder: "family" } })).toBe("holderName");
    expect(
      tried({ bank: { ...bank, holder: "family", holderName: "דוד כהן" } }),
    ).toBe("ok");
    expect(tried({ bank: { ...bank, holderName: "דוד כהן" } })).toBe(
      "holderName",
    );
    expect(tried({ bank: { ...bank, instruction: "v0" } })).not.toBe("ok");
    expect(tried({ bank: null })).toBe("ok");
  });

  it("takes a pension fund only with an answer that has one", () => {
    expect(tried({ pension: { answer: "existing", fund: "unknown" } })).toBe(
      "ok",
    );
    expect(tried({ pension: { answer: "new" } })).toBe("ok");
    expect(tried({ pension: { answer: "employer", fund: "unknown" } })).toBe(
      "fund",
    );
    expect(tried({ pension: { answer: "later", fund: "unknown" } })).toBe(
      "fund",
    );
    expect(tried({ pension: { answer: "existing", fund: "Fund A" } })).not.toBe(
      "ok",
    );
    // A key of the shape the database takes, but not on the dated list.
    expect(tried({ pension: { answer: "new", fund: "fund_a" } })).not.toBe(
      "ok",
    );
    expect(tried({ pension: { answer: "new", fund: "harel" } })).toBe("ok");
  });

  it("dates a change on or before today, within a year", () => {
    expect(tried({ changeOn: TODAY })).toBe("ok");
    expect(tried({ changeOn: "2026-11-27" })).toBe("changeOn");
    expect(tried({ changeOn: "2025-11-25" })).toBe("changeOn");
  });
});

describe("identityParts", () => {
  it("seals the number and another document's name, with the hint in the clear", () => {
    expect(identityParts({ kind: "il", number: "000000018" })).toEqual({
      kind: "il",
      number: "000000018",
      hint: "0018",
      country: null,
      expiresOn: null,
      name: null,
    });
    expect(
      identityParts({
        kind: "passport",
        number: "P1234567",
        country: "PH",
        expiresOn: "2030-01-01",
      }),
    ).toMatchObject({ hint: "4567", country: "PH", expiresOn: "2030-01-01" });
    expect(
      identityParts({ kind: "other", number: "A12", name: "תעודה" }),
    ).toMatchObject({ hint: "0A12", name: "תעודה", country: null });
  });
});

describe("addressText", () => {
  it("seals everything but the city, and reads back with it", () => {
    const address = {
      kind: "street" as const,
      cityCode: 5000,
      street: "הרצל",
      number: "12",
      apartment: "3",
    };
    const text = addressText(address);
    expect(text).not.toContain("5000");
    expect(addressFromText(text, 5000)).toEqual(address);
    expect(addressFromText(text, null)).toBeNull();
    expect(addressFromText("not json", 5000)).toBeNull();
  });

  it("seals one address from one text whatever order it came in", () => {
    expect(addressText({ kind: "poBox", poBox: "12", cityCode: 4000 })).toEqual(
      addressText({ cityCode: 4000, poBox: "12", kind: "poBox" }),
    );
  });
});

describe("bankParts", () => {
  const bank = {
    bank: 12,
    branch: 600,
    account: "100001",
    holder: "self" as const,
    instruction: "v1" as const,
  };

  it("keeps the stored form, its hint, and what the check said", () => {
    expect(bankParts(bank, TODAY)).toEqual({
      code: 12,
      branch: 600,
      account: "100001",
      hint: "0001",
      holder: "self",
      holderName: null,
      instruction: "v1",
      check: "valid",
      warning: null,
    });
  });

  it("lets a failed check through as a warning, for a holder to look at", () => {
    expect(bankParts({ ...bank, account: "100002" }, TODAY)).toMatchObject({
      check: "warning",
      warning: "checkDigit",
    });
  });

  it("refuses only what can't be stored", () => {
    expect(bankParts({ ...bank, account: "abc" }, TODAY)).toBeNull();
  });
});

describe("the emergency contact", () => {
  it("is a name and a mobile number in E.164, sealed as one text", () => {
    const contact = emergencyContactInput.parse({
      name: "דוד כהן",
      phone: "050-123-4567",
    });
    expect(contact).toEqual({ name: "דוד כהן", phone: "+972501234567" });
    expect(contactFromText(contactText(contact))).toEqual(contact);
    expect(
      emergencyContactInput.safeParse({ name: "דוד", phone: "03-1234567" })
        .success,
    ).toBe(false);
    expect(contactFromText("[]")).toBeNull();
  });
});

describe("maskedHint", () => {
  it("shows only the last digits", () => {
    expect(maskedHint("4821")).toBe("•••4821");
  });
});

describe("fileFailureOf", () => {
  it.each([
    ["42501", "off", "off"],
    ["42501", "own", "own"],
    ["42501", "owner", "ownerOnly"],
    ["42501", "ack", "ack"],
    ["42501", null, "noAccess"],
    ["55000", "demo", "demo"],
    ["55000", "not_open", "closed"],
    ["55000", "step_up", "stepUp"],
    ["55000", "phone_hold", "phoneHold"],
    ["55000", "shredded", "shredded"],
    ["55000", null, "failed"],
    ["22023", "not_staff", "notStaff"],
    ["22023", null, "invalid"],
    ["40001", null, "moved"],
    ["P0002", null, "notInTeam"],
    ["23514", null, "invalid"],
    ["XX000", null, "failed"],
    [undefined, null, "failed"],
  ] as const)("reads %s with hint %s as %s", (code, hint, failure) => {
    expect(fileFailureOf(code, hint)).toBe(failure);
  });
});

describe("the database's replies", () => {
  const plain = {
    legal_first_name: "נועה",
    legal_last_name: "כהן",
    birth_date: "1994-03-01",
    id_kind: "il",
    id_country: null,
    id_expires_on: null,
    id_hint: "0018",
    city_code: 5000,
    bank_code: 12,
    bank_branch: 600,
    bank_account_hint: "0001",
    bank_holder_kind: "self",
    bank_instruction_at: "2026-11-20T10:00:00+00:00",
    bank_instruction_version: "v1",
    bank_changed_at: "2026-11-20T10:00:00+00:00",
    bank_review: null,
    pension_answer: "existing",
    pension_fund: "unknown",
    pension_answered_at: "2026-11-20T10:00:00+00:00",
    direct_groups: [],
    submitted_at: null,
    updated_at: "2026-11-20T10:00:00+00:00",
    has: {
      id: true,
      address: true,
      email: false,
      work_language: false,
      bank_account: true,
    },
  };
  const sealed = {
    address: "AQIDBA==",
    email: null,
    work_language: null,
    id_name: null,
    bank_holder: null,
    emergency: null,
  };

  it("read a file, or why not", () => {
    expect(
      fileReply.safeParse({
        access: "holder",
        demo: false,
        file: plain,
        sealed,
        key: { kek_id: 1, wrapped_dek: "AQID" },
        missing: ["pension"],
        youth_until: null,
        pension_due_on: "2027-01-10",
        tax_years: [
          {
            year: 2026,
            status: "handed_in",
            route: "print",
            returned_reason: null,
            change_due_by: null,
          },
        ],
      }).success,
    ).toBe(true);
    expect(fileReply.parse({ access: "denied", reason: "not_holder" })).toEqual(
      { access: "denied", reason: "not_holder" },
    );
  });

  it("read a holder refused for no live SMS code on this sign-in (20261127000400)", () => {
    const refused = { access: "denied", reason: "step_up" };
    for (const reply of [fileReply, revealReply, exportReply]) {
      expect(reply.parse(refused)).toEqual(refused);
    }
  });

  it("fail closed on what they don't expect", () => {
    expect(
      fileReply.safeParse({ access: "denied", reason: "because" }).success,
    ).toBe(false);
    expect(
      fileReply.safeParse({
        access: "holder",
        demo: false,
        file: plain,
        sealed: { ...sealed, address: "not base64!" },
        key: null,
        missing: [],
        youth_until: null,
        pension_due_on: null,
        tax_years: [],
      }).success,
    ).toBe(false);
    expect(fileReply.safeParse(null).success).toBe(false);
  });

  it("read a reveal, an export and a status row", () => {
    expect(
      revealReply.safeParse({
        access: "holder",
        demo: false,
        sealed: { id: "AQID", bank_account: null },
        key: { kek_id: 1, wrapped_dek: "AQID" },
      }).success,
    ).toBe(true);
    expect(
      exportReply.safeParse({
        access: "holder",
        demo: true,
        entries: [
          {
            user_id: PERSON,
            file: plain,
            sealed: {
              id: "AQID",
              id_name: null,
              address: null,
              email: null,
              work_language: null,
              bank_account: null,
              bank_holder: null,
            },
            key: null,
            missing: [],
            bank_held: true,
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      statusRow.safeParse({
        user_id: PERSON,
        complete: false,
        missing: 2,
        form101_in: true,
        detail: null,
      }).success,
    ).toBe(true);
    expect(
      statusRow.safeParse({
        user_id: BUSINESS,
        complete: true,
        missing: -1,
        form101_in: true,
        detail: null,
      }).success,
    ).toBe(false);
  });
});

describe("a holder's state", () => {
  // public.file_holder_state (20261126000500_file_holder_state.sql, H6a).
  it("takes the six states the database answers, and nobody signed in", () => {
    expect(FILE_HOLDER_STATES).toEqual([
      "ready",
      "ack",
      "viewing",
      "not_member",
      "not_holder",
      "off",
    ]);
    for (const state of FILE_HOLDER_STATES) {
      expect(holderStateReply.parse(state)).toBe(state);
    }
    expect(holderStateReply.parse(null)).toBeNull();
  });

  it("refuses anything else", () => {
    for (const reply of [
      "holder",
      "limit",
      "",
      1,
      undefined,
      { state: "ready" },
    ]) {
      expect(holderStateReply.safeParse(reply).success, String(reply)).toBe(
        false,
      );
    }
  });
});
