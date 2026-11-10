"use server";

import { getPlatformStaff } from "@db/admin";
import { setBusinessDetails } from "@db/business-details";
import { setDepartmentMembers, setDepartments } from "@db/departments";
import {
  activeElsewhere,
  inviteFromConsole,
  issueInviteLink,
} from "@db/invites";
import {
  archiveListTemplate,
  getListTemplateForTeam,
  restoreListTemplate,
  saveListTemplate,
} from "@db/lists";
import {
  getBusinessModulesForTeam,
  setModuleEnabled,
  setModuleSettings,
} from "@db/module-settings";
import { startViewing } from "@db/view-as";
import { getTemplateSentence, setBusinessWording } from "@db/wording";
import { checkBusinessDetailsChange } from "@domain/business-details";
import { departments as departmentsSchema } from "@domain/departments";
import { inviteLink } from "@domain/invites";
import { listTemplateInput, type SavedTemplate } from "@domain/lists";
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
import {
  baseSentence,
  checkSentence,
  isEditableKey,
  type MessageTree,
  sentenceFits,
} from "@domain/wording";
import { manifestFor, manifests } from "@modules/registry";
import { refresh, revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import type { ListActionResult } from "@/app/(app)/lists/list-types";
import type { SettingsResult } from "@/app/(app)/manage/settings-types";
import type { InviteState } from "@/app/(app)/team/actions";
import { requestOrigin } from "@/app/origin";
import he from "@/messages/he.json";
import type { ModuleSwitchResult } from "./settings/module-switch";
import { formatsCleanly } from "./wording/formats";
import type { WordingSaveResult } from "./wording/wording-types";

export type InviteLinkState =
  | {
      link?: undefined;
      failure?: "failed" | "noPermission" | "demo" | "hasOwner";
    }
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
    const issued = await issueInviteLink(staff.userId, inviteId);
    if (!issued.ok) return { failure: issued.error };
    const { token, phone } = issued;
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
 * console (an owner only while the business has none): the result is a link
 * for them to send on, as from the Team screen. A number with an invite nobody claimed, open or expired, gets that
 * invite renewed. A number on another business's staff is refused a place on
 * this one's (one place on a staff per login, payroll P3b), and may still be
 * added as its accountant.
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
    if (
      await activeElsewhere(parsed.value.phone, business.id, parsed.value.role)
    ) {
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
 * Someone on the team saves a business's departments, as they set it up. The
 * database checks they are on the team (`private.can_edit_settings`).
 */
export async function saveTeamDepartmentsAction(
  businessId: string,
  departments: unknown,
): Promise<SettingsResult> {
  const staff = await getPlatformStaff();
  if (!staff || !platformCan(staff.role, "businesses.edit")) {
    return { ok: false, failure: "noAccess" };
  }
  const parsed = departmentsSchema.safeParse(departments);
  if (!parsed.success) return { ok: false, failure: "invalid" };
  const result = await setDepartments(staff.userId, businessId, parsed.data);
  refresh();
  return teamResult(result);
}

/** Someone on the team puts a business's people in a department. */
export async function saveTeamDepartmentMembersAction(
  businessId: string,
  department: unknown,
  members: unknown,
): Promise<SettingsResult> {
  const staff = await getPlatformStaff();
  if (!staff || !platformCan(staff.role, "businesses.edit")) {
    return { ok: false, failure: "noAccess" };
  }
  const id = z.uuid().safeParse(department);
  const people = z.array(z.uuid()).max(500).safeParse(members);
  if (!id.success || !people.success) return { ok: false, failure: "invalid" };
  const result = await setDepartmentMembers(
    staff.userId,
    businessId,
    id.data,
    people.data,
  );
  refresh();
  return teamResult(result);
}

/**
 * Someone on the team saves a business's list template, as they set it up,
 * with the version the editor last had (`public.save_list_template`, which
 * lets the team write: `private.can_edit_settings`). The editor keeps what
 * it shows, so nothing is read again here.
 */
export async function saveTeamListTemplateAction(
  businessId: string,
  input: unknown,
  seenVersion: unknown,
): Promise<ListActionResult<SavedTemplate>> {
  const staff = await getPlatformStaff();
  if (!staff || !platformCan(staff.role, "businesses.edit")) {
    return { ok: false, failure: "noAccess" };
  }
  const template = listTemplateInput.safeParse(input);
  const version = z.int().min(1).nullable().safeParse(seenVersion);
  if (!template.success || !version.success) {
    return { ok: false, failure: "invalid" };
  }
  return saveListTemplate(
    staff.userId,
    businessId,
    template.data,
    version.data ?? undefined,
  );
}

/**
 * Removes one of the business's templates, or brings it back (the undo), as
 * the team sets its lists up. Only a template of that business.
 */
async function teamTemplateChange(
  businessId: string,
  templateId: unknown,
  change: typeof archiveListTemplate,
): Promise<ListActionResult> {
  const staff = await getPlatformStaff();
  if (!staff || !platformCan(staff.role, "businesses.edit")) {
    return { ok: false, failure: "noAccess" };
  }
  const id = z.uuid().safeParse(templateId);
  if (!id.success) return { ok: false, failure: "invalid" };
  const template = await getListTemplateForTeam(businessId, id.data);
  if (template === "notYet") return { ok: false, failure: "notYet" };
  if (!template) return { ok: false, failure: "noAccess" };
  const result = await change(staff.userId, id.data);
  refresh();
  return result;
}

export async function archiveTeamListTemplateAction(
  businessId: string,
  templateId: unknown,
): Promise<ListActionResult> {
  return teamTemplateChange(businessId, templateId, archiveListTemplate);
}

export async function restoreTeamListTemplateAction(
  businessId: string,
  templateId: unknown,
): Promise<ListActionResult> {
  return teamTemplateChange(businessId, templateId, restoreListTemplate);
}

function teamResult(result: { ok: true } | { ok: false; code?: string }) {
  if (result.ok) return { ok: true } as const;
  return {
    ok: false,
    failure:
      result.code === "22023" || result.code === "23514" ? "invalid" : "failed",
  } as const;
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

/**
 * Someone on the team replaces one of the business's sentences, or clears it
 * with null so its template's or the app's shows again. Checked against the
 * app's sentence (what it must keep) and formatted once (that it reads),
 * then written and logged. Returns what it replaced, for an undo.
 */
export async function saveBusinessWordingAction(
  businessId: string,
  key: string,
  sentence: string | null,
): Promise<WordingSaveResult> {
  const staff = await getPlatformStaff();
  if (!staff || !platformCan(staff.role, "businesses.edit")) {
    return { ok: false, problem: "noAccess" };
  }
  const base = baseSentence(he as MessageTree, key);
  if (base === null || !isEditableKey(key)) {
    return { ok: false, problem: "notEditable" };
  }
  let text: string | null = null;
  if (sentence !== null) {
    const checked = checkSentence(he as MessageTree, key, sentence);
    if (!checked.ok) return { ok: false, problem: checked.problem };
    if (!formatsCleanly(checked.sentence)) {
      return { ok: false, problem: "syntax" };
    }
    text = checked.sentence;
  }
  try {
    // The sentence the business would show without its own: saving that
    // clears its own, so later changes to the template's still reach it.
    if (text !== null) {
      const template = await getTemplateSentence(businessId, key);
      const below =
        template !== null && sentenceFits(base, template) ? template : base;
      if (text === below) text = null;
    }
    const result = await setBusinessWording(
      staff.userId,
      businessId,
      key,
      text,
      text === null ? null : base,
    );
    if (!result.ok) {
      return {
        ok: false,
        problem: result.error === "notAllowed" ? "noAccess" : "failed",
      };
    }
    refresh();
    return { ok: true, sentence: text, previous: result.previous };
  } catch (error) {
    console.error("setBusinessWording failed", (error as Error).message);
    return { ok: false, problem: "failed" };
  }
}
