import { z } from "zod";

/**
 * The demo door (Orel, 6 November 2026): one press on a person of a demo
 * business, with no phone and no code. Since 8 November it stands beside real
 * sign-in with a phone number and an SMS code, and stays easy to reach: both
 * are on `/enter`.
 *
 * It reaches only these fictional people, who exist only where the demo data
 * was added (`supabase/hosted-demo.sql`, `supabase/seed.sql`). Row-level
 * security is unchanged, so they see their own business and nothing else. The
 * console is not on offer. Anyone with the address can come in and change the
 * demo businesses, and put them back with the door's reset, so real people
 * never join a demo business. False closes the demo door.
 */
export const PASSIVE_SIGN_IN = true;

/** Where a signed-out person is sent. */
export const signInPath = PASSIVE_SIGN_IN ? "/enter" : "/sign-in";

export const DEMO_PEOPLE = [
  "owner",
  "manager",
  "worker",
  "shopOwner",
  "shopManager",
  "shopWorker",
  // The demo's accountant, Galit (payroll P3): the shop's, and since one login
  // may be in several businesses (P3b) the restaurant's too.
  "accountant",
] as const;

export type DemoPerson = (typeof DEMO_PEOPLE)[number];

/**
 * The demo businesses at the door, in the order it shows them, each with the
 * people it offers. Everyone on a staff is in one of them; the accountant is
 * in both, and comes in to whichever business the door offered her in. A
 * business that `renews` always has this week's schedule published, so there
 * is something to see the moment one comes in; next week is left for the
 * visitor to collect availability, build and publish. The restaurant doesn't
 * renew: its schedule is the visitor's to build.
 */
export const DEMO_BUSINESSES = [
  {
    key: "restaurant",
    slug: "demo-restaurant",
    people: ["owner", "manager", "worker", "accountant"],
    renews: false,
  },
  {
    key: "shop",
    slug: "demo-shop",
    people: ["shopOwner", "shopManager", "shopWorker", "accountant"],
    renews: true,
  },
] as const satisfies readonly {
  key: string;
  slug: string;
  people: readonly DemoPerson[];
  renews: boolean;
}[];

export type DemoBusiness = (typeof DEMO_BUSINESSES)[number];

const demoPerson = z.enum(DEMO_PEOPLE);

/** The part of each person's address before the @, as the demo data has it. */
const ACCOUNTS: Record<DemoPerson, string> = {
  owner: "owner",
  manager: "manager",
  worker: "worker",
  shopOwner: "shop-owner",
  shopManager: "shop-manager",
  shopWorker: "shop-worker",
  accountant: "accountant",
};

/** A person on offer, or null for anything else a client sends. */
export function demoPersonOf(person: unknown): DemoPerson | null {
  const parsed = demoPerson.safeParse(person);
  return parsed.success ? parsed.data : null;
}

/** The account of a person on offer. Null for anything else a client sends. */
export function demoEmailOf(person: unknown): string | null {
  const known = demoPersonOf(person);
  return known ? `${ACCOUNTS[known]}@demo.conceptapp.invalid` : null;
}

/**
 * Whether the business at this slug is one of the demo businesses, where
 * anyone who comes in reads what the last visitor wrote (chat's note on
 * screen). The database keeps its own list (`private.demo_businesses`) for
 * what it refuses and clears there.
 */
export function isDemoBusiness(slug: string | null | undefined): boolean {
  return DEMO_BUSINESSES.some((b) => b.slug === slug);
}

/** Whether the business at this slug is a demo business whose week renews. */
export function renewsDemoWeek(slug: string | null | undefined): boolean {
  return (
    PASSIVE_SIGN_IN && DEMO_BUSINESSES.some((b) => b.renews && b.slug === slug)
  );
}

/** The demo businesses a person on offer is in: one, or both for the accountant. */
export function demoBusinessesOf(person: DemoPerson): DemoBusiness[] {
  return DEMO_BUSINESSES.filter((b) =>
    (b.people as readonly DemoPerson[]).includes(person),
  );
}

/**
 * The demo business a person on offer comes in to: the one the door offered
 * them in (`key`, as a client sends it) when they are in it, else the first
 * they are in.
 */
export function demoBusinessOf(
  person: DemoPerson,
  key?: unknown,
): DemoBusiness {
  const theirs = demoBusinessesOf(person);
  const business = theirs.find((b) => b.key === key) ?? theirs[0];
  if (!business) throw new Error(`No demo business for ${person}`);
  return business;
}
