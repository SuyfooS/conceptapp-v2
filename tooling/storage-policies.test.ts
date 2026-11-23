import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Files through the server only (20261127000300_files_server_only.sql, as
// 20261111000900_documents_server_only.sql did for documents): no bucket
// keeps a policy on storage.objects, so no session downloads, lists or signs
// a link to any file, whatever token it holds. The app's routes check the
// row under the reader's session and read the bytes with the secret key, and
// nothing in the app signs a read link but the server's own 60-second one
// for a chat PDF's first KB (`storedHead`). This keeps it so.
const root = join(__dirname, "..");
const MIGRATION = "20261127000300_files_server_only.sql";
const migrations = readdirSync(join(root, "supabase/migrations")).sort();
const read = (file: string) =>
  readFileSync(join(root, "supabase/migrations", file), "utf8");
/** A migration's SQL without its `--` comments, for what it does rather than says. */
const code = (file: string) => read(file).replace(/--[^\n]*/g, "");

/** The policies on storage.objects the migrations leave standing, by name. */
function standingPolicies(): { open: string[]; made: number } {
  const open = new Set<string>();
  let made = 0;
  for (const file of migrations) {
    const sql = code(file);
    // In the file's order: a policy made and dropped in one migration goes.
    const statements = [
      ...sql.matchAll(
        /create policy "([^"]+)"\s+on storage\.objects\b|drop policy (?:if exists )?"([^"]+)" on storage\.objects\b/g,
      ),
    ];
    for (const [, created, dropped] of statements) {
      if (created) {
        open.add(created);
        made += 1;
      }
      if (dropped) open.delete(dropped);
    }
  }
  return { open: [...open].sort(), made };
}

/** Every .ts and .tsx file under `dir`, but dependencies and builds. */
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) return [];
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

/** A file's path from the repo's root, with forward slashes. */
const fromRoot = (path: string) => relative(root, path).split("\\").join("/");

describe("Storage's files", () => {
  it("have no policy on storage.objects left in the migrations, for any bucket", () => {
    const { open, made } = standingPolicies();
    expect(open).toEqual([]);
    // Profile photos made four, lists' photos, chat files and documents one each.
    expect(made).toBeGreaterThanOrEqual(7);
  });

  it("have no reader's check left: the chat files' and the list photos' helpers go after their policies, and nothing after names them", () => {
    const at = migrations.indexOf(MIGRATION);
    expect(at).toBeGreaterThan(0);
    const sql = code(MIGRATION);
    for (const [policy, helper] of [
      [
        'drop policy "people read the files of the chat messages they read" on storage.objects;',
        "drop function private.can_read_chat_file(text);",
      ],
      [
        'drop policy "people read the photos of the lists they see" on storage.objects;',
        "drop function private.can_read_list_photo(text);",
      ],
    ] as const) {
      expect(sql.indexOf(policy), policy).toBeGreaterThanOrEqual(0);
      expect(sql.indexOf(helper), helper).toBeGreaterThan(sql.indexOf(policy));
    }
    expect(sql).toContain(
      'drop policy "people and their colleagues read photos" on storage.objects;',
    );
    for (const file of migrations.slice(at + 1)) {
      expect(code(file), file).not.toMatch(
        /can_read_chat_file|can_read_list_photo/,
      );
    }
  });

  it("are read through no signed link the app makes, but the server's own for a chat PDF's first KB", () => {
    const signing = /\.createSignedUrls?\(/g;
    const found: string[] = [];
    for (const path of [
      ...sources(join(root, "app")),
      ...sources(join(root, "packages")),
    ]) {
      const name = fromRoot(path);
      if (name.endsWith(".test.ts") || name.endsWith(".test.tsx")) continue;
      const source = readFileSync(path, "utf8");
      for (const match of source.matchAll(signing)) {
        const before = source.slice(0, match.index);
        const inStoredHead =
          name === "packages/db/chat-files.ts" &&
          before.lastIndexOf("export async function storedHead(") >
            before.lastIndexOf("\n}\n");
        if (!inStoredHead) found.push(name);
      }
    }
    expect(found).toEqual([]);
  });

  it("are read by chat's and the lists' readers with the secret key, never under the session", () => {
    for (const file of [
      "packages/db/chat-files.ts",
      "packages/db/list-photos.ts",
    ]) {
      const source = readFileSync(join(root, file), "utf8");
      // The session's client is named `supabase` in both.
      expect(source, file).not.toMatch(/\bsupabase\s*\.storage\b/);
    }
  });

  it("include profile photos nothing points at in the daily clean-up", () => {
    const head = /create (?:or replace )?function private\.list_photos_tick\(/;
    const last = migrations.findLast((file) => head.test(read(file)));
    expect(last).toBe(MIGRATION);
    const sql = read(MIGRATION);
    const tick = sql.slice(sql.search(head));
    const body = tick.slice(0, tick.indexOf("$$;", tick.indexOf("$$") + 2));
    expect(body).toContain("public.expired_avatars(at_time, 1)");
    expect(body).toContain("public.expired_list_photos(at_time, 1)");
  });
});
