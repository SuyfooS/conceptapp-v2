import postgres from "postgres";
import { EMAIL_DOMAIN } from "./ids";

/**
 * The first of the never-send layers (docs/measure.md): the seed, the clean
 * and the measuring run refuse any database but the local stack's own, and
 * any run that could be a deployment, on the address as the URL standard
 * reads it and again on the hosts and ports postgres.js read from it
 * (localDatabase). The database itself is asked next (./sql/00-guard.sql):
 * its SMS hook writes codes to dev.sms_codes, its Vault holds no address of
 * the app, and its cron jobs are off.
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
 * The address's authority as postgres.js reads it: between `://` and the
 * first `/` or `?`. postgres.js takes the host after the first `@` and
 * splits it at each `,` (several hosts, dialled from the first), where the
 * URL standard takes it after the last `@`: with a `,` or a second `@` the
 * two read different hosts.
 */
function authorityOf(url: string): string {
  return url.slice(url.indexOf("://") + 3).split(/[?/]/)[0] ?? "";
}

/**
 * Why the run must not go on, or null: a database that isn't loopback on the
 * local stack's port 54322 (a hosted project, its pooler, another machine,
 * or a Postgres of the machine's own on 5432), an address postgres.js would
 * read another host from (a `,` or a second `@`), a deployment (`VERCEL`),
 * or an app pointed at a Supabase that isn't loopback.
 */
export function localRefusal(url: string, env: GuardEnv): string | null {
  const database = hostOf(url);
  if (!database) return "The database's address can't be read";
  if (!/^postgres(ql)?:$/.test(new URL(url).protocol)) {
    return "The database's address isn't a Postgres one";
  }
  const authority = authorityOf(url);
  if (authority.includes(",") || authority.split("@").length > 2) {
    return "The database's address has a ',' or a second '@', so postgres.js would read other hosts from it than this guard does";
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

/**
 * Why a postgres.js client must not be used, or null: among the hosts and
 * ports it read from the address (`sql.options`, the ones it would dial) is
 * one that isn't loopback, or a port but 54322.
 */
export function driverRefusal(options: {
  host: readonly string[];
  port: readonly number[];
}): string | null {
  if (options.host.length === 0) return "postgres.js read no host";
  const host = options.host.find((h) => !LOOPBACK.has(h.toLowerCase()));
  if (host !== undefined) {
    return `postgres.js would connect to ${host}, not this machine`;
  }
  const port = options.port.find((p) => p !== 54322);
  if (port !== undefined) {
    return `postgres.js would connect on port ${port}, not the local stack's 54322`;
  }
  return null;
}

/**
 * The client the seed, the clean and the database test use: DATABASE_URL
 * (or the local stack's) refused as localRefusal refuses it, then the
 * client's own hosts and ports as driverRefusal does. postgres.js connects
 * only at the first query, so a refused client never dialled anything.
 */
export function localDatabase(env: GuardEnv) {
  const url = databaseUrl(env);
  refuseUnlessLocal(url, env);
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  const refusal = driverRefusal(sql.options);
  if (refusal) {
    void sql.end({ timeout: 0 });
    throw new Error(`Refused: ${refusal}.`);
  }
  return sql;
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
