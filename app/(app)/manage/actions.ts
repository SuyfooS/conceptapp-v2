"use server";

import { setBusinessDetails } from "@db/business-details";
import { setDepartmentMembers, setDepartments } from "@db/departments";
import { setModuleSettings, type Written } from "@db/module-settings";
import { checkBusinessDetailsChange } from "@domain/business-details";
import { departments as departmentsSchema } from "@domain/departments";
import { type ModuleManifest, moduleKeyOf } from "@domain/modules";
import { checkSettingsChange } from "@domain/settings-form";
import { manifestFor } from "@modules/registry";
import { refresh } from "next/cache";
import { z } from "zod";
import { listsOn, manageAccess, modulesToManage } from "./manage";
import type { SettingsResult } from "./settings-types";

/**
 * An owner or manager saves some of a module's settings, at their own level
 * (an owner also the owners' own, such as the punch code). The screen is not
 * trusted: the change is checked against the module's manifest, for what this
 * person may edit and what's valid, and the database checks who they are.
 */
export async function saveModuleSettingsAction(
  module: string,
  change: unknown,
): Promise<SettingsResult> {
  const access = await manageAccess();
  if (!access) return { ok: false, failure: "noAccess" };
  if (access.viewOnly) return { ok: false, failure: "viewOnly" };

  const key = moduleKeyOf(module);
  if (!key || !modulesToManage(access.rows, access.level).includes(key)) {
    return { ok: false, failure: "noAccess" };
  }
  const manifest: ModuleManifest = manifestFor(key);
  const stored = access.rows.find((row) => row.key === key)?.settings;
  const checked = checkSettingsChange(manifest, stored, change, access.level);
  if (!checked.ok) return { ok: false, failure: checked.problem };

  const result = await setModuleSettings(
    access.userId,
    access.businessId,
    key,
    checked.patch,
  );
  refresh();
  return settingsResult(result);
}

/**
 * An owner or manager saves some of the business's own details: its name,
 * colour, address or Shabbat city. Checked the same way, and refreshed, since
 * the name and colour frame every screen.
 */
export async function saveBusinessDetailsAction(
  change: unknown,
): Promise<SettingsResult> {
  const access = await manageAccess();
  if (!access) return { ok: false, failure: "noAccess" };
  if (access.viewOnly) return { ok: false, failure: "viewOnly" };

  const checked = checkBusinessDetailsChange(change);
  if (!checked.ok) return { ok: false, failure: checked.problem };

  const result = await setBusinessDetails(
    access.userId,
    access.businessId,
    checked.patch,
  );
  refresh();
  return settingsResult(result);
}

/**
 * An owner or manager saves the business's departments, in order: a name
 * typed over, one added, one removed or brought back. Only while lists are on.
 */
export async function saveDepartmentsAction(
  departments: unknown,
): Promise<SettingsResult> {
  const access = await manageAccess();
  if (!access || !listsOn(access.rows)) {
    return { ok: false, failure: "noAccess" };
  }
  if (access.viewOnly) return { ok: false, failure: "viewOnly" };
  const parsed = departmentsSchema.safeParse(departments);
  if (!parsed.success) return { ok: false, failure: "invalid" };
  const result = await setDepartments(
    access.userId,
    access.businessId,
    parsed.data,
  );
  refresh();
  return settingsResult(result);
}

/** An owner or manager puts people in a department, or takes them out. */
export async function saveDepartmentMembersAction(
  department: unknown,
  members: unknown,
): Promise<SettingsResult> {
  const access = await manageAccess();
  if (!access || !listsOn(access.rows)) {
    return { ok: false, failure: "noAccess" };
  }
  if (access.viewOnly) return { ok: false, failure: "viewOnly" };
  const id = z.uuid().safeParse(department);
  const people = z.array(z.uuid()).max(500).safeParse(members);
  if (!id.success || !people.success) return { ok: false, failure: "invalid" };
  const result = await setDepartmentMembers(
    access.userId,
    access.businessId,
    id.data,
    people.data,
  );
  refresh();
  return settingsResult(result);
}

/** What the screen hears back: who may not, what doesn't fit, or try again. */
function settingsResult(result: Written): SettingsResult {
  if (result.ok) return { ok: true };
  if (result.code === "42501") return { ok: false, failure: "noAccess" };
  // The database's own checks: the wrong shape, or a value it won't store.
  if (result.code === "22023" || result.code === "23514") {
    return { ok: false, failure: "invalid" };
  }
  return { ok: false, failure: "failed" };
}
