import { z } from "zod";

/**
 * A save or a publish of a week the database refused
 * (`public.save_week_schedule`, `public.publish_week_schedule`), with what it
 * said: its code, hint and detail as well as its words, so a caller can tell
 * the refusals apart (`scheduleTeamChanged`, `movedShifts`).
 */
export class ScheduleWriteError extends Error {
  readonly code: string | null;
  readonly hint: string | null;
  readonly detail: string | null;

  constructor(
    message: string,
    error: {
      code?: string | null;
      hint?: string | null;
      details?: string | null;
    },
  ) {
    super(message);
    this.name = "ScheduleWriteError";
    this.code = error.code ?? null;
    this.hint = error.hint ?? null;
    this.detail = error.details ?? null;
  }
}

/**
 * What the database says when a week saved or published puts someone no
 * longer on the team on a shift (`private.write_week_schedule`, 22023) or
 * someone off the staff (`private.refuse_non_staff`, 42501): a builder
 * opened before they were taken off it (20261114000100_team_changes.sql).
 * Both sentences are pinned by pgTAP (team_changes.test.sql and
 * payroll_access.test.sql), so a migration that rewords one fails there
 * before the screen loses its words.
 */
const OFF_THE_TEAM = [
  "Only active members of the business can work a shift",
  "An accountant is not on the staff",
];

/**
 * The save or publish failed because someone on the week left the team or
 * the staff since the screen was drawn (`saveWeekSchedule` and
 * `publishWeekSchedule` in ./schedule throw the database's message): the
 * screen asks to be read again, and their shifts then show as missing.
 */
export function scheduleTeamChanged(error: unknown): boolean {
  return (
    error instanceof Error &&
    OFF_THE_TEAM.some((message) => error.message.includes(message))
  );
}

/**
 * What the database says when someone would work two shifts at once
 * (`private.write_week_schedule`, 22023), pinned by week_in_place.test.sql.
 */
const TWO_AT_ONCE = "A person works two shifts at once";

/**
 * The save or publish failed because it would put someone on two shifts at
 * once with a shift the screen does not show as it is: what was sent passed
 * the same check first (`weekSchedule` in @domain/schedule), so the clash is
 * with something that changed meanwhile (a swap approved, another manager's
 * shift). Sending the same again can never work: the screen asks to be read
 * again.
 */
export function scheduleClashedMeanwhile(error: unknown): boolean {
  return (
    error instanceof ScheduleWriteError &&
    error.code === "22023" &&
    error.message.includes(TWO_AT_ONCE)
  );
}

const MovedIds = z.array(z.string()).min(1);

/**
 * The shifts that changed since the screen read them, when that is why the
 * save or publish was refused (40001 with hint `moved`, the ids in its detail,
 * 20261115000100_week_in_place.sql): someone else changed them meanwhile, a
 * swap was approved on one, or someone on one left the team. Nothing was
 * written. Null for any other failure.
 */
export function movedShifts(error: unknown): string[] | null {
  if (
    !(error instanceof ScheduleWriteError) ||
    error.code !== "40001" ||
    error.hint !== "moved"
  ) {
    return null;
  }
  try {
    const ids = MovedIds.safeParse(JSON.parse(error.detail ?? ""));
    return ids.success ? ids.data : [];
  } catch {
    return [];
  }
}
