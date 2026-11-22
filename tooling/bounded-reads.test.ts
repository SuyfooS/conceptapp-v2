import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  KEPT_OUT,
  unboundedReads,
  unboundedReadViolations,
} from "./bounded-reads";

const root = join(__dirname, "..");

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
  it("pages every read of a growing table in packages/db, or says why not", () => {
    // Page it with @db/pages (allPages, readAllPages, allPagesIn), ordered by
    // its key last, or write on the `.from(` line or above it
    // `// bounded: <why it can't pass 1000 rows>`.
    expect(unboundedReadViolations(root)).toEqual([]);
  });

  it("keeps out only files that exist", () => {
    for (const file of Object.keys(KEPT_OUT)) {
      expect(existsSync(join(root, file)), file).toBe(true);
    }
  });
});
