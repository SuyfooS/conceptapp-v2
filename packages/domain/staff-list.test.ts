import { describe, expect, it } from "vitest";
import { parseStaffList, STAFF_LIST_MAX } from "./staff-list";

describe("parseStaffList", () => {
  it("is empty for empty input", () => {
    expect(parseStaffList("  \n\n ")).toEqual({
      lines: [],
      entries: [],
      error: null,
    });
  });

  it("reads a name and a number in either order, with any separator", () => {
    const list = parseStaffList(
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

  it("takes a role word out of the name", () => {
    const list = parseStaffList(
      [
        "רונית בעלים 0501111111",
        "שי כהן, מנהל, 0502222222",
        'אחמ"ש תמר 0503333333',
        "Owner Dan 0504444444",
        "עובדת: ליאת 0505555555",
      ].join("\n"),
    );
    expect(list.entries.map((e) => [e.name, e.role])).toEqual([
      ["רונית", "owner"],
      ["שי כהן", "manager"],
      ["תמר", "manager"],
      ["Dan", "owner"],
      ["ליאת", "worker"],
    ]);
  });

  it("reads an accountant's two words before a manager's one", () => {
    const list = parseStaffList(
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
    expect(list.entries.map((e) => [e.name, e.role])).toEqual([
      ["גלית לוי", "accountant"],
      ["אבי", "accountant"],
      ["מירב", "accountant"],
      ["יוסי", "accountant"],
      ['ד"ר נעמה', "accountant"],
      ["Ben", "accountant"],
      ["ענבל", "manager"],
    ]);
  });

  it("numbers lines as pasted and explains each problem", () => {
    const list = parseStaffList(
      [
        "דנה 0501234567",
        "",
        "בלי מספר",
        "יוסי 03-1234567",
        "0521234567",
        "דנה שוב 050-123-4567",
        `${"א".repeat(81)} 0541234567`,
      ].join("\n"),
    );
    expect(list.error).toBe("invalid");
    expect(list.lines.map((l) => [l.line, l.ok ? "ok" : l.error])).toEqual([
      [1, "ok"],
      [3, "noPhone"],
      [4, "invalidPhone"],
      [5, "noName"],
      [6, "duplicate"],
      [7, "nameTooLong"],
    ]);
    expect(list.entries).toHaveLength(1);
  });

  it(`refuses more than ${STAFF_LIST_MAX} people`, () => {
    const lines = Array.from(
      { length: STAFF_LIST_MAX + 1 },
      // Names without digits, so they never run into the number.
      (_, i) =>
        `${"אבגדהוזחטי"[i % 10]}${"אבגדהוזחטי"[Math.floor(i / 10)]} 050${String(i).padStart(7, "0")}`,
    );
    expect(parseStaffList(lines.slice(0, -1).join("\n")).error).toBeNull();
    expect(parseStaffList(lines.join("\n")).error).toBe("tooMany");
  });
});
