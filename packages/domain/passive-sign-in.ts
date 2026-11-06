import { z } from "zod";

/**
 * Orel, 6 November 2026: real sign-in and its security wait for later. Until
 * then the door is passive: one press on a person of the demo restaurant, with
 * no phone and no code.
 *
 * It reaches only these three fictional people, who exist only where the demo
 * data was added (`supabase/hosted-demo.sql`, `supabase/seed.sql`). Row-level
 * security is unchanged, so they see their own business and nothing else. The
 * console is not on offer. Anyone with the address can come in and change the
 * demo restaurant, so set this to false before real people use the project.
 */
export const PASSIVE_SIGN_IN = true;

/** Where a signed-out person is sent. */
export const signInPath = PASSIVE_SIGN_IN ? "/enter" : "/sign-in";

export const DEMO_PEOPLE = ["owner", "manager", "worker"] as const;

const demoPerson = z.enum(DEMO_PEOPLE);

/** The account of a person on offer. Null for anything else a client sends. */
export function demoEmailOf(person: unknown): string | null {
  const parsed = demoPerson.safeParse(person);
  return parsed.success ? `${parsed.data}@demo.conceptapp.invalid` : null;
}
