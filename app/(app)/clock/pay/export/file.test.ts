import { afterEach, describe, expect, it, vi } from "vitest";
import { readWorkbook, sheetCells, unzip } from "@/e2e/unzip";
import he from "@/messages/he.json";

// The month's file as it goes out (payroll P8), in the app's real words: the
// demo's October through `payrollFileOf`, read back as an unzipper and Excel
// would open it. The domain's tests use words that say what they are; this
// one fills every message the file uses, so a missing key or argument, which
// next-intl only logs and then writes as the key's path, fails here.

vi.mock("server-only", () => ({}));

const { payrollFileOf } = await import("./file");
const { baseWording } = await import("../../../wording");
const { demoPayExport } = await import("@/app/design/shell/clock/pay/data");

/** What a cell would hold if the words had failed: a key's path, an ICU argument, an `<ltr>` tag. */
const NOT_WORDS = /^(app|modules|cities)\.|[{}]|<\/?ltr>/;

/** September closed for payroll, with two of Yoav's days changed since (payroll P9). */
const SEPTEMBER = {
  month: "2026-09",
  closedAt: "2026-10-03T10:00",
  engineChanged: true,
  rows: [
    {
      userId: "yoav",
      name: "יואב לוי",
      payrollNumber: "103",
      restDay: 5 as const,
      day: {
        date: "2026-09-21",
        before: 480,
        now: 510,
        buckets: {
          regular: 0,
          ot125: 30,
          ot150: 0,
          rest150: 0,
          rest175: 0,
          rest200: 0,
        },
        entryIds: [],
      },
      reasons: ["שכח לצאת"],
    },
  ],
};

/**
 * The file, read back, with what next-intl said while it was built; with
 * `away`, Noa's days away in October too (a vacation on the 19th, a sick
 * day on the 26th, both her day off).
 */
