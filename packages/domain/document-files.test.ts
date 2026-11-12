import { describe, expect, it } from "vitest";
import {
  DEMO_DOCUMENT_CATEGORIES,
  DOCUMENT_SAMPLE_FILES,
  documentFileRequest,
  documentSampleKind,
  documentSampleOf,
  documentSrc,
  downloadsDocuments,
  opensDocument,
} from "./document-files";
import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_CATEGORY_KEYS,
  DOCUMENT_SAMPLES,
  documentFileSrc,
} from "./documents";

const BUSINESS = "10000000-0000-4000-b000-000000000001";
const DOCUMENT = "30000000-0000-4000-a000-000000000001";
const KEY = "0123456789abcdef0123456789abcdef";

describe("a demo's samples", () => {
  it("are one file each, a PDF or a WebP, for the database's samples", () => {
    expect(Object.keys(DOCUMENT_SAMPLE_FILES).sort()).toEqual(
      [...DOCUMENT_SAMPLES].sort(),
    );
    expect(documentSampleKind("sick_note")).toBe("image");
    expect(documentSampleKind("payslip")).toBe("pdf");
    expect(documentSampleKind("procedure")).toBe("pdf");
  });

  it("go each way only for a category that has one, of its own", () => {
    for (const direction of ["from_person", "to_people"] as const) {
      for (const category of DEMO_DOCUMENT_CATEGORIES[direction]) {
        expect(DOCUMENT_CATEGORIES[direction]).toContain(category);
        expect(documentSampleOf(category)).toBe(category);
      }
    }
    const without = DOCUMENT_CATEGORY_KEYS.filter(
      (category) => documentSampleOf(category) === null,
    );
    expect(without).toEqual(["contract", "form", "other"]);
  });
});

describe("a document's address", () => {
  it("is the route by its id, in its business", () => {
    expect(documentSrc(BUSINESS, DOCUMENT.toUpperCase())).toBe(
      `/document-files/${BUSINESS}/${DOCUMENT}`,
    );
  });

  it("is read as a document by its id, or a stored file by its name", () => {
    expect(documentFileRequest(BUSINESS, DOCUMENT)).toEqual({
      kind: "document",
      businessId: BUSINESS,
      documentId: DOCUMENT,
    });
    expect(documentFileRequest(BUSINESS, `${KEY}.pdf`)).toEqual({
      kind: "file",
      businessId: BUSINESS,
      path: `${BUSINESS}/${KEY}.pdf`,
    });
    // C6's own address for a stored file is read the same way.
    const src = documentFileSrc(`${BUSINESS}/${KEY}.webp`);
    const [, , business = "", file = ""] = (src ?? "").split("/");
    expect(documentFileRequest(business, file)?.kind).toBe("file");
  });

  it("is nothing in any other shape", () => {
    for (const [business, file] of [
      [BUSINESS.toUpperCase(), DOCUMENT],
      [BUSINESS, DOCUMENT.toUpperCase()],
      [BUSINESS, `${KEY}.PDF`],
      [BUSINESS, `${KEY}.svg`],
      [BUSINESS, `${KEY.slice(1)}.pdf`],
      [BUSINESS, "..%2Fadmin"],
      ["all", DOCUMENT],
      ["download", "x"],
      [BUSINESS, ""],
    ] as const) {
      expect(documentFileRequest(business, file), `${business}/${file}`).toBe(
        null,
      );
    }
  });
});

describe("opening a document", () => {
  const ask = (
    secFetchSite: string | null,
    more: { purpose?: string; nextPrefetch?: boolean } = {},
  ) =>
    opensDocument({
      secFetchSite,
      purpose: more.purpose ?? null,
      nextPrefetch: more.nextPrefetch ?? false,
    });

  it("answers the app's own pages and an address typed in", () => {
    expect(ask("same-origin")).toBe(true);
    expect(ask("none")).toBe(true);
  });

  it("answers no other site, no browser that says nothing, and no prefetch", () => {
    expect(ask("cross-site")).toBe(false);
    expect(ask("same-site")).toBe(false);
    expect(ask(null)).toBe(false);
    expect(ask("same-origin", { purpose: "prefetch" })).toBe(false);
    expect(ask("same-origin", { purpose: "prefetch;prerender" })).toBe(false);
    expect(ask("same-origin", { nextPrefetch: true })).toBe(false);
  });
});

describe("a download of many documents", () => {
  const OWN = "https://app.conceptapp.test";
  const ask = (
    more: Partial<{
      method: string;
      secFetchSite: string | null;
      origin: string | null;
    }> = {},
  ) =>
    downloadsDocuments(
      {
        method: "POST",
        secFetchSite: "same-origin",
        origin: OWN,
        ...more,
      },
      OWN,
    );

  it("answers only the page's own form", () => {
    expect(ask()).toBe(true);
  });

  it("answers no link: not one followed in the app, from outside the browser, or from another site", () => {
    // A link in a chat message is a GET from the app's own page.
    expect(ask({ method: "GET" })).toBe(false);
    expect(ask({ method: "HEAD" })).toBe(false);
    // From WhatsApp or an email, or typed: `none`.
    expect(ask({ secFetchSite: "none" })).toBe(false);
    expect(ask({ secFetchSite: "cross-site" })).toBe(false);
    expect(ask({ secFetchSite: "same-site" })).toBe(false);
    expect(ask({ secFetchSite: null })).toBe(false);
    // Another site's form, or a browser that names no origin.
    expect(ask({ origin: "https://evil.test" })).toBe(false);
    expect(ask({ origin: `${OWN}.evil.test` })).toBe(false);
    expect(ask({ origin: null })).toBe(false);
    expect(ask({ origin: "null" })).toBe(false);
  });
});
