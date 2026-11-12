import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_DOCUMENT_SPACE_MB,
  DOCUMENT_CATEGORIES,
  DOCUMENT_CATEGORY_KEYS,
  DOCUMENT_DIRECTIONS,
  DOCUMENT_NOTE_MAX,
  DOCUMENT_PDF_MAX_BYTES,
  DOCUMENT_PHOTO_MAX_BYTES,
  DOCUMENT_RECIPIENTS_MAX,
  DOCUMENT_REMOVE_REASONS,
  DOCUMENT_SAMPLES,
  DOCUMENT_SPACE_MB,
  DOCUMENT_TAKE_BACK_MINUTES,
  DOCUMENT_TITLE_MAX,
  DOCUMENT_UNDO_MINUTES,
  DOCUMENTS_GUARD_BYTES,
  OFFICE_REMOVE_REASONS,
} from "@domain/documents";
import { describe, expect, it } from "vitest";
import he from "../messages/he.json";

// Official documents (chat C6): what @domain/documents says of them is the
// database's own, in the newest definition of each function and table among
// the migrations, so a change to one side that misses the other fails here
// rather than as a refusal nobody can explain. modules/chat/documents.db.test.ts
// asks the database itself the same (`pnpm test:db`). And a document's lines
// and log rows carry ids and codes only: no category, title, note or file of
// a document (a sick note is health data) is ever put into them.
const root = join(__dirname, "..");
const migrations = readdirSync(join(root, "supabase/migrations")).sort();
const read = (file: string) =>
  readFileSync(join(root, "supabase/migrations", file), "utf8");

/** The body of the newest `create [or replace] function <name>(` in the migrations. */
function newest(name: string): string {
  const head = new RegExp(`create (?:or replace )?function ${name}\\(`);
  let found = "";
  for (const file of migrations) {
    const sql = read(file);
    const at = sql.search(head);
    if (at < 0) continue;
    const start = sql.indexOf("$$", at);
    const end = sql.indexOf("$$", start + 2);
    found = sql.slice(at, end + 2);
  }
  if (!found) throw new Error(`No migration makes ${name}`);
  return found;
}

/** The newest `create table <name> (…);` in the migrations. */
function table(name: string): string {
  let found = "";
  for (const file of migrations) {
    const sql = read(file);
    const at = sql.indexOf(`create table ${name} (`);
    if (at < 0) continue;
    found = sql.slice(at, sql.indexOf("\n);", at));
  }
  if (!found) throw new Error(`No migration makes ${name}`);
  return found;
}

/** `('a', 'b', …)` as SQL writes a list of words, after `prefix`. */
function words(sql: string, prefix: string): string[] {
  const at = sql.indexOf(prefix);
  if (at < 0) throw new Error(`Not found: ${prefix}`);
  const open = sql.indexOf("(", at + prefix.length);
  const close = sql.indexOf(")", open);
  return [...sql.slice(open + 1, close).matchAll(/'([^']*)'/g)].map(
    ([, word = ""]) => word,
  );
}

/** Each `<call>( … );` statement in a function's body. */
function calls(body: string, call: string): string[] {
  const found: string[] = [];
  let at = body.indexOf(call);
  while (at >= 0) {
    found.push(body.slice(at, body.indexOf(");", at) + 2));
    at = body.indexOf(call, at + call.length);
  }
  return found;
}

const documents = table("public.documents");

