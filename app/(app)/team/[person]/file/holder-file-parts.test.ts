import type { EmployeeFile } from "@db/employee-files";
import type { FileRow } from "@domain/employee-file";
import type { EmployeeFileSettings } from "@domain/employee-file-settings";
import { describe, expect, it } from "vitest";
import { holderFileOf } from "./holder-file-parts";

/*
 * A file read by a holder, as their screen shows it (profile H6a): only
 * what the screen shows, the numbers by their last digits, the parts the
 * business asks or the file holds, what is missing and what was handed
 * straight to payroll, this year's 101 while the business takes it in the
 * app.
 */

const SETTINGS: EmployeeFileSettings = {
  askBank: true,
  askAddress: true,
  askEmergencyContact: false,
  askWorkLanguage: false,
  form101: "print",
  form101Provider: "",
  form101Link: "",
  payrollProvider: "",
  employerName: "",
  employerPhone: "",
  deductionsFile: "",
};

const ROW: FileRow = {
  legal_first_name: "Noa",
  legal_last_name: "Cohen",
  birth_date: "1995-01-01",
  id_kind: "il",
  id_country: null,
  id_expires_on: null,
  id_hint: "0018",
  city_code: 5000,
  bank_code: 12,
  bank_branch: 600,
  bank_account_hint: "0001",
  bank_holder_kind: "self",
  bank_instruction_at: "2026-09-20T09:00:00Z",
  bank_instruction_version: "v1",
  bank_changed_at: "2026-09-20T09:00:00Z",
  bank_review: null,
  pension_answer: "later",
  pension_fund: null,
  pension_answered_at: "2026-09-20T09:00:00Z",
  direct_groups: [],
  submitted_at: null,
  updated_at: "2026-09-20T09:00:00Z",
  has: {
    id: true,
    address: true,
    email: true,
    work_language: false,
    bank_account: true,
  },
};

const read = (over: Partial<EmployeeFile> = {}): EmployeeFile => ({
  ok: true,
  access: "holder",
  demo: true,
  file: ROW,
  address: { kind: "street", cityCode: 5000, street: "Herzl", number: "12" },
  email: "noa@demo.conceptapp.invalid",
  workLanguage: null,
  documentName: null,
  holderName: null,
  emergency: null,
  masked: { id: "•••0018", bankAccount: "•••0001" },
  missing: ["pension"],
  youthUntil: null,
  pensionDueOn: "2026-12-01",
  taxYears: [
    {
      year: 2026,
      status: "returned",
      route: "print",
      returnedReason: "signature",
      changeDueBy: null,
    },
    {
      year: 2025,
      status: "accepted",
      route: "print",
      returnedReason: null,
      changeDueBy: null,
    },
  ],
  ...over,
});

describe("a holder's file", () => {
  it("shows the numbers by their last digits, and nothing the screen doesn't", () => {
    const data = holderFileOf(read(), SETTINGS, "2026-11-22");
    expect(data.identity.masked).toBe("•••0018");
    expect(data.bank?.masked).toBe("•••0001");
    const shown = JSON.stringify(data);
    expect(shown).not.toMatch(/"has"|updated_at|answered_at|version/);
    expect(data.identity.legalName).toBe("Noa Cohen");
  });

  it("says what is missing, what was handed straight to payroll, and the pension's day", () => {
    const data = holderFileOf(
      read({ file: { ...ROW, direct_groups: ["address"] } }),
      SETTINGS,
      "2026-11-22",
    );
    expect(data.missing).toEqual(["pension"]);
    expect(data.direct).toEqual(["address"]);
    expect(data.pension).toEqual({
      answer: "later",
      fund: null,
      dueOn: "2026-12-01",
    });
  });

  it("takes this year's 101 alone, and none while it is outside the app", () => {
    expect(holderFileOf(read(), SETTINGS, "2026-11-22").taxYear).toEqual({
      status: "returned",
      route: "print",
      returnedReason: "signature",
      changeDueBy: null,
    });
    const off = holderFileOf(
      read(),
      { ...SETTINGS, form101: "off" },
      "2026-11-22",
    );
    expect(off.form101).toBeNull();
    expect(off.taxYear).toBeNull();
    expect(
      holderFileOf(
        read(),
        { ...SETTINGS, form101: "link", form101Link: "https://101.example" },
        "2026-11-22",
      ).form101,
    ).toEqual({ provider: null });
  });

  it("leaves out the contact and the account while neither is asked nor held", () => {
    const lean = { ...SETTINGS, askAddress: false, askBank: false };
    const empty = read({
      file: {
        ...ROW,
        bank_code: null,
        bank_branch: null,
        bank_account_hint: null,
      },
      address: null,
      email: null,
      masked: { id: "•••0018", bankAccount: null },
    });
    const data = holderFileOf(empty, lean, "2026-11-22");
    expect(data.asked).toEqual(["identity", "pension"]);
    expect(data.contact).toBeNull();
    expect(data.bank).toBeNull();
    // Held, they still show, though no longer asked.
    expect(holderFileOf(read(), lean, "2026-11-22").bank?.code).toBe(12);
  });
});
