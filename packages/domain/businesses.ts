import { isStaff, type Role } from "./modules";

/**
 * One login in several businesses (payroll P3b; Orel, 8 November 2026): at
 * most one place on a business's staff, and any number as an accountant (the
 * database's `memberships_one_staff_idx`). The app opens one of them at a
 * time. Which one is a cookie the person sets by switching, and the server
 * checks it against their memberships on every request: a cookie naming a
 * business they aren't in is never trusted, and with one business it changes
 * nothing.
 */

/** The cookie that remembers which of their businesses the person works in. */
export const BUSINESS_COOKIE = "ca_business";

/** How long it is kept: a year, in seconds. */
export const BUSINESS_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

/** What choosing needs to know of each active membership. */
export type MembershipChoice = {
  businessId: string;
  role: Role;
  /** When they joined it (ISO). */
  since: string;
};

const joinedFirst = (a: MembershipChoice, b: MembershipChoice) =>
  a.since.localeCompare(b.since) || a.businessId.localeCompare(b.businessId);

/**
 * The business the app opens for the person: the one the cookie names, when
 * it is one of theirs; else their place on a staff; else the one they joined
 * first. Null for someone in no business.
 */
export function chosenMembership<T extends MembershipChoice>(
  memberships: readonly T[],
  chosen: string | null | undefined,
): T | null {
  const named = chosen
    ? memberships.find((m) => m.businessId === chosen)
    : undefined;
  if (named) return named;
  const byJoining = [...memberships].sort(joinedFirst);
  return byJoining.find((m) => isStaff(m.role)) ?? byJoining[0] ?? null;
}

/**
 * The order the switcher lists them in, the same on every screen: the
 * business they are on the staff of first, then the rest by name.
 */
export function switcherOrder<T>(
  list: readonly T[],
  of: (item: T) => { role: Role; name: string },
): T[] {
  return [...list].sort((a, b) => {
    const left = of(a);
    const right = of(b);
    const staff = Number(isStaff(right.role)) - Number(isStaff(left.role));
    return staff || left.name.localeCompare(right.name, "he");
  });
}

/** Whether the person has another business to switch to. */
export function canSwitchBusiness(count: number): boolean {
  return count > 1;
}

/**
 * The cookie that remembers, on this device, the latest departure the person
 * said they saw ("הבנתי"): the moment they were taken off that business's
 * team (ISO). Kept as long as the business cookie, and forgotten with it on
 * signing out.
 */
export const DEPARTURE_SEEN_COOKIE = "ca_departure_seen";

/** A business the person was taken off the team of, and when. */
export type DepartureMoment = {
  businessId: string;
  /** ISO. */
  leftAt: string;
};

/**
 * Which business the app tells the person they are no longer on the team of
 * (Orel's decision 3 of 14 November 2026: they are told nothing then, and
 * next time they open the app it says so). `departures` come the latest
 * first. With no business open, the latest, every time: it is all the app
 * has for them. With one open, the earliest they have not said they saw on
 * this device (`seenUpTo`, the cookie's moment; none, or one that isn't a
 * moment, and none is seen), whichever business was open when it happened
 * and whichever device they had then: each is said once, in turn. Null when
 * there is nothing to tell.
 */
export function departureToTell<T extends DepartureMoment>(
  open: string | null,
  departures: readonly T[],
  seenUpTo: string | null | undefined,
): T | null {
  if (open === null) return departures[0] ?? null;
  const seen = seenUpTo ? Date.parse(seenUpTo) : Number.NaN;
  const unseen = Number.isNaN(seen)
    ? departures
    : departures.filter((left) => Date.parse(left.leftAt) > seen);
  return unseen.at(-1) ?? null;
}
