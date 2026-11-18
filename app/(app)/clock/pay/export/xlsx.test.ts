import { describe, expect, it, vi } from "vitest";
import { readWorkbook, sheetCells, unzip } from "@/e2e/unzip";

vi.mock("server-only", () => ({}));

const {
  columnName,
  escapeXml,
  excelDate,
  excelDateTime,
  excelTime,
  sheetNames,
  STYLES,
  xlsxFile,
  xlsxParts,
} = await import("./xlsx");

type Sheets = Parameters<typeof xlsxFile>[0];

const SHEETS: Sheets = [
  {
    name: "סיכום חודשי",
    rtl: true,
    columns: [
      { header: "שם", width: 20 },
      { header: "מספר עובד", width: 12, id: true },
      { header: "שעות", width: 10 },
      { header: "ימים", width: 8 },
      { header: "תאריך", width: 12 },
      { header: "כניסה", width: 8 },
      { header: "תוקן ב", width: 16 },
      { header: "הערה", width: 30 },
    ],
    rows: [
      [
        { t: "s", v: "נועה כהן" },
        { t: "s", v: "007" },
        { t: "n", v: 8.6 },
        { t: "n", v: 21, whole: true },
        { t: "d", v: "2026-10-13" },
        { t: "time", v: "08:36" },
        { t: "dt", v: "2026-10-14T12:00" },
        { t: "s", v: "=SUM(A1:A9)" },
      ],
      [
        { t: "s", v: "Tom & Jerry <b>\"'" },
        null,
        { t: "n", v: Number.NaN },
        null,
        null,
        null,
        null,
        { t: "s", v: "שורה\u0001 עם\u0000 תו בקרה" },
      ],
    ],
  },
  {
    name: "על הקובץ",
    rtl: true,
    columns: [{ header: "נושא", width: 20 }],
    rows: [],
  },
];

const open = (sheets: Sheets) => readWorkbook(unzip(xlsxFile(sheets)));

