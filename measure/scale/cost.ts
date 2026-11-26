import type postgres from "postgres";
import type { SeedReport } from "./seed";
import type { Shape } from "./shape";

/**
 * The cost of a business per month (the plan's 2.5): arithmetic from the
 * seed's counts, labelled as such. The database part is each growing
 * table's size shared out by the business's rows in it, over the months of
 * history; what is made once (people, settings, the first index pages) is
 * left out of the division. Storage is the payslips at the review's 150 KB
 * each, and the chat's files at a rate stated here, not measured.
 */

/** Tables that grow every month, with the count each is read from. */
export const GROWING = [
  ["time_entries", "entries"],
  ["time_breaks", "breaks"],
  ["audit_log", "log"],
  ["notifications", "lines"],
  ["shift_assignments", "assignments"],
  ["schedule_shifts", "shifts"],
  ["chat_messages", "messages"],
  ["documents", "documents"],
  ["document_recipients", "recipients"],
] as const;

export type TableSize = { table: string; rows: number; bytes: number };

export type Cost = {
  /** Megabytes a month, each table's share by the business's rows. */
  databaseMbAMonth: number;
  tables: { table: string; businessRows: number; mbAMonth: number }[];
  databaseBytes: number;
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
const round = (n: number, places = 1) =>
  Math.round(n * 10 ** places) / 10 ** places;

export function costOf(
  s: Shape,
  report: SeedReport,
  sizes: TableSize[],
  databaseBytes: number,
): Cost {
  const months = Math.max(1, s.months);
  const tables = GROWING.map(([table, key]) => {
    const size = sizes.find((t) => t.table === table);
    const businessRows = report.counts.scale[key] ?? 0;
    const share = size && size.rows > 0 ? businessRows / size.rows : 0;
    return {
      table,
      businessRows,
      mbAMonth: round(((size?.bytes ?? 0) * share) / MB / months, 2),
    };
  });
  const payslipKb = 150;
  const payslips = s.scale.people.filter(
    (p) => p.kind === "staff" && p.role !== "owner",
  ).length;
  const storageMbAMonth = (payslips * payslipKb) / 1024;
  const picturesADay = 20;
  const pictureKb = 300;
  const chatMbADay = (picturesADay * pictureKb) / 1024;
  return {
    databaseMbAMonth: round(
      tables.reduce((sum, t) => sum + t.mbAMonth, 0),
      2,
    ),
    tables,
    databaseBytes,
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
    label: `Arithmetic from the seed's counts at ${s.size} people over ${months} months, not a measurement: the database's share of each growing table, payslips at ${payslipKb} KB, and an assumed ${picturesADay} pictures a day of ${pictureKb} KB in the chat.`,
  };
}

/** Each growing table's rows and size on disk, and the database's. */
export async function sizesOf(
  tx: postgres.TransactionSql | postgres.Sql,
): Promise<{ sizes: TableSize[]; databaseBytes: number }> {
  const sizes: TableSize[] = [];
  for (const [table] of GROWING) {
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
  const [database] = await tx<{ bytes: string }[]>`
    select pg_database_size(current_database())::text as bytes`;
  return { sizes, databaseBytes: Number(database?.bytes ?? 0) };
}
