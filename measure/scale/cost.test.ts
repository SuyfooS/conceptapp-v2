import { describe, expect, it } from "vitest";
import { costOf, GROWING, linesHeld, spansOf, type TableSize } from "./cost";
import type { SeedReport } from "./seed";
import { confirmLines, type Shape, shape, thisWeekLines } from "./shape";

const ANCHOR = new Date("2026-11-17T09:20:00Z");
const MB = 1024 * 1024;
const MONTH_DAYS = 30.44;

/** The counts the seed would read back, from the shape itself. */
function reportOf(s: Shape): SeedReport {
  const b = s.scale;
  const joined = b.joined.reduce((sum, j) => sum + j.recipients.length, 0);
  const confirm = confirmLines(b);
  const scale = {
    entries: b.entries.length,
    breaks: b.breaks.length,
    log: 3 * b.entries.length,
    assignments: b.weeks
      .flatMap((w) => w.shifts)
      .reduce((sum, x) => sum + x.assignees.length, 0),
    shifts: b.weeks.flatMap((w) => w.shifts).length,
    messages: b.chat.messages.length,
    documents: b.documents.length,
    recipients: b.documents.reduce((sum, d) => sum + d.recipients.length, 0),
    lines: thisWeekLines(b, s.anchor) + b.published.length + joined + confirm,
    lines_confirm: confirm,
  };
  return {
    version: s.version,
    size: s.size,
    depth: s.depth,
    months: s.months,
    anchor: s.anchor,
    counts: { scale, neighbour: {}, people: {} },
    times: [],
    ms: 0,
  };
}

/** Each table holding the business's rows alone, at a megabyte a row. */
function sizesFor(report: SeedReport): TableSize[] {
  const rows = (key: string) => report.counts.scale[key] ?? 0;
  return [
    ...GROWING.map(([table, key]) => ({
      table,
      rows: rows(key),
      bytes: rows(key) * MB,
    })),
    { table: "notifications", rows: rows("lines"), bytes: rows("lines") * MB },
  ];
}

describe("the cost of a business a month", () => {
  const ci = shape({
    people: 30,
    depth: "history",
    months: 2,
    chat: "ci",
    anchor: ANCHOR,
  });
  const full = shape({ people: 30, depth: "history", anchor: ANCHOR });

  it("divides each table by the months its rows cover, not by the history's", () => {
    for (const s of [ci, full]) {
      const spans = spansOf(s);
      // The hours and the log over the history, from its first week.
      expect(spans.time_entries.months).toBeGreaterThanOrEqual(s.months);
      expect(spans.time_entries.months).toBeLessThan(s.months + 0.3);
      expect(spans.audit_log.months).toBe(spans.time_entries.months);
      // The schedule over all its weeks, next week's draft included.
      expect(spans.schedule_shifts.months).toBeCloseTo(
        (s.scale.weeks.length * 7) / MONTH_DAYS,
        1,
      );
      // The chat over its 90 days, whatever the history's months.
      expect(spans.chat_messages.months).toBeCloseTo(90 / MONTH_DAYS, 1);
    }
    // The documents over their months of payslips: 1 at ci, 4 in full.
    expect(spansOf(ci).documents.months).toBe(1);
    expect(spansOf(full).documents.months).toBe(4);
    expect(spansOf(full).document_recipients.months).toBe(4);
  });

  it("gives each table's divisor, and the bell's lines as held, not a month", () => {
    const report = reportOf(full);
    const cost = costOf(full, report, sizesFor(report), {
      before: 40 * MB,
      after: 52.5 * MB,
    });
    // The database before the seed and after, both kept, and what it grew by.
    expect(cost.databaseBytes).toEqual({ before: 40 * MB, after: 52.5 * MB });
    expect(cost.databaseGrownMb).toBe(12.5);
    const of = (table: string) => cost.tables.find((t) => t.table === table);
    const messages = full.scale.chat.messages.length;
    // At a megabyte a row: the messages over about 3 months, not 13.
    expect(of("chat_messages")?.mbAMonth).toBeCloseTo(
      messages / spansOf(full).chat_messages.months,
      0,
    );
    expect(of("documents")?.mbAMonth).toBeCloseTo(
      full.scale.documents.length / 4,
      0,
    );
    expect(of("time_entries")?.months).toBe(spansOf(full).time_entries.months);
    expect(cost.tables.map((t) => t.table)).not.toContain("notifications");
    expect(cost.databaseMbAMonth).toBeCloseTo(
      cost.tables.reduce((sum, t) => sum + t.mbAMonth, 0),
      1,
    );
    for (const t of cost.tables)
      expect(cost.label).toContain(`${t.table} over ${t.months} months`);

    // The lines: the waiting hours' backlog left out, and what the app
    // would have cleaned (who joined years ago) with it.
    const n = cost.notifications;
    expect(n.backlogRows).toBe(confirmLines(full.scale));
    expect(n.heldRows).toBe(linesHeld(full));
    expect(n.heldRows).toBeGreaterThan(0);
    expect(n.heldRows).toBeLessThan(n.businessRows - n.backlogRows);
    expect(n.heldMb).toBeCloseTo(n.heldRows, 1);
  });
});
