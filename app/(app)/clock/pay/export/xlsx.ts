import "server-only";
import { type Cell, type Column, escapeCellText } from "@domain/payroll-export";
import { zip } from "./zip";

/*
 * A small XLSX writer (Office Open XML SpreadsheetML, ECMA-376), for the file
 * for payroll (payroll P8): a workbook of sheets, each right to left with its
 * first row frozen, text as shared strings (never a formula: no cell here
 * has one; identifiers such as "007" marked as text on purpose), hours and
 * wages as numbers to two decimals, counts as whole numbers, days as
 * dd/mm/yyyy and times as hh:mm. Zipped by `./zip`. Written
 * here rather than taken from a package (no new dependency for one file).
 */

/** One sheet as the writer takes it. */
export type XlsxSheet = {
  name: string;
  rtl: boolean;
  columns: readonly Column[];
  rows: readonly (readonly Cell[])[];
};

/** One part of the package: its path in the ZIP and its XML. */
export type XlsxPart = { path: string; xml: string };

const MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const RELATIONSHIPS =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PACKAGE_RELATIONSHIPS =
  "http://schemas.openxmlformats.org/package/2006/relationships";
const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

export const CONTENT_TYPES = {
  workbook:
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml",
  worksheet:
    "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml",
  styles:
    "application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml",
  sharedStrings:
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml",
} as const;

/** The file's own type, for the response. */
export const XLSX_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Each cell style (`cellXfs`) by its index in styles.xml. */
export const STYLES = {
  general: 0,
  text: 1,
  header: 2,
  decimal: 3,
  whole: 4,
  date: 5,
  time: 6,
  dateTime: 7,
} as const;

