"use server";

import type { DepartmentInput } from "@domain/departments";
import { anyItemResult, type ListProgress } from "@domain/lists";
import { STAFF_ROLES } from "@domain/modules";
import { z } from "zod";
import type {
  ListActionResult,
  SendResult,
} from "../../../(app)/lists/list-types";
import type { SettingsResult } from "../../../(app)/manage/settings-types";

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
 * A send as the demo's form makes it: `sendInput`'s shape, with the mock data's
 * ids ("t-kitchen-opening", "dep-kitchen", "shiran") where the app has uuids.
 */
const demoSend = z.object({
  template: z.string().min(1),
  recipient: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("person"), user: z.string().min(1) }),
    z.object({ kind: z.literal("department"), department: z.string().min(1) }),
    z.object({ kind: z.literal("role"), role: z.enum(STAFF_ROLES) }),
  ]),
  note: z.string().trim().min(1).max(300).optional(),
});

/**
 * Sending goes back to Lists as if it had sent the floor's opening list,
 * which Lists then shows as just sent, with the way to take it back.
 */
export async function demoSendList(input: unknown): Promise<SendResult> {
  return demoSend.safeParse(input).success
    ? { ok: true, value: "list-floor-opening" }
    : { ok: false, failure: "invalid" };
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
