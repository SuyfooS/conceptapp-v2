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
 * The newest login code's id in the dev SMS hook's table for `phone`
 * (E.164), or 0 with none yet: what `codeAfter` reads from.
 */
export async function lastCodeId(phone: string): Promise<number> {
  const rows = await sql<{ id: string | null }[]>`
    select max(id)::text as id from dev.sms_codes where phone = ${phone}`;
  return Number(rows[0]?.id ?? 0);
}

/**
 * The login code stored for `phone` (E.164) after the one with id `after`,
 * waiting a second for it, or null when none came. The sign-in screen says
 * the same whether a code went or not, so a test asks here.
 */
export async function codeAfter(
  phone: string,
  after: number,
): Promise<string | null> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const rows = await sql<{ code: string }[]>`
      select code from dev.sms_codes
      where phone = ${phone} and id > ${after}
      order by id desc limit 1`;
    if (rows[0]) return rows[0].code;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return null;
}

/**
 * Forget the codes counted as sent to `phone` (E.164), as if the last had
 * gone longer ago than a code lasts (`public.note_auth_attempt`'s ten
 * minutes): a check is then counted for its caller only and never asked of
 * the auth server. Local database only.
 */
export async function forgetSentCodes(phone: string): Promise<void> {
  await sql`
    delete from private.auth_attempts
    where kind = 'send'
      and key_hash = encode(sha256(convert_to('phone:' || ${phone}::text, 'UTF8')), 'hex')`;
}

/**
 * Count a code as sent to `phone` (E.164) now, which also starts the app's
 * own wait between codes (`public.note_auth_attempt`), so a test can be sure
 * its next request falls inside it however slow the runner is. Local
 * database only.
 */
export async function noteSentCode(phone: string): Promise<void> {
  await sql`
    insert into private.auth_attempts (kind, key_hash, at)
    values (
      'send',
      encode(sha256(convert_to('phone:' || ${phone}::text, 'UTF8')), 'hex'),
      now()
    )`;
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
 * How many login codes the dev SMS hook stored for `phone` (E.164) after the
 * one with id `after` (`lastCodeId`), at once: for a test that shows nothing
 * sent a number a code, as `codeAfter` would wait a second to show.
 */
export async function codesSince(
  phone: string,
  after: number,
): Promise<number> {
  const rows = await sql<{ count: number }[]>`
    select count(*)::int as count from dev.sms_codes
    where phone = ${phone} and id > ${after}`;
  return rows[0]?.count ?? 0;
}
