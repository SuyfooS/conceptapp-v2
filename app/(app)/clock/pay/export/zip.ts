import "server-only";
import { deflateRawSync } from "node:zlib";

/*
 * A small ZIP writer, for the XLSX file for payroll (payroll P8): the parts of
 * PKWARE's APPNOTE an XLSX needs. Each entry is a local header and its bytes,
 * deflated by node:zlib; then the central directory and its end record. No
 * ZIP64, no encryption and no data descriptors: every size is known before
 * its header is written. Server code only, written here rather than taken
 * from a package (no new dependency for one file).
 */

/** The CRC-32 table (IEEE 802.3, the reversed polynomial 0xEDB88320). */
const TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

/** The CRC-32 of some bytes, as ZIP keeps it: "123456789" is 0xCBF43926. */
export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = (TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** One file in the archive: its path inside it (`/` between folders) and its bytes. */
export type ZipEntry = { path: string; data: Uint8Array };

/**
 * An instant as MS-DOS keeps it, by its UTC fields (a ZIP has no time zone),
 * to two seconds, between 1980 and 2107.
 */
export function dosDateTime(at: Date): { time: number; date: number } {
  const year = Math.min(Math.max(at.getUTCFullYear(), 1980), 2107);
  return {
    time:
      (at.getUTCHours() << 11) |
      (at.getUTCMinutes() << 5) |
      Math.floor(at.getUTCSeconds() / 2),
    date:
      ((year - 1980) << 9) | ((at.getUTCMonth() + 1) << 5) | at.getUTCDate(),
  };
}

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_DIRECTORY = 0x06054b50;
/** Version 2.0: deflate, what every unzipper reads. */
const VERSION = 20;
/** Bit 11: the names are UTF-8. */
const UTF8_NAMES = 0x0800;
const DEFLATE = 8;
const MAX_32 = 0xffffffff;
const MAX_16 = 0xffff;

/**
 * The archive of `entries`, in their order, each deflated. Paths must be
 * unique. `modified` is every entry's time; the default, 1 January 1980,
 * makes the same entries give the same bytes.
 */
export function zip(
  entries: readonly ZipEntry[],
  modified: Date = new Date(Date.UTC(1980, 0, 1)),
): Uint8Array<ArrayBuffer> {
  if (entries.length > MAX_16) {
    throw new Error("Too many entries for a ZIP without ZIP64");
  }
  const { time, date } = dosDateTime(modified);
  const parts: Uint8Array[] = [];
  const directory: Uint8Array[] = [];
  const seen = new Set<string>();
  let offset = 0;

  for (const entry of entries) {
    if (seen.has(entry.path))
      throw new Error(`Twice in the ZIP: ${entry.path}`);
    seen.add(entry.path);
    const name = Buffer.from(entry.path, "utf8");
    if (name.length > MAX_16) throw new Error("A ZIP entry's name is too long");
    const compressed = deflateRawSync(entry.data);
    const crc = crc32(entry.data);
    if (
      entry.data.length > MAX_32 ||
      compressed.length > MAX_32 ||
      offset > MAX_32
    ) {
      throw new Error("Too large for a ZIP without ZIP64");
    }

    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL_HEADER, 0);
    local.writeUInt16LE(VERSION, 4);
    local.writeUInt16LE(UTF8_NAMES, 6);
    local.writeUInt16LE(DEFLATE, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28); // no extra field
    parts.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(CENTRAL_HEADER, 0);
    central.writeUInt16LE(VERSION, 4); // made by MS-DOS (0), version 2.0
    central.writeUInt16LE(VERSION, 6);
    central.writeUInt16LE(UTF8_NAMES, 8);
    central.writeUInt16LE(DEFLATE, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30); // no extra field
    central.writeUInt16LE(0, 32); // no comment
    central.writeUInt16LE(0, 34); // disk 0
    central.writeUInt16LE(0, 36); // internal attributes
    central.writeUInt32LE(0, 38); // external attributes
    central.writeUInt32LE(offset, 42);
    directory.push(central, name);

    offset += local.length + name.length + compressed.length;
  }

  const directorySize = directory.reduce((sum, part) => sum + part.length, 0);
  if (offset > MAX_32 || directorySize > MAX_32) {
    throw new Error("Too large for a ZIP without ZIP64");
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(END_OF_DIRECTORY, 0);
  end.writeUInt16LE(0, 4); // this disk
  end.writeUInt16LE(0, 6); // the directory's disk
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directorySize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20); // no comment

  const all = [...parts, ...directory, end];
  const bytes = new Uint8Array(all.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of all) {
    bytes.set(part, at);
    at += part.length;
  }
  return bytes;
}
