import { describe, expect, it } from "vitest";
import {
  firstStepWithError,
  NEW_BUSINESS_FIELDS,
  NEW_BUSINESS_STEPS,
  normalizeSlug,
  parseNewBusiness,
  parseStaffList,
  roleWordsOf,
  type StaffList,
  staffRolesOf,
} from "./business";
import { ACCENT_PRESETS, accentTokens } from "./color";
import type { Role } from "./modules";
import { PEOPLE_IMPORT_CHARS, PEOPLE_IMPORT_MAX } from "./people-import";
import { STAFF_LIST_MAX } from "./staff-list";

const RLM = String.fromCodePoint(0x200f);
const ZERO_WIDTH = String.fromCodePoint(0x200b);
const ACUTE = String.fromCodePoint(0x301);

/** The app's words for the built-in roles, as `app.roles` has them in Hebrew. */
const LABELS: Record<Role, string> = {
  owner: "בעלים",
  manager: "ניהול",
  worker: "צוות",
  accountant: "הנהלת חשבונות",
};

const read = (text: string, elsewhere: readonly string[] = []) =>
  parseStaffList(text, { labels: LABELS, elsewhere: new Set(elsewhere) });

/** Each line by its number: what it became, or its problem. */
const kinds = (list: StaffList) =>
  list.lines.map((line) => [
    line.line,
    line.kind === "problem" ? line.problem : line.kind,
  ]);
const roles = (list: StaffList) =>
  list.entries.map((entry) => [entry.name, entry.role]);

/** Two letters for a name, apart for each of 100 people, never a final letter. */
const nameAt = (i: number) =>
  `${"אבגדהוזחטי"[i % 10]}${"אבגדהוזחטי"[Math.floor(i / 10) % 10]}`;

const valid = {
  template: "restaurant",
  name: "  קפה   נועה ",
  slug: "Cafe Noa",
  address: " רחוב הרצל 1, חיפה ",
  accent: "#2563EB",
};

describe("normalizeSlug", () => {
  it("lower-cases and turns spaces and underscores into single hyphens", () => {
    expect(normalizeSlug("  Cafe  Noa_TLV ")).toBe("cafe-noa-tlv");
    expect(normalizeSlug("--bar--42--")).toBe("bar-42");
  });

  it("keeps characters the check must reject", () => {
    expect(normalizeSlug("קפה")).toBe("קפה");
    expect(normalizeSlug("cafe.noa")).toBe("cafe.noa");
  });
});