const STYLES_XML = `${HEAD}<styleSheet xmlns="${MAIN}"><numFmts count="3"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/><numFmt numFmtId="165" formatCode="hh:mm"/><numFmt numFmtId="166" formatCode="dd/mm/yyyy hh:mm"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Arial"/><family val="2"/></font><font><b/><sz val="11"/><name val="Arial"/><family val="2"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="8"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="49" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top"/></xf><xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top"/></xf><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top"/></xf><xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

/** Whether XML 1.0 allows a code point at all. */
function allowedInXml(code: number): boolean {
  return (
    code === 0x9 ||
    code === 0xa ||
    code === 0xd ||
    (code >= 0x20 && code <= 0xd7ff) ||
    (code >= 0xe000 && code <= 0xfffd) ||
    (code >= 0x10000 && code <= 0x10ffff)
  );
}

/**
 * Text as XML holds it: `&`, `<`, `>` and quotes escaped, a carriage return
 * kept as a reference (a parser would turn it into a line feed), and what
 * XML 1.0 can't hold (other control characters, lone surrogates) left out.
 */
export function escapeXml(value: string): string {
  let out = "";
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (!allowedInXml(code)) continue;
    switch (char) {
      case "&":
        out += "&amp;";
        break;
      case "<":
        out += "&lt;";
        break;
      case ">":
        out += "&gt;";
        break;
      case '"':
        out += "&quot;";
        break;
      case "'":
        out += "&apos;";
        break;
      case "\r":
        out += "&#13;";
        break;
      default:
        out += char;
    }
  }
  return out;
}

/** A column's letters: 0 is A, 25 is Z, 26 is AA. */
export function columnName(index: number): string {
  let name = "";
  let n = index + 1;
  while (n > 0) {
    const rest = (n - 1) % 26;
    name = String.fromCharCode(65 + rest) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

const DAY_MS = 86_400_000;
/** Day 0 of Excel's 1900 system, as it counts days from 1 March 1900. */
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

/** A day (`YYYY-MM-DD`) as Excel's serial number: 1 January 2000 is 36526. */
export function excelDate(date: string): number {
  const [year = 1900, month = 1, day = 1] = date.split("-").map(Number);
  return Math.round((Date.UTC(year, month - 1, day) - EXCEL_EPOCH) / DAY_MS);
}

/** A time of day (`HH:MM`) as a fraction of a day: 12:00 is 0.5. */
export function excelTime(value: string): number {
  const [hours = 0, minutes = 0] = value.split(":").map(Number);
  return (hours * 60 + minutes) / 1440;
}

/** A day and a time (`YYYY-MM-DDTHH:MM`) as one serial number. */
export function excelDateTime(value: string): number {
  const [date = "", clock = "00:00"] = value.split("T");
  return excelDate(date) + excelTime(clock);
}

/**
 * A sheet's name as Excel takes it: none of `[]:*?/\`, no apostrophe at
 * either end, at most 31 characters, and unique in the workbook (whatever the
 * case), else a number is added.
 */
export function sheetNames(names: readonly string[]): string[] {
  const used = new Set<string>();
  return names.map((asked, index) => {
    const base =
      [...asked]
        .filter((char) => !"[]:*?/\\".includes(char))
        .join("")
        .replace(/^'+|'+$/g, "")
        .trim()
        .slice(0, 31) || `Sheet${index + 1}`;
    let name = base;
    for (let n = 2; used.has(name.toLowerCase()); n += 1) {
      const suffix = ` (${n})`;
      name = `${base.slice(0, 31 - suffix.length)}${suffix}`;
    }
    used.add(name.toLowerCase());
    return name;
  });
}

/** The workbook's shared strings: each text once, by its index. */
class SharedStrings {
  readonly #index = new Map<string, number>();
  readonly #all: string[] = [];
  count = 0;

  add(value: string): number {
    this.count += 1;
    const known = this.#index.get(value);
    if (known !== undefined) return known;
    const index = this.#all.length;
    this.#index.set(value, index);
    this.#all.push(value);
    return index;
  }

  xml(): string {
    const items = this.#all
      .map(
        (value) => `<si><t xml:space="preserve">${escapeXml(value)}</t></si>`,
      )
      .join("");
    return `${HEAD}<sst xmlns="${MAIN}" count="${this.count}" uniqueCount="${this.#all.length}">${items}</sst>`;
  }
}

/** A number as XML writes it; null when it isn't one. */
const numberText = (value: number): string | null =>
  Number.isFinite(value) ? String(value) : null;

/** One cell's XML, or nothing for an empty one. */
function cellXml(ref: string, cell: Cell, strings: SharedStrings): string {
  if (cell === null) return "";
  switch (cell.t) {
    case "s":
      // Shared strings: never a formula, and "007" stays "007".
      return `<c r="${ref}" s="${STYLES.text}" t="s"><v>${strings.add(escapeCellText(cell.v))}</v></c>`;
    case "n": {
      const value = numberText(cell.v);
      if (value === null) return "";
      const style = cell.whole ? STYLES.whole : STYLES.decimal;
      return `<c r="${ref}" s="${style}"><v>${value}</v></c>`;
    }
    case "d":
      return `<c r="${ref}" s="${STYLES.date}"><v>${excelDate(cell.v)}</v></c>`;
    case "time":
      return `<c r="${ref}" s="${STYLES.time}"><v>${excelTime(cell.v)}</v></c>`;
    case "dt":
      return `<c r="${ref}" s="${STYLES.dateTime}"><v>${excelDateTime(cell.v)}</v></c>`;
    default:
      return cell satisfies never;
  }
}

/** A sheet's XML: right to left as asked, the header row frozen, the columns' widths. */
function sheetXml(
  sheet: XlsxSheet,
  first: boolean,
  strings: SharedStrings,
): string {
  const width = Math.max(
    1,
    sheet.columns.length,
    ...sheet.rows.map((row) => row.length),
  );
  const height = sheet.rows.length + 1;
  const header = sheet.columns
    .map(
      (column, index) =>
        `<c r="${columnName(index)}1" s="${STYLES.header}" t="s"><v>${strings.add(escapeCellText(column.header))}</v></c>`,
    )
    .join("");
  const rows = sheet.rows
    .map((row, rowIndex) => {
      const r = rowIndex + 2;
      const cells = row
        .map((cell, index) =>
          cellXml(`${columnName(index)}${r}`, cell, strings),
        )
        .join("");
      return `<row r="${r}">${cells}</row>`;
    })
    .join("");
  const cols =
    sheet.columns.length === 0
      ? ""
      : `<cols>${sheet.columns
          .map(
            (column, index) =>
              `<col min="${index + 1}" max="${index + 1}" width="${Math.max(4, column.width)}" customWidth="1"/>`,
          )
          .join("")}</cols>`;
  const view = [
    first ? ' tabSelected="1"' : "",
    sheet.rtl ? ' rightToLeft="1"' : "",
  ].join("");
  return `${HEAD}<worksheet xmlns="${MAIN}" xmlns:r="${RELATIONSHIPS}"><dimension ref="A1:${columnName(width - 1)}${height}"/><sheetViews><sheetView${view} workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData><row r="1">${header}</row>${rows}</sheetData>${ignoredErrorsXml(sheet)}</worksheet>`;
}

/**
 * The cells of identifier columns (`Column.id`, the payroll number), below the
 * header, marked as text on purpose: Excel otherwise flags each "007" as a
 * number stored as text and offers to convert it, which drops the zeros.
 * Nothing for a sheet without such a column or without rows. It comes right
 * after `sheetData`, the place the schema (CT_Worksheet) gives it here.
 */
function ignoredErrorsXml(sheet: XlsxSheet): string {
  if (sheet.rows.length === 0) return "";
  const last = sheet.rows.length + 1;
  const refs = sheet.columns.flatMap((column, index) =>
    column.id ? [`${columnName(index)}2:${columnName(index)}${last}`] : [],
  );
  if (refs.length === 0) return "";
  return `<ignoredErrors><ignoredError sqref="${refs.join(" ")}" numberStoredAsText="1"/></ignoredErrors>`;
}

/**
 * Every part of the workbook, in the order the ZIP holds them:
 * [Content_Types].xml first, then the package's relationships, the workbook,
 * its relationships, each sheet, the styles and the shared strings.
 */
export function xlsxParts(sheets: readonly XlsxSheet[]): XlsxPart[] {
  if (sheets.length === 0) throw new Error("A workbook needs a sheet");
  const names = sheetNames(sheets.map((sheet) => sheet.name));
  const strings = new SharedStrings();
  const worksheets = sheets.map((sheet, index) => ({
    path: `xl/worksheets/sheet${index + 1}.xml`,
    xml: sheetXml(sheet, index === 0, strings),
  }));
  const stylesId = `rId${sheets.length + 1}`;
  const stringsId = `rId${sheets.length + 2}`;

  const types = `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="${CONTENT_TYPES.workbook}"/>${worksheets
    .map(
      (part) =>
        `<Override PartName="/${part.path}" ContentType="${CONTENT_TYPES.worksheet}"/>`,
    )
    .join(
      "",
    )}<Override PartName="/xl/styles.xml" ContentType="${CONTENT_TYPES.styles}"/><Override PartName="/xl/sharedStrings.xml" ContentType="${CONTENT_TYPES.sharedStrings}"/></Types>`;

  const rootRels = `${HEAD}<Relationships xmlns="${PACKAGE_RELATIONSHIPS}"><Relationship Id="rId1" Type="${RELATIONSHIPS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

  const workbook = `${HEAD}<workbook xmlns="${MAIN}" xmlns:r="${RELATIONSHIPS}"><workbookPr/><bookViews><workbookView activeTab="0"/></bookViews><sheets>${names
    .map(
      (name, index) =>
        `<sheet name="${escapeXml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
    )
    .join("")}</sheets></workbook>`;

  const workbookRels = `${HEAD}<Relationships xmlns="${PACKAGE_RELATIONSHIPS}">${worksheets
    .map(
      (_, index) =>
        `<Relationship Id="rId${index + 1}" Type="${RELATIONSHIPS}/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
    )
    .join(
      "",
    )}<Relationship Id="${stylesId}" Type="${RELATIONSHIPS}/styles" Target="styles.xml"/><Relationship Id="${stringsId}" Type="${RELATIONSHIPS}/sharedStrings" Target="sharedStrings.xml"/></Relationships>`;

  return [
    { path: "[Content_Types].xml", xml: types },
    { path: "_rels/.rels", xml: rootRels },
    { path: "xl/workbook.xml", xml: workbook },
    { path: "xl/_rels/workbook.xml.rels", xml: workbookRels },
    ...worksheets,
    { path: "xl/styles.xml", xml: STYLES_XML },
    // After the sheets: they add the strings.
    { path: "xl/sharedStrings.xml", xml: strings.xml() },
  ];
}

/** The workbook as the bytes of an .xlsx file, every part UTF-8. */
export function xlsxFile(
  sheets: readonly XlsxSheet[],
  modified?: Date,
): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  return zip(
    xlsxParts(sheets).map((part) => ({
      path: part.path,
      data: encoder.encode(part.xml),
    })),
    modified,
  );
}
