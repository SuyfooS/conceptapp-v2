import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  KEPT_OUT,
  rowFunctions,
  unboundedReads,
  unboundedReadViolations,
} from "./bounded-reads";

const root = join(__dirname, "..");

describe("rowFunctions", () => {
  it("names the functions that answer rows, not one value", () => {
    const types = [
      "export type Database = {",
      "  public: {",
      "    Tables: {",
      "      lists: {",
      "        Row: { id: string };",
      "      };",
      "    };",
      "    Functions: {",
      "      announcement_readers: {",
      "        Args: { message: string };",
      "        Returns: {",
      "          acked_at: string;",
      "          person: string;",
      "        }[];",
      "      };",
      "      due_lists: {",
      "        Args: never;",
      '        Returns: Database["public"]["Tables"]["lists"]["Row"][];',
      "      };",
      "      chat_paths_signed: {",
      "        Args: { paths: string[] };",
      "        Returns: string[];",
      "      };",
      "      file_space: { Args: { business: string }; Returns: Json };",
      "      own_phone: { Args: never; Returns: string };",
      "      team_youth: { Args: never; Returns: { user_id: string }[] };",
      "    };",
      "    Enums: {",
      "      member_role: {",
      "        Returns: { x: string }[];",
      "      };",
      "    };",
      "  };",
      "};",
    ].join("\n");
    expect(rowFunctions(types)).toEqual([
      "announcement_readers",
      "due_lists",
      "team_youth",
    ]);
  });

  it("reads the repo's functions", () => {
    const types = readFileSync(
      join(root, "packages", "db", "database.types.ts"),
      "utf8",
    );
    const found = rowFunctions(types);
    expect(found).toEqual(
      expect.arrayContaining(["announcement_readers", "team_phones"]),
    );
    expect(found).not.toContain("file_space");
    expect(found).not.toContain("my_permissions");
  });
});

describe("unboundedReads", () => {
  it("finds a read of a growing table that neither pages nor says why", () => {
    const source = [
      "export async function everyone(supabase) {",
      "  const { data } = await supabase",
      '    .from("memberships")',
      '    .select("user_id")',
      '    .eq("business_id", business);',
      "  return data;",
      "}",
    ].join("\n");
    expect(unboundedReads(source)).toEqual([{ line: 3, table: "memberships" }]);
  });

  it("passes a paged read, a few rows, a reason, a write and a small table", () => {
    const source = [
      "export async function paged(supabase) {",
      "  return allPages((first, last) =>",
      '    supabase.from("memberships").select("user_id").order("user_id").range(first, last),',
      "  );",
      "}",
      "export async function one(supabase) {",
      '  return supabase.from("lists").select("id").eq("id", id).maybeSingle();',
      "}",
      "export async function said(supabase) {",
      "  return supabase",
      "    // bounded: one list's people.",
      '    .from("list_people")',
      '    .select("user_id");',
      "}",
      "export async function written(supabase) {",
      '  return supabase.from("lists").update({ name }).eq("id", id);',
      "}",
      "export async function small(supabase) {",
      '  return supabase.from("departments").select("id");',
      "}",
      "export async function file(admin) {",
      '  return admin.storage.from("documents").list(folder);',
      "}",
    ].join("\n");
    expect(unboundedReads(source)).toEqual([]);
  });

  it("ends a read at the next one, so one read's range never covers another", () => {
    const source = [
      "export async function two(supabase) {",
      '  const a = await supabase.from("invites").select("id");',
      '  const b = await supabase.from("invites").select("id").range(0, 9);',
      "}",
    ].join("\n");
    expect(unboundedReads(source)).toEqual([{ line: 2, table: "invites" }]);
  });

  it("finds a call of a function that answers rows and neither pages nor says why", () => {
    // announcementReaders as it was: one row a member of the team's group.
    const source = [
      "export async function readers(supabase) {",
      '  const { data } = await supabase.rpc("announcement_readers", {',
      "    message,",
      "  });",
      "  return data;",
      "}",
      "export async function matrix(admin) {",
      "  const { data } = await admin.rpc(",
      '    "role_permission_matrix",',
      "    { business },",
      "  );",
      "  return data;",
      "}",
    ].join("\n");
    const functions = ["announcement_readers", "role_permission_matrix"];
    expect(unboundedReads(source, functions)).toEqual([
      { line: 2, table: "announcement_readers" },
      { line: 8, table: "role_permission_matrix" },
    ]);
    // Only the functions named: a write's answer or one value isn't a read.
    expect(unboundedReads(source)).toEqual([]);
  });

  it("passes a paged call, one row, a reason and another function", () => {
    const source = [
      "export async function readers(supabase) {",
      "  return readAllPages((first, last) =>",
      "    supabase",
      '      .rpc("announcement_readers", { message })',
      '      .order("person")',
      "      .range(first, last),",
      "  );",
      "}",
      "export async function stamp(supabase) {",
      '  return supabase.rpc("chat_stamp", { conversation }).maybeSingle();',
      "}",
      "export async function inbox(supabase) {",
      "  // bounded: one person's chats.",
      '  return supabase.rpc("chat_inbox", { business });',
      "}",
      "export async function send(supabase) {",
      '  return supabase.rpc("send_document", { business });',
      "}",
    ].join("\n");
    expect(
      unboundedReads(source, [
        "announcement_readers",
        "chat_stamp",
        "chat_inbox",
      ]),
    ).toEqual([]);
  });

  it("ends a table's read at a call, so the call's range never covers it", () => {
    const source = [
      "export async function both(supabase) {",
      '  const a = await supabase.from("invites").select("id");',
      "  const b = await allPages((first, last) =>",
      '    supabase.rpc("team_phones", { business }).order("user_id").range(first, last),',
      "  );",
      "}",
    ].join("\n");
    expect(unboundedReads(source, ["team_phones"])).toEqual([
      { line: 2, table: "invites" },
    ]);
  });

  it("wants a reason, not the word alone", () => {
    const source = [
      "export async function bare(supabase) {",
      "  // bounded:",
      '  return supabase.from("invites").select("id");',
      "}",
    ].join("\n");
    expect(unboundedReads(source)).toHaveLength(1);
  });
});

describe("the repo", () => {
  it("pages every read of a growing table or of a function's rows in packages/db, or says why not", () => {
    // Page it with @db/pages (allPages, readAllPages, allPagesIn), ordered by
    // its key last, or write on the `.from(` or `.rpc(` line or above it
    // `// bounded: <why it can't pass 1000 rows>`.
    expect(unboundedReadViolations(root)).toEqual([]);
  });

  it("keeps out only files that exist", () => {
    for (const file of Object.keys(KEPT_OUT)) {
      expect(existsSync(join(root, file)), file).toBe(true);
    }
  });
});
