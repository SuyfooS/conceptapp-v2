import { addDays, instantIn } from "@domain/availability";
import type postgres from "postgres";
import { ZONE } from "./ids";
import type { SeedReport } from "./seed";
import { type Shape, seedReads, thisWeekLines } from "./shape";

/**
 * The cost of a business per month (the plan's 2.5): arithmetic from the
 * seed's counts, labelled as such. The database part is each growing
 * table's size shared out by the business's rows in it, over the months
 * those rows cover in the shape (the hours over the history, the chat over
 * its 90 days, the documents over their months of payslips); what is made
 * once (people, settings, the first index pages) is left out. The bell's
 * lines don't grow by the month: the app deletes them after 180 days, read
 * ones after 90, so they are given as what the app would hold. Storage is
 * the payslips at the review's 150 KB each, and the chat's files at a rate
 * stated here, not measured.
 */

/** Tables that grow every month, with the count each is read from. */
export const GROWING = [
  ["time_entries", "entries"],
  ["time_breaks", "breaks"],
  ["audit_log", "log"],
  ["shift_assignments", "assignments"],
  ["schedule_shifts", "shifts"],
  ["chat_messages", "messages"],
  ["documents", "documents"],
  ["document_recipients", "recipients"],
] as const;

export type GrowingTable = (typeof GROWING)[number][0];

/** Every table sizesOf reads: the growing ones and the bell's. */
const SIZED = [...GROWING.map(([table]) => table), "notifications"] as const;

export type TableSize = { table: string; rows: number; bytes: number };

export type Span = { months: number; over: string };

export type DatabaseBytes = { before: number; after: number };

export type Cost = {
  /** Megabytes a month: each growing table's share by the business's rows, over its span. */
  databaseMbAMonth: number;
  tables: {
    table: GrowingTable;
    businessRows: number;
    /** What the table's rows were divided by. */
    months: number;
    over: string;
    mbAMonth: number;
  }[];
  /** The bell's lines: held, not a month's growth. */
  notifications: {
    businessRows: number;
    /** The clock.confirm lines of the hours waiting now: a backlog, left out. */
    backlogRows: number;
    /** The seed's other lines the app would still hold at the anchor. */
    heldRows: number;
    heldMb: number;
    over: string;
  };
  /** pg_database_size before the seed's transaction began and after it committed. */
  databaseBytes: DatabaseBytes;
  /** What the seed's run added to the database, in MB (less on a run after another, which can reuse the space its clean left). */
  databaseGrownMb: number;
  payslipKb: number;
  storageMbAMonth: number;
  monthsUntilFull: { mb50: number; mb200: number };
  chat: {
    picturesADay: number;
    pictureKb: number;
    daysKept: { mb100: number; mb200: number };
  };
  label: string;
};

const MB = 1024 * 1024;
const DAY = 86_400_000;
const MONTH = 30.44 * DAY;
const round = (n: number, places = 1) =>
  Math.round(n * 10 ** places) / 10 ** places;

/** The months each growing table's rows cover in the shape, and what they are. */
export function spansOf(s: Shape): Record<GrowingTable, Span> {
  const b = s.scale;
  const anchor = Date.parse(s.anchor);
  const midnight = (day: string) => instantIn(day, "00:00", ZONE).getTime();
  const months = (from: number, to = anchor) =>
    round(Math.max(DAY, to - from) / MONTH, 2);

  const worked = b.weeks.find((w) => w.kind !== "next")?.startsOn;
  const hours: Span = {
    months: months(midnight(worked ?? s.weekStart)),
    over: `the hours from ${worked ?? s.weekStart} to the anchor`,
  };
  const first = b.weeks[0]?.startsOn ?? s.weekStart;
  const last = addDays(b.weeks[b.weeks.length - 1]?.startsOn ?? s.weekStart, 7);
  const weeks: Span = {
    months: months(midnight(first), midnight(last)),
    over: `the weeks from ${first} to ${last}`,
  };
  const oldest = b.chat.messages.reduce(
    (min, m) => Math.min(min, Date.parse(m.createdAt)),
    anchor,
  );
  const chat: Span = {
    months: months(oldest),
    over: `the chat's last ${Math.round((anchor - oldest) / DAY)} days`,
  };
  const payslipMonths = new Set(
    b.documents.filter((d) => d.category === "payslip").map((d) => d.title),
  ).size;
  const documents: Span = {
    months: Math.max(1, payslipMonths),
    over: `${payslipMonths} months of payslips, the procedure with them`,
  };
  return {
    time_entries: hours,
    time_breaks: hours,
    audit_log: hours,
    shift_assignments: weeks,
    schedule_shifts: weeks,
    chat_messages: chat,
    documents,
    document_recipients: documents,
  };
}

