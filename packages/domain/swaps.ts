import { z } from "zod";
import { minutesOf, rangeMinutes } from "./hours";
import type { ScheduledShift } from "./schedule";

/**
 * Shift swaps: a worker gives away a shift of a published week, a
 * colleague takes it, and a manager approves or declines. The database
 * holds the rules (`public.request_shift_swap` and friends); these are the
 * pieces the screens need to show where each request stands.
 */

export const SWAP_STATUSES = [
  "open",
  "taken",
  "approved",
  "declined",
  "cancelled",
] as const;
export type SwapStatus = (typeof SWAP_STATUSES)[number];

/** A request still waiting: nobody took it yet, or a manager decides. */
export type LiveSwapStatus = Extract<SwapStatus, "open" | "taken">;

export const shiftSwap = z.object({
  id: z.uuid(),
  shiftId: z.uuid(),
  requestedBy: z.string(),
  takenBy: z.string().nullable(),
  status: z.enum(["open", "taken"]),
});
export type ShiftSwap = z.infer<typeof shiftSwap>;

/** A shift with its id, as the published schedule reads it. */
export type SwappableShift = Pick<
  ScheduledShift,
  "day" | "start" | "end" | "name" | "assignees"
> & { id: string };

/** The live request `userId` made for `shiftId`, if any. */
export function myRequestFor(
  swaps: readonly ShiftSwap[],
  shiftId: string,
  userId: string,
): ShiftSwap | null {
  return (
    swaps.find((s) => s.shiftId === shiftId && s.requestedBy === userId) ?? null
  );
}

/** Minutes since 1970-01-01 local midnight, for comparing across weeks. */
function span(shift: Pick<ScheduledShift, "day" | "start" | "end">) {
  const [y, m, d] = shift.day.split("-").map(Number);
  const from =
    Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) / 60000 + minutesOf(shift.start);
  return [from, from + rangeMinutes(shift.start, shift.end)] as const;
}

/** True when two shifts share any minute (past midnight counts). */
export function shiftsOverlap(
  a: Pick<ScheduledShift, "day" | "start" | "end">,
  b: Pick<ScheduledShift, "day" | "start" | "end">,
): boolean {
  const [a0, a1] = span(a);
  const [b0, b1] = span(b);
  return a0 < b1 && b0 < a1;
}

/** Shift time order, for lists of requests. */
const byShiftTime = <S extends SwappableShift>(
  a: { shift: S },
  b: { shift: S },
) =>
  `${a.shift.day}${a.shift.start}${a.shift.name}`.localeCompare(
    `${b.shift.day}${b.shift.start}${b.shift.name}`,
  );

/** Where a colleague's request stands for the person reading it. */
export type OfferState =
  /** They can take it. */
  | "available"
  /** They work another shift at the same time. */
  | "busy"
  /** They took it; a manager decides. */
  | "takenByYou";

export type Offer<S> = {
  swap: ShiftSwap;
  shift: S;
  state: OfferState;
};

/**
 * The shifts colleagues give away that `userId` may take, from `from` on
 * (today), day by day: open requests by others for shifts they are not
 * on, plus the ones they took that wait for a manager. A shift at the same
 * time as one of their own is listed as "busy", so they see why they
 * cannot take it. Requests taken by someone else are left out.
 */
export function offersFor<S extends SwappableShift>(
  swaps: readonly ShiftSwap[],
  shifts: readonly S[],
  userId: string,
  from: string,
): Offer<S>[] {
  const byId = new Map(shifts.map((s) => [s.id, s]));
  const mine = shifts.filter((s) => s.assignees.some((a) => a.user === userId));
  return swaps
    .flatMap((swap): Offer<S>[] => {
      const shift = byId.get(swap.shiftId);
      if (!shift || shift.day < from || swap.requestedBy === userId) return [];
      if (swap.status === "taken") {
        return swap.takenBy === userId
          ? [{ swap, shift, state: "takenByYou" }]
          : [];
      }
      if (shift.assignees.some((a) => a.user === userId)) return [];
      const busy = mine.some(
        (m) => m.id !== shift.id && shiftsOverlap(m, shift),
      );
      return [{ swap, shift, state: busy ? "busy" : "available" }];
    })
    .sort(byShiftTime);
}

/** A request a colleague took, waiting for a manager to decide. */
export type Approval<S> = {
  swap: ShiftSwap & { takenBy: string };
  shift: S;
  /** The position the worker giving it away holds on the shift. */
  position: string | null;
};

/**
 * What a manager approves or declines: the requests a colleague took,
 * for shifts from `from` on (today), by shift time. Requests for days that
 * have passed or for shifts no longer in the schedule are left out; the
 * database refuses to decide on a shift that started.
 */
export function approvalsFor<S extends SwappableShift>(
  swaps: readonly ShiftSwap[],
  shifts: readonly S[],
  from: string,
): Approval<S>[] {
  const byId = new Map(shifts.map((s) => [s.id, s]));
  return swaps
    .flatMap((swap): Approval<S>[] => {
      const shift = byId.get(swap.shiftId);
      const { takenBy } = swap;
      if (swap.status !== "taken" || !takenBy || !shift || shift.day < from) {
        return [];
      }
      const position =
        shift.assignees.find((a) => a.user === swap.requestedBy)?.position ??
        null;
      return [{ swap: { ...swap, takenBy }, shift, position }];
    })
    .sort(byShiftTime);
}

/** Why the database refused a swap step, for the screen to explain. */
export type SwapFailure =
  | "noAccess"
  | "viewOnly"
  | "started"
  | "closed"
  | "busy"
  | "already"
  | "failed";

/**
 * A Postgres error code from the swap functions, as a failure the screen
 * explains: 55000 the shift started (told apart by the message) or the
 * request is closed, 22023 the colleague is busy or already on it, 23505
 * asked twice, 42501 and P0002 no access.
 */
export function swapFailureOf(
  code: string | undefined,
  message = "",
): SwapFailure {
  switch (code) {
    case "55000":
      return /started/i.test(message) ? "started" : "closed";
    case "22023":
      return "busy";
    case "23505":
      return "already";
    case "42501":
    case "P0002":
      return "noAccess";
    default:
      return "failed";
  }
}
