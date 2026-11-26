import { EMAIL_DOMAIN } from "./ids";

/**
 * The first of the never-send layers (docs/measure.md): the seed, the clean
 * and the measuring run refuse any database but the local stack's own, and
 * any run that could be a deployment. The database itself is asked next
 * (./sql/00-guard.sql): its SMS hook writes codes to dev.sms_codes, its Vault
 * holds no address of the app, and its cron jobs are off.
 */

/** The local stack's database (supabase/config.toml's `[db] port`). */
export const LOCAL_DATABASE =
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

/** The environment the guard reads DATABASE_URL, VERCEL and NEXT_PUBLIC_SUPABASE_URL from. */
export type GuardEnv = Readonly<Record<string, string | undefined>>;

/** The database the run would write to: DATABASE_URL, else the local stack's. */
export function databaseUrl(env: GuardEnv): string {
  return env.DATABASE_URL || LOCAL_DATABASE;
}

function hostOf(url: string): { host: string; port: string } | null {
  try {
    const parsed = new URL(url);
    return { host: parsed.hostname.toLowerCase(), port: parsed.port };
  } catch {
    return null;
  }
}

/**
 * Why the run must not go on, or null: a database that isn't loopback on the
 * local stack's port 54322 (a hosted project, its pooler, another machine,
 * or a Postgres of the machine's own on 5432), a deployment (`VERCEL`), or an
 * app pointed at a Supabase that isn't loopback.
 */
export function localRefusal(url: string, env: GuardEnv): string | null {
  const database = hostOf(url);
  if (!database) return "The database's address can't be read";
  if (!/^postgres(ql)?:$/.test(new URL(url).protocol)) {
    return "The database's address isn't a Postgres one";
  }
  if (!LOOPBACK.has(database.host)) {
    return `The database is on ${database.host}, not this machine: the test business is made on the local stack alone`;
  }
  if (database.port !== "54322") {
    return `The database is on port ${database.port || "5432"}, not the local stack's 54322`;
  }
  if (env.VERCEL) return "VERCEL is set: this looks like a deployment";
  const app = env.NEXT_PUBLIC_SUPABASE_URL;
  if (app) {
    const supabase = hostOf(app);
    if (!supabase || !LOOPBACK.has(supabase.host)) {
      return "NEXT_PUBLIC_SUPABASE_URL is not this machine";
    }
  }
  return null;
}

export function refuseUnlessLocal(url: string, env: GuardEnv): void {
  const refusal = localRefusal(url, env);
  if (refusal) throw new Error(`Refused: ${refusal}.`);
}

/** The measuring run signs in only the seed's people, at an address that can't receive mail. */
export function refuseUnlessTestLogin(email: string): void {
  if (
    !email.endsWith(`@${EMAIL_DOMAIN}`) ||
    email.indexOf("@") !== email.lastIndexOf("@")
  ) {
    throw new Error(
      `Refused: ${email} is not one of the test business's logins.`,
    );
  }
}