/**
 * The seed's lines the app would still hold at the anchor, the backlog of
 * hours waiting left out: private.clean_notifications deletes a line after
 * 180 days, and a read one after 90.
 */
export function linesHeld(s: Shape): number {
  const b = s.scale;
  const anchor = Date.parse(s.anchor);
  const kept = (user: string, at: string) => {
    const age = anchor - Date.parse(at);
    return (
      age < 180 * DAY && !(age >= 90 * DAY && seedReads(user, at, s.weekStart))
    );
  };
  let held = thisWeekLines(b, s.anchor);
  for (const line of b.joined)
    for (const user of line.recipients) if (kept(user, line.at)) held += 1;
  for (const line of b.published) if (kept(line.user, line.at)) held += 1;
  return held;
}

export function costOf(
  s: Shape,
  report: SeedReport,
  sizes: TableSize[],
  databaseBytes: DatabaseBytes,
): Cost {
  const share = (table: string, rows: number) => {
    const size = sizes.find((t) => t.table === table);
    return size && size.rows > 0 ? (size.bytes * rows) / size.rows : 0;
  };
  const spans = spansOf(s);
  const tables = GROWING.map(([table, key]) => {
    const businessRows = report.counts.scale[key] ?? 0;
    const span = spans[table];
    return {
      table,
      businessRows,
      months: span.months,
      over: span.over,
      mbAMonth: round(share(table, businessRows) / MB / span.months, 2),
    };
  });
  const heldRows = linesHeld(s);
  const notifications = {
    businessRows: report.counts.scale.lines ?? 0,
    backlogRows: report.counts.scale.lines_confirm ?? 0,
    heldRows,
    heldMb: round(share("notifications", heldRows) / MB, 2),
    over: "held under the app's cleaning (180 days, read ones 90), the waiting hours' clock.confirm lines left out",
  };
  const payslipKb = 150;
  const payslips = s.scale.people.filter(
    (p) => p.kind === "staff" && p.role !== "owner",
  ).length;
  const storageMbAMonth = (payslips * payslipKb) / 1024;
  const picturesADay = 20;
  const pictureKb = 300;
  const chatMbADay = (picturesADay * pictureKb) / 1024;
  const spanWords = tables
    .map((t) => `${t.table} over ${t.months} months (${t.over})`)
    .join("; ");
  return {
    databaseMbAMonth: round(
      tables.reduce((sum, t) => sum + t.mbAMonth, 0),
      2,
    ),
    tables,
    notifications,
    databaseBytes,
    databaseGrownMb: round((databaseBytes.after - databaseBytes.before) / MB),
    payslipKb,
    storageMbAMonth: round(storageMbAMonth),
    monthsUntilFull: {
      mb50: round(50 / storageMbAMonth),
      mb200: round(200 / storageMbAMonth),
    },
    chat: {
      picturesADay,
      pictureKb,
      daysKept: {
        mb100: round(100 / chatMbADay),
        mb200: round(200 / chatMbADay),
      },
    },
    label: `Arithmetic from the seed's counts at ${s.size} people, not a measurement: the database's share of each growing table by the business's rows, divided by the months those rows cover (${spanWords}); the bell's lines as held, not a month's growth (${notifications.over}); payslips at ${payslipKb} KB, and an assumed ${picturesADay} pictures a day of ${pictureKb} KB in the chat.`,
  };
}

/** The whole database's size on disk, read before the seed and after it. */
export async function databaseBytesOf(
  tx: postgres.TransactionSql | postgres.Sql,
): Promise<number> {
  const [database] = await tx<{ bytes: string }[]>`
    select pg_database_size(current_database())::text as bytes`;
  return Number(database?.bytes ?? 0);
}

/** Each growing table's rows and size on disk, and the bell's. */
export async function sizesOf(
  tx: postgres.TransactionSql | postgres.Sql,
): Promise<TableSize[]> {
  const sizes: TableSize[] = [];
  for (const table of SIZED) {
    const [row] = await tx.unsafe<{ rows: string; bytes: string }[]>(
      `select (select count(*) from public.${table})::text as rows,
        pg_total_relation_size('public.${table}')::text as bytes`,
    );
    sizes.push({
      table,
      rows: Number(row?.rows ?? 0),
      bytes: Number(row?.bytes ?? 0),
    });
  }
  return sizes;
}
