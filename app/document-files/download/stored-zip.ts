import "server-only";
import { crc32, dosDateTime } from "../../(app)/clock/pay/export/zip";

/*
 * A ZIP written as it goes, for "הורדת כל המסמכים" (chat C7): each file is
 * stored as it is (method 0, no compression: a PDF or a photo is compressed
 * already), its local header and bytes handed out as soon as it is added, so
 * the route streams the archive and holds one file at a time (at most 10 MiB),
 * never the whole of it. Then the central directory and its end record. No
 * ZIP64, no encryption and no data descriptors: each file is whole before its
 * header is written, so its size and CRC-32 are known. The CRC-32 and the
 * MS-DOS time are the payroll file's writer's (app/(app)/clock/pay/export/zip.ts).
 */

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_DIRECTORY = 0x06054b50;
/** Version 1.0: stored files, what every unzipper reads. */
const VERSION = 10;
/** Bit 11: the names are UTF-8. */
const UTF8_NAMES = 0x0800;
const STORED = 0;
const MAX_32 = 0xffffffff;
const MAX_16 = 0xffff;

export class StoredZip {
  readonly #time: number;
  readonly #date: number;
  readonly #directory: Uint8Array[] = [];
  readonly #names = new Set<string>();
  #offset = 0;
  #count = 0;
  #ended = false;

  /** `modified` is every entry's time (UTC, as a ZIP has no time zone). */
  constructor(modified: Date) {
    const { time, date } = dosDateTime(modified);
    this.#time = time;
    this.#date = date;
  }

  /**
   * Adds one file (`path` inside the archive, `/` between folders; unique)
   * and gives the bytes that put it there, in order: its local header, its
   * name and its data.
   */
  entry(path: string, data: Uint8Array): Uint8Array[] {
    if (this.#ended) throw new Error("The ZIP is closed");
    if (this.#names.has(path)) throw new Error(`Twice in the ZIP: ${path}`);
    if (this.#count >= MAX_16) {
      throw new Error("Too many entries for a ZIP without ZIP64");
    }
    const name = Buffer.from(path, "utf8");
    if (name.length === 0 || name.length > MAX_16) {
      throw new Error("A ZIP entry's name is empty or too long");
    }
    if (data.length > MAX_32 || this.#offset > MAX_32) {
      throw new Error("Too large for a ZIP without ZIP64");
    }
    this.#names.add(path);
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL_HEADER, 0);
    local.writeUInt16LE(VERSION, 4);
    local.writeUInt16LE(UTF8_NAMES, 6);
    local.writeUInt16LE(STORED, 8);
    local.writeUInt16LE(this.#time, 10);
    local.writeUInt16LE(this.#date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28); // no extra field

    const central = Buffer.alloc(46);
    central.writeUInt32LE(CENTRAL_HEADER, 0);
    central.writeUInt16LE(VERSION, 4); // made by MS-DOS (0), version 1.0
    central.writeUInt16LE(VERSION, 6);
    central.writeUInt16LE(UTF8_NAMES, 8);
    central.writeUInt16LE(STORED, 10);
    central.writeUInt16LE(this.#time, 12);
    central.writeUInt16LE(this.#date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30); // no extra field
    central.writeUInt16LE(0, 32); // no comment
    central.writeUInt16LE(0, 34); // disk 0
    central.writeUInt16LE(0, 36); // internal attributes
    central.writeUInt32LE(0, 38); // external attributes
    central.writeUInt32LE(this.#offset, 42);
    this.#directory.push(central, name);

    this.#offset += local.length + name.length + data.length;
    this.#count += 1;
    return [local, name, data];
  }

  /** Closes the archive: the bytes of its central directory and end record. */
  end(): Uint8Array[] {
    if (this.#ended) throw new Error("The ZIP is closed");
    this.#ended = true;
    const size = this.#directory.reduce((sum, part) => sum + part.length, 0);
    if (this.#offset > MAX_32 || size > MAX_32) {
      throw new Error("Too large for a ZIP without ZIP64");
    }
    const end = Buffer.alloc(22);
    end.writeUInt32LE(END_OF_DIRECTORY, 0);
    end.writeUInt16LE(0, 4); // this disk
    end.writeUInt16LE(0, 6); // the directory's disk
    end.writeUInt16LE(this.#count, 8);
    end.writeUInt16LE(this.#count, 10);
    end.writeUInt32LE(size, 12);
    end.writeUInt32LE(this.#offset, 16);
    end.writeUInt16LE(0, 20); // no comment
    return [...this.#directory, end];
  }
}

/** A whole archive of `entries` at once (for small ones and tests). */
export function storedZip(
  entries: readonly { path: string; data: Uint8Array }[],
  modified: Date = new Date(Date.UTC(1980, 0, 1)),
): Uint8Array<ArrayBuffer> {
  const zip = new StoredZip(modified);
  const parts = [
    ...entries.flatMap((entry) => zip.entry(entry.path, entry.data)),
    ...zip.end(),
  ];
  const bytes = new Uint8Array(
    parts.reduce((sum, part) => sum + part.length, 0),
  );
  let at = 0;
  for (const part of parts) {
    bytes.set(part, at);
    at += part.length;
  }
  return bytes;
}
