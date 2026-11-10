import "server-only";
import type { PayrollMonth } from "@domain/payroll";
import {
  attachmentHeader,
  type ExportMeta,
  type ExportPerson,
  exportFileName,
  exportSheets,
} from "@domain/payroll-export";
import type { AppWording } from "../../../wording";
import { exportWords, fileTitle } from "./export-words";
import { XLSX_TYPE, xlsxFile } from "./xlsx";

/** A month's file for payroll, built and ready to go out. */
export type PayrollFile = {
  bytes: Uint8Array<ArrayBuffer>;
  /** Its name in plain ASCII, and in words. */
  fileName: string;
  title: string;
  /** What the log keeps of it. */
  people: number;
  shifts: number;
  engineVersion: string;
};

/**
 * The month's file (payroll P8): the four sheets in the business's words,
 * written as XLSX. The month's amounts are never read (`exportSheets`), so
 * it is the same with the estimate on or off. Shared by the app and the demo.
 */
export function payrollFileOf(args: {
  month: PayrollMonth;
  people: readonly ExportPerson[];
  meta: ExportMeta;
  slug: string;
  wording: AppWording;
  /** When it was made, for the ZIP's own times. */
  now: Date;
}): PayrollFile {
  const { month, people, meta, slug, wording, now } = args;
  const built = exportSheets(month, people, meta, exportWords(wording));
  return {
    bytes: xlsxFile(built.sheets, now),
    fileName: exportFileName(slug, meta.month),
    title: `${fileTitle(wording, meta.business, meta.month)}.xlsx`,
    people: built.people,
    shifts: built.shifts,
    engineVersion: month.engineVersion,
  };
}

/** Never kept by a cache on the way, nor read as anything but a download. */
const PRIVATE = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
} as const;

/** The file as a download: its type, its name in ASCII and in UTF-8, kept by nobody on the way. */
export function fileResponse(file: PayrollFile): Response {
  return new Response(file.bytes, {
    status: 200,
    headers: {
      ...PRIVATE,
      "Content-Type": XLSX_TYPE,
      "Content-Length": String(file.bytes.byteLength),
      "Content-Disposition": attachmentHeader(file.fileName, file.title),
    },
  });
}

/** Nothing for this person, or no such month: the same answer either way. */
export function noFile(status: 404 | 500 = 404): Response {
  return new Response(null, { status, headers: PRIVATE });
}

/** A prefetch or a page asking for data, rather than a person taking the file. */
export function isPrefetch(request: Request): boolean {
  const h = request.headers;
  return (
    h.has("next-router-prefetch") ||
    h.has("rsc") ||
    /prefetch/i.test(h.get("sec-purpose") ?? h.get("purpose") ?? "")
  );
}

/**
 * Asked from the app itself, or typed in: never from another site's link,
 * which would write a row to the log (and download a file) for whoever
 * follows it.
 */
export function ownRequest(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  return site === null || site === "same-origin" || site === "none";
}
