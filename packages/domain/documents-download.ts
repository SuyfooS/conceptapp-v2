import { isUuid } from "./activity";
import { cleanFileName } from "./chat-files";
import { escapeCellText } from "./payroll-export";

/*
 * "הורדת כל המסמכים" (chat C7; Orel, 11 November 2026): the free plan keeps
 * no backup, so the office downloads a person's documents, or a month's, as
 * one ZIP: every file still kept, and a list of all of them (removed ones
 * too, with why), which a spreadsheet opens. Each file in it is an opening of
 * its document (public.open_document logs it), so it is asked for by the
 * page's own form (a POST), never by a link. Pure parts here; the route is
 * app/document-files/download/route.ts.
 */

/**
 * Documents one download holds at most: every one a business keeps, as far
 * as its space for documents goes (200 MB at most, a few thousand files), and
 * well inside a ZIP's 65535 entries. Past it the list says what was left out.
 */
export const DOCUMENTS_DOWNLOAD_MAX = 5000;

/** Where the page's form sends a download (a POST, with `documentsDownloadFields`). */
export const DOCUMENTS_DOWNLOAD_PATH = "/document-files/download";

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** Whether `value` is a month as `YYYY-MM`, between 2020 and 2100. */
export function isMonth(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = MONTH.exec(value);
  const year = Number(match?.[1]);
  return match !== null && year >= 2020 && year <= 2100;
}

/** What a download is of: one person's documents, or a month's. */
export type DocumentsDownload = { person: string } | { month: string };

/**
 * The download asked for, from the form's fields: `person=<id>` or
 * `month=YYYY-MM`, exactly one, and nothing else. Null for anything else.
 */
export function documentsDownloadOf(
  params: URLSearchParams,
): DocumentsDownload | null {
  const keys = [...params.keys()];
  if (keys.length !== 1) return null;
  const person = params.get("person");
  if (keys[0] === "person" && isUuid(person)) {
    return { person: person.toLowerCase() };
  }
  const month = params.get("month");
  if (keys[0] === "month" && isMonth(month)) return { month };
  return null;
}

/** The one field the page's form sends for a download (`name`, `value`). */
export function documentsDownloadField(download: DocumentsDownload): {
  name: "person" | "month";
  value: string;
} {
  return "person" in download
    ? { name: "person", value: download.person }
    : { name: "month", value: download.month };
}

/** Characters no file name may hold on the systems a download lands on. */
const NOT_IN_NAMES = /[<>:"/\\|?*]/g;

/**
 * A file's name inside the archive: its number in the list (so no two are the
 * same, and they sort as the list does), then its words (the day it was
 * sent, its category, its title), without what a file system refuses, the
 * marks that turn text around or control characters, at most 120 characters
 * with its extension.
 */
export function downloadEntryName(
  index: number,
  words: readonly string[],
  extension: "pdf" | "jpg" | "webp",
): string {
  const number = String(index).padStart(3, "0");
  const text = words.join(" - ").replace(NOT_IN_NAMES, " ");
  const name = cleanFileName(`${number} ${text}.${extension}`);
  return name ?? `${number}.${extension}`;
}

/**
 * The archive's name for browsers that take no UTF-8 one: ASCII letters,
 * digits and dashes from the business's address, at most 64 characters in
 * all (`contentDisposition`'s fallback).
 */
export function downloadAsciiName(
  slug: string,
  download: DocumentsDownload,
): string {
  const safe =
    slug
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 30)
      .replace(/^-+|-+$/g, "") || "business";
  return "month" in download
    ? `documents-${safe}-${download.month}.zip`
    : `documents-${safe}-person.zip`;
}

/** The archive's name in words, as the person sees it saved. */
export function downloadName(words: string): string {
  return (
    cleanFileName(`${words.replace(NOT_IN_NAMES, " ")}.zip`) ?? "documents.zip"
  );
}

/** The list's name inside the archive, in words. */
export function downloadListName(words: string): string {
  return (
    cleanFileName(`${words.replace(NOT_IN_NAMES, " ")}.csv`) ?? "documents.csv"
  );
}

/** The byte order mark, which tells a spreadsheet the text is UTF-8. */
const BOM = String.fromCharCode(0xfeff);

/** A field as CSV writes it: quoted, quotes doubled, a formula's start defused. */
function csvField(value: string): string {
  const flat = value.replace(/\r\n?|\n/g, " ");
  return `"${escapeCellText(flat).replace(/"/g, '""')}"`;
}

/**
 * The list as CSV (RFC 4180): UTF-8 with a byte order mark, so a spreadsheet
 * reads Hebrew right; lines ended CRLF; every field quoted, its quotes
 * doubled, its line breaks made spaces, and text that would start a formula
 * given a leading apostrophe (what a title typed by anyone could carry).
 */
export function csvOf(rows: readonly (readonly string[])[]): Uint8Array {
  const text = rows.map((row) => row.map(csvField).join(",")).join("\r\n");
  return new TextEncoder().encode(`${BOM}${text}\r\n`);
}