describe("a document's words in the database", () => {
  it("are the categories, ways, samples and reasons @domain/documents names", () => {
    expect(words(documents, "check (category in")).toEqual([
      ...DOCUMENT_CATEGORY_KEYS,
    ]);
    expect(words(documents, "check (direction in")).toEqual([
      ...DOCUMENT_DIRECTIONS,
    ]);
    expect(words(documents, "check (sample in")).toEqual([...DOCUMENT_SAMPLES]);
    expect(words(documents, "check (removed_reason in")).toEqual([
      ...DOCUMENT_REMOVE_REASONS,
    ]);
    expect(words(documents, "when 'from_person' then category in")).toEqual([
      ...DOCUMENT_CATEGORIES.from_person,
    ]);
  });

  it("send each way only the categories it takes", () => {
    const send = newest("public\\.send_document");
    expect(words(send, "send_category not in")).toEqual([
      ...DOCUMENT_CATEGORIES.from_person,
    ]);
    const toPeople = send.slice(send.indexOf("send_direction = 'to_people'"));
    expect(words(toPeople, "send_category not in")).toEqual([
      ...DOCUMENT_CATEGORIES.to_people,
    ]);
    expect(words(send, "send_sample not in")).toEqual([...DOCUMENT_SAMPLES]);
  });

  it("title a demo's document with its category's words, as the screens say them", () => {
    const title = newest("private\\.document_title");
    const categories = he.app.chat.documents.categories;
    for (const category of DOCUMENT_CATEGORY_KEYS) {
      expect(title, category).toContain(
        `when '${category}' then '${categories[category]}'`,
      );
    }
  });

  it("let the office remove a file with its own reasons, and its sender take one back", () => {
    const remove = newest("public\\.remove_document");
    expect(words(remove, "elsif reason in")).toEqual([
      ...OFFICE_REMOVE_REASONS,
    ]);
    expect(remove).toContain(
      `doc.sent_at + interval '${DOCUMENT_TAKE_BACK_MINUTES} minutes'`,
    );
    expect(remove).toContain(
      `file_gone_after = at_time + interval '${DOCUMENT_UNDO_MINUTES} minutes'`,
    );
  });
});

describe("a document's numbers in the database", () => {
  it("are its title's, note's and people's", () => {
    const send = newest("public\\.send_document");
    expect(send).toContain(`char_length(clean_title) > ${DOCUMENT_TITLE_MAX}`);
    expect(send).toContain(`char_length(clean_note) > ${DOCUMENT_NOTE_MAX}`);
    expect(send).toContain(`cardinality(people) > ${DOCUMENT_RECIPIENTS_MAX}`);
    expect(documents).toContain(
      `char_length(title) between 1 and ${DOCUMENT_TITLE_MAX}`,
    );
    expect(documents).toContain(
      `char_length(note) between 1 and ${DOCUMENT_NOTE_MAX}`,
    );
  });

  it("are its file's: a photo of 700 KB, a PDF of 10 MiB", () => {
    const limit = `then ${DOCUMENT_PHOTO_MAX_BYTES} else ${DOCUMENT_PDF_MAX_BYTES} end`;
    expect(newest("public\\.reserve_document_upload")).toContain(limit);
    expect(newest("private\\.attach_document_upload")).toContain(limit);
    expect(documents).toContain(
      `file_size between 1 and ${DOCUMENT_PDF_MAX_BYTES}`,
    );
  });

  it("are the room's: the team's space, and 980 MB across the project", () => {
    expect(newest("private\\.documents_guard_bytes")).toContain(
      `${DOCUMENTS_GUARD_BYTES}::bigint`,
    );
    const space = newest("private\\.document_space_bytes");
    for (const mb of DOCUMENT_SPACE_MB.filter(
      (mb) => mb !== DEFAULT_DOCUMENT_SPACE_MB,
    )) {
      expect(space).toContain(`when '${mb}' then ${mb}::bigint`);
    }
    expect(space).toContain(`else ${DEFAULT_DOCUMENT_SPACE_MB}::bigint`);
    expect(newest("private\\.chat_settings")).toContain(
      `'documentSpaceMb', ${DEFAULT_DOCUMENT_SPACE_MB}`,
    );
  });
});

