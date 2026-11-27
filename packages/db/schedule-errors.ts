import { z } from "zod";

/**
 * A save or a publish of a week the database refused
 * (`public.save_week_schedule`, `public.publish_week_schedule`), with what it
 * said: its code, hint and detail as well as its words, so a caller can tell
 * the refusals apart (`scheduleTeamChanged`, `movedShifts`, `startedShifts`,
 * `pastShifts`, `scheduleWeekOver`, `edgeClashes`, `crowdedShifts`).
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

/**
 * A refusal of the week under way (20261115000300_running_week.sql), or
 * across its edge (20261115000600_running_week_edge.sql), by its code and
 * hint.
 */
function refusedAs(error: unknown, code: string, hint: string): boolean {
  return (
    error instanceof ScheduleWriteError &&
    error.code === code &&
    error.hint === hint
  );
}

/** The JSON array of ids a refusal's detail names; empty when it can't be read. */
function idsIn(detail: string | null): string[] {
  try {
    const ids = MovedIds.safeParse(JSON.parse(detail ?? ""));
    return ids.success ? ids.data : [];
  } catch {
    return [];
  }
}

/**
 * The shifts that had begun when the save or publish changed them or left
 * them out (55006 with hint `started`, the ids in its detail): in a published
 * week a shift that has begun stays as it was (Orel's answer of 15 November
 * 2026), and nothing was written. The running week's builder (R3a) meets it,
 * and so does next week's when the week turned while it was open, since the
 * action then writes the week now running. Null for any other failure.
 */
export function startedShifts(error: unknown): string[] | null {
  return refusedAs(error, "55006", "started")
    ? idsIn((error as ScheduleWriteError).detail)
    : null;
}

/**
 * The shifts someone was to join after they ended (55006 with hint `ended`,
 * the ids in its detail): a shift under way takes people (`joins`) only until
 * it ends. The builder sends no joins before the running week opens on it.
 * Null for any other failure.
 */
export function endedShifts(error: unknown): string[] | null {
  return refusedAs(error, "55006", "ended")
    ? idsIn((error as ScheduleWriteError).detail)
    : null;
}

const PastEntry = z.object({
  id: z.string().nullable(),
  day: z.iso.date(),
  start: z.string(),
});
const PastEntries = z.array(PastEntry).min(1);

export type PastShift = z.infer<typeof PastEntry>;

/**
 * The shifts that would start at or before the moment of the save or publish
 * (22023 with hint `past`: in a published week, a new shift, or one still to
 * start moved, starts after now), each with its id (null for a new one), day
 * and start as sent. Nothing was written. Null for any other failure.
 */
export function pastShifts(error: unknown): PastShift[] | null {
  if (!refusedAs(error, "22023", "past")) return null;
  try {
    const shifts = PastEntries.safeParse(
      JSON.parse((error as ScheduleWriteError).detail ?? ""),
    );
    return shifts.success ? shifts.data : [];
  } catch {
    return [];
  }
}

/**
 * The save or publish was for a published week that has wholly ended (55000
 * with hint `over`: its next week's first midnight and the end of its last
 * shift have passed): it no longer changes.
 */
export function scheduleWeekOver(error: unknown): boolean {
  return refusedAs(error, "55000", "over");
}

const EdgeEntry = z.object({
  /** Who would be on two shifts at once. */
  user: z.string(),
  /** The shift next door they are on: its name, day and start ("HH:MM"). */
  name: z.string(),
  day: z.iso.date(),
  start: z.string(),
  /** The week it is in, from the week written. */
  week: z.enum(["previous", "next"]),
});
const EdgeEntries = z.array(EdgeEntry).min(1);

export type EdgeClash = z.infer<typeof EdgeEntry>;

/**
 * Someone this save or publish puts on a shift already works one of the week
 * before or after at the same time (22023 with hint `clash`,
 * 20261115000600_running_week_edge.sql): each of them with the shift next
 * door, the earlier week's first, then by day and start. The screen shows
 * only its own week, so the database names the other shift. Nothing was
 * written. Empty when the detail can't be read; null for any other failure.
 */
export function edgeClashes(error: unknown): EdgeClash[] | null {
  if (!refusedAs(error, "22023", "clash")) return null;
  try {
    const clashes = EdgeEntries.safeParse(
      JSON.parse((error as ScheduleWriteError).detail ?? ""),
    );
    return clashes.success ? clashes.data : [];
  } catch {
    return [];
  }
}

/**
 * The shifts the save or publish would have taken past the people a shift
 * holds (22023 with hint `full`, the ids in its detail,
 * 20261128000500_shift_cap.sql: at most 50, MAX_PEOPLE_ON_A_SHIFT in
 * @domain/staffing, on every path that puts people on a shift). What was sent
 * passed the action's own count first (`weekSchedule`'s cap, and
 * `crowdedByJoins` in @domain/running-week for the people joining a shift
 * under way), so people were put on those shifts meanwhile, from another
 * screen. Nothing was written. Empty when the detail can't be read; null for
 * any other failure.
 */
export function crowdedShifts(error: unknown): string[] | null {
  return refusedAs(error, "22023", "full")
    ? idsIn((error as ScheduleWriteError).detail)
    : null;
}