describe("parseNewBusiness", () => {
  it("returns the tidied business", () => {
    expect(parseNewBusiness(valid)).toEqual({
      ok: true,
      value: {
        template: "restaurant",
        name: "קפה נועה",
        slug: "cafe-noa",
        address: "רחוב הרצל 1, חיפה",
        accent: "#2563eb",
        staff: [],
      },
    });
  });

  it("carries the pasted staff list", () => {
    const result = parseNewBusiness({
      ...valid,
      staff: "רונית בעלים 050-111-1111\nשי 0502222222",
    });
    expect(result.ok && result.value.staff).toEqual([
      { name: "רונית", phone: "+972501111111", role: "owner" },
      { name: "שי", phone: "+972502222222", role: "worker" },
    ]);
  });

  it("refuses a staff list with a problem line", () => {
    expect(
      parseNewBusiness({ ...valid, staff: "שי 0502222222\nבלי מספר" }),
    ).toEqual({ ok: false, errors: { staff: "invalid" } });
  });

  it("reads the staff list with the words it is given, and blocks numbers found elsewhere", () => {
    const staff = "דנה כהן 050-111-1111 ניהול\nשי לוי 050-222-2222";
    const result = parseNewBusiness({ ...valid, staff }, NEW_BUSINESS_FIELDS, {
      labels: LABELS,
    });
    expect(
      result.ok && result.value.staff.map((entry) => [entry.name, entry.role]),
    ).toEqual([
      ["דנה כהן", "manager"],
      ["שי לוי", "worker"],
    ]);
    expect(
      parseNewBusiness({ ...valid, staff }, NEW_BUSINESS_STEPS[3], {
        labels: LABELS,
        elsewhere: new Set(["+972502222222"]),
      }),
    ).toEqual({ ok: false, errors: { staff: "invalid" } });
  });

  it("refuses two columns of mobiles, and a list longer than the wizard's", () => {
    expect(
      parseNewBusiness({
        ...valid,
        staff: "שם\tנייד\tטלפון נייד\nדנה\t050-111-1111\t052-111-1111",
      }),
    ).toEqual({ ok: false, errors: { staff: "phoneColumns" } });
    const many = Array.from(
      { length: STAFF_LIST_MAX + 1 },
      (_, i) => `${nameAt(i)} 050${String(i).padStart(7, "0")}`,
    ).join("\n");
    expect(parseNewBusiness({ ...valid, staff: many })).toEqual({
      ok: false,
      errors: { staff: "tooMany" },
    });
  });

  it("stores an empty address as null", () => {
    const result = parseNewBusiness({ ...valid, address: "   " });
    expect(result.ok && result.value.address).toBeNull();
  });

  it("stores the readable version of a pale accent", () => {
    const result = parseNewBusiness({ ...valid, accent: "#ffee00" });
    const tokens = accentTokens("#ffee00");
    expect(tokens.adjusted).toBe(true);
    expect(result.ok && result.value.accent).toBe(tokens.accent);
  });

  it("names every missing field", () => {
    expect(parseNewBusiness({})).toEqual({
      ok: false,
      errors: {
        template: "required",
        name: "required",
        slug: "required",
        accent: "required",
      },
    });
  });

  it.each([
    ["ab", "tooShort"],
    ["a".repeat(41), "tooLong"],
    ["קפה-נועה", "invalid"],
    ["cafe.noa", "invalid"],
    ["admin", "reserved"],
    ["Sign In", "reserved"],
  ])("rejects the slug %s as %s", (slug, error) => {
    expect(parseNewBusiness({ ...valid, slug })).toEqual({
      ok: false,
      errors: { slug: error },
    });
  });

  it("rejects an unknown template, a long name and address, a bad colour", () => {
    expect(
      parseNewBusiness({
        ...valid,
        template: "bakery",
        name: "א".repeat(81),
        address: "א".repeat(201),
        accent: "blue",
      }),
    ).toEqual({
      ok: false,
      errors: {
        template: "invalid",
        name: "tooLong",
        address: "tooLong",
        accent: "invalid",
      },
    });
  });

  it("ignores non-string values instead of throwing", () => {
    const result = parseNewBusiness({ ...valid, name: 42 });
    expect(result).toEqual({ ok: false, errors: { name: "required" } });
  });

  it("checks only the fields of one step when asked", () => {
    expect(
      parseNewBusiness({ template: "cafe-bar" }, NEW_BUSINESS_STEPS[0]).ok,
    ).toBe(true);
    expect(
      parseNewBusiness({ name: "x", slug: "admin" }, NEW_BUSINESS_STEPS[1]),
    ).toEqual({ ok: false, errors: { slug: "reserved" } });
  });
});

describe("staffRolesOf", () => {
  it("gives every role, owners and accountants too, none blocked", () => {
    const given = staffRolesOf(LABELS);
    expect(
      given.choices.map((one) => [one.role, one.label, one.blocked]),
    ).toEqual([
      ["manager", "ניהול", null],
      ["worker", "צוות", null],
    ]);
    expect(given.oneByOne.map((one) => [one.role, one.given])).toEqual([
      ["owner", true],
      ["accountant", true],
    ]);
    expect(given.aboveRank).toEqual([]);
  });

  it("takes the words one by one from a translator", () => {
    expect(roleWordsOf((role) => LABELS[role])).toEqual(LABELS);
  });
});

