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

const hourMinute = z.string().regex(/^\d{2}:\d{2}$/);

/**
 * The shift as a request keeps it (`shift_swaps.shift`, private.shift_brief):
 * its day, name and hours when it was asked for, never rewritten, so it
 * outlives the shift.
 */
export const swapShift = z.object({
  day: z.iso.date(),
  name: z.string(),
  start: hourMinute,
  end: hourMinute,
});
export type SwapShift = z.infer<typeof swapShift>;

/** Why a cancelled request was cancelled (`shift_swaps.cancelled_because`). */
export const SWAP_CANCEL_REASONS = ["withdrawn", "schedule", "team"] as const;

/**
 * How a request that no longer waits ended: approved or declined by whoever
 * decides, or cancelled, by whoever asked (`withdrawn`), by a change to the
 * schedule or by a change in the team.
 */
export const SWAP_OUTCOMES = [
  "approved",
  "declined",
  ...SWAP_CANCEL_REASONS,
] as const;
export type SwapOutcome = (typeof SWAP_OUTCOMES)[number];

/** A request that no longer waits, with the shift it asked for. */
export type EndedSwap = {
  id: string;
  /** Null once the shift was deleted; the request keeps `shift`. */
  shiftId: string | null;
  shift: SwapShift;
  requestedBy: string;
  /** Kept when it was cancelled after someone took it. */
  takenBy: string | null;
  outcome: SwapOutcome;
  /** Whoever approved or declined it; null for a cancelled one. */
  decidedBy: string | null;
  /** ISO, as the database wrote it: orders requests on one shift. */
  createdAt: string;
};

const endedSwapRow = z.object({
  id: z.uuid(),
  shift_id: z.uuid().nullable(),
  shift: swapShift,
  requested_by: z.uuid(),
  taken_by: z.uuid().nullable(),
  status: z.enum(SWAP_STATUSES),
  cancelled_because: z.enum(SWAP_CANCEL_REASONS).nullable(),
  decided_by: z.uuid().nullable(),
  created_at: z.string(),
});

/**
 * A `shift_swaps` row as read, as a request that ended: approved and
 * declined by their status, cancelled by why (`cancelled_because`,
 * 20261115000200_swap_history.sql). Null for one still waiting, a cancelled
 * one that doesn't say why, or a row whose shift doesn't read.
 */
export function endedSwapOf(row: unknown): EndedSwap | null {
  const parsed = endedSwapRow.safeParse(row);
  if (!parsed.success) return null;
  const r = parsed.data;
  const outcome =
    r.status === "approved" || r.status === "declined"
      ? r.status
      : r.status === "cancelled"
        ? r.cancelled_because
        : null;
  if (!outcome) return null;
  return {
    id: r.id,
    shiftId: r.shift_id,
    shift: r.shift,
    requestedBy: r.requested_by,
    takenBy: r.taken_by,
    outcome,
    decidedBy: r.decided_by,
    createdAt: r.created_at,
  };
}

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
const byShiftTime = (
  a: { shift: Pick<ScheduledShift, "day" | "start" | "name"> },
  b: { shift: Pick<ScheduledShift, "day" | "start" | "name"> },
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

/** Where a request's shift is: its id, or the shift it kept once deleted. */
const shiftKey = ({ shiftId, shift }: EndedSwap) =>
  shiftId ?? `${shift.day}|${shift.start}|${shift.end}|${shift.name}`;

const newer = (a: EndedSwap, b: EndedSwap) => a.createdAt > b.createdAt;

/** A request the person was part of that no longer waits, and their side. */
export type PastRequest = {
  swap: EndedSwap;
  /** `from`: they asked to give it away. `to`: they took it. */
  side: "from" | "to";
};

/**
 * What became of the requests `userId` asked for or took, on shifts from
 * `today` on (by the shift each asked for, which outlives the shift), by
 * shift time: the newest of theirs on each shift, as an older one on it no
 * longer says where things stand. A shift on which a request of theirs still
 * waits (`live`) is left out, since the request says it on the shift. Each
 * is what happened then, not where the shift is now: a decided request stays
 * as it was while its shift is deleted, changed or given away again by
 * someone else, so the screen says it in the past (`pastRequestLine`), and a
 * deleted shift's, kept by the shift it asked for, says the shift was taken
 * off.
 */
export function pastRequestsFor(
  ended: readonly EndedSwap[],
  live: readonly ShiftSwap[],
  userId: string,
  today: string,
): PastRequest[] {
  const waiting = new Set(
    live
      .filter((s) => s.requestedBy === userId || s.takenBy === userId)
      .map((s) => s.shiftId),
  );
  const newest = new Map<string, PastRequest>();
  for (const swap of ended) {
    const side =
      swap.requestedBy === userId
        ? "from"
        : swap.takenBy === userId
          ? "to"
          : null;
    if (!side || swap.shift.day < today) continue;
    if (swap.shiftId !== null && waiting.has(swap.shiftId)) continue;
    const key = shiftKey(swap);
    const kept = newest.get(key);
    if (!kept || newer(swap, kept.swap)) newest.set(key, { swap, side });
  }
  return [...newest.values()].sort((a, b) => byShiftTime(a.swap, b.swap));
}

/** What a person's own shift says about a request of theirs that ended. */
export type OutcomeOnShift = Extract<SwapOutcome, "declined" | "schedule">;

/**
 * What the person's own shift says about their newest request to give it
 * away, once it no longer waits: not approved, or cancelled by a change to
 * the schedule that kept them on it. Null while a request of theirs waits on
 * it, and for one they withdrew themselves, one approved (the shift is no
 * longer theirs) or one a change in the team ended.
 */
export function outcomeOnShift(
  ended: readonly EndedSwap[],
  live: readonly ShiftSwap[],
  shiftId: string,
  userId: string,
): OutcomeOnShift | null {
  if (myRequestFor(live, shiftId, userId)) return null;
  let last: EndedSwap | null = null;
  for (const swap of ended) {
    if (swap.shiftId !== shiftId || swap.requestedBy !== userId) continue;
    if (!last || newer(swap, last)) last = swap;
  }
  return last?.outcome === "declined" || last?.outcome === "schedule"
    ? last.outcome
    : null;
}

/**
 * What whoever decides sees no longer waits for a decision: the requests a
 * colleague took that were approved, declined or cancelled since, on shifts
 * from `today` on, by shift time. One cancelled before anyone took it never
 * waited for them, so it is left out.
 */
export function noLongerWaiting(
  ended: readonly EndedSwap[],
  today: string,
): EndedSwap[] {
  return ended
    .filter((swap) => swap.takenBy !== null && swap.shift.day >= today)
    .sort(byShiftTime);
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
