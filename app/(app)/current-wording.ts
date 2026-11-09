import "server-only";
import { cache } from "react";
import { currentMember } from "./member";
import { type AppWording, baseWording, wordingFrom } from "./wording";

/**
 * The signed-in business's words, once per request: its template's sentences
 * and its own, read with the member. The viewed business's, while the team
 * views one. The app's own words for anyone else.
 */
export const currentWording = cache(async (): Promise<AppWording> => {
  const member = await currentMember();
  const stored = member?.membership?.business.wording;
  return stored ? wordingFrom(stored) : baseWording;
});
