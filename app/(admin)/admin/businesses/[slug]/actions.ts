"use server";

import { getPlatformStaff } from "@db/admin";
import { setBusinessDetails } from "@db/business-details";
import {
  activeElsewhere,
  inviteFromConsole,
  issueInviteLink,
} from "@db/invites";
import {
  getBusinessModulesForTeam,
  setModuleEnabled,
  setModuleSettings,
} from "@db/module-settings";
import { startViewing } from "@db/view-as";
import { checkBusinessDetailsChange } from "@domain/business-details";
import { inviteLink } from "@domain/invites";
import {
  enabledModules,
  fitsTabBar,
  type ModuleManifest,
  moduleKeyOf,
} from "@domain/modules";
import { platformCan } from "@domain/platform";
import { checkSettingsChange } from "@domain/settings-form";
import { parseTeamInvite } from "@domain/team";
import { parseViewAsRole } from "@domain/view-as";
import { manifestFor, manifests } from "@modules/registry";
import { refresh, revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import type { SettingsResult } from "@/app/(app)/manage/settings-types";
import type { InviteState } from "@/app/(app)/team/actions";
import { requestOrigin } from "@/app/origin";
import type { ModuleSwitchResult } from "./settings/module-switch";

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
    // A renewed invite is open again: the page reads it afresh (rows are
    // keyed by invite, so the new link stays on screen).
    refresh();
    return { link };
  } catch (error) {
    console.error("issueInviteLink failed", (error as Error).message);
    return { failure: "failed" };
  }
}

/**
 * Someone on the team adds a person to a business, in any role, from the
 * console: the result is a link for them to send on, as from the Team
 * screen. A number with an invite nobody claimed, open or expired, gets that
 * invite renewed. A number already working in another business is refused:
 * the app opens a person's oldest business, so they would never see this one.
 */
export async function addPersonAction(
  business: { id: string; slug: string },
  _prev: InviteState,
  form: FormData,
): Promise<InviteState> {
  const values = {
    name: String(form.get("name") ?? ""),
    phone: String(form.get("phone") ?? ""),
    role: String(form.get("role") ?? ""),
  };
  const staff = await getPlatformStaff();
  if (!staff || !platformCan(staff.role, "staff.invite")) {
    return { failure: "noPermission", values };
  }
  // The team may give any role, as an owner may.
  const parsed = parseTeamInvite(values, "owner");
  if (!parsed.ok) return { errors: parsed.errors, values };

  try {
    if (await activeElsewhere(parsed.value.phone, business.id)) {
      return { failure: "elsewhere", values };
    }
    const result = await inviteFromConsole(
      staff.userId,
      business.id,
      parsed.value,
    );
    if (!result.ok) return { failure: result.error, values };
    const link = inviteLink(await requestOrigin(), result.token);
    if (process.env.NODE_ENV !== "production") {
      console.info(`[invite] not sent, link for ${result.phone}: ${link}`);
    }
    revalidatePath(`/admin/businesses/${business.slug}`);
    return {
      done: { name: parsed.value.name, phone: parsed.value.phone, link },
    };
  } catch (error) {
    console.error("inviteFromConsole failed", (error as Error).message);
    return { failure: "failed", values };
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

/**
 * Someone on the team switches a module on or off for one business. Switching
 * one on is refused when its tab would not fit next to the business's others.
 */
export async function setBusinessModuleAction(
  businessId: string,
  module: string,
  enabled: boolean,
): Promise<ModuleSwitchResult> {
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
  if (enabled) {
    const rows = await getBusinessModulesForTeam(businessId);
    const after = [
      ...rows.filter((row) => row.key !== key),
      { key, enabled: true, settings: {} },
    ];
    if (!fitsTabBar(manifests, enabledModules(manifests, after))) {
      return { ok: false, failure: "noRoom" };
    }
  }
  const result = await setModuleEnabled(staff.userId, businessId, key, enabled);
  refresh();
  return result.ok ? { ok: true } : { ok: false, failure: "failed" };
}