function built(
  more: Partial<ReturnType<typeof demoPayExport>["meta"]> = {},
  differences: typeof SEPTEMBER | null = null,
  away = false,
) {
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  const demo = demoPayExport(away);
  const file = payrollFileOf({
    ...demo,
    meta: { ...demo.meta, ...more },
    differences,
    wording: baseWording,
  });
  const said = errors.mock.calls.map((call) => call.map(String).join(" "));
  errors.mockRestore();
  return { file, said, ...readWorkbook(unzip(file.bytes)) };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the month's file, in the app's words", () => {
  it("fills every message it uses: no error, no key and no argument left in a cell", () => {
    for (const more of [
      {},
      // The team viewing the business, with and without a name.
      { viewing: true },
      { viewing: true, madeBy: null },
    ]) {
      const { said, strings } = built(more);
      expect(said, JSON.stringify(more)).toEqual([]);
      expect(
        strings.filter((text) => NOT_WORDS.test(text)),
        JSON.stringify(more),
      ).toEqual([]);
    }
  });

  it("has the four sheets, in the messages' words and order", () => {
    const { sheets } = built();
    const names = he.app.pay.file.sheets;
    expect(sheets.map((sheet) => sheet.name)).toEqual([
      names.summary,
      names.daily,
      names.check,
      names.about,
    ]);
  });

  it("runs the words of a day not worked and of the team's view", () => {
    // Election day was Yoav's day off: a day not worked and paid, with what
    // to check.
    const { file, strings } = built();
    expect(file.people).toBeGreaterThan(0);
    const yoav = he.modules.time_clock.oneOffRestDays.knesset_2026;
    expect(strings.some((text) => text.startsWith(`${yoav}, `))).toBe(true);
    expect(
      strings.some((text) => text.includes(yoav) && text.endsWith(".")),
    ).toBe(true);
    const team = built({ viewing: true }).strings;
    const madeBy = he.app.pay.file.about.madeByTeam.replace("{name}", "");
    expect(team.some((text) => text.endsWith(madeBy))).toBe(true);
    const noName = built({ viewing: true, madeBy: null }).strings;
    expect(noName).toContain(he.app.pay.file.about.madeByTeamNoName);
  });

  it("adds the month before's differences in the app's words, before the sheet about the file (payroll P9)", () => {
    for (const differences of [SEPTEMBER, { ...SEPTEMBER, rows: [] }]) {
      const { said, strings } = built({}, differences);
      expect(said).toEqual([]);
      expect(strings.filter((text) => NOT_WORDS.test(text))).toEqual([]);
    }
    const { sheets, strings } = built({}, SEPTEMBER);
    const names = he.app.pay.file.sheets;
    expect(sheets.map((sheet) => sheet.name)).toEqual([
      names.summary,
      names.daily,
      names.check,
      names.differences,
      names.about,
    ]);
    expect(strings).toContain("ספטמבר 2026");
    expect(strings).toContain("שכח לצאת");
    expect(sheets[3]?.xml).toContain('rightToLeft="1"');
    // Unchanged since it closed: no sheet, and a line saying so.
    const same = built({}, { ...SEPTEMBER, rows: [] });
    expect(same.sheets.map((sheet) => sheet.name)).not.toContain(
      names.differences,
    );
  });

  it("counts days away by kind in the summary, gives each date a daily row, and says how (known issue 19)", () => {
    const { said, sheets, strings } = built({}, null, true);
    expect(said).toEqual([]);
    expect(strings.filter((text) => NOT_WORDS.test(text))).toEqual([]);
    const columns = he.app.pay.file.columns;
    const kinds = he.app.clock.absences.kinds;
    const [summary, daily] = [sheets[0], sheets[1]].map((sheet) =>
      sheetCells(sheet?.xml ?? "", strings),
    );
    if (!summary || !daily) throw new Error("no summary or daily sheet");
    /** A column by its header in the first row: "Q". */
    const columnOf = (cells: typeof summary, header: string) =>
      (
        [...cells].find(
          ([ref, cell]) => /^[A-Z]+1$/.test(ref) && cell.value === header,
        )?.[0] ?? ""
      ).replace(/\d+$/, "");
    /** The rows whose first column holds `name`, by number. */
    const rowsOf = (cells: typeof summary, name: string) =>
      [...cells]
        .filter(([ref, cell]) => /^A\d+$/.test(ref) && cell.value === name)
        .map(([ref]) => ref.slice(1));
    const noa = "נועה כהן";

    // The summary's four columns in their words, and Noa's days in them.
    const daysIn = (header: string) => {
      const column = columnOf(summary, header);
      expect(column, header).not.toBe("");
      return rowsOf(summary, noa).reduce(
        (total, row) =>
          total + Number(summary.get(`${column}${row}`)?.value || 0),
        0,
      );
    };
    expect(daysIn(columns.summary.vacationDays)).toBe(1);
    expect(daysIn(columns.summary.sickDays)).toBe(1);
    expect(daysIn(columns.summary.reserveDays)).toBe(0);
    expect(daysIn(columns.summary.otherAbsenceDays)).toBe(0);

    // A daily row for each date away, though she worked no shift on it,
    // with its kind in its words.
    const date = columnOf(daily, columns.daily.date);
    const absence = columnOf(daily, columns.daily.absence);
    expect(absence).not.toBe("");
    const away = rowsOf(daily, noa)
      .filter((row) => daily.get(`${absence}${row}`)?.value)
      .map((row) => [
        new Date(
          Date.UTC(1899, 11, 30) +
            Number(daily.get(`${date}${row}`)?.value) * 86_400_000,
        )
          .toISOString()
          .slice(0, 10),
        daily.get(`${absence}${row}`)?.value,
      ]);
    expect(away).toEqual([
      ["2026-10-19", kinds.vacation],
      ["2026-10-26", kinds.sick],
    ]);

    // The sheet about the file says how they are counted.
    expect(strings).toContain(he.app.pay.file.about.lines.absences);
  });

  it("holds no estimate, not even inside a sentence, with the estimate on", () => {
    const { strings } = built();
    expect(
      strings.filter((text) => text.includes(he.app.pay.estimate.label)),
    ).toEqual([]);
  });

  it("keeps each payroll number as text, marked so Excel offers no conversion", () => {
    const { sheets, strings } = built();
    const [summary, daily, check, about] = sheets;
    for (const sheet of [summary, daily, check]) {
      const cells = sheetCells(sheet?.xml ?? "", strings);
      expect(cells.get("B1")?.value, sheet?.name).toBe(
        he.app.pay.file.columns.summary.number,
      );
      expect(sheet?.xml, sheet?.name).toMatch(
        /<ignoredError sqref="B2:B\d+" numberStoredAsText="1"\/>/,
      );
    }
    expect(sheetCells(summary?.xml ?? "", strings).get("B2")?.type).toBe("s");
    expect(about?.xml).not.toContain("ignoredError");
  });
});
