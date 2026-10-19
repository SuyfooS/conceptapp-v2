import { z } from "zod";

/**
 * Supabase connection settings, read from the environment and checked once.
 * The URL and the publishable key are public by design. The secret key is
 * parsed here too but read only by the server-only admin client
 * (`supabase/admin.ts`).
 */
const PublicEnv = z.object({
  url: z.url(),
  publishableKey: z.string().startsWith("sb_publishable_"),
});

export type PublicEnv = z.infer<typeof PublicEnv>;

/**
 * Parse the two public settings. Throws with a readable message when one is
 * missing, so a bad deploy fails at the first request instead of at sign-in.
 */
export function parsePublicEnv(source: {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
}): PublicEnv {
  const result = PublicEnv.safeParse({
    url: source.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: source.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  if (!result.success) {
    throw new Error(
      `Supabase settings missing or invalid (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY): ${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
}

/**
 * The settings for this process. NEXT_PUBLIC_ variables are inlined at build
 * time only when written out in full, so they are listed explicitly.
 */
export function publicEnv(): PublicEnv {
  return parsePublicEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}

/** True when both public settings are present (e.g. not on a bare preview). */
export function hasPublicEnv(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}

const SecretKey = z.string().startsWith("sb_secret_");

/**
 * The secret key, checked. Throws without echoing the value, so a bad
 * setting never ends up in a log.
 */
export function parseSecretKey(source: { SUPABASE_SECRET_KEY?: string }) {
  const result = SecretKey.safeParse(source.SUPABASE_SECRET_KEY);
  if (!result.success) {
    throw new Error(
      "Supabase secret key missing or invalid (SUPABASE_SECRET_KEY): expected an sb_secret_ key",
    );
  }
  return result.data;
}
