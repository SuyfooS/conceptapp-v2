import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { unzip } from "@/e2e/unzip";

vi.mock("server-only", () => ({}));

const { StoredZip, storedZip } = await import("./stored-zip");

const bytes = (text: string) => new TextEncoder().encode(text);

describe("a stored ZIP", () => {
  it("is read back by an unzipper, each file whole and checked by its CRC-32", () => {
    const pdf = randomBytes(70_000);
    const photo = randomBytes(3_000);
    const bom = String.fromCharCode(0xfeff);
    const list = bytes(`${bom}"מספר","שם"${String.fromCharCode(13, 10)}`);
    const entries = unzip(
      storedZip([
        { path: "001 2026-11-10 אישור מחלה.pdf", data: pdf },
        { path: "002 2026-11-11 טופס.webp", data: photo },
        { path: "רשימת המסמכים.csv", data: list },
      ]),
    );
    expect([...entries.keys()]).toEqual([
      "001 2026-11-10 אישור מחלה.pdf",
      "002 2026-11-11 טופס.webp",
      "רשימת המסמכים.csv",
    ]);
    expect(entries.get("001 2026-11-10 אישור מחלה.pdf")?.data).toEqual(pdf);
    expect(entries.get("002 2026-11-11 טופס.webp")?.data).toEqual(photo);
    expect(entries.get("רשימת המסמכים.csv")?.data).toEqual(Buffer.from(list));
    for (const entry of entries.values()) {
      // Stored as they are, with UTF-8 names.
      expect(entry.method).toBe(0);
      expect(entry.flags & 0x0800).toBe(0x0800);
    }
  });

  it("gives the same bytes in parts as at once, so the route can stream it", () => {
    const files = [
      { path: "a.pdf", data: randomBytes(1234) },
      { path: "b.jpg", data: randomBytes(10) },
    ];
    const at = new Date(Date.UTC(2026, 10, 12, 9, 30));
    const zip = new StoredZip(at);
    const parts = [
      ...files.flatMap((file) => zip.entry(file.path, file.data)),
      ...zip.end(),
    ];
    expect(Buffer.concat(parts)).toEqual(Buffer.from(storedZip(files, at)));
  });

  it("holds an empty archive, and refuses a name twice or anything after its end", () => {
    expect(unzip(storedZip([])).size).toBe(0);
    const zip = new StoredZip(new Date());
    zip.entry("a.pdf", bytes("a"));
    expect(() => zip.entry("a.pdf", bytes("b"))).toThrow(/Twice/);
    expect(() => zip.entry("", bytes("b"))).toThrow(/empty/);
    zip.end();
    expect(() => zip.entry("b.pdf", bytes("b"))).toThrow(/closed/);
    expect(() => zip.end()).toThrow(/closed/);
  });
});
