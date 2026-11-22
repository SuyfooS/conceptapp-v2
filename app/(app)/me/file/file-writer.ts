import "server-only";
import type { EmployeeFileSettings } from "@domain/employee-file-settings";
import { canOpenModule } from "@domain/modules";
import { clockAt } from "@domain/today";
import { canWrite } from "@domain/view-as";
import { manifestFor } from "@modules/registry";
import { currentMember } from "../../member";
import { currentModuleSettings, currentModules } from "../../modules";
import type { FileActionFailure } from "./file-types";

/*
 * Who may write the worker's own hiring file now (profile H5a), shared by
 * its server actions (./actions.ts) and Today's "אני שיניתי" route
 * (/home/bank-seen, H5b): the session's own person, never an id from the
 * browser; nothing while viewing as a role; the business the screen was
 * drawn for, which a write is bound to on the page (the business the app
 * opens is one cookie for the whole browser, so a write from a tab left
 * open after a switch is refused, never made in the other); the module on
 * and the person on the staff. Nothing typed is logged: a failure logs its
 * code.
 */

export type FileWriter = {
  userId: string;
  businessId: string;
  today: string;
  year: number;
  /** The business's settings for the file, as stored (H5b). */
  settings: EmployeeFileSettings;
};

export async function fileWriter(
  business: unknown,
): Promise<FileWriter | { failure: FileActionFailure }> {
  const [member, enabled, settings] = await Promise.all([
    currentMember(),
    currentModules(),
    currentModuleSettings("employee_files"),
  ]);
  const membership = member?.membership;
  if (!member || !membership) return { failure: "failed" };
  if (!canWrite(member.viewing)) return { failure: "viewOnly" };
  if (business !== membership.business.id) {
    return { failure: "businessChanged" };
  }
  if (!canOpenModule(manifestFor("employee_files"), enabled, membership)) {
    return { failure: "off" };
  }
  const today = clockAt(new Date(), membership.business.place.timeZone).date;
  return {
    userId: member.userId,
    businessId: membership.business.id,
    today,
    year: Number(today.slice(0, 4)),
    settings,
  };
}

/** A write's error, by its code only: whatever it carries stays here. */
export function logged(what: string, error: unknown): { failure: "failed" } {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code: unknown }).code)
      : "without a code";
  console.error(what, code);
  return { failure: "failed" };
}
