import { describe, expect, it } from "vitest";
import {
  BANK_CHANGE_SEEN_MOST,
  bankChangeSeen,
  bankChangeToTell,
  DEDUCTIONS_FILE,
  type EmployeeFileSettings,
  fileAsksOf,
  fileGroupsAsked,
  form101SetupOf,
  isForm101Link,
  linkDomain,
  noticeNamesOf,
  settingLine,
  tidyDeductionsFile,
  tidyForm101Link,
  withBankChangeSeen,
} from "./employee-file-settings";

const DEFAULTS: EmployeeFileSettings = {
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

/**
 * Links as typed, and whether each is one once tidied: the same list the
 * database's check is held to (modules/employee_files/settings.db.test.ts).
 */
const LINKS: [string, boolean][] = [
  ["", true],
  ["https://101.example/a?b=1#c", true],
  ["HTTPS://Malam.co.il/101", true],
  ["http://x.co", false],
  ["https://", false],
  ["https://x", false],
  ["https://x.co/ש", false],
  ["https://user@x.co", false],
  ["javascript:alert(1)", false],
  ["https://x.co/a b", false],
  [`https://x.co/${"a".repeat(288)}`, false],
  [`https://x.co/${"a".repeat(287)}`, true],
];

describe("the groups the file counts", () => {
  it("are the identity and the pension always, the address and the bank while asked", () => {
    expect(fileGroupsAsked({ address: true, bank: true })).toEqual([
      "identity",
      "address",
      "bank",
      "pension",
    ]);
    expect(fileGroupsAsked({ address: true, bank: false })).toEqual([
      "identity",
      "address",
      "pension",
    ]);
    expect(fileGroupsAsked({ address: false, bank: true })).toEqual([
      "identity",
      "bank",
      "pension",
    ]);
    expect(fileGroupsAsked({ address: false, bank: false })).toEqual([
      "identity",
      "pension",
    ]);
  });

  it("read the asks from the settings", () => {
    expect(
      fileAsksOf({ ...DEFAULTS, askBank: false, askWorkLanguage: true }),
    ).toEqual({
      address: true,
      bank: false,
      emergencyContact: false,
      workLanguage: true,
    });
  });
});

describe("Form 101's way", () => {
  it("is the paper card, a link once one is set, or not in the app", () => {
    expect(form101SetupOf(DEFAULTS)).toEqual({ way: "print" });
    expect(form101SetupOf({ ...DEFAULTS, form101: "off" })).toEqual({
      way: "off",
    });
    // A link chosen with none yet: the paper card meanwhile.
    expect(form101SetupOf({ ...DEFAULTS, form101: "link" })).toEqual({
      way: "print",
    });
    expect(
      form101SetupOf({
        ...DEFAULTS,
        form101: "link",
        form101Link: "https://101.example/noa",
        form101Provider: "משרד השכר",
      }),
    ).toEqual({
      way: "link",
      link: "https://101.example/noa",
      domain: "101.example",
      provider: "משרד השכר",
    });
  });

  it("names the site when no provider is set", () => {
    expect(
      form101SetupOf({
        ...DEFAULTS,
        form101: "link",
        form101Link: "https://forms.101.example/x",
      }),
    ).toMatchObject({ provider: "forms.101.example" });
  });
});

describe("the 101's link", () => {
  it.each(LINKS)("checks %s", (typed, ok) => {
    expect(isForm101Link(tidyForm101Link(typed))).toBe(ok);
  });

  it("keeps the scheme and the host in lower case, the rest as typed", () => {
    expect(tidyForm101Link(" HTTPS://Malam.co.il/A?B=1 ")).toBe(
      "https://malam.co.il/A?B=1",
    );
    expect(tidyForm101Link("http://X.co")).toBe("http://X.co");
  });

  it("says the site it opens", () => {
    expect(linkDomain("https://101.example/a?b=1#c")).toBe("101.example");
    expect(linkDomain("https://malam.co.il")).toBe("malam.co.il");
    expect(linkDomain("nope")).toBe("");
  });
});

describe("the deductions file", () => {
  it.each([
    ["912345678", true],
    ["9-1234-5678", true],
    [" 912 345 678 ", true],
    ["812345678", false],
    ["91234567", false],
    ["9123456789", false],
  ])("checks %s", (typed, ok) => {
    expect(DEDUCTIONS_FILE.test(tidyDeductionsFile(typed))).toBe(ok);
  });
});

describe("a setting's line", () => {
  it("is trimmed, short enough and one line", () => {
    const line = settingLine(60);
    expect(line.parse("  משרד השכר  ")).toBe("משרד השכר");
    expect(line.safeParse("א".repeat(60)).success).toBe(true);
    expect(line.safeParse("א".repeat(61)).success).toBe(false);
    expect(line.safeParse("שורה\nשנייה").success).toBe(false);
    expect(line.safeParse("a\tb").success).toBe(false);
  });
});

describe("the notice's names", () => {
  it("are each the setting, or null while empty", () => {
    expect(noticeNamesOf(DEFAULTS)).toEqual({
      payrollProvider: null,
      employer: null,
      phone: null,
    });
    expect(
      noticeNamesOf({
        ...DEFAULTS,
        payrollProvider: "משרד רואי החשבון",
        employerName: "מסעדת הדגמה בע״מ",
        employerPhone: "+97231234567",
      }),
    ).toEqual({
      payrollProvider: "משרד רואי החשבון",
      employer: "מסעדת הדגמה בע״מ",
      phone: "+97231234567",
    });
  });
});

describe("a bank change on Today", () => {
  const now = new Date("2026-11-22T10:00:00.000Z");
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
  const HOUR = 60 * 60 * 1000;

  it("is told for 14 days, by its day in the business's zone", () => {
    expect(
      bankChangeToTell(ago((13 * 24 + 23) * HOUR), now, "Asia/Jerusalem"),
    ).toBe("2026-11-08");
    expect(
      bankChangeToTell("2026-11-21T22:30:00.000Z", now, "Asia/Jerusalem"),
    ).toBe("2026-11-22");
  });

  it("is not told after 14 days, from the future, or without one", () => {
    expect(
      bankChangeToTell(ago(14 * 24 * HOUR), now, "Asia/Jerusalem"),
    ).toBeNull();
    expect(
      bankChangeToTell("2026-11-22T10:00:01.000Z", now, "Asia/Jerusalem"),
    ).toBeNull();
    expect(bankChangeToTell(null, now, "Asia/Jerusalem")).toBeNull();
    expect(bankChangeToTell("garbage", now, "Asia/Jerusalem")).toBeNull();
  });
});

describe("the bank changes seen on this device", () => {
  const SHOP = "10000000-0000-4000-b000-000000000001";
  const CAFE = "10000000-0000-4000-b000-000000000002";
  const AT = "2026-11-20T10:00:00.123456+00:00";
  const LATER = "2026-11-21T08:00:00+00:00";

  it("remembers a change by the moment the database gave it", () => {
    const cookie = withBankChangeSeen(null, SHOP, AT);
    expect(bankChangeSeen(cookie, SHOP, AT)).toBe(true);
    expect(bankChangeSeen(cookie, CAFE, AT)).toBe(false);
    // A newer change is told again.
    expect(bankChangeSeen(cookie, SHOP, LATER)).toBe(false);
  });

  it("reads garbage as nothing", () => {
    for (const cookie of ["", "x", `${SHOP}.abc`, `${SHOP}`, "a.1,,b"]) {
      expect(bankChangeSeen(cookie, SHOP, AT), cookie).toBe(false);
    }
    expect(withBankChangeSeen("junk,x.y", SHOP, AT)).toBe(
      `${SHOP}.${Date.parse(AT)}`,
    );
  });

  it("keeps the newest change of a business in place of the older one", () => {
    const cookie = withBankChangeSeen(
      withBankChangeSeen(withBankChangeSeen(null, SHOP, AT), CAFE, AT),
      SHOP,
      LATER,
    );
    expect(cookie).toBe(
      `${CAFE}.${Date.parse(AT)},${SHOP}.${Date.parse(LATER)}`,
    );
    expect(bankChangeSeen(cookie, SHOP, LATER)).toBe(true);
  });

  it("drops the oldest business after the twentieth", () => {
    const ids = Array.from(
      { length: BANK_CHANGE_SEEN_MOST + 1 },
      (_, n) => `10000000-0000-4000-b000-${String(n).padStart(12, "0")}`,
    );
    const cookie = ids.reduce<string | null>(
      (kept, id) => withBankChangeSeen(kept, id, AT),
      null,
    );
    expect(cookie?.split(",")).toHaveLength(BANK_CHANGE_SEEN_MOST);
    expect(bankChangeSeen(cookie, ids[0] ?? "", AT)).toBe(false);
    expect(bankChangeSeen(cookie, ids[1] ?? "", AT)).toBe(true);
  });
});
