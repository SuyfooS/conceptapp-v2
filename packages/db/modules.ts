import "server-only";
import type { ModuleRow } from "@domain/modules";
import { createClient } from "./supabase/server";

/**
 * The business's `business_modules` rows, read as the signed-in person
 * under RLS (members read their own business's rows only). Which of them
 * count as on is decided by `enabledModules` in `@domain/modules`.
 */
export async function getBusinessModules(
  businessId: string,
): Promise<ModuleRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
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
