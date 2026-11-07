import "server-only";
import type { ModuleKey, ModuleRow } from "@domain/modules";
import type { Json } from "./database.types";
import { createAdminClient } from "./supabase/admin";

/*
 * A business's settings. Writes run with the secret key: the database checks who
 * `actorId` is, and callers check the change against the module's manifest first
 * (`checkSettingsChange`) and that the actor is the signed-in person.
 */

export type Written = { ok: true } | { ok: false; code: string | undefined };

export function written(
  error: { code?: string; message: string } | null,
): Written {
  if (!error) return { ok: true };
  if (error.code !== "42501") {
    console.error("saving settings failed", error.message);
  }
  return { ok: false, code: error.code };
}

/** Saves some of a module's settings; the rest stay as they are. */
export async function setModuleSettings(
  actorId: string,
  businessId: string,
  module: ModuleKey,
  patch: Record<string, unknown>,
): Promise<Written> {
  const { error } = await createAdminClient().rpc("set_module_settings", {
    actor: actorId,
    business: businessId,
    module,
    patch: patch as Json,
  });
  return written(error);
}

/** The ConceptApp team switches a module on or off for one business. */
export async function setModuleEnabled(
  actorId: string,
  businessId: string,
  module: ModuleKey,
  enabled: boolean,
): Promise<Written> {
  const { error } = await createAdminClient().rpc("set_module_enabled", {
    actor: actorId,
    business: businessId,
    module,
    enabled,
  });
  return written(error);
}

/**
 * A business's module rows for the console, whose people aren't members of it, so
 * RLS has nothing to show them. Callers check they're on the team.
 */
export async function getBusinessModulesForTeam(
  businessId: string,
): Promise<ModuleRow[]> {
  const { data, error } = await createAdminClient()
    .from("business_modules")
    .select("module_key, enabled, settings")
    .eq("business_id", businessId);
  if (error) throw error;
  return data.map((row) => ({
    key: row.module_key,
    enabled: row.enabled,
    settings: row.settings,
  }));
}
