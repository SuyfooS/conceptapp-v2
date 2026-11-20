"use server";

import { setBusinessDetails } from "@db/business-details";
import { setDepartmentMembers, setDepartments } from "@db/departments";
import { setModuleSettings, type Written } from "@db/module-settings";
import { checkBusinessDetailsChange } from "@domain/business-details";
import { departments as departmentsSchema } from "@domain/departments";
import type { ManageReadOnly } from "@domain/manage-access";
import { type ModuleManifest, moduleKeyOf } from "@domain/modules";
import { checkSettingsChange } from "@domain/settings-form";
import { manifestFor } from "@modules/registry";
import { refresh } from "next/cache";
import { z } from "zod";
import {
  departmentsOn,
  manageAccess,
  modulesToManage,
  readOnlyFor,
} from "./manage";
import type { SettingsFailure, SettingsResult } from "./settings-types";

/**
 * Someone who edits the management page saves some of a module's settings,
 * with the module's own edit too, at their own level (an owner also the
 * owners' own, such as the punch code). The screen is not trusted: the
 * change is checked against the module's manifest, for what this person may
 * edit and what's valid, and the database checks who they are.
 */
export async function saveModuleSettingsAction(
  module: string,
  change: unknown,
): Promise<SettingsResult> {
  const access = await manageAccess();
  if (!access) return { ok: false, failure: "noAccess" };
  if (access.viewing) return { ok: false, failure: "viewOnly" };

  const key = moduleKeyOf(module);
  if (!key || !modulesToManage(access.rows, access.level).includes(key)) {
    return { ok: false, failure: "noAccess" };
  }
  const refused = refusal(readOnlyFor(access, key));
  if (refused) return { ok: false, failure: refused };
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
 * Someone who edits the management page saves some of the business's own
 * details: its name, colour, address or Shabbat city. Checked the same way,
 * and refreshed, since the name and colour frame every screen.
 */
export async function saveBusinessDetailsAction(
  change: unknown,
): Promise<SettingsResult> {
  const access = await manageAccess();
  if (!access) return { ok: false, failure: "noAccess" };
  const refused = refusal(access.readOnly);
  if (refused) return { ok: false, failure: refused };

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
 * Someone who edits the management page saves the business's departments,
 * in order: a name typed over, one added, one removed or brought back. Only
 * while lists or taking orders are on, which read them.
 */
export async function saveDepartmentsAction(
  departments: unknown,
): Promise<SettingsResult> {
  const access = await manageAccess();
  if (!access || !departmentsOn(access.rows)) {
    return { ok: false, failure: "noAccess" };
  }
  const refused = refusal(access.readOnly);
  if (refused) return { ok: false, failure: refused };
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

/** Someone who edits the management page puts people in a department, or takes them out. */
export async function saveDepartmentMembersAction(
  department: unknown,
  members: unknown,
): Promise<SettingsResult> {
  const access = await manageAccess();
  if (!access || !departmentsOn(access.rows)) {
    return { ok: false, failure: "noAccess" };
  }
  const refused = refusal(access.readOnly);
  if (refused) return { ok: false, failure: refused };
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

/**
 * Why a save is refused before it reaches the database: a view session never
 * writes, and someone at view here, or without a module's own edit, may not.
 */
function refusal(readOnly: ManageReadOnly): SettingsFailure | null {
  if (readOnly === "viewing") return "viewOnly";
  return readOnly ? "noAccess" : null;
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
