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

describe("a removed document's file", () => {
  // C7 (20261111000800_documents_screens.sql): the bucket gives nobody a
  // removed document's file, even within its 10 minutes of undo, which needs
  // no look at it; a sick note its sender took back is seen by nobody. The
  // screens and the /document-files routes refuse one too (@db/documents).
  it("is read by nobody, even within its 10 minutes of undo", () => {
    const policy = newest("private.can_read_document");
    expect(policy).toContain("and d.removed_at is null");
    expect(policy).not.toContain("file_gone_after");
    expect(policy).toContain("private.sees_document(d.id, reader)");
    // Replaced last in the migrations, with the signed-in role's grant.
    const last = migrations.filter((file) =>
      /create (or replace )?function private\.can_read_document\(/.test(
        read(file),
      ),
    );
    const sql = read(last.at(-1) ?? "");
    expect(sql).toContain(
      "grant execute on function private.can_read_document(text) to authenticated;",
    );
  });
});
