import "server-only";
import type { ActivityLookups, ActivityRow } from "@domain/activity";
import { FILE_HISTORY_ACTIONS, FILE_HISTORY_SIZE } from "@domain/file-holders";
import { memberNames, nameIn } from "./member-names";
import { createClient } from "./supabase/server";

/*
 * "מה קרה בתיק" (profile H6b-1): one person's file as its holders' log tells
 * it, read straight from `audit_log` under the signed-in holder's session.
 * RLS already lets people.files holders read every employee.* row of the
 * business and never a view session (20261126000200_employee_files.sql), so
 * no function of its own is needed. The rows name parts of the file only,
 * never a value (H4's rule), and only these five columns are read.
 */

export type FileHistoryPage = {
  rows: ActivityRow[];
  /** The actors' names in the business; nothing else a line points at. */
  lookups: ActivityLookups;
  /** There are older rows than these. */
  more: boolean;
};

const COLUMNS = "id, action, details, created_at, actor_id";

// Quoted: PostgREST reads a dot in a list as its own syntax.
const CHANGES = `(${FILE_HISTORY_ACTIONS.map((action) => `"${action}"`).join(",")})`;

/**
 * The daily read of a file, as both writers log it (`private.note_file_view`
 * and `public.reveal_employee_fields`): a reveal names `id`, `bank_account`
 * or both instead.
 */
export const FILE_READ_FIELDS = '["file"]';

/**
 * What happened in one person's file, newest first, as the signed-in holder
 * reads the log: the file's changes, its sending, the 101's marks, the
 * account confirmed or disputed, the parts handed directly, and each reveal
 * of a number, never the daily read of the file itself. The newest
 * FILE_HISTORY_SIZE, from two reads merged by id. People by the business's
 * name for them, as it is now. An error throws: the caller says the history
 * couldn't be shown, and the file still opens.
 */
export async function getFileHistory(
  businessId: string,
  personId: string,
): Promise<FileHistoryPage> {
  const supabase = await createClient();
  // The writers log a uuid as Postgres prints it, in lower case, and
  // `details->>person` is text: an id in upper case would match no row.
  const person = personId.toLowerCase();
  const about = () =>
    supabase
      .from("audit_log")
      .select(COLUMNS)
      .eq("business_id", businessId)
      .eq("details->>person", person);
  const [changes, reveals] = await Promise.all([
    about()
      .filter("action", "in", CHANGES)
      .order("id", { ascending: false })
      .limit(FILE_HISTORY_SIZE + 1),
    about()
      .eq("action", "employee.view")
      .neq("details->>fields", FILE_READ_FIELDS)
      .order("id", { ascending: false })
      .limit(FILE_HISTORY_SIZE + 1),
  ]);
  if (changes.error) throw changes.error;
  if (reveals.error) throw reveals.error;

  const merged = [...changes.data, ...reveals.data].sort((a, b) => b.id - a.id);
  const rows: ActivityRow[] = merged.slice(0, FILE_HISTORY_SIZE).map((row) => ({
    id: row.id,
    action: row.action,
    details: row.details,
    createdAt: row.created_at,
    actorId: row.actor_id,
  }));
  const actors = [
    ...new Set(
      rows.flatMap((row) => (row.actorId === null ? [] : [row.actorId])),
    ),
  ];

  const [members, names] = await Promise.all([
    actors.length
      ? supabase
          // bounded: the people the file's newest 40 lines name.
          .from("memberships")
          .select("user_id, active, profiles (full_name)")
          .eq("business_id", businessId)
          .in("user_id", actors)
      : null,
    memberNames(supabase, businessId, actors),
  ]);
  if (members?.error) throw members.error;

  return {
    rows,
    more: merged.length > FILE_HISTORY_SIZE,
    lookups: {
      members: new Map(
        (members?.data ?? []).map((row) => [
          row.user_id,
          {
            active: row.active,
            name: nameIn(names, row.user_id, row.profiles?.full_name),
          },
        ]),
      ),
      invites: new Map(),
      shifts: new Map(),
      swaps: new Map(),
      departments: new Map(),
      stations: new Map(),
    },
  };
}
