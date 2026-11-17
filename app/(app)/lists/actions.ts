"use server";

import {
  type ListPhotoWrite,
  removeListItemPhoto,
  setListItemPhoto,
} from "@db/list-photos";
import {
  archiveListTemplate,
  cancelUnstartedList,
  finishList,
  type ListWrite,
  passList,
  reopenList,
  restoreListTemplate,
  saveListTemplate,
  sendList,
  setListItem,
} from "@db/lists";
import {
  anyItemResult,
  type ListProgress,
  listTemplateInput,
  passInput,
  type SavedTemplate,
  sendInput,
} from "@domain/lists";
import { refresh } from "next/cache";
import { z } from "zod";
import { pushSoon } from "../../push/server";
import type {
  ItemFailure,
  ListActionResult,
  ListPhotoResult,
} from "./list-types";
import { listsAccess } from "./lists";

/**
 * A lists write as the signed-in person: never while viewing as someone, and
 * the database holds the rules of who may do what. `tells` says whether it may
 * have written a notification, which then goes to the phones. `business` is
 * the business the screen was drawn for, where the write names one (payroll
 * P3b): the business the app opens is one cookie for the whole browser, so a
 * save or a send from a tab left open may arrive after the person switched
 * business, and is refused then ("businessChanged"), never written in the
 * other one. `F` is why the write itself can be refused.
 */
async function asMember<T, F extends string>(
  run: (actorId: string, businessId: string) => Promise<ListWrite<T, F>>,
  after: { refresh: boolean; tells: boolean; business?: unknown },
): Promise<
  ListActionResult<T, F | "noAccess" | "businessChanged" | "viewOnly">
> {
  const access = await listsAccess();
  if (!access) return { ok: false, failure: "noAccess" };
  if ("business" in after && after.business !== access.businessId) {
    return { ok: false, failure: "businessChanged" };
  }
  if (access.viewOnly) return { ok: false, failure: "viewOnly" };
  const result = await run(access.userId, access.businessId);
  if (result.ok && after.tells) pushSoon();
  if (after.refresh) refresh();
  return result;
}

const listId = z.uuid();
const templateId = z.uuid();
const seen = z.int().min(1).nullable();
/** A fix of a finished list (L6b-1), or a fill: said, never guessed. */
const fixingOf = z.boolean().optional().default(false);

/**
 * Fills an item, or clears it with null (the undo). The screen keeps what it
 * shows and takes the list's progress back, so nothing is read again.
 * `fixing` fixes an item of a finished list in place instead (L6b-1): the
 * database lets only those it allows (`private.can_fix_list`), keeps the
 * list closed and tells nobody, so nothing goes to the phones.
 */
