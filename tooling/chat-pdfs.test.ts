import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CHAT_PDF_BURST_MINUTES,
  CHAT_PDF_MAX_BYTES,
  CHAT_PDF_TYPE,
  CHAT_PDFS_WAITING_MAX,
  CHAT_UPLOAD_HOURS,
  CHAT_UPLOAD_MARGIN_MINUTES,
  chatPlaceTombstone,
} from "@domain/chat-files";
import { describe, expect, it } from "vitest";

// Chat's PDFs (C5): the numbers the server checks a PDF by
// (@domain/chat-files) are the database's own, in the newest definition of
// each function among the migrations, so a change to one side that misses
// the other fails here rather than as a refusal nobody can explain.
const root = join(__dirname, "..");
const migrations = readdirSync(join(root, "supabase/migrations")).sort();

/** The body of the newest `create [or replace] function <name>(` in the migrations. */
function newest(name: string): string {
  const head = new RegExp(`create (?:or replace )?function ${name}\\(`);
  let found = "";
  for (const file of migrations) {
    const sql = readFileSync(join(root, "supabase/migrations", file), "utf8");
    const at = sql.search(head);
    if (at < 0) continue;
    const start = sql.indexOf("$$", at);
    const end = sql.indexOf("$$", start + 2);
    found = sql.slice(at, end + 2);
  }
  return found;
}

describe("a chat PDF's numbers", () => {
  it("are the reservation's: its type, 10 MiB, and ten unsent a day", () => {
    const reserve = newest("public\\.reserve_chat_upload");
    expect(reserve).toContain(
      `when upload_kind = 'pdf' and upload_type = '${CHAT_PDF_TYPE}' then 'pdf'`,
    );
    expect(reserve).toContain(`else ${CHAT_PDF_MAX_BYTES} end`);
    expect(reserve).toMatch(
      new RegExp(
        `\\) >= ${CHAT_PDFS_WAITING_MAX} then\\s+raise exception '[^']+' using errcode = '54000', hint = 'pdfs'`,
      ),
    );
  });

  it("are the sending's: the same 10 MiB, within the place's hours", () => {
    const attach = newest("private\\.attach_chat_upload");
    expect(attach).toContain(`else ${CHAT_PDF_MAX_BYTES} end`);
    expect(attach).toContain(`interval '${CHAT_UPLOAD_HOURS} hours'`);
    const place = newest("public\\.chat_upload_place");
    expect(place).toContain(`interval '${CHAT_UPLOAD_HOURS} hours'`);
  });

  it("are the room's: a business's 10 minutes, and a signed upload's hours with their margin", () => {
    const reserve = newest("public\\.reserve_chat_upload");
    const live = `interval '${CHAT_UPLOAD_HOURS} hours ${CHAT_UPLOAD_MARGIN_MINUTES} minutes'`;
    expect(reserve).toContain(`interval '${CHAT_PDF_BURST_MINUTES} minutes'`);
    expect(reserve).toMatch(
      /raise exception '[^']+' using errcode = '54000', hint = 'busy'/,
    );
    expect(reserve).toContain(live);
    // A place holding the server's tombstone holds nothing.
    expect(reserve).toContain(
      `private.stored_bytes(u.bucket, u.path) > ${chatPlaceTombstone().length}`,
    );
    // What a PDF's signed upload may bring, whatever size it was reserved at.
    expect(reserve).toContain(
      `case when upload_kind = 'pdf' then ${CHAT_PDF_MAX_BYTES}::bigint`,
    );
    const onTheirWay = newest("private\\.uploads_on_their_way");
    expect(onTheirWay).toContain(live);
    expect(onTheirWay).toContain(`then ${CHAT_PDF_MAX_BYTES}::bigint`);
    expect(newest("public\\.chat_paths_signed")).toContain(live);
  });

  it("are counted one person at a time, and a business's PDFs too", () => {
    const reserve = newest("public\\.reserve_chat_upload");
    const person = reserve.indexOf(
      "pg_advisory_xact_lock(hashtextextended('chat_upload:' || actor::text, 0))",
    );
    const business = reserve.indexOf(
      "pg_advisory_xact_lock(hashtextextended('chat_pdfs:' || business::text, 0))",
    );
    expect(person).toBeGreaterThan(0);
    expect(business).toBeGreaterThan(0);
    // Each lock before the counts it serves, so they read what came before.
    expect(person).toBeLessThan(reserve.indexOf("'Too many in a minute'"));
    expect(business).toBeLessThan(reserve.indexOf("hint = 'pdfs'"));
    expect(business).toBeLessThan(reserve.indexOf("hint = 'busy'"));
  });
});
