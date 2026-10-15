import postgres from "postgres";

/** The local database started by the Supabase CLI. Never a real project. */
const DB_URL =
  process.env.E2E_DB_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

/**
 * Wait for the login code the dev SMS hook stored for `phone` (E.164) after
 * `since`, and return it.
 */
export async function latestCode(phone: string, since: Date): Promise<string> {
  const sql = postgres(DB_URL, { max: 1 });
  try {
    for (let attempt = 0; attempt < 50; attempt++) {
      const rows = await sql<{ code: string }[]>`
        select code from dev.sms_codes
        where phone = ${phone} and created_at >= ${since}
        order by id desc limit 1`;
      if (rows[0]) return rows[0].code;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`No login code for ${phone}`);
  } finally {
    await sql.end();
  }
}