/**
 * The wizard's staff list (inviting from a list, part 6): read as the import
 * reads a list of people, owners and accountants taken from the list too.
 * The first cases are the wizard's own reader's, which this one replaced,
 * and read the same.
 */
describe("parseStaffList", () => {
  it("is empty for empty input", () => {
    expect(read("  \n\n ")).toEqual({
      lines: [],
      entries: [],
      ignored: [],
      error: null,
    });
  });

  it("reads a name and a number in either order, with any separator", () => {
    const list = read(
      [
        "דנה כהן 050-123-4567",
        "0521234567, יוסי לוי",
        "מיכל אברהם\t+972 54 123 4567",
        "1. נועה - 053 1234567",
        "• אבי (058-1234567)",
      ].join("\n"),
    );
    expect(list.error).toBeNull();
    expect(list.entries).toEqual([
      { name: "דנה כהן", phone: "+972501234567", role: "worker" },
      { name: "יוסי לוי", phone: "+972521234567", role: "worker" },
      { name: "מיכל אברהם", phone: "+972541234567", role: "worker" },
      { name: "נועה", phone: "+972531234567", role: "worker" },
      { name: "אבי", phone: "+972581234567", role: "worker" },
    ]);
  });

  it("takes a role word out of the name, at either end", () => {
    const list = read(
      [
        "רונית בעלים 0501111111",
        "שי כהן, מנהל, 0502222222",
        'אחמ"ש תמר 0503333333',
        "Owner Dan 0504444444",
        "עובדת: ליאת 0505555555",
        "מנהלת: נועה פרץ 0506666666",
      ].join("\n"),
    );
    expect(roles(list)).toEqual([
      ["רונית", "owner"],
      ["שי כהן", "manager"],
      ["תמר", "manager"],
      ["Dan", "owner"],
      ["ליאת", "worker"],
      ["נועה פרץ", "manager"],
    ]);
  });

  it("reads an accountant's two words before a manager's one", () => {
    const list = read(
      [
        "גלית לוי מנהלת חשבונות 0506666666",
        "אבי, מנהל חשבונות, 0507777777",
        "הנהלת חשבונות - מירב 0508888888",
        "רואה חשבון יוסי 0509999999",
        'רואת חשבון: ד"ר נעמה 0521111111',
        "Accountant Ben 0522222222",
        "מנהלת ענבל 0523333333",
      ].join("\n"),
    );
    expect(roles(list)).toEqual([
      ["גלית לוי", "accountant"],
      ["אבי", "accountant"],
      ["מירב", "accountant"],
      ["יוסי", "accountant"],
      ['ד"ר נעמה', "accountant"],
      ["Ben", "accountant"],
      ["ענבל", "manager"],
    ]);
  });

  it("reads the app's words for the roles only when it is given them", () => {
    const text = [
      "דנה כהן 050-111-1111 ניהול",
      "יוסי לוי 050-222-2222 צוות",
      "מיכל אברהם 050-333-3333 בעלים",
      "גלית לוי 050-444-4444 הנהלת חשבונות",
    ].join("\n");
    expect(roles(read(text))).toEqual([
      ["דנה כהן", "manager"],
      ["יוסי לוי", "worker"],
      ["מיכל אברהם", "owner"],
      ["גלית לוי", "accountant"],
    ]);
    // Without them a word the app's roles alone have stays in the name, as
    // the preview shows it.
    expect(roles(parseStaffList(text))[0]).toEqual(["דנה כהן ניהול", "worker"]);
  });

  it("numbers lines as pasted and says each problem as the import does", () => {
    const list = read(
      [
        "דנה 0501234567",
        "",
        "בלי מספר",
        "יוסי 03-1234567",
        "0521234567",
        "דנה שוב 050-123-4567",
        `${"א".repeat(81)} 0541234567`,
        "מיכל 050-111-1111 052-222-2222",
        "רוני 5.01E+08",
        "ןהכ הנד 050-333-3333",
        // Excel's dropped zero is a sheet's alone: in a line typed by hand
        // a 9-digit run starting with 5 may be an ID number.
        "אבי 501234567",
      ].join("\n"),
    );
    expect(list.error).toBe("invalid");
    expect(kinds(list)).toEqual([
      [1, "person"],
      [3, "noPhone"],
      [4, "invalidPhone"],
      [5, "noName"],
      [6, "duplicate"],
      [7, "nameTooLong"],
      [8, "twoPhones"],
      [9, "excelNumber"],
      [10, "reversed"],
      [11, "invalidPhone"],
    ]);
    expect(list.lines[4]).toMatchObject({ kind: "problem", first: 1 });
    expect(list.entries).toHaveLength(1);
  });

  it("reads a sheet with its header row, an ID column and Excel's dropped zero", () => {
    const sheet = read(
      [
        "צוות הסניף",
        "שם\tת.ז.\tנייד\tתפקיד",
        `${RLM}רונית כהן\t123456782\t050-111-1111\tבעלים`,
        "שי לוי\t234567891\t502222222\tמנהל",
        "גלית אברהם\t\t0503333333\tהנהלת חשבונות",
        "תמר פרץ\t345678912\t0504444444\t",
      ].join("\n"),
    );
    expect(sheet.error).toBeNull();
    expect(kinds(sheet)).toEqual([
      [1, "title"],
      [2, "header"],
      [3, "person"],
      [4, "person"],
      [5, "person"],
      [6, "person"],
    ]);
    expect(sheet.entries).toEqual([
      { name: "רונית כהן", phone: "+972501111111", role: "owner" },
      { name: "שי לוי", phone: "+972502222222", role: "manager" },
      { name: "גלית אברהם", phone: "+972503333333", role: "accountant" },
      { name: "תמר פרץ", phone: "+972504444444", role: "worker" },
    ]);
    expect(sheet.ignored).toEqual([{ header: "ת.ז." }]);
    // No ID number is in what the wizard sends.
    expect(JSON.stringify(sheet.entries)).not.toMatch(
      /123456782|234567891|345678912/,
    );
  });

  it("keeps names as the app keeps them, and other numbers out of them", () => {
    const list = read(
      [
        `דנה${ZERO_WIDTH} כהן ${RLM}050-111-1111`,
        `Rene${ACUTE} Levi 050-222-2222`,
        "יוסי לוי 050-333-3333 ת.ז. 123456782",
      ].join("\n"),
    );
    expect(list.entries.map((entry) => entry.name)).toEqual([
      "דנה כהן",
      "René Levi",
      "יוסי לוי",
    ]);
    expect(list.lines[2]?.dropped).toEqual(["123456782"]);
  });

  it("takes the same person twice once, and holds another name or role on a number", () => {
    const list = read(
      [
        "רונית כהן 050-111-1111 בעלים",
        "רונית כהן 050-111-1111 בעלים",
        "רונית כהן 050-111-1111",
        "שי לוי 050-222-2222",
        "שי לוי 050-222-2222",
        "שי לוי 050-222-2222 מנהל",
        "גלית 050-333-3333",
        "גלית 050-333-3333 מנהלת חשבונות",
        "Dana Cohen 050-444-4444",
        "dana cohen 050-444-4444",
      ].join("\n"),
    );
    expect(kinds(list)).toEqual([
      [1, "person"],
      [2, "sameLine"],
      [3, "duplicate"],
      [4, "person"],
      [5, "sameLine"],
      [6, "duplicate"],
      [7, "person"],
      [8, "duplicate"],
      [9, "person"],
      [10, "sameLine"],
    ]);
    // Each conflict names the first line with its number, an owner's too.
    expect(
      list.lines.flatMap((line) =>
        line.kind === "problem" || line.kind === "sameLine"
          ? [[line.line, line.first]]
          : [],
      ),
    ).toEqual([
      [2, 1],
      [3, 1],
      [5, 4],
      [6, 4],
      [8, 7],
      [10, 9],
    ]);
    // The same line again, alone, holds nothing up.
    const again = read(
      "רונית כהן 050-111-1111 בעלים\nרונית כהן 050-111-1111 בעלים",
    );
    expect(again.error).toBeNull();
    expect(again.entries).toHaveLength(1);
  });

  it("holds a number found on another staff until its line goes, never an accountant's", () => {
    const text = [
      "רונית כהן 050-111-1111 בעלים",
      "שי לוי 050-222-2222",
      "גלית 050-333-3333 מנהלת חשבונות",
      "תמר 050-444-4444",
    ];
    const found = ["+972501111111", "+972502222222", "+972503333333"];
    const list = read(text.join("\n"), found);
    expect(list.error).toBe("invalid");
    expect(kinds(list)).toEqual([
      [1, "elsewhere"],
      [2, "elsewhere"],
      [3, "person"],
      [4, "person"],
    ]);
    expect(read(text.slice(2).join("\n"), found).error).toBeNull();
  });

  it("reads a name line followed by its number line as one person", () => {
    const list = read(
      ["דנה כהן", "050-111-1111", "יוסי לוי", "050-222-2222"].join("\n"),
    );
    expect(list.error).toBeNull();
    expect(list.lines.map((line) => [line.line, line.last])).toEqual([
      [1, 2],
      [3, 4],
    ]);
    expect(roles(list)).toEqual([
      ["דנה כהן", "worker"],
      ["יוסי לוי", "worker"],
    ]);
  });

  it("never guesses between two columns of mobiles", () => {
    const list = read(
      [
        "שם\tנייד\tטלפון נייד",
        "דנה\t050-111-1111\t052-111-1111",
        "יוסי\t050-222-2222\t052-222-2222",
      ].join("\n"),
    );
    expect(list).toEqual({
      lines: [],
      entries: [],
      ignored: [],
      phoneHeaders: ["נייד", "טלפון נייד"],
      error: "phoneColumns",
    });
  });

  it(`refuses more than ${STAFF_LIST_MAX} people, and draws nothing past what the import reads`, () => {
    const lines = Array.from(
      { length: PEOPLE_IMPORT_MAX + 1 },
      (_, i) =>
        `${nameAt(i)}${"אבגד"[Math.floor(i / 100)]} 050${String(i).padStart(7, "0")}`,
    );
    expect(read(lines.slice(0, STAFF_LIST_MAX).join("\n")).error).toBeNull();
    const over = read(lines.slice(0, STAFF_LIST_MAX + 1).join("\n"));
    expect(over.error).toBe("tooMany");
    expect(over.entries).toHaveLength(STAFF_LIST_MAX + 1);
    const far = read(lines.join("\n"));
    expect([far.error, far.lines, far.entries]).toEqual(["tooMany", [], []]);
    expect(read("א".repeat(PEOPLE_IMPORT_CHARS + 1)).error).toBe("tooMany");
  });
});

describe("wizard steps", () => {
  it("ask every field exactly once", () => {
    expect(NEW_BUSINESS_STEPS.flat().sort()).toEqual(
      [...NEW_BUSINESS_FIELDS].sort(),
    );
  });

  it("go back to the first step with an error", () => {
    expect(firstStepWithError({ accent: "invalid" })).toBe(2);
    expect(firstStepWithError({ slug: "taken", accent: "invalid" })).toBe(1);
    expect(firstStepWithError({ staff: "invalid" })).toBe(3);
    expect(firstStepWithError({})).toBe(0);
  });
});

describe("accent presets", () => {
  it("are readable as they are and unique", () => {
    for (const { hex } of ACCENT_PRESETS) {
      expect(accentTokens(hex)).toMatchObject({ accent: hex, adjusted: false });
    }
    expect(new Set(ACCENT_PRESETS.map((p) => p.hex)).size).toBe(
      ACCENT_PRESETS.length,
    );
  });
});
