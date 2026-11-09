"use server";

import {
  cancelUnstartedList,
  finishList,
  type ListWrite,
  reopenList,
  sendList,
  setListItem,
} from "@db/lists";
import { anyItemResult, type ListProgress, sendInput } from "@domain/lists";
import { refresh } from "next/cache";
import { z } from "zod";
import { pushSoon } from "../../push/server";
import type { ListActionResult } from "./list-types";
import { listsAccess } from "./lists";

/**
 * A lists write as the signed-in person: never while viewing as someone, and
 * the database holds the rules of who may do what. `tells` says whether it may
 * have written a notification, which then goes to the phones.
 */
async function asMember<T>(
  run: (actorId: string, businessId: string) => Promise<ListWrite<T>>,
  after: { refresh: boolean; tells: boolean },
): Promise<ListActionResult<T>> {
  const access = await listsAccess();
  if (!access) return { ok: false, failure: "noAccess" };
  if (access.viewOnly) return { ok: false, failure: "viewOnly" };
  const result = await run(access.userId, access.businessId);
  if (result.ok && after.tells) pushSoon();
  if (after.refresh) refresh();
  return result;
}

const listId = z.uuid();

/**
 * Fills an item, or clears it with null (the undo). The screen keeps what it
 * shows and takes the list's progress back, so nothing is read again.
 */
export async function setListItemAction(
  itemId: unknown,
  result: unknown,
): Promise<ListActionResult<ListProgress>> {
  const item = z.uuid().safeParse(itemId);
  const parsed = anyItemResult.safeParse(result);
  if (!item.success || !parsed.success) {
    return { ok: false, failure: "invalid" };
  }
  return asMember((actor) => setListItem(actor, item.data, parsed.data), {
    refresh: false,
    tells: false,
  });
}

/** Finishes a list once every required item is done. */
export async function finishListAction(id: unknown): Promise<ListActionResult> {
  const list = listId.safeParse(id);
  if (!list.success) return { ok: false, failure: "invalid" };
  return asMember((actor) => finishList(actor, list.data), {
    refresh: true,
    tells: true,
  });
}

/** Opens a list again: the undo of finishing it, or a manager's correction. */
export async function reopenListAction(id: unknown): Promise<ListActionResult> {
  const list = listId.safeParse(id);
  if (!list.success) return { ok: false, failure: "invalid" };
  return asMember((actor) => reopenList(actor, list.data), {
    refresh: true,
    tells: true,
  });
}

/**
 * Takes back a list just sent, only while nobody has started it: the database
 * checks that under the list's lock ("finished" once someone has).
 */
export async function cancelListAction(id: unknown): Promise<ListActionResult> {
  const list = listId.safeParse(id);
  if (!list.success) return { ok: false, failure: "invalid" };
  return asMember((actor) => cancelUnstartedList(actor, list.data), {
    refresh: true,
    tells: false,
  });
}

/** Sends a list now, from a template, to a person, a department or a role. */
export async function sendListAction(
  input: unknown,
): Promise<ListActionResult<string>> {
  const list = sendInput.safeParse(input);
  if (!list.success) return { ok: false, failure: "invalid" };
  return asMember((actor, business) => sendList(actor, business, list.data), {
    refresh: true,
    tells: true,
  });
}
