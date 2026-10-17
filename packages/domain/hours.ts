import { z } from "zod";

/**
 * Times of day and weekly opening hours. Days are numbered 0 (Sunday) to
 * 6 (Saturday). A range whose end is not after its start runs past
 * midnight ("19:30"–"00:30" ends at half past midnight the next day).
 */

export const DAYS = [0, 1, 2, 3, 4, 5, 6] as const;

export const dayOfWeek = z.int().min(0).max(6);

/** "HH:MM", 24-hour clock. */
export const timeOfDay = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected a time as HH:MM");

/** Minutes since midnight for an "HH:MM" time. */
export function minutesOf(time: string): number {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

/** Length of a range in minutes; an end at or before the start is the next day. */
export function rangeMinutes(start: string, end: string): number {
  const length = minutesOf(end) - minutesOf(start);
  return length > 0 ? length : length + 24 * 60;
}

/** Two ranges on the same day overlap (ends past midnight count as late). */
function overlaps(
  a: { open: string; close: string },
  b: { open: string; close: string },
): boolean {
  const aStart = minutesOf(a.open);
  const bStart = minutesOf(b.open);
  return (
    aStart < bStart + rangeMinutes(b.open, b.close) &&
    bStart < aStart + rangeMinutes(a.open, a.close)
  );
}

export const openingRange = z
  .object({ day: dayOfWeek, open: timeOfDay, close: timeOfDay })
  .refine((range) => range.open !== range.close, {
    message: "Opening and closing times must differ",
  });

export type OpeningRange = z.infer<typeof openingRange>;

/**
 * The business's weekly opening hours: any number of ranges per day (a
 * day without one is closed), none overlapping another on the same day.
 */
export const openingHours = z
  .array(openingRange)
  .max(21)
  .superRefine((ranges, ctx) => {
    ranges.forEach((range, i) => {
      for (const other of ranges.slice(0, i)) {
        if (other.day === range.day && overlaps(other, range)) {
          ctx.addIssue({
            code: "custom",
            path: [i],
            message: `Overlaps another range on day ${range.day}`,
          });
        }
      }
    });
  });

export type OpeningHours = z.infer<typeof openingHours>;