export async function setListItemAction(
  itemId: unknown,
  result: unknown,
  fixing?: unknown,
): Promise<ListActionResult<ListProgress, ItemFailure>> {
  const item = z.uuid().safeParse(itemId);
  const parsed = anyItemResult.safeParse(result);
  const fix = fixingOf.safeParse(fixing);
  if (!item.success || !parsed.success || !fix.success) {
    return { ok: false, failure: "invalid" };
  }
  return asMember(
    (actor) => setListItem(actor, item.data, parsed.data, { fixing: fix.data }),
    { refresh: false, tells: false },
  );
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
 * Passes a list to another department, with a note (blank for none). Bound on
 * the page to the business it was drawn for. Nothing is read again here: the
 * screen refreshes itself, or goes back to Lists when the person no longer
 * reads the list.
 */
export async function passListAction(
  business: string,
  id: unknown,
  department: unknown,
  note: unknown,
): Promise<ListActionResult> {
  const pass = passInput.safeParse({
    list: id,
    department,
    ...(typeof note === "string" && note.trim() !== "" ? { note } : {}),
  });
  if (!pass.success) return { ok: false, failure: "invalid" };
  return asMember((actor) => passList(actor, pass.data), {
    refresh: false,
    tells: true,
    business,
  });
}

/**
 * A photo write as the signed-in person, in the business the screen was drawn
 * for (P3b), never while viewing; nothing of the file is logged. The screen
 * keeps what it shows, so nothing is read again.
 */
async function photoWrite(
  business: string,
  run: (actorId: string, businessId: string) => Promise<ListPhotoWrite>,
): Promise<ListPhotoResult> {
  const access = await listsAccess();
  if (!access) return { ok: false, failure: "noAccess" };
  if (business !== access.businessId) {
    return { ok: false, failure: "businessChanged" };
  }
  if (access.viewOnly) return { ok: false, failure: "viewOnly" };
  let result: ListPhotoWrite;
  try {
    result = await run(access.userId, access.businessId);
  } catch (error) {
    console.error(
      "a list photo failed",
      error instanceof Error ? error.message : "unknown",
    );
    return { ok: false, failure: "failed" };
  }
  return result.ok ? { ok: true, value: { photo: result.photo } } : result;
}

/**
 * Sets a photo item's photo (L6), as the screen re-encoded it (`photo` in the
 * form). The server checks the file again, stores it and removes the one it
 * replaced. Bound on the page to the business it was drawn for. `fixing`
 * sets it on an item of a finished list in place (L6b-1).
 */
export async function setListPhotoAction(
  business: string,
  itemId: unknown,
  form: FormData,
  fixing?: unknown,
): Promise<ListPhotoResult> {
  const item = z.uuid().safeParse(itemId);
  const fix = fixingOf.safeParse(fixing);
  if (!item.success || !fix.success) return { ok: false, failure: "invalid" };
  const photo = form instanceof FormData ? form.get("photo") : null;
  if (!(photo instanceof Blob)) return { ok: false, failure: "empty" };
  return photoWrite(business, (actor, id) =>
    setListItemPhoto(actor, id, item.data, photo, fix.data),
  );
}

/**
 * Removes a photo item's photo; the screen kept its bytes for the undo.
 * `fixing` removes it from an item of a finished list (L6b-1).
 */
export async function removeListPhotoAction(
  business: string,
  itemId: unknown,
  fixing?: unknown,
): Promise<ListPhotoResult> {
  const item = z.uuid().safeParse(itemId);
  const fix = fixingOf.safeParse(fixing);
  if (!item.success || !fix.success) return { ok: false, failure: "invalid" };
  return photoWrite(business, (actor, id) =>
    removeListItemPhoto(actor, id, item.data, fix.data),
  );
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

/**
 * Sends a list now, from a template or typed now, to a person, a department,
 * the people of a shift or a role, by a time if it has one. Bound on the page
 * to the business it was drawn for.
 */
export async function sendListAction(
  business: string,
  input: unknown,
): Promise<ListActionResult<string>> {
  const list = sendInput.safeParse(input);
  if (!list.success) return { ok: false, failure: "invalid" };
  return asMember((actor, id) => sendList(actor, id, list.data), {
    refresh: true,
    tells: true,
    business,
  });
}

/**
 * Saves a template as its editor has it now (the editor saves itself on
 * every change). `seenVersion` is the version it last read or saved, null
 * for a new one: a save behind the stored version is refused ("changed").
 * Nothing is read again here: the editor keeps what it shows, and takes back
 * the version and its items' ids for the next save.
 */
export async function saveListTemplateAction(
  business: string,
  input: unknown,
  seenVersion: unknown,
): Promise<ListActionResult<SavedTemplate>> {
  const template = listTemplateInput.safeParse(input);
  const version = seen.safeParse(seenVersion);
  if (!template.success || !version.success) {
    return { ok: false, failure: "invalid" };
  }
  return asMember(
    (actor, id) =>
      saveListTemplate(
        actor,
        id,
        template.data,
        version.data === null ? undefined : version.data,
      ),
    { refresh: false, tells: false, business },
  );
}

/** Removes a template from the screens; restoring it is the undo. */
export async function archiveListTemplateAction(
  business: string,
  id: unknown,
): Promise<ListActionResult> {
  const template = templateId.safeParse(id);
  if (!template.success) return { ok: false, failure: "invalid" };
  return asMember((actor) => archiveListTemplate(actor, template.data), {
    refresh: false,
    tells: false,
    business,
  });
}

/** Brings a removed template back. */
export async function restoreListTemplateAction(
  business: string,
  id: unknown,
): Promise<ListActionResult> {
  const template = templateId.safeParse(id);
  if (!template.success) return { ok: false, failure: "invalid" };
  return asMember((actor) => restoreListTemplate(actor, template.data), {
    refresh: true,
    tells: false,
    business,
  });
}
