"use server";

import type { DepartmentInput } from "@domain/departments";
import {
  anyItemResult,
  type ListProgress,
  listItemInput,
  listName,
  passNote,
  type SavedTemplate,
} from "@domain/lists";
import { STAFF_ROLES } from "@domain/modules";
import { z } from "zod";
import type {
  ListActionResult,
  ListPhotoResult,
  SendResult,
} from "../../../(app)/lists/list-types";
import type { SettingsResult } from "../../../(app)/manage/settings-types";
import { listPhotos } from "../../list-photos";

// Stand-ins for the lists actions on the design demo: the same checks as the
// app where its mock ids allow, and nothing stored. What changes stays on
// screen until a reload.

const NO_PROGRESS: ListProgress = {
  done: 0,
  total: 0,
  required: 0,
  requiredLeft: 0,
};

export async function demoSetListItem(
  _itemId: string,
  result: unknown,
): Promise<ListActionResult<ListProgress>> {
  return anyItemResult.safeParse(result).success
    ? { ok: true, value: NO_PROGRESS }
    : { ok: false, failure: "invalid" };
}

export async function demoListChange(
  _listId: string,
): Promise<ListActionResult> {
  return { ok: true, value: null };
}

/**
 * Passing a list on (L5), as the demo's sheet does it: a department of the
 * mock data ("dep-bar") and a note of at most 200, and nothing stored.
 */
export async function demoPassList(
  _listId: string,
  department: string,
  note: string,
): Promise<ListActionResult> {
  return department.startsWith("dep-") && passNote.safeParse(note).success
    ? { ok: true, value: null }
    : { ok: false, failure: "invalid" };
}

/**
 * A photo taken on the demo (L6): a photo item of the mock data and a picture
 * in the form, nothing stored. It shows as the demo's illustration of a clean
 * kitchen, as if stored, and the undo of a removal sends that illustration
 * back, so any picture is taken here.
 */
export async function demoSetListPhoto(
  itemId: string,
  form: FormData,
): Promise<ListPhotoResult> {
  const photo = form.get("photo");
  if (!(photo instanceof Blob) || photo.size === 0) {
    return { ok: false, failure: "empty" };
  }
  if (!photo.type.startsWith("image/")) {
    return { ok: false, failure: "type" };
  }
  return itemId.length > 0
    ? { ok: true, value: { photo: listPhotos.kitchen } }
    : { ok: false, failure: "invalid" };
}

/** A photo removed on the demo: nothing stored, so nothing to remove. */
export async function demoRemoveListPhoto(
  itemId: string,
): Promise<ListPhotoResult> {
  return itemId.length > 0
    ? { ok: true, value: { photo: null } }
    : { ok: false, failure: "invalid" };
}

/**
 * A send as the demo's form makes it: `sendInput`'s shape, with the mock data's
 * ids ("t-kitchen-opening", "dep-kitchen", "shiran", "s-tue-evening") where
 * the app has uuids.
 */
const demoSend = z
  .object({
    template: z.string().min(1).optional(),
    name: listName.optional(),
    items: z.array(listItemInput).min(1).max(60).optional(),
    recipient: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("person"), user: z.string().min(1) }),
      z.object({
        kind: z.literal("department"),
        department: z.string().min(1),
      }),
      z.object({ kind: z.literal("shift"), shift: z.string().min(1) }),
      z.object({ kind: z.literal("role"), role: z.enum(STAFF_ROLES) }),
    ]),
    dueAt: z.iso.datetime({ offset: true }).optional(),
    note: z.string().trim().min(1).max(300).optional(),
  })
  .refine(
    (list) =>
      (list.template !== undefined) !==
      (list.name !== undefined && list.items !== undefined),
    "A template, or a name and items",
  );

/**
 * Sending goes back to Lists as if it had sent the floor's opening list,
 * which Lists then shows as just sent, with the way to take it back.
 */
export async function demoSendList(input: unknown): Promise<SendResult> {
  return demoSend.safeParse(input).success
    ? { ok: true, value: "list-floor-opening" }
    : { ok: false, failure: "invalid" };
}

/**
 * A template saved as the demo's editor saves it: a name and its items, the
 * mock data's ids where the app has uuids. Nothing is stored: each item gets
 * the id it had, or one of its own, and the version goes up, as the
 * database would answer.
 */
const demoTemplate = z.object({
  id: z.string().min(1).optional(),
  name: listName,
  items: z
    .array(z.object({ id: z.string().min(1).optional() }).loose())
    .min(1)
    .max(60),
  schedules: z
    .array(z.object({ id: z.string().min(1).optional() }).loose())
    .max(7)
    .default([]),
});

export async function demoSaveTemplate(
  input: unknown,
  seenVersion: number | null,
): Promise<ListActionResult<SavedTemplate>> {
  const template = demoTemplate.safeParse(input);
  if (!template.success) return { ok: false, failure: "invalid" };
  const id = template.data.id ?? "t-new";
  return {
    ok: true,
    value: {
      id,
      version: (seenVersion ?? 0) + 1,
      items: template.data.items.map(
        (item, at) => item.id ?? `${id}-item-${at + 1}`,
      ),
      schedules: template.data.schedules.map(
        (schedule, at) => schedule.id ?? `${id}-time-${at + 1}`,
      ),
      // The editor works the next openings out itself while there are none.
      openings: {},
    },
  };
}

export async function demoTemplateChange(
  _templateId: string,
): Promise<ListActionResult> {
  return { ok: true, value: null };
}

export async function demoSaveDepartments(
  _departments: DepartmentInput[],
): Promise<SettingsResult> {
  return { ok: true };
}

export async function demoSaveDepartmentMembers(
  _department: string,
  _members: string[],
): Promise<SettingsResult> {
  return { ok: true };
}
