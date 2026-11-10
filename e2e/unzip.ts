import { crc32, inflateRawSync } from "node:zlib";

/*
 * A small ZIP reader for the tests of the file for payroll (payroll P8): it
 * reads an archive the way an unzipper does, from the end record and the
 * central directory, checks each entry's local header against it, inflates it
 * with node:zlib and checks its CRC-32 with node:zlib's own, so it doesn't
 * share a line with the app's writer. Used by the vitest tests of the writer
 * and by the e2e that downloads the file.
 */

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_DIRECTORY = 0x06054b50;

/** One entry as the central directory has it, with its bytes. */
export type UnzippedEntry = {
  data: Buffer;
  method: number;
  flags: number;
  crc: number;
};

/** Every entry of an archive, by its path, in the directory's order. */
export function unzip(bytes: Uint8Array): Map<string, UnzippedEntry> {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (
    let at = buf.length - 22;
    at >= Math.max(0, buf.length - 22 - 0xffff);
    at -= 1
  ) {
    if (buf.readUInt32LE(at) === END_OF_DIRECTORY) {
      end = at;
      break;
    }
  }
  if (end < 0) throw new Error("Not a ZIP: no end of central directory");
  const count = buf.readUInt16LE(end + 10);
  if (buf.readUInt16LE(end + 8) !== count) {
    throw new Error("The entries on this disk and in all differ");
  }
  const size = buf.readUInt32LE(end + 12);
  let at = buf.readUInt32LE(end + 16);
  if (at + size !== end) {
    throw new Error("The central directory doesn't end where its record says");
  }

  const entries = new Map<string, UnzippedEntry>();
  for (let n = 0; n < count; n += 1) {
    if (buf.readUInt32LE(at) !== CENTRAL_HEADER) {
      throw new Error(`Entry ${n}: not a central directory header`);
    }
    const flags = buf.readUInt16LE(at + 8);
    const method = buf.readUInt16LE(at + 10);
    const crc = buf.readUInt32LE(at + 16);
    const compressedSize = buf.readUInt32LE(at + 20);
    const size = buf.readUInt32LE(at + 24);
    const nameLength = buf.readUInt16LE(at + 28);
    const extraLength = buf.readUInt16LE(at + 30);
    const commentLength = buf.readUInt16LE(at + 32);
    const offset = buf.readUInt32LE(at + 42);
    const name = buf.toString("utf8", at + 46, at + 46 + nameLength);

    if (buf.readUInt32LE(offset) !== LOCAL_HEADER) {
      throw new Error(`${name}: no local header where the directory says`);
    }
    const localName = buf.toString(
      "utf8",
      offset + 30,
      offset + 30 + buf.readUInt16LE(offset + 26),
    );
    if (
      localName !== name ||
      buf.readUInt16LE(offset + 8) !== method ||
      buf.readUInt32LE(offset + 14) !== crc ||
      buf.readUInt32LE(offset + 18) !== compressedSize ||
      buf.readUInt32LE(offset + 22) !== size
    ) {
      throw new Error(`${name}: the local header and the directory differ`);
    }
    const start =
      offset +
      30 +
      buf.readUInt16LE(offset + 26) +
      buf.readUInt16LE(offset + 28);
    const raw = buf.subarray(start, start + compressedSize);
    const data =
      method === 8
        ? inflateRawSync(raw)
        : method === 0
          ? Buffer.from(raw)
          : null;
    if (!data) throw new Error(`${name}: compressed with method ${method}`);
    if (data.length !== size) throw new Error(`${name}: not ${size} bytes`);
    if (crc32(data) >>> 0 !== crc) throw new Error(`${name}: wrong CRC-32`);
    if (entries.has(name)) throw new Error(`${name}: twice in the archive`);
    entries.set(name, { data, method, flags, crc });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/** Each match of an XML element's attributes, as a map. */
function attributesOf(xml: string, element: string): Map<string, string>[] {
  return [...xml.matchAll(new RegExp(`<${element}\\b([^>]*?)/?>`, "g"))].map(
    ([, body = ""]) =>
      new Map(
        [...body.matchAll(/([\w:]+)="([^"]*)"/g)].map(
          ([, key = "", value = ""]) => [key, value],
        ),
      ),
  );
}

/** XML text with its five entities read back. */
export function unescapeXml(value: string): string {
  return value
    .replace(/&#13;/g, "\r")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** A sheet of a workbook: its name, where its XML is, and the XML. */
export type WorkbookSheet = { name: string; path: string; xml: string };

/**
 * A workbook read as Excel opens it: [Content_Types].xml and the package's
 * relationships lead to the workbook, its relationships to each sheet, and
 * every part they name is in the archive with its type. Throws on the first
 * thing that wouldn't open. Gives the sheets in order and the shared strings.
 */
export function readWorkbook(entries: ReadonlyMap<string, UnzippedEntry>): {
  sheets: WorkbookSheet[];
  strings: string[];
} {
  const text = (path: string) => {
    const entry = entries.get(path);
    if (!entry) throw new Error(`Missing part: ${path}`);
    return entry.data.toString("utf8");
  };
  const types = text("[Content_Types].xml");
  const overrides = new Map(
    attributesOf(types, "Override").map((one) => [
      (one.get("PartName") ?? "").replace(/^\//, ""),
      one.get("ContentType") ?? "",
    ]),
  );
  const defaults = new Map(
    attributesOf(types, "Default").map((one) => [
      one.get("Extension") ?? "",
      one.get("ContentType") ?? "",
    ]),
  );
  for (const part of overrides.keys()) {
    if (!entries.has(part)) throw new Error(`Typed but missing: ${part}`);
  }
  for (const path of entries.keys()) {
    const extension = path.split(".").pop() ?? "";
    if (!overrides.has(path) && !defaults.has(extension)) {
      throw new Error(`No content type for ${path}`);
    }
  }

  const relationships = (path: string) =>
    attributesOf(text(path), "Relationship").map((one) => ({
      id: one.get("Id") ?? "",
      type: one.get("Type") ?? "",
      target: one.get("Target") ?? "",
    }));
  const root = relationships("_rels/.rels").find((rel) =>
    rel.type.endsWith("/officeDocument"),
  );
  if (!root) throw new Error("No office document in _rels/.rels");
  const workbookPath = root.target.replace(/^\//, "");
  if (!overrides.get(workbookPath)?.endsWith("sheet.main+xml")) {
    throw new Error("The workbook isn't typed as one");
  }
  const folder = workbookPath.split("/").slice(0, -1).join("/");
  const relsPath = `${folder}/_rels/${workbookPath.split("/").pop()}.rels`;
  const rels = relationships(relsPath);
  for (const rel of rels) {
    if (!entries.has(`${folder}/${rel.target}`)) {
      throw new Error(`Related but missing: ${rel.target}`);
    }
  }
  const workbook = text(workbookPath);
  const sheets = attributesOf(workbook, "sheet").map((one) => {
    const rel = rels.find((candidate) => candidate.id === one.get("r:id"));
    if (!rel?.type.endsWith("/worksheet")) {
      throw new Error(`Sheet ${one.get("name")} has no worksheet`);
    }
    const path = `${folder}/${rel.target}`;
    if (!overrides.get(path)?.endsWith("worksheet+xml")) {
      throw new Error(`${path} isn't typed as a worksheet`);
    }
    return { name: unescapeXml(one.get("name") ?? ""), path, xml: text(path) };
  });
  const stringsRel = rels.find((rel) => rel.type.endsWith("/sharedStrings"));
  const strings = stringsRel
    ? [
        ...text(`${folder}/${stringsRel.target}`).matchAll(
          /<si><t[^>]*>([\s\S]*?)<\/t><\/si>/g,
        ),
      ].map(([, value = ""]) => unescapeXml(value))
    : [];
  return { sheets, strings };
}

/** A sheet's cells, by reference ("A1"): the shared string, or the number as written. */
export function sheetCells(
  xml: string,
  strings: readonly string[],
): Map<string, { value: string; style: number; type: string | null }> {
  const cells = new Map<
    string,
    { value: string; style: number; type: string | null }
  >();
  for (const [, attributes = "", body = ""] of xml.matchAll(
    /<c\b([^>]*)>([\s\S]*?)<\/c>/g,
  )) {
    const ref = /\br="([A-Z]+\d+)"/.exec(attributes)?.[1] ?? "";
    const type = /\bt="(\w+)"/.exec(attributes)?.[1] ?? null;
    const style = Number(/\bs="(\d+)"/.exec(attributes)?.[1] ?? 0);
    const raw = /<v>([^<]*)<\/v>/.exec(body)?.[1] ?? "";
    cells.set(ref, {
      value: type === "s" ? (strings[Number(raw)] ?? "") : raw,
      style,
      type,
    });
  }
  return cells;
}
