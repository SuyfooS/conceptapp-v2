import { z } from "zod";
import { dateIn } from "./availability";
import { minutesOf, rangeMinutes } from "./hours";
import { type ScheduledShift, sameShift, shiftStarted } from "./schedule";

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
 * The shifts colleagues give away that `userId` may take, those that have
 * not begun at `now` (`shiftStarted`, as the database refuses a take or an
 * approval from the start on), day by day: open requests by others for
 * shifts they are not on, plus the ones they took that wait for a manager.
 * A shift at the same time as one of their own is listed as "busy", so they
 * see why they cannot take it; their own shift on now counts for that.
 * Requests taken by someone else are left out.
 */
export function offersFor<S extends SwappableShift>(
  swaps: readonly ShiftSwap[],
  shifts: readonly S[],
  userId: string,
  now: Date,
  timeZone: string,
): Offer<S>[] {
  const byId = new Map(shifts.map((s) => [s.id, s]));
  const mine = shifts.filter((s) => s.assignees.some((a) => a.user === userId));
  return swaps
    .flatMap((swap): Offer<S>[] => {
      const shift = byId.get(swap.shiftId);
      if (
        !shift ||
        swap.requestedBy === userId ||
        shiftStarted(shift, now, timeZone)
      ) {
        return [];
      }
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
  /**
   * Its shift has begun (`shiftStarted`): the database refuses approving it
   * from the start on, so declining is all that is left, and it no longer
   * counts as waiting for approval.
   */
  started: boolean;
};

/**
 * What a manager approves or declines: the requests a colleague took, for
 * shifts from today on (the business's day at `now`), by shift time.
 * Requests for days that have passed or for shifts no longer in the
 * schedule are left out. One whose shift has begun at `now` stays, marked
 * `started`, as the database still lets a manager decline it.
 */
export function approvalsFor<S extends SwappableShift>(
  swaps: readonly ShiftSwap[],
  shifts: readonly S[],
  now: Date,
  timeZone: string,
): Approval<S>[] {
  const today = dateIn(now, timeZone);
  const byId = new Map(shifts.map((s) => [s.id, s]));
  return swaps
    .flatMap((swap): Approval<S>[] => {
      const shift = byId.get(swap.shiftId);
      const { takenBy } = swap;
      if (swap.status !== "taken" || !takenBy || !shift || shift.day < today) {
        return [];
      }
      const position =
        shift.assignees.find((a) => a.user === swap.requestedBy)?.position ??
        null;
      return [
        {
          swap: { ...swap, takenBy },
          shift,
          position,
          started: shiftStarted(shift, now, timeZone),
        },
      ];
    })
    .sort(byShiftTime);
}

/** The requests a manager can still approve: their shift has not begun. */
export const toApprove = <S>(approvals: readonly Approval<S>[]) =>
  approvals.filter((a) => !a.started);

/**
 * Whether `decider`, who builds the schedule, decides this request: whoever
 * publishes it too decides every one; someone who builds without publishing
 * (the roles plan's R3) decides colleagues' requests only, never one they
 * asked for or took, since approving it changes a published week, which
 * they never do on their word alone (`public.decide_shift_swap`).
 */
export function decidesSwap(
  swap: Pick<ShiftSwap, "requestedBy" | "takenBy">,
  decider: { userId: string; publishes: boolean },
): boolean {
  return (
    decider.publishes ||
    (swap.requestedBy !== decider.userId && swap.takenBy !== decider.userId)
  );
}

/**
 * The waiting requests (open, or taken and waiting for a manager) that
 * sending `sent` for a week the screen read as `read` would end, for the
 * warning above "פרסום השינויים" (Orel's answer 2 of 15 November 2026). The
 * database decides (`private.write_week_schedule`,
 * 20261115000100_week_in_place.sql); this reads its rule off the screen, and
 * swaps.test.ts mirrors week_in_place.test.sql's cases one for one, all but
 * those with nothing to say about requests (refused payloads, drafts and
 * positions):
 * - a request on a shift read and not sent (deleted) ends;
 * - one on a shift sent changed ends when its day, start or end changed, or
 *   whoever asked is no longer on it;
 * - one on a shift sent as it was read waits on, and so does one on a shift
 *   changed in any other way: someone else put on it, even its taker (which
 *   opens it again with no taker rather than ending it);
 * - one on a shift the screen did not read (another week's, or one another
 *   manager added meanwhile) is not this write's;
 * - with nothing read (`replace`: the week sent with no basis), every request
 *   on a shift read ends, as the week is replaced.
 * A shift changed both here and meanwhile is refused rather than written
 * (`weekMoved`), so its request would not end yet; it is counted as if it
 * would.
 */
export function swapsEndedBy<
  W extends Pick<ShiftSwap, "shiftId" | "requestedBy">,
>(
  read: readonly ScheduledShift[],
  sent: readonly ScheduledShift[],
  swaps: readonly W[],
  replace = false,
): W[] {
  const byId = (shifts: readonly ScheduledShift[]) =>
    new Map(
      shifts.flatMap((shift) => (shift.id ? [[shift.id, shift] as const] : [])),
    );
  const before = byId(read);
  const after = byId(sent);
  return swaps.filter((swap) => {
    const was = before.get(swap.shiftId);
    if (!was) return false;
    if (replace) return true;
    const now = after.get(swap.shiftId);
    if (!now) return true;
    if (sameShift(was, now)) return false;
    return (
      now.day !== was.day ||
      now.start !== was.start ||
      now.end !== was.end ||
      !now.assignees.some((a) => a.user === swap.requestedBy)
    );
  });
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
