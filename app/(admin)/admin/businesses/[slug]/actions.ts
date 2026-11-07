"use server";

import { getPlatformStaff } from "@db/admin";
import { setBusinessDetails } from "@db/business-details";
import { issueInviteLink } from "@db/invites";
import {
  getBusinessModulesForTeam,
  setModuleEnabled,
  setModuleSettings,
} from "@db/module-settings";
import { startViewing } from "@db/view-as";
import { checkBusinessDetailsChange } from "@domain/business-details";
import { inviteLink } from "@domain/invites";
import { type ModuleManifest, moduleKeyOf } from "@domain/modules";
import { platformCan } from "@domain/platform";
import { checkSettingsChange } from "@domain/settings-form";
import { parseViewAsRole } from "@domain/view-as";
import { manifestFor } from "@modules/registry";
import { refresh } from "next/cache";
import { notFound, redirect } from "next/navigation";
import type { SettingsResult } from "@/app/(app)/manage/settings-types";
import { requestOrigin } from "@/app/origin";

export type InviteLinkState =
  | { link?: undefined; failure?: "failed" | "noPermission" }
  | { link: string; failure?: undefined };

/**
 * A fresh invite link for one open invite, shown to the team member to
 * send on (WhatsApp, SMS from their phone). Nothing is sent from here: in
 * development the link is also written to the server log. The old link
 * stops working.
 */
export async function inviteLinkAction(
  inviteId: string,
  _prev: InviteLinkState,
  _form: FormData,
): Promise<InviteLinkState> {
  const staff = await getPlatformStaff();
  if (!staff || !platformCan(staff.role, "staff.invite")) {
    return { failure: "noPermission" };
  }
  try {
    const { token, phone } = await issueInviteLink(staff.userId, inviteId);
    const link = inviteLink(await requestOrigin(), token);
    if (process.env.NODE_ENV !== "production") {
      console.info(`[invite] not sent, link for ${phone}: ${link}`);
    }
    return { link };
  } catch (error) {
    console.error("issueInviteLink failed", (error as Error).message);
    return { failure: "failed" };
  }
}

/**
 * Open the business's app as the role in the form, read only. The session
 * and the audit log entry are written by the database; the app then reads
 * the business as that role until the session ends (two hours at most).
 */
export async function viewAsAction(
  business: { id: string; slug: string },
  form: FormData,
): Promise<never> {
  const staff = await getPlatformStaff();
  const role = parseViewAsRole(form.get("role"));
  if (!staff || !platformCan(staff.role, "businesses.view_as") || !role) {
    notFound();
  }
  try {
    await startViewing(staff.userId, business.id, role);
  } catch (error) {
    console.error("startViewing failed", (error as Error).message);
    redirect(`/admin/businesses/${business.slug}?view=failed`);
  }
  redirect("/home");
}

/** Someone on the team saves a module's settings, the advanced ones too. */
export async function saveBusinessSettingsAction(
  businessId: string,
  module: string,
  change: unknown,
): Promise<SettingsResult> {
  const staff = await getPlatformStaff();
  const key = moduleKeyOf(module);
  if (!staff || !platformCan(staff.role, "businesses.edit") || !key) {
    return { ok: false, failure: "noAccess" };
  }
  const manifest: ModuleManifest = manifestFor(key);
  const rows = await getBusinessModulesForTeam(businessId);
  const stored = rows.find((row) => row.key === key)?.settings;
  const checked = checkSettingsChange(manifest, stored, change, "team");
  if (!checked.ok) return { ok: false, failure: checked.problem };
  const result = await setModuleSettings(
    staff.userId,
    businessId,
    key,
    checked.patch,
  );
  refresh();
  return result.ok ? { ok: true } : { ok: false, failure: "failed" };
}

/** Someone on the team saves some of a business's own details. */
export async function saveTeamBusinessDetailsAction(
  businessId: string,
  change: unknown,
): Promise<SettingsResult> {
  const staff = await getPlatformStaff();
  if (!staff || !platformCan(staff.role, "businesses.edit")) {
    return { ok: false, failure: "noAccess" };
  }
  const checked = checkBusinessDetailsChange(change);
  if (!checked.ok) return { ok: false, failure: checked.problem };
  const result = await setBusinessDetails(
    staff.userId,
    businessId,
    checked.patch,
  );
  refresh();
  if (result.ok) return { ok: true };
  return {
    ok: false,
    failure:
      result.code === "22023" || result.code === "23514" ? "invalid" : "failed",
  };
}

/** Someone on the team switches a module on or off for one business. */
export async function setBusinessModuleAction(
  businessId: string,
  module: string,
  enabled: boolean,
): Promise<SettingsResult> {
  const staff = await getPlatformStaff();
  const key = moduleKeyOf(module);
  if (
    !staff ||
    !platformCan(staff.role, "businesses.edit") ||
    !key ||
    typeof enabled !== "boolean"
  ) {
    return { ok: false, failure: "noAccess" };
  }
  const result = await setModuleEnabled(staff.userId, businessId, key, enabled);
  refresh();
  return result.ok ? { ok: true } : { ok: false, failure: "failed" };
}
