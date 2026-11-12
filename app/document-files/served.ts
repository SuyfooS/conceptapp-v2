import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { isPdf } from "@domain/chat-files";
import {
  DOCUMENT_SAMPLE_FILES,
  DOCUMENT_SAMPLE_FOLDER,
  DOCUMENT_SAMPLE_MAX_BYTES,
  opensDocument,
} from "@domain/document-files";
import type { DocumentSample } from "@domain/documents";
import { sniffPhotoType } from "@domain/profile-photos";
import { FILE_CONTENT_POLICY } from "@domain/security-headers";

/*
 * What the routes that serve documents (chat C7, /document-files) share: the
 * headers of an untrusted file, the one answer for nothing, the check that
 * the request is the app's own, and a demo's samples read from
 * public/demo-documents/ (next.config.ts traces them into these routes).
 */

/**
 * Every answer here: kept by nobody (a sick note shouldn't stay on a shared
 * work phone, plan §6.3), read only as what it says it is, and, should a
 * browser choose to render it, running no script, loading nothing, in no
 * frame and embedded by no other site (`FILE_HEADERS`, also set by
 * next.config.ts for these paths).
 */
export const DOCUMENT_FILE_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": FILE_CONTENT_POLICY,
  "Cross-Origin-Resource-Policy": "same-origin",
} as const;

/**
 * Nothing here for this person: the same answer whether the document exists
 * or not, whether it is theirs or not, and whether the request may open it.
 */
export function missing(): Response {
  return new Response(null, { status: 404, headers: DOCUMENT_FILE_HEADERS });
}

/** A read that failed, logged by its code alone: never a document's name or path. */
export function failed(error: unknown): Response {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code: unknown }).code)
      : "without a code";
  console.error("a document's file could not be read", code);
  return missing();
}

/**
 * Whether this request may open a document (`opensDocument`): the app's own
 * page asked (or the person typed the address), and no prefetch.
 */
export function mayOpen(request: Request): boolean {
  const h = request.headers;
  return opensDocument({
    secFetchSite: h.get("sec-fetch-site"),
    purpose: h.get("sec-purpose") ?? h.get("purpose"),
    nextPrefetch: h.has("next-router-prefetch") || h.has("rsc"),
  });
}

/**
 * A demo's sample, read from the app's own files and checked by its bytes as
 * an uploaded file would be: a PDF's start, or a WebP's. Null when it can't
 * be read or isn't what it should be.
 */
export async function readSample(sample: DocumentSample): Promise<{
  bytes: Uint8Array<ArrayBuffer>;
  kind: "image" | "pdf";
  type: "application/pdf" | "image/webp";
} | null> {
  const { file, kind, type } = DOCUMENT_SAMPLE_FILES[sample];
  let read: Buffer;
  try {
    read = await readFile(
      join(process.cwd(), "public", DOCUMENT_SAMPLE_FOLDER, file),
    );
  } catch (error) {
    console.error(
      "a demo document's sample could not be read",
      (error as { code?: string } | null)?.code ?? "without a code",
    );
    return null;
  }
  if (read.length === 0 || read.length > DOCUMENT_SAMPLE_MAX_BYTES) return null;
  const bytes = new Uint8Array(read);
  const right = kind === "pdf" ? isPdf(bytes) : sniffPhotoType(bytes) === type;
  return right ? { bytes, kind, type } : null;
}

/** HEAD would run GET's opening (and its log line) for nothing: only GET opens. */
export function onlyGet(): Response {
  return new Response(null, {
    status: 405,
    headers: { ...DOCUMENT_FILE_HEADERS, Allow: "GET" },
  });
}

/**
 * A download of many documents answers only its page's form (a POST): a link
 * (GET) or HEAD opens nothing.
 */
export function onlyPost(): Response {
  return new Response(null, {
    status: 405,
    headers: { ...DOCUMENT_FILE_HEADERS, Allow: "POST" },
  });
}
