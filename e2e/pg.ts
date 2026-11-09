import postgres from "postgres";

/**
 * The local database started by the Supabase CLI. Never a real project.
 * One connection per Playwright worker, shared by the helpers in db.ts and
 * sms.ts, instead of one opened and closed for every call. Helpers must never
 * change session state on it (SET, a transaction left open across calls): the
 * next test would inherit it. It closes after a minute idle, and Playwright
 * ends the worker after its tests.
 */
export const sql = postgres(
  process.env.E2E_DB_URL ??
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  { max: 1, idle_timeout: 60 },
);
