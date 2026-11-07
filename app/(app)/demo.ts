import "server-only";
import { renewDemoSchedules } from "@db/demo";
import { renewsDemoWeek } from "@domain/passive-sign-in";
import { currentMember } from "./member";

/**
 * A demo business whose week renews gets it published before Today reads it,
 * for whoever stayed signed in past the start of a new week. Nothing for any
 * other business, and Today opens either way.
 */
export async function renewDemoWeek(): Promise<void> {
  const member = await currentMember();
  if (!renewsDemoWeek(member?.membership?.business.slug)) return;
  try {
    await renewDemoSchedules();
  } catch (error) {
    console.error("demo schedule renewal failed", (error as Error).message);
  }
}
