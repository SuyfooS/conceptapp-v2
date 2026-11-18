import { describe, expect, it } from "vitest";
import { documentsPaths, documentsPathsAt } from "./documents-paths";

const ID = "10000000-0000-4000-a000-000000000001";

describe("the documents' addresses", () => {
  it("leads to the app's screens, and downloads from its route", () => {
    expect(documentsPaths.list).toBe("/chat/documents");
    expect(documentsPaths.document(ID)).toBe(`/chat/documents/${ID}`);
    expect(documentsPaths.sent(ID)).toBe(`/chat/documents/${ID}?sent=1`);
    expect(documentsPaths.person(ID)).toBe(`/chat/documents?person=${ID}`);
    expect(documentsPaths.send("business")).toBe(
      "/chat/documents/send?to=business",
    );
    // A form posts there, its one field in the body, never in the address.
    expect(documentsPaths.download).toBe("/document-files/download");
  });

  it("stays inside the design demo, where nothing downloads", () => {
    const demo = documentsPathsAt("/design/chat/documents");
    expect(demo.document("sick-note")).toBe("/design/chat/documents/sick-note");
    expect(demo.send("people")).toBe("/design/chat/documents/send?to=people");
    expect(demo.download).toBeNull();
  });
});
