import "server-only";
import { renewDemoAvailability, renewDemoSchedules } from "@db/demo";
import { demoDoorOpen } from "@db/env";
import { isDemoBusiness, renewsDemoWeek } from "@domain/passive-sign-in";
import { currentMember } from "./member";

/**
 * Before Today reads, for whoever stayed signed in to a demo business past
 * the start of a new week: a business whose week renews gets it published,
 * and next week's sample availability is sent for whoever a definition names
 * and hasn't sent theirs (`renewDemoAvailability`: the hosted restaurant's),
 * as the door does at every entry, so the builder's new next week has someone
 * to fill from. Nothing for any other business, nothing on a site whose demo
 * door is closed (`DEMO_DOOR=off`), and Today opens either way.
 */
export async function renewDemoWeek(): Promise<void> {
  if (!demoDoorOpen()) return;
  const member = await currentMember();
  const slug = member?.membership?.business.slug;
  if (!isDemoBusiness(slug)) return;
  if (renewsDemoWeek(slug)) {
    try {
      await renewDemoSchedules();
    } catch (error) {
      console.error("demo schedule renewal failed", (error as Error).message);
    }
  }
  // The database does nothing for a definition without a sample, on a
  // published week, or for someone who has sent theirs, so this is safe on
  // every load.
  try {
    await renewDemoAvailability();
  } catch (error) {
    console.error("demo availability renewal failed", (error as Error).message);
  }
}
