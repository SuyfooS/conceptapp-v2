import "server-only";
import { type CloseFailure, closeFailureOf } from "@domain/payroll-close";
import type { ClosedSnapshot } from "@domain/payroll-diff";
import type { Json } from "./database.types";
import { createAdminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";

/*
 * Closing a month for payroll (payroll P9, 20261110001000_payroll_months.sql).
 * Reads run under the person's own session, so RLS decides what they get:
 * the business's months for whoever holds clock.payroll or views as an
 * accountant. A month is closed and reopened with the secret key for `actor`,
 * whom the database checks is an active owner or accountant; callers make
 * sure the actor is the signed-in person and not viewing as someone else.
 */

/** A month as `public.payroll_months` keeps it. */
export type PayrollMonthRecord = {
  /** `YYYY-MM`. */
  month: string;
  closedAt: string;
  closedBy: string | null;
  /** Null while it stays closed. */
  reopenedAt: string | null;
  reopenedBy: string | null;
  reopenReason: string | null;
  /** What the hours engine gave when it closed, as stored: read with `readSnapshot`. */
  snapshot: unknown;
  engineVersion: string;
};

/** The table isn't on the project yet: before its migration, no month is closed. */
function isMissingTable(error: { code?: string }): boolean {
  return error.code === "PGRST205" || error.code === "42P01";
}

/** A month (`YYYY-MM`) of the business as the signed-in person may read it, or null when it was never closed. */
export async function getPayrollMonthRecord(
  businessId: string,
  month: string,
): Promise<PayrollMonthRecord | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payroll_months")
    .select(
      "month, closed_at, closed_by, reopened_at, reopened_by, reopen_reason, snapshot, engine_version",
    )
    .eq("business_id", businessId)
    .eq("month", `${month}-01`)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
  if (!data) return null;
  return {
    month: data.month.slice(0, 7),
    closedAt: data.closed_at,
    closedBy: data.closed_by,
    reopenedAt: data.reopened_at,
    reopenedBy: data.reopened_by,
    reopenReason: data.reopen_reason,
    snapshot: data.snapshot,
    engineVersion: data.engine_version,
  };
}

/** The business's months closed and not reopened, `YYYY-MM`, oldest first, as the signed-in person may read them. */
export async function getClosedMonths(businessId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payroll_months")
    .select("month")
    .eq("business_id", businessId)
    .is("reopened_at", null)
    .order("month");
  if (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }
  return data.map((row) => row.month.slice(0, 7));
}

export type CloseResult = { ok: true } | { ok: false; failure: CloseFailure };

function closeResult(
  error: { code?: string; message: string } | null,
  what: string,
): CloseResult {
  if (!error) return { ok: true };
  const failure = closeFailureOf(error.code, error.message);
  if (failure === "failed") console.error(`${what} failed`, error.message);
  return { ok: false, failure };
}

/**
 * `actor` closes a month (`YYYY-MM`) of the business, keeping what the hours
 * engine gave for it and the engine's version. The database refuses anyone
 * but an active owner or accountant, a month not yet ended by the business's
 * clock, and one closed already; it logs payroll.close and settles the
 * month's reminder.
 */
export async function closePayrollMonth(
  actorId: string,
  businessId: string,
  month: string,
  snapshot: ClosedSnapshot,
): Promise<CloseResult> {
  const { error } = await createAdminClient().rpc("close_payroll_month", {
    actor: actorId,
    business: businessId,
    for_month: `${month}-01`,
    closed_snapshot: snapshot as unknown as Json,
    with_engine: snapshot.month.engineVersion,
  });
  return closeResult(error, "closing a month");
}

/**
 * `actor` reopens a closed month (`YYYY-MM`) of the business, saying why. The
 * database refuses anyone but an active owner or accountant, a missing
 * reason, and a month that isn't closed; it logs payroll.reopen with the
 * reason.
 */
export async function reopenPayrollMonth(
  actorId: string,
  businessId: string,
  month: string,
  reason: string,
): Promise<CloseResult> {
  const { error } = await createAdminClient().rpc("reopen_payroll_month", {
    actor: actorId,
    business: businessId,
    for_month: `${month}-01`,
    why: reason,
  });
  return closeResult(error, "reopening a month");
}
