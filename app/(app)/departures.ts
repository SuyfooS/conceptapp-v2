import "server-only";
import { type Departure, ownDepartures } from "@db/team";
import { DEPARTURE_SEEN_COOKIE, departureToTell } from "@domain/businesses";
import { cookies } from "next/headers";
import type { currentMember } from "./member";

type Member = NonNullable<Awaited<ReturnType<typeof currentMember>>>;

/**
 * The business the signed-in person was taken off the team of, when the app
 * should say so (Orel's decision 3 of 14 November 2026: they are told
 * nothing then, and next time they open the app it says so;
 * `departureToTell`). With no business left, the latest; with another open,
 * each in turn until they say they saw it on this device
 * (`seenDepartureAction` keeps its moment in DEPARTURE_SEEN_COOKIE), whichever
 * business was open when it happened. Never while viewing as someone. The
 * database is asked under their own session, since nothing else of a
 * business they left is theirs to read. A failure to read it only keeps the
 * words as they were.
 */
export async function currentDeparture(
  member: Member,
): Promise<Departure | null> {
  if (member.viewing) return null;
  const open = member.membership?.business.id ?? null;
  try {
    const [departures, jar] = await Promise.all([ownDepartures(), cookies()]);
    return departureToTell(
      open,
      departures,
      jar.get(DEPARTURE_SEEN_COOKIE)?.value ?? null,
    );
  } catch (error) {
    console.error(
      "reading departures failed",
      (error as { code?: string }).code ?? "without a code",
    );
    return null;
  }
}
