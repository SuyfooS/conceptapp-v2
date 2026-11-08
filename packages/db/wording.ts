import "server-only";
import { createAdminClient } from "./supabase/admin";

/**
 * Wording: whole sentences of the app's copy, replaced for a template or a
 * business (`public.template_wording`, `public.business_wording`). The app
 * reads them under RLS with the member; these are the console's reads and
 * writes, with the secret key: callers check the person may edit first, and
 * the database checks again.
 */

export type WordingRow = {
  key: string;
  sentence: string;
  /** The app's sentence it was written against. */
  baseSentence: string;
  updatedAt: string;
};

/** A business's own sentences, and its template's, for the console. */
export async function getWordingForTeam(businessId: string): Promise<{
  templateKey: string | null;
  template: WordingRow[];
  business: WordingRow[];
}> {
  const admin = createAdminClient();
  const [business, own] = await Promise.all([
    admin
      .from("businesses")
      .select("template_key")
      .eq("id", businessId)
      .maybeSingle(),
    admin
      .from("business_wording")
      .select("key, sentence, base_sentence, updated_at")
      .eq("business_id", businessId),
  ]);
  if (business.error) throw business.error;
  if (own.error) throw own.error;
  const templateKey = business.data?.template_key ?? null;
  const template = templateKey
    ? await getTemplateWordingForTeam(templateKey)
    : [];
  return { templateKey, template, business: own.data.map(rowOf) };
}

/** A template's sentences, for the console. */
export async function getTemplateWordingForTeam(
  templateKey: string,
): Promise<WordingRow[]> {
  const { data, error } = await createAdminClient()
    .from("template_wording")
    .select("key, sentence, base_sentence, updated_at")
    .eq("template_key", templateKey);
  if (error) throw error;
  return data.map(rowOf);
}

/** The sentence a business's template gives a key, as stored, or null. */
export async function getTemplateSentence(
  businessId: string,
  key: string,
): Promise<string | null> {
  const admin = createAdminClient();
  const business = await admin
    .from("businesses")
    .select("template_key")
    .eq("id", businessId)
    .maybeSingle();
  if (business.error) throw business.error;
  const templateKey = business.data?.template_key;
  if (!templateKey) return null;
  const row = await admin
    .from("template_wording")
    .select("sentence")
    .eq("template_key", templateKey)
    .eq("key", key)
    .maybeSingle();
  if (row.error) throw row.error;
  return row.data?.sentence ?? null;
}

function rowOf(row: {
  key: string;
  sentence: string;
  base_sentence: string;
  updated_at: string;
}): WordingRow {
  return {
    key: row.key,
    sentence: row.sentence,
    baseSentence: row.base_sentence,
    updatedAt: row.updated_at,
  };
}

export type WordingWrite =
  | { ok: true; previous: string | null }
  | { ok: false; error: "notAllowed" | "unknown" | "invalid" };

function wordingError(code: string | undefined) {
  if (code === "42501") return "notAllowed" as const;
  if (code === "P0002") return "unknown" as const;
  if (code === "23514" || code === "22023") return "invalid" as const;
  return null;
}

/**
 * Sets one business's sentence, or clears it with null so its template's (or
 * the app's) shows again (`public.set_business_wording`). Returns what it
 * replaced, for an undo.
 */
export async function setBusinessWording(
  actorId: string,
  businessId: string,
  key: string,
  sentence: string | null,
  baseSentence: string | null,
): Promise<WordingWrite> {
  const { data, error } = await createAdminClient().rpc(
    "set_business_wording",
    {
      actor: actorId,
      business: businessId,
      word_key: key,
      // The generated types don't know these may be null.
      new_sentence: sentence as string,
      base: baseSentence as string,
    },
  );
  if (error) {
    const known = wordingError(error.code);
    if (known) return { ok: false, error: known };
    throw new Error(`Could not set the wording: ${error.message}`);
  }
  return { ok: true, previous: data ?? null };
}

/**
 * Sets one template's sentence for every business opened from it, or clears
 * it with null (`public.set_template_wording`). Platform admins only.
 */
export async function setTemplateWording(
  actorId: string,
  templateKey: string,
  key: string,
  sentence: string | null,
  baseSentence: string | null,
): Promise<WordingWrite> {
  const { data, error } = await createAdminClient().rpc(
    "set_template_wording",
    {
      actor: actorId,
      template: templateKey,
      word_key: key,
      new_sentence: sentence as string,
      base: baseSentence as string,
    },
  );
  if (error) {
    const known = wordingError(error.code);
    if (known) return { ok: false, error: known };
    throw new Error(`Could not set the template wording: ${error.message}`);
  }
  return { ok: true, previous: data ?? null };
}
