import { sql } from "./pg";

/**
 * Wait for the login code the dev SMS hook stored for `phone` (E.164) after
 * `since`, and return it.
 */
export async function latestCode(phone: string, since: Date): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const rows = await sql<{ code: string }[]>`
      select code from dev.sms_codes
      where phone = ${phone} and created_at >= ${since}
      order by id desc limit 1`;
    if (rows[0]) return rows[0].code;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`No login code for ${phone}`);
}

/**
 * Switch a module on or off for the demo restaurant, as the admin console
 * will. Local database only.
 */
export async function setDemoModule(
  key: string,
  enabled: boolean,
): Promise<void> {
  await sql`
    update public.business_modules set enabled = ${enabled}
    where business_id = '00000000-0000-4000-b000-000000000001'
      and module_key = ${key}`;
}

/**
 * Start the auth server's resend wait for `phone` (E.164) now, as if a code
 * had just been sent. The auth server reads it fresh on every request, so a
 * test can be sure its next request falls inside the wait however slow the
 * runner is. Local database only.
 */
export async function restartSmsWait(phone: string): Promise<void> {
  await sql`
    update auth.users set confirmation_sent_at = now()
    where phone = ${phone.replace(/^\+/, "")}`;
}
