import "server-only";
import {
  type DetailsFailure,
  type DetailsPatch,
  detailsFailureOf,
  detailsOf,
  type EmploymentPeriod,
  type PayrollDetails,
  periodsOf,
} from "@domain/payroll-details";
import { isMissingFunction } from "./missing";
import { createAdminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";

/*
 * Details for payroll and employment periods (payroll P5,
 * 20261110000600_payroll_details.sql). Reads run under the person's own
 * session, so RLS decides what they get: their own while a member, and the
 * business's for whoever holds clock.payroll or views as an accountant. A
 * manager without pay access reads only who is a minor, and until when
 * (`public.team_youth`). Writes go with the secret key for `actor`, whom the
 * database checks; callers make sure the actor is the signed-in person and
 * not viewing as someone else. Before the migration reaches a project there
 * is nothing to read, and nothing is written.
 */

/** The table isn't on the project yet: before its migration, nobody has details. */
function isMissingTable(error: { code?: string }): boolean {
  return error.code === "PGRST205" || error.code === "42P01";
}

/**
 * The details the signed-in person may read in the business, by person (one
 * person's when `userId` is given). Someone with no row isn't in the map: they
 * have the defaults (`detailsOf(null)`).
 */
export async function getPayrollDetails(
  businessId: string,
  userId?: string,
): Promise<Map<string, PayrollDetails>> {
  const supabase = await createClient();
  let query = supabase
    .from("member_payroll_details")
    .select(
      "user_id, payroll_number, rest_day, hours_law, youth_until, compulsory_education",
    )
    .eq("business_id", businessId);
  if (userId) query = query.eq("user_id", userId);
  const { data, error } = await query;
  if (error) {
    if (isMissingTable(error)) return new Map();
    throw error;
  }
  return new Map(data.map((row) => [row.user_id, detailsOf(row)]));
}

/**
 * The employment periods the signed-in person may read in the business, by
 * person and oldest first (one person's when `userId` is given).
 */
export async function getEmploymentPeriods(
  businessId: string,
  userId?: string,
): Promise<Map<string, EmploymentPeriod[]>> {
  const supabase = await createClient();
  let query = supabase
    .from("employment_periods")
    .select("id, user_id, started_on, ended_on, last_paid_on, source")
    .eq("business_id", businessId);
  if (userId) query = query.eq("user_id", userId);
  const { data, error } = await query.order("started_on");
  if (error) {
    if (isMissingTable(error)) return new Map();
    throw error;
  }
  const byPerson = new Map<string, unknown[]>();
  for (const row of data) {
    const rows = byPerson.get(row.user_id);
    if (rows) rows.push(row);
    else byPerson.set(row.user_id, [row]);
  }
  return new Map(
    [...byPerson].map(([person, rows]) => [person, periodsOf(rows)]),
  );
}

/**
 * Who on the business's staff is a minor today, and until when, for its
 * owners and managers (and a view as one): empty for anyone else.
 */
export async function getTeamYouth(
  businessId: string,
): Promise<Map<string, string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("team_youth", {
    business: businessId,
  });
  if (error) {
    if (isMissingFunction(error)) return new Map();
    throw error;
  }
  return new Map(data.map((row) => [row.user_id, row.youth_until]));
}

export type DetailsWriteResult =
  | { ok: true }
  | { ok: false; failure: DetailsFailure };

function failed(error: { code?: string; message: string }): DetailsWriteResult {
  const failure = detailsFailureOf(error.code, error.message);
  if (failure === "failed") {
    console.error("saving payroll details failed", error.message);
  }
  return { ok: false, failure };
}

/**
 * `actor` sets some of a person's payroll details. A birth date in the patch
 * is never kept: the database keeps only the 18th birthday, and only from an
 * owner or the accountant. The log names the fields, never a value.
 */
export async function setPayrollDetails(
  actorId: string,
  businessId: string,
  personId: string,
  patch: DetailsPatch,
): Promise<DetailsWriteResult> {
  const { error } = await createAdminClient().rpc("set_payroll_details", {
    actor: actorId,
    business: businessId,
    person: personId,
    patch,
  });
  return error ? failed(error) : { ok: true };
}

/**
 * `actor` adds a period of a person's work, or changes one of theirs
 * (`periodId`): from a day, until one (null while it goes on), with the last
 * payment once it ended. Never overlapping another of theirs.
 */
export async function setEmploymentPeriod(
  actorId: string,
  businessId: string,
  personId: string,
  input: {
    from: string;
    to: string | null;
    paid: string | null;
    periodId: string | null;
  },
): Promise<DetailsWriteResult> {
  const { error } = await createAdminClient().rpc("set_employment_period", {
    actor: actorId,
    business: businessId,
    person: personId,
    from_day: input.from,
    ...(input.to ? { to_day: input.to } : {}),
    ...(input.paid ? { paid_until: input.paid } : {}),
    ...(input.periodId ? { period_id: input.periodId } : {}),
  });
  return error ? failed(error) : { ok: true };
}
