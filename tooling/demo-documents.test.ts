import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isPdf } from "@domain/chat-files";
import {
  DOCUMENT_SAMPLE_FILES,
  DOCUMENT_SAMPLE_FOLDER,
  DOCUMENT_SAMPLE_MAX_BYTES,
} from "@domain/document-files";
import { checkDocumentPhoto } from "@domain/documents";
import { describe, expect, it } from "vitest";
import { demoDocuments } from "./demo-documents.mjs";

// The demo's sample documents (chat C7, plan §13): what
// public/demo-documents/ holds is what tooling/demo-documents.mjs makes, byte
// for byte (run it again after changing it), each small, marked as a sample,
// and the kind of file /document-files serves it as: a PDF by its bytes, or a
// photo of a page that checkDocumentPhoto takes, as an uploaded one.
const folder = join(__dirname, "..", "public", DOCUMENT_SAMPLE_FOLDER);
const made = demoDocuments() as Record<string, Uint8Array>;

describe("the demo's sample documents", () => {
  it("are the files the script makes, and no others", () => {
    expect(Object.keys(made).sort()).toEqual(
      Object.values(DOCUMENT_SAMPLE_FILES)
        .map((sample) => sample.file)
        .sort(),
    );
    for (const [name, bytes] of Object.entries(made)) {
      const committed = new Uint8Array(readFileSync(join(folder, name)));
      expect(committed, `${name}: run node tooling/demo-documents.mjs`).toEqual(
        bytes,
      );
    }
  });

  it("are small, and each what it says it is", () => {
    for (const { file, kind, type } of Object.values(DOCUMENT_SAMPLE_FILES)) {
      const bytes = made[file];
      expect(bytes, file).toBeDefined();
      if (!bytes) continue;
      expect(bytes.length, file).toBeLessThanOrEqual(DOCUMENT_SAMPLE_MAX_BYTES);
      if (kind === "pdf") {
        expect(isPdf(bytes), file).toBe(true);
      } else {
        const photo = checkDocumentPhoto({ type, size: bytes.length, bytes });
        expect(photo, file).toEqual({
          ok: true,
          type: "image/webp",
          extension: "webp",
        });
      }
    }
  });

  it("say they are samples, and a PDF's every object is where its table says", () => {
    for (const file of ["payslip.pdf", "procedure.pdf"]) {
      const body = Buffer.from(made[file] ?? []).toString("latin1");
      expect(body, file).toContain("SAMPLE - NOT A REAL DOCUMENT");
      const start = Number(/startxref\n(\d+)/.exec(body)?.[1]);
      expect(body.startsWith("xref", start), file).toBe(true);
      const offsets = [...body.slice(start).matchAll(/^(\d{10}) 00000 n $/gm)];
      expect(offsets.length, file).toBe(7);
      offsets.forEach(([, offset = ""], index) => {
        expect(
          body.startsWith(`${index + 1} 0 obj`, Number(offset)),
          file,
        ).toBe(true);
      });
    }
  });
});