describe("the XLSX file", () => {
  it("opens: every part typed in [Content_Types].xml and reached through the relationships", () => {
    const { sheets } = open(SHEETS);
    expect(sheets.map((sheet) => sheet.name)).toEqual([
      "סיכום חודשי",
      "על הקובץ",
    ]);
    const parts = xlsxParts(SHEETS).map((part) => part.path);
    expect(parts[0]).toBe("[Content_Types].xml");
    expect(parts).toEqual(
      expect.arrayContaining([
        "_rels/.rels",
        "xl/workbook.xml",
        "xl/_rels/workbook.xml.rels",
        "xl/worksheets/sheet1.xml",
        "xl/worksheets/sheet2.xml",
        "xl/styles.xml",
        "xl/sharedStrings.xml",
      ]),
    );
  });

  it("is well-formed XML, UTF-8, in every part", () => {
    for (const part of xlsxParts(SHEETS)) {
      expect(part.xml.startsWith('<?xml version="1.0" encoding="UTF-8"')).toBe(
        true,
      );
      // Every element opened is closed, in order.
      const stack: string[] = [];
      for (const [, closing, name, selfClosing] of part.xml
        .replace(/<\?xml[^>]*\?>/, "")
        .matchAll(/<(\/?)([\w:]+)[^>]*?(\/?)>/g)) {
        if (selfClosing) continue;
        if (closing) expect(stack.pop(), part.path).toBe(name);
        else stack.push(name ?? "");
      }
      expect(stack, part.path).toEqual([]);
    }
    // Hebrew is kept as UTF-8, and reads back the same.
    const { strings } = open(SHEETS);
    expect(strings).toContain("נועה כהן");
  });

  it("is right to left, with the header row frozen", () => {
    for (const sheet of open(SHEETS).sheets) {
      expect(sheet.xml).toContain('rightToLeft="1"');
      expect(sheet.xml).toContain(
        '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>',
      );
    }
    // Only the first sheet is the one shown when the file opens.
    const [first, second] = open(SHEETS).sheets;
    expect(first?.xml).toContain('tabSelected="1"');
    expect(second?.xml).not.toContain("tabSelected");
    // A sheet that isn't right to left says nothing about it.
    const [ltr] = open([{ ...SHEETS[1], rtl: false } as Sheets[number]]).sheets;
    expect(ltr?.xml).not.toContain("rightToLeft");
  });

  it("writes numbers as numbers, two decimals for hours, whole numbers for counts", () => {
    const { sheets, strings } = open(SHEETS);
    const cells = sheetCells(sheets[0]?.xml ?? "", strings);
    expect(cells.get("C2")).toEqual({
      value: "8.6",
      style: STYLES.decimal,
      type: null,
    });
    expect(cells.get("D2")).toEqual({
      value: "21",
      style: STYLES.whole,
      type: null,
    });
    // Not a number: left empty rather than written as NaN.
    expect(cells.has("C3")).toBe(false);
    const styles = xlsxParts(SHEETS).find(
      (part) => part.path === "xl/styles.xml",
    )?.xml;
    // Built-in 2 is "0.00", 1 is "0"; 49 is text.
    expect(styles).toMatch(
      /<cellXfs count="8">(<xf [^>]*?(\/>|>.*?<\/xf>)){3}<xf numFmtId="2"/,
    );
    expect(styles).toContain('formatCode="dd/mm/yyyy"');
    expect(styles).toContain('formatCode="hh:mm"');
  });

  it("keeps a payroll number as text, and escapes text that would be a formula", () => {
    const { sheets, strings } = open(SHEETS);
    const cells = sheetCells(sheets[0]?.xml ?? "", strings);
    expect(cells.get("B2")).toEqual({
      value: "007",
      style: STYLES.text,
      type: "s",
    });
    expect(cells.get("H2")?.value).toBe("'=SUM(A1:A9)");
    // No cell of the workbook holds a formula.
    for (const sheet of sheets) expect(sheet.xml).not.toContain("<f>");
  });

  it("marks a payroll number's cells as text on purpose, so Excel offers no conversion", () => {
    const [summary, about] = open(SHEETS).sheets;
    // Below the header, to the last row, right after the sheet's data.
    expect(summary?.xml).toContain(
      '</sheetData><ignoredErrors><ignoredError sqref="B2:B3" numberStoredAsText="1"/></ignoredErrors></worksheet>',
    );
    // Nothing for a sheet without rows, or without such a column.
    expect(about?.xml).not.toContain("ignoredError");
    const first = SHEETS[0] as Sheets[number];
    const [noRows] = open([{ ...first, rows: [] }]).sheets;
    expect(noRows?.xml).not.toContain("ignoredError");
    const [noId] = open([
      {
        ...first,
        columns: first.columns.map(({ header, width }) => ({ header, width })),
      },
    ]).sheets;
    expect(noId?.xml).not.toContain("ignoredError");
    // Two such columns are one list.
    const [two] = open([
      {
        name: "x",
        rtl: true,
        columns: [
          { header: "a", width: 5, id: true },
          { header: "b", width: 5 },
          { header: "c", width: 5, id: true },
        ],
        rows: [[null, null, null]],
      },
    ]).sheets;
    expect(two?.xml).toContain(
      '<ignoredError sqref="A2:A2 C2:C2" numberStoredAsText="1"/>',
    );
  });

  it("escapes XML, and leaves out what XML can't hold", () => {
    const { sheets, strings } = open(SHEETS);
    const cells = sheetCells(sheets[0]?.xml ?? "", strings);
    expect(cells.get("A3")?.value).toBe("Tom & Jerry <b>\"'");
    expect(cells.get("H3")?.value).toBe("שורה עם תו בקרה");
    expect(escapeXml("a\rb\u0008c\ud800d")).toBe("a&#13;bcd");
    expect(escapeXml("😀")).toBe("😀");
  });

  it("writes days, times and both as Excel's serial numbers", () => {
    expect(excelDate("2000-01-01")).toBe(36526);
    expect(excelDate("2026-10-13")).toBe(46308);
    expect(excelTime("12:00")).toBe(0.5);
    expect(excelTime("08:36")).toBeCloseTo(0.358333, 6);
    expect(excelDateTime("2026-10-14T12:00")).toBe(46309.5);
    const { sheets, strings } = open(SHEETS);
    const cells = sheetCells(sheets[0]?.xml ?? "", strings);
    expect(cells.get("E2")).toEqual({
      value: "46308",
      style: STYLES.date,
      type: null,
    });
    expect(cells.get("F2")?.style).toBe(STYLES.time);
    expect(cells.get("G2")).toEqual({
      value: "46309.5",
      style: STYLES.dateTime,
      type: null,
    });
  });

  it("shares each text once, and counts every use", () => {
    const strings = xlsxParts([
      {
        name: "a",
        rtl: true,
        columns: [{ header: "x", width: 5 }],
        rows: [[{ t: "s", v: "x" }], [{ t: "s", v: "y" }]],
      },
    ]).find((part) => part.path === "xl/sharedStrings.xml")?.xml;
    expect(strings).toContain('count="3" uniqueCount="2"');
  });

  it("gives each sheet its size and its columns' widths", () => {
    const [sheet] = open(SHEETS).sheets;
    expect(sheet?.xml).toContain('<dimension ref="A1:H3"/>');
    expect(sheet?.xml).toContain(
      '<col min="1" max="1" width="20" customWidth="1"/>',
    );
  });
});

describe("columnName", () => {
  it("counts as Excel does", () => {
    expect([0, 1, 25, 26, 27, 51, 52, 701, 702].map(columnName)).toEqual([
      "A",
      "B",
      "Z",
      "AA",
      "AB",
      "AZ",
      "BA",
      "ZZ",
      "AAA",
    ]);
  });
});

describe("sheetNames", () => {
  it("keeps what Excel takes, at most 31 characters, each once", () => {
    expect(
      sheetNames([
        "סיכום חודשי",
        "a[b]:c*d?e/f\\g",
        "'quoted'",
        "x".repeat(40),
        "Sheet",
        "sheet",
        "",
      ]),
    ).toEqual([
      "סיכום חודשי",
      "abcdefg",
      "quoted",
      "x".repeat(31),
      "Sheet",
      "sheet (2)",
      "Sheet7",
    ]);
  });
});
