import "server-only";
import {
  ACTIVITY_PAGE_SIZE,
  type ActivityLookups,
  type ActivityRow,
  type ActivityShift,
  activityRefs,
  activityShiftOf,
  ROUTINE_ACTIONS,
} from "@domain/activity";
import { isMissingColumn } from "./missing";
import { isMissingTable } from "./notifications";
import { createClient } from "./supabase/server";

export type ActivityPage = {
  rows: ActivityRow[];
  lookups: ActivityLookups;
  /** The cursor for the next older page, or null at the start of the log. */
  older: number | null;
};

// Quoted: PostgREST reads a dot in a list as its own syntax.
const ROUTINE = `(${ROUTINE_ACTIONS.map((action) => `"${action}"`).join(",")})`;

/**
 * A page of a business's activity log, newest first, as the signed-in person
 * may read it (RLS): whoever holds manage.view, each row only while they hold
 * its own area too, and the team viewing it as a role that does.
 * Everything the rows point at is read the same way, so an id from another
 * business finds nothing, and someone who has left keeps no name.
 */
export async function getBusinessActivity(
  businessId: string,
  before: number | null,
): Promise<ActivityPage> {
  const supabase = await createClient();
  let query = supabase
    .from("audit_log")
    .select("id, action, details, created_at, actor_id")
    .eq("business_id", businessId)
    .not("action", "in", ROUTINE)
    .order("id", { ascending: false })
    .limit(ACTIVITY_PAGE_SIZE + 1);
  if (before !== null) query = query.lt("id", before);
  const { data, error } = await query;
  if (error) throw error;

  const page = data.slice(0, ACTIVITY_PAGE_SIZE);
  const rows: ActivityRow[] = page.map((row) => ({
    id: row.id,
    action: row.action,
    details: row.details,
    createdAt: row.created_at,
    actorId: row.actor_id,
  }));
  const refs = activityRefs(rows);

  const [swaps, invites] = await Promise.all([
    refs.swaps.length ? getSwaps(businessId, refs.swaps) : [],
    refs.invites.length
      ? supabase
          .from("invites")
          .select("id, full_name, role")
          .eq("business_id", businessId)
          .in("id", refs.invites)
      : null,
  ]);
  if (invites?.error) throw invites.error;

  // A swap names its people only through the request itself, and its shift
  // as the request keeps it; the shift by id only where that isn't there.
  const people = new Set(refs.people);
  const shifts = new Set(refs.shifts);
  for (const swap of swaps) {
    people.add(swap.requestedBy);
    if (swap.takenBy) people.add(swap.takenBy);
    if (!swap.shift && swap.shiftId) shifts.add(swap.shiftId);
  }

  const [members, shiftRows, departments] = await Promise.all([
    people.size
      ? supabase
          .from("memberships")
          .select("user_id, active, profiles (full_name)")
          .eq("business_id", businessId)
          .in("user_id", [...people])
      : null,
    shifts.size
      ? supabase
          .from("schedule_shifts")
          .select("id, day, name, starts_at, ends_at")
          .eq("business_id", businessId)
          .in("id", [...shifts])
      : null,
    // Removed ones too: an old line keeps the name it had.
    refs.departments.length
      ? supabase
          .from("departments")
          .select("id, name")
          .eq("business_id", businessId)
          .in("id", refs.departments)
      : null,
  ]);
  if (members?.error) throw members.error;
  if (shiftRows?.error) throw shiftRows.error;
  // Before the lists migration reaches a project there are no departments.
  if (departments?.error && !isMissingTable(departments.error)) {
    throw departments.error;
  }

  return {
    rows,
    older: data.length > ACTIVITY_PAGE_SIZE ? (page.at(-1)?.id ?? null) : null,
    lookups: {
      members: new Map(
        (members?.data ?? []).map((row) => [
          row.user_id,
          {
            active: row.active,
            name: row.profiles?.full_name?.trim() || null,
          },
        ]),
      ),
      invites: new Map(
        (invites?.data ?? []).map((row) => [
          row.id,
          { name: row.full_name?.trim() || null, role: row.role },
        ]),
      ),
      shifts: new Map(
        (shiftRows?.data ?? []).map((row) => [
          row.id,
          {
            day: row.day,
            name: row.name,
            start: row.starts_at.slice(0, 5),
            end: row.ends_at.slice(0, 5),
          },
        ]),
      ),
      departments: new Map(
        (departments?.data ?? []).map((row) => [row.id, row.name]),
      ),
      swaps: new Map(swaps.map(({ id, ...swap }) => [id, swap])),
    },
  };
}

type ActivitySwap = {
  id: string;
  shiftId: string | null;
  shift: ActivityShift | null;
  requestedBy: string;
  takenBy: string | null;
};

/**
 * The swap requests a page of the log names, under the reader's access, each
 * with the shift as it was asked for (`shift_swaps.shift`), which outlives the
 * shift. Until 20261115000200_swap_history.sql reaches the project, without
 * it: the shift by id, while it is there.
 */
async function getSwaps(
  businessId: string,
  ids: string[],
): Promise<ActivitySwap[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shift_swaps")
    .select("id, shift_id, shift, requested_by, taken_by")
    .eq("business_id", businessId)
    .in("id", ids);
  if (!error) {
    return data.map((row) => ({
      id: row.id,
      shiftId: row.shift_id,
      shift: activityShiftOf(row.shift),
      requestedBy: row.requested_by,
      takenBy: row.taken_by,
    }));
  }
  if (!isMissingColumn(error)) throw error;
  const before = await supabase
    .from("shift_swaps")
    .select("id, shift_id, requested_by, taken_by")
    .eq("business_id", businessId)
    .in("id", ids);
  if (before.error) throw before.error;
  return before.data.map((row) => ({
    id: row.id,
    shiftId: row.shift_id,
    shift: null,
    requestedBy: row.requested_by,
    takenBy: row.taken_by,
  }));
}
