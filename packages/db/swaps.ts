import "server-only";
import { type ShiftSwap, type SwapFailure, swapFailureOf } from "@domain/swaps";
import { createAdminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";

/**
 * A business's live shift swaps (open, or taken and waiting for a
 * manager), as the signed-in person may read them (RLS: active members of
 * the business, and "view as").
 */
export async function getLiveSwaps(businessId: string): Promise<ShiftSwap[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shift_swaps")
    .select("id, shift_id, requested_by, taken_by, status")
    .eq("business_id", businessId)
    .in("status", ["open", "taken"])
    .order("created_at");
  if (error) throw error;
  return data.flatMap((row) =>
    row.status === "open" || row.status === "taken"
      ? [
          {
            id: row.id,
            shiftId: row.shift_id,
            requestedBy: row.requested_by,
            takenBy: row.taken_by,
            status: row.status,
          },
        ]
      : [],
  );
}

export type SwapResult = { ok: true } | { ok: false; failure: SwapFailure };

async function call(
  run: () => PromiseLike<{
    error: { code?: string; message: string } | null;
  }>,
): Promise<SwapResult> {
  const { error } = await run();
  if (!error) return { ok: true };
  const failure = swapFailureOf(error.code, error.message);
  if (failure === "failed") console.error("shift swap failed", error.message);
  return { ok: false, failure };
}

/*
 * The steps of a swap, with the secret key (`public.request_shift_swap`,
 * `take_shift_swap`, `cancel_shift_swap`). The database checks every rule
 * for `actorId`; callers make sure the actor is the signed-in person and
 * not viewing as someone else.
 */

/** `actorId` asks to give away their shift. */
export const requestShiftSwap = (actorId: string, shiftId: string) =>
  call(() =>
    createAdminClient().rpc("request_shift_swap", {
      actor: actorId,
      shift: shiftId,
    }),
  );

/** `actorId` takes a colleague's open request; a manager decides next. */
export const takeShiftSwap = (actorId: string, swapId: string) =>
  call(() =>
    createAdminClient().rpc("take_shift_swap", {
      actor: actorId,
      swap: swapId,
    }),
  );

/** The person who asked withdraws, until a manager decides. */
export const cancelShiftSwap = (actorId: string, swapId: string) =>
  call(() =>
    createAdminClient().rpc("cancel_shift_swap", {
      actor: actorId,
      swap: swapId,
    }),
  );

/**
 * A manager or owner approves (the colleague takes the worker's place) or
 * declines a taken request. The database checks every rule again.
 */
export const decideShiftSwap = (
  actorId: string,
  swapId: string,
  approve: boolean,
) =>
  call(() =>
    createAdminClient().rpc("decide_shift_swap", {
      actor: actorId,
      swap: swapId,
      approve,
    }),
  );