describe("a document's lines and log rows", () => {
  const functions = [
    "public\\.send_document",
    "public\\.open_document",
    "public\\.confirm_document",
    "public\\.remove_document",
    "public\\.restore_document",
  ];
  // What would say what a document is, or name its file.
  const telling =
    /\b(category|title|note|file_name|file_path|send_category|send_title|send_note|clean_title|clean_note|sample)\b/;

  it("hold ids and codes only: no category, title, note or file", () => {
    let seen = 0;
    for (const name of functions) {
      const body = newest(name);
      for (const statement of [
        ...calls(body, "private.notify("),
        ...calls(body, "insert into public.audit_log"),
      ]) {
        seen += 1;
        expect(statement, name).not.toMatch(telling);
      }
    }
    // send, open, remove and restore log; send and restore tell people.
    expect(seen).toBeGreaterThanOrEqual(7);
  });

  it("tell people with {document, from} alone", () => {
    for (const name of [
      "public\\.send_document",
      "public\\.restore_document",
    ]) {
      for (const statement of calls(newest(name), "private.notify(")) {
        expect(statement, name).toMatch(
          /jsonb_build_object\('document', [a-z.]+, 'from', [a-z_.]+\)/,
        );
      }
    }
  });
});

/** A migration's SQL without its `--` comments, for what it does rather than says. */
function code(file: string): string {
  return read(file).replace(/--[^\n]*/g, "");
}

describe("a document's file", () => {
  // Orel, 12 November 2026 (20261111000900_documents_server_only.sql): a
  // document's file is read by the server alone, with the secret key, after
  // public.open_document. The documents bucket has no policy, so no session
  // downloads it, lists it or signs a link to it.
  it("has no policy of the documents bucket left in the migrations", () => {
    const open = new Set<string>();
    let made = 0;
    let dropped = 0;
    for (const file of migrations) {
      const sql = code(file);
      for (const statement of sql.matchAll(
        /create policy "([^"]+)"\s+on storage\.objects\b([^;]*);/g,
      )) {
        const [, name = "", body = ""] = statement;
        if (body.includes("'documents'")) {
          open.add(name);
          made += 1;
        }
      }
      for (const statement of sql.matchAll(
        /drop policy (?:if exists )?"([^"]+)" on storage\.objects\b/g,
      )) {
        const [, name = ""] = statement;
        if (open.delete(name)) dropped += 1;
      }
    }
    expect([...open]).toEqual([]);
    // C6 made one, and it is gone.
    expect(made).toBeGreaterThanOrEqual(1);
    expect(dropped).toBe(made);
  });

  it("has no reader's check left: private.can_read_document is dropped, and nothing after names it", () => {
    const defines =
      /create (or replace )?function private\.can_read_document\(/;
    const lastMade = migrations.findLastIndex((file) =>
      defines.test(code(file)),
    );
    const drop = migrations.findIndex((file) =>
      code(file).includes("drop function private.can_read_document(text);"),
    );
    expect(lastMade).toBeGreaterThanOrEqual(0);
    expect(drop).toBeGreaterThan(lastMade);
    for (const file of migrations.slice(drop + 1)) {
      expect(code(file), file).not.toContain("can_read_document");
    }
    // Dropped after its policy, in the same migration.
    const sql = code(migrations[drop] ?? "");
    expect(
      sql.indexOf(
        'drop policy "people read the files of the documents they read" on storage.objects;',
      ),
    ).toBeGreaterThanOrEqual(0);
    expect(
      sql.indexOf(
        'drop policy "people read the files of the documents they read" on storage.objects;',
      ),
    ).toBeLessThan(
      sql.indexOf("drop function private.can_read_document(text);"),
    );
  });

  it("is served, and its opening logged, only while its document isn't removed, even within its 10 minutes of undo", () => {
    // C7 (20261111000800_documents_screens.sql) made a removed document's
    // file nobody's to see, and putting it back needs no look at it; the
    // opening that stands before the secret key's read (the /document-files
    // routes, @db/documents) says the same.
    const opening = newest("public\\.open_document");
    expect(opening).toContain(
      "serves := doc.removed_at is null\n    and (doc.sample is not null or doc.file_path is not null);",
    );
    expect(opening).toContain(
      "'path', case when serves then doc.file_path end",
    );
    expect(opening).toContain("'sample', case when serves then doc.sample end");
    expect(opening).not.toContain("file_gone_after");
    expect(opening).toContain("if serves and not own and private.in_office(");
  });
});
