import "server-only";
import { shownName } from "@domain/people";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "./database.types";
import { readAllPages, readAllPagesIn } from "./pages";

/** The names a business keeps for its people, by their id in lower case. */
export type MemberNames = ReadonlyMap<string, string>;

const NameRow = z.object({ user_id: z.string(), name: z.string() });

/**
 * Someone's name in the business: the one it keeps for them (`names`, from
 * `memberNames`), else `own`, their profile's (`shownName`).
 */
export function nameIn(
  names: MemberNames,
  userId: string,
  own: string | null | undefined,
): string | null {
  return shownName(names.get(userId.toLowerCase()), own);
}

/**
 * The names a business keeps for its people over their own
 * (`public.member_names`, 20261117000700_member_names.sql: a fix from
 * /team/[person], or the invite's name they joined by,
 * 20261127000500_invite_names.sql), by person, as
 * `supabase` may read them: under RLS as their profile is read, in that
 * business (its members, and its pay holders also for those who left), or
 * with the secret key for the console and the screens that read the whole
 * team with it. Only `people` when given, and nothing read for none. Empty
 * before the migration reaches a project, when every business shows people
 * by their own names. Pass each with its own name to `shownName`.
 */
export async function memberNames(
  supabase: SupabaseClient<Database>,
  businessId: string,
  people?: readonly string[],
): Promise<MemberNames> {
  if (people && people.length === 0) return new Map();
  // Names are kept for those who left too, so page by page, and many people
  // in parts so the address stays short.
  const read = (
    part: readonly string[] | undefined,
    first: number,
    last: number,
  ) => {
    let query = supabase
      .from("member_names")
      .select("user_id, name")
      .eq("business_id", businessId);
    if (part) query = query.in("user_id", [...part]);
    return query.order("user_id").range(first, last);
  };
  const { data, error } = people
    ? await readAllPagesIn(people, (part, first, last) =>
        read(part, first, last),
      )
    : await readAllPages((first, last) => read(undefined, first, last));
  // PostgREST's and Postgres's "no such table", as `isMissingTable` says
  // it (./notifications, which reads these names: no import both ways).
  if (error?.code === "PGRST205" || error?.code === "42P01") return new Map();
  if (error) throw error;
  return new Map(
    z
      .array(NameRow)
      .parse(data ?? [])
      .map((row) => [row.user_id.toLowerCase(), row.name]),
  );
}
