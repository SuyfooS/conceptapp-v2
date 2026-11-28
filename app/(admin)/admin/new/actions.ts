"use server";

import { createBusiness, getPlatformStaff } from "@db/admin";
import { onAnotherStaff } from "@db/invites";
import {
  getBusinessModulesForTeam,
  setModuleSettings,
} from "@db/module-settings";
import {
  NEW_BUSINESS_FIELDS,
  type NewBusinessErrors,
  parseNewBusiness,
  roleWordsOf,
} from "@domain/business";
import { platformCan } from "@domain/platform";
import { checkSettingsChange } from "@domain/settings-form";
import { manifestFor } from "@modules/registry";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

export type NewBusinessState = {
  errors?: NewBusinessErrors;
  /**
   * With `errors.staff` "elsewhere": the staff list's numbers already on
   * another business's staff (E.164), to name them and mark their lines.
   */
  elsewhere?: string[];
  /** A problem that is not about one field. */
  failure?: "failed" | "noPermission";
};

/**
 * The wizard's last step: check who is asking and what they typed, then
 * open the business and invite its staff with the secret key
 * (`createBusiness`). The staff list is read again here as the form read it
 * (`parseStaffList`, as the import reads a list, with the app's words for
 * the roles in the same language). A number on the list that is on another
 * business's staff can't be on this one's too (one place on a staff per
 * login, payroll P3b): the list goes back with those numbers named, before
 * anything is written, as the Team screen and the business's page in the
 * console say it for one person; the numbers are asked in the call's body
 * (`onAnotherStaff`), and never logged. Once it is open, the answer about
 * Shabbat is saved as its settings page saves it (`saveShabbat`, below):
 * `create_business` takes no settings. On success the business's checklist
 * opens, saying so if that answer could not be saved; otherwise the form
 * goes back to the step with the first error.
 */
export async function createBusinessAction(
  _prev: NewBusinessState,
  form: FormData,
): Promise<NewBusinessState> {
  const staff = await getPlatformStaff();
  if (!staff || !platformCan(staff.role, "businesses.create")) {
    return { failure: "noPermission" };
  }

  const roles = await getTranslations("app.roles");
  const parsed = parseNewBusiness(
    Object.fromEntries(NEW_BUSINESS_FIELDS.map((f) => [f, form.get(f)])),
    NEW_BUSINESS_FIELDS,
    { labels: roleWordsOf((role) => roles(role)) },
  );
  if (!parsed.ok) return { errors: parsed.errors };

  let result: Awaited<ReturnType<typeof createBusiness>>;
  try {
    const elsewhere = await onAnotherStaff(staff.userId, parsed.value.staff);
    if (elsewhere.length > 0) {
      return { errors: { staff: "elsewhere" }, elsewhere };
    }
    result = await createBusiness(staff.userId, parsed.value);
  } catch (error) {
    console.error("createBusiness failed", (error as Error).message);
    return { failure: "failed" };
  }
  if (!result.ok) return { errors: { slug: "taken" } };

  // The business is open whatever happens next, so the checklist opens: a
  // second press would find its slug taken.
  const saved = await saveShabbat(
    staff.userId,
    result.id,
    parsed.value.closedOnShabbat,
  );
  redirect(
    `/admin/businesses/${parsed.value.slug}?created=1${saved ? "" : "&shabbat=unsaved"}`,
  );
}

/**
 * The wizard's answer to "העסק פתוח בשבת", saved for the business just
 * opened through the settings engine, as the console's settings page and
 * /manage/scheduling save it: checked against scheduling's manifest at the
 * team's level (`checkSettingsChange`), then `set_module_settings`, which
 * writes the change's `module.settings` line in the audit log, from what
 * the template gave to the answer. It is saved even when the template
 * already gives it, so that line, and a stored `closedOnShabbat` (no
 * template stores one), say the question was answered; /manage/activity
 * leaves out a line
 * that ends where the module's default is (`withoutNoChange` in
 * `@domain/activity`). No answer, from a form drawn before the wizard
 * asked, writes nothing. False when it could not be saved; only the
 * error's message is logged.
 */
async function saveShabbat(
  actorId: string,
  businessId: string,
  closedOnShabbat: boolean | null,
): Promise<boolean> {
  if (closedOnShabbat === null) return true;
  try {
    const manifest = manifestFor("scheduling");
    const rows = await getBusinessModulesForTeam(businessId);
    const stored = rows.find((row) => row.key === "scheduling")?.settings;
    const checked = checkSettingsChange(
      manifest,
      stored,
      { closedOnShabbat },
      "team",
    );
    if (!checked.ok) return false;
    const written = await setModuleSettings(
      actorId,
      businessId,
      "scheduling",
      checked.patch,
    );
    return written.ok;
  } catch (error) {
    console.error("saving Shabbat failed", (error as Error).message);
    return false;
  }
}
