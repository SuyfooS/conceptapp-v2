import { randomBytes } from "node:crypto";
import { crc32 as nodeCrc32 } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import { unzip } from "@/e2e/unzip";

vi.mock("server-only", () => ({}));

const { crc32, dosDateTime, zip } = await import("./zip");

const bytes = (text: string) => new TextEncoder().encode(text);

describe("crc32", () => {
  it("gives the check value of the standard", () => {
    // The CRC-32 of "123456789" (IEEE 802.3, the value every implementation lists).
    expect(crc32(bytes("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
    expect(crc32(bytes("The quick brown fox jumps over the lazy dog"))).toBe(
      0x414fa339,
    );
  });

  it("agrees with node:zlib's on any bytes", () => {
    for (const length of [1, 7, 256, 4096, 65_537]) {
      const data = randomBytes(length);
      expect(crc32(data)).toBe(nodeCrc32(data) >>> 0);
    }
  });
});

describe("dosDateTime", () => {
  it("keeps the day and the time to two seconds", () => {
    const { time, date } = dosDateTime(
      new Date(Date.UTC(2026, 9, 13, 8, 36, 59)),
    );
    expect(date >> 9).toBe(2026 - 1980);
    expect((date >> 5) & 0xf).toBe(10);
    expect(date & 0x1f).toBe(13);
    expect(time >> 11).toBe(8);
    expect((time >> 5) & 0x3f).toBe(36);
    expect((time & 0x1f) * 2).toBe(58);
  });

  it("holds a day before 1980 at 1980", () => {
    expect(dosDateTime(new Date(Date.UTC(1970, 0, 1))).date >> 9).toBe(0);
  });
});

describe("zip", () => {
  const entries = [
    { path: "[Content_Types].xml", data: bytes("<Types/>") },
    { path: "xl/worksheets/sheet1.xml", data: bytes("שעות לשכר ".repeat(500)) },
    { path: "empty.txt", data: new Uint8Array() },
    { path: "random.bin", data: new Uint8Array(randomBytes(10_000)) },
  ];

  it("reads back with another reader: every entry, its bytes and its CRC-32", () => {
    const read = unzip(zip(entries));
    expect([...read.keys()]).toEqual(entries.map((entry) => entry.path));
    for (const entry of entries) {
      const found = read.get(entry.path);
      expect(found?.data.equals(Buffer.from(entry.data)), entry.path).toBe(
        true,
      );
      expect(found?.method).toBe(8);
      expect(found?.crc).toBe(crc32(entry.data));
      // UTF-8 names.
      expect((found?.flags ?? 0) & 0x0800).toBe(0x0800);
    }
  });

  it("deflates: repeated text takes far less room", () => {
    const archive = zip([entries[1] ?? { path: "x", data: new Uint8Array() }]);
    expect(archive.length).toBeLessThan(500);
  });

  it("gives the same bytes for the same entries", () => {
    expect(Buffer.from(zip(entries)).equals(Buffer.from(zip(entries)))).toBe(
      true,
    );
  });

  it("ends with the directory's record: entries, size and where it starts", () => {
    const archive = Buffer.from(zip(entries));
    const end = archive.length - 22;
    expect(archive.readUInt32LE(end)).toBe(0x06054b50);
    expect(archive.readUInt16LE(end + 8)).toBe(entries.length);
    expect(archive.readUInt16LE(end + 10)).toBe(entries.length);
    const size = archive.readUInt32LE(end + 12);
    const start = archive.readUInt32LE(end + 16);
    expect(start + size).toBe(end);
    expect(archive.readUInt32LE(start)).toBe(0x02014b50);
    // The archive starts with the first local header.
    expect(archive.readUInt32LE(0)).toBe(0x04034b50);
  });

  it("refuses a path twice", () => {
    expect(() =>
      zip([
        { path: "a.xml", data: bytes("1") },
        { path: "a.xml", data: bytes("2") },
      ]),
    ).toThrow(/Twice/);
  });
});
