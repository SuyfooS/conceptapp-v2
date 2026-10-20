import postgres from "postgres";

/** The local database started by the Supabase CLI. Never a real project. */
const DB_URL =
  process.env.E2E_DB_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

export type OpenedBusiness = {
  name: string;
  accent: string;
  templateKey: string | null;
  modules: number;
  audited: number;
};

/** A business the wizard opened, as the database has it. */
export async function businessBySlug(
  slug: string,
): Promise<OpenedBusiness | null> {
  const sql = postgres(DB_URL, { max: 1 });
  try {
    const rows = await sql<OpenedBusiness[]>`
      select b.name, b.accent, b.template_key as "templateKey",
        (select count(*)::int from public.business_modules m
          where m.business_id = b.id) as modules,
        (select count(*)::int from public.audit_log a
          where a.business_id = b.id and a.action = 'business.create') as audited
      from public.businesses b where b.slug = ${slug}`;
    return rows[0] ?? null;
  } finally {
    await sql.end();
  }
}

export type OpenInvite = { name: string | null; phone: string; role: string };

/** The open invites of a business, by phone number. */
export async function invitesBySlug(slug: string): Promise<OpenInvite[]> {
  const sql = postgres(DB_URL, { max: 1 });
  try {
    return await sql<OpenInvite[]>`
      select i.full_name as name, i.phone, i.role::text as role
      from public.invites i join public.businesses b on b.id = i.business_id
      where b.slug = ${slug} and i.claimed_at is null
      order by i.phone`;
  } finally {
    await sql.end();
  }
}
