import "server-only";
import type { TemplateKey } from "@domain/templates";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * Sets up an empty business from a template, in one transaction
 * (`public.apply_template`): a row per module with the template's
 * settings, the opening hours, and the template's key and version. Only
 * the server role may run it, so `client` is the secret-key admin client
 * (chunk 1c). Throws when the business is already set up or either key is
 * unknown; nothing is changed then.
 */
export async function applyTemplate(
  client: SupabaseClient<Database>,
  businessId: string,
  template: TemplateKey,
): Promise<void> {
  const { error } = await client.rpc("apply_template", {
    business: businessId,
    template,
  });
  if (error) {
    throw new Error(`Could not apply template ${template}: ${error.message}`);
  }
}
