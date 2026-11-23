import "server-only";
import {
  type Absence,
  type AbsenceFailure,
  type AwaySpan,
  absence,
  absenceFailureOf,
  type ParsedAbsence,
} from "@domain/absences";
import { z } from "zod";
import { isMissingFunction } from "./missing";
import { isMissingTable } from "./notifications";
import { readAllPages } from "./pages";
import { createAdminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";

/*
 * Days away (20261127000600_absences.sql). Reads run under the signed-in
 * person (RLS: their own; whoever edits the clock or holds pay, the
 * business's), and the schedule's builders read only who and when
 * (public.team_away). Writes run with the secret key; the database checks
 * every rule for `actorId`, and callers make sure the actor is the signed-in
 * person and not viewing as someone else. Until Migrate brings the table and
 * its functions to a project, the reads answer none.
 */

const COLUMNS =
  "id, user_id, kind, from_day, to_day, note, recorded_by, recorded_at, changed_at, removed_by, removed_at";

type Row = {
  id: string;
  user_id: string;
  kind: string;
  from_day: string;
  to_day: string;
  note: string | null;
  recorded_by: string | null;
  recorded_at: string;
  changed_at: string | null;
  removed_by: string | null;
  removed_at: string | null;
};

/** A row as the screens read it; one that doesn't parse is a bug, and throws. */
export function absenceOf(row: Row): Absence {
  return absence.parse({
    id: row.id,
    userId: row.user_id,
    kind: row.kind,
    from: row.from_day,
    to: row.to_day,
    note: row.note,
    recordedBy: row.recorded_by,
    recordedAt: row.recorded_at,
    changedAt: row.changed_at,
    removedBy: row.removed_by,
    removedAt: row.removed_at,
  });
}

/**
 * A business's days away that touch [from, to] (`YYYY-MM-DD`, both
 * included), as the signed-in person may read them, in date order. With
 * `userId`, that person's only; with `withRemoved`, the removed ones too (the
 * payroll file's changes since an export). None before the migration.
 */
export async function getAbsences(
  businessId: string,
  from: string,
  to: string,
  options: { userId?: string; withRemoved?: boolean } = {},
): Promise<Absence[]> {
  const supabase = await createClient();
  const read = await readAllPages<Row, { code?: string }>((first, last) => {
    let query = supabase
      .from("absences")
      .select(COLUMNS)
      .eq("business_id", businessId)
      .lte("from_day", to)
      .gte("to_day", from);
    if (options.userId) query = query.eq("user_id", options.userId);
    if (!options.withRemoved) query = query.is("removed_at", null);
    // `id` breaks ties, so no row falls between two pages.
    return query.order("from_day").order("id").range(first, last);
  });
  if (read.data === null) {
    if (isMissingTable(read.error)) return [];
    throw read.error;
  }
  return read.data.map(absenceOf);
}

const awayRow = z.object({
  user_id: z.string(),
  from_day: z.string(),
  to_day: z.string(),
});

/**
 * Who on the staff is away over [from, to] and when, without the kind or the
 * note, for whoever builds the schedule or edits the clock (empty for anyone
 * else, and over more than 62 days). None before the migration.
 */
export async function getTeamAway(
  businessId: string,
  from: string,
  to: string,
): Promise<AwaySpan[]> {
  const supabase = await createClient();
  const read = await readAllPages<unknown, { code?: string }>((first, last) =>
    supabase
      .rpc("team_away", {
        business: businessId,
        first_day: from,
        last_day: to,
      })
      // One person is away once a day, so these two order every row.
      .order("from_day")
      .order("user_id")
      .range(first, last),
  );
  if (read.data === null) {
    if (isMissingFunction(read.error)) return [];
    throw read.error;
  }
  return read.data.map((row) => {
    const one = awayRow.parse(row);
    return { userId: one.user_id, from: one.from_day, to: one.to_day };
  });
}

export type AbsenceResult<T = undefined> =
  | { ok: true; value: T }
  | {
      ok: false;
      failure: AbsenceFailure;
      /** The month closed for payroll, `YYYY-MM`, when that is why. */
      month?: string;
    };

type RpcError = {
  code?: string;
  message: string;
  hint?: string | null;
  details?: string | null;
};

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** A refusal as the screen says it. Only the message is logged: it holds no note. */
function refusal(error: RpcError): AbsenceResult<never> {
  const failure = absenceFailureOf(error.code, error.hint ?? null);
  if (failure === "failed") console.error("days away failed", error.message);
  const month = error.details?.trim();
  return failure === "monthClosed" && month && MONTH.test(month)
    ? { ok: false, failure, month }
    : { ok: false, failure };
}

async function call<T>(
  run: () => PromiseLike<{ data: T | null; error: RpcError | null }>,
): Promise<AbsenceResult<T>> {
  const { data, error } = await run();
  if (!error) return { ok: true, value: data as T };
  return refusal(error);
}

/**
 * Whoever edits the clock records that someone on the staff is away (logged
 * as `clock.absence_add`, without the note). Their own days only an owner
 * records. Returns the record's id.
 */
export const recordAbsence = (
  actorId: string,
  businessId: string,
  personId: string,
  values: ParsedAbsence,
) =>
  call(() =>
    createAdminClient().rpc("record_absence", {
      actor: actorId,
      business: businessId,
      person: personId,
      absence_kind: values.kind,
      first_day: values.from,
      last_day: values.to,
      ...(values.note === null ? {} : { absence_note: values.note }),
    }),
  );

/** Whoever edits the clock changes a record's kind, days or note (`clock.absence_change`). */
export const changeAbsence = (
  actorId: string,
  absenceId: string,
  values: ParsedAbsence,
) =>
  call(() =>
    createAdminClient().rpc("change_absence", {
      actor: actorId,
      absence: absenceId,
      absence_kind: values.kind,
      first_day: values.from,
      last_day: values.to,
      ...(values.note === null ? {} : { absence_note: values.note }),
    }),
  );

/** Whoever edits the clock removes a record; it stays, and counts nowhere (`clock.absence_remove`). */
export const removeAbsence = (actorId: string, absenceId: string) =>
  call(() =>
    createAdminClient().rpc("remove_absence", {
      actor: actorId,
      absence: absenceId,
    }),
  );

/** Whoever removed a record brings it back, within ten minutes (`clock.absence_restore`). */
export const restoreAbsence = (actorId: string, absenceId: string) =>
  call(() =>
    createAdminClient().rpc("restore_absence", {
      actor: actorId,
      absence: absenceId,
    }),
  );
