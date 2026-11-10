import "server-only";
import { type WageFailure, type WageRow, wageFailureOf } from "@domain/wages";
import { createAdminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";

/*
 * Hourly wages (payroll P4, 20261110000500_hourly_wages.sql). Reads run under
 * the person's own session, so RLS decides what they get: their own wages
 * while a member, and the business's for whoever holds clock.payroll or views
 * as an accountant. A wage is set with the secret key for `actor`, whom the
 * database checks holds pay access and isn't setting their own; callers make
 * sure the actor is the signed-in person and not viewing as someone else.
 */

/** A wage of someone in the business. */
export type PersonWage = WageRow & { userId: string };

/** The table isn't on the project yet: before its migration, nobody has a wage. */
function isMissingTable(error: { code?: string }): boolean {
  return error.code === "PGRST205" || error.code === "42P01";
}

/**
 * Every wage the signed-in person may read in the business, or one person's
 * when `userId` is given, oldest first. A person reads their own; a pay holder
 * everyone's.
 */
export async function getWages(
  businessId: string,
  userId?: string,
): Promise<PersonWage[]> {
  const supabase = await createClient();
  let query = supabase
    .from("member_wages")
    .select("id, user_id, hourly_agorot, effective_from, set_at, set_by, note")
    .eq("business_id", businessId);
  if (userId) query = query.eq("user_id", userId);
  const { data, error } = await query.order("effective_from").order("set_at");
  if (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }
  return data.map((row) => ({
    id: row.id,
    userId: row.user_id,
    agorot: row.hourly_agorot,
    from: row.effective_from,
    setAt: row.set_at,
    setBy: row.set_by,
    note: row.note,
  }));
}

/** Each person's wages, from the rows `getWages` read. */
export function wagesByPerson(
  wages: readonly PersonWage[],
): Map<string, WageRow[]> {
  const byPerson = new Map<string, WageRow[]>();
  for (const { userId, ...wage } of wages) {
    const rows = byPerson.get(userId);
    if (rows) rows.push(wage);
    else byPerson.set(userId, [wage]);
  }
  return byPerson;
}

export type SetWageResult =
  | { ok: true; id: string }
  | { ok: false; failure: WageFailure };

/**
 * `actor` sets someone's hourly wage, in agorot, from a day (`YYYY-MM-DD`),
 * with an optional note. The database refuses one's own, an owner's by anyone
 * but an owner, an accountant's, and a day outside the first of last month to
 * a year ahead; it keeps the wage before and the minimum of the day in the
 * log, and tells the person, with no amount.
 */
export async function setHourlyWage(
  actorId: string,
  businessId: string,
  personId: string,
  input: { agorot: number; from: string; note: string | null },
): Promise<SetWageResult> {
  const { data, error } = await createAdminClient().rpc("set_hourly_wage", {
    actor: actorId,
    business: businessId,
    person: personId,
    agorot: input.agorot,
    from_day: input.from,
    ...(input.note ? { wage_note: input.note } : {}),
  });
  if (error) {
    const failure = wageFailureOf(error.code, error.message);
    if (failure === "failed") {
      console.error("setting a wage failed", error.message);
    }
    return { ok: false, failure };
  }
  return { ok: true, id: data };
}
