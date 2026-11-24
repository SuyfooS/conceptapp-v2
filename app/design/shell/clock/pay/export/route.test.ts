import { describe, expect, it, vi } from "vitest";
import { readWorkbook, sheetCells, unzip } from "@/e2e/unzip";
import he from "@/messages/he.json";

// The pay demo's file (payroll P8) follows its screen: with Noa's days away
// on the screen (`?absences=1`, known issue 19), the download link says so,
// and the workbook it gives holds them, as the screen shows them.

vi.mock("server-only", () => ({}));

const { GET } = await import("./route");
const { demoPayPathsFor } = await import("../data");

/** Noa's days of each kind in the summary of the workbook at `href`. */
async function noaDays(href: string) {
  const response = await GET(new Request(`http://localhost:3000${href}`));
  expect(response.status).toBe(200);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const { sheets, strings } = readWorkbook(unzip(bytes));
  const summary = sheetCells(sheets[0]?.xml ?? "", strings);
  const columns = he.app.pay.file.columns.summary;
  const rows = [...summary]
    .filter(([ref, cell]) => /^A\d+$/.test(ref) && cell.value === "נועה כהן")
    .map(([ref]) => ref.slice(1));
  const daysIn = (header: string) => {
    const column = (
      [...summary].find(
        ([ref, cell]) => /^[A-Z]+1$/.test(ref) && cell.value === header,
      )?.[0] ?? ""
    ).replace(/\d+$/, "");
    expect(column, header).not.toBe("");
    return rows.reduce(
      (total, row) =>
        total + Number(summary.get(`${column}${row}`)?.value || 0),
      0,
    );
  };
  return {
    vacation: daysIn(columns.vacationDays),
    sick: daysIn(columns.sickDays),
  };
}

describe("the pay demo's file", () => {
  it("links to Noa's days away when the screen shows them, beside where October stands", () => {
    const file = "/design/shell/clock/pay/export";
    expect(demoPayPathsFor(undefined).file).toBe(file);
    expect(demoPayPathsFor(undefined, "1").file).toBe(`${file}?absences=1`);
    expect(demoPayPathsFor("before", "1").file).toBe(
      `${file}?close=before&absences=1`,
    );
    expect(demoPayPathsFor("before").file).toBe(`${file}?close=before`);
    expect(demoPayPathsFor("closed", "0").file).toBe(file);
  });

  it("holds her vacation and sick day only when asked, as the screen shows them", async () => {
    const away = demoPayPathsFor(undefined, "1").file;
    expect(await noaDays(`${away}&month=2026-10`)).toEqual({
      vacation: 1,
      sick: 1,
    });
    expect(
      await noaDays("/design/shell/clock/pay/export?month=2026-10"),
    ).toEqual({ vacation: 0, sick: 0 });
  });
});
