import { z } from "zod";
import { dayOfWeek, timeOfDay } from "./hours";

/**
 * What a business staffs: its positions (waiter, cook…) and its weekly
 * shift pattern (which shifts run on which days, and how many people each
 * needs). Names are the business's own data, in its language. Both live in
 * the scheduling module's settings and come from the business's template.
 */

const key = z
  .string()
  .regex(/^[a-z][a-z0-9-]*$/, "Expected a lowercase key")
  .max(40);

const name = z.string().trim().min(1).max(40);

export const position = z.object({ key, name });

export type Position = z.infer<typeof position>;

/** Each key once. */
function uniqueKeys<T extends { key: string }>(items: T[]): boolean {
  return new Set(items.map((item) => item.key)).size === items.length;
}

export const positions = z
  .array(position)
  .max(30)
  .refine(uniqueKeys, { message: "Position keys must be unique" });

export const shiftPattern = z
  .object({
    key,
    name,
    /** The days this shift runs, 0 = Sunday. */
    days: z
      .array(dayOfWeek)
      .min(1)
      .refine((days) => new Set(days).size === days.length, {
        message: "Each day once",
      }),
    start: timeOfDay,
    /** At or before `start` means the shift ends after midnight. */
    end: timeOfDay,
    /** People the shift needs. */
    needed: z.int().min(1).max(50),
  })
  .refine((shift) => shift.start !== shift.end, {
    message: "Start and end must differ",
  });

export type ShiftPattern = z.infer<typeof shiftPattern>;

export const shiftPatterns = z
  .array(shiftPattern)
  .max(30)
  .refine(uniqueKeys, { message: "Shift keys must be unique" });

/** The shifts that run on `day`, earliest first. */
export function shiftsOn(
  patterns: readonly ShiftPattern[],
  day: number,
): ShiftPattern[] {
  return patterns
    .filter((shift) => shift.days.includes(day))
    .sort((a, b) => a.start.localeCompare(b.start));
}
