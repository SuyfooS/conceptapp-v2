import { editsClock } from "@domain/time-clock";
import { currentModuleSettings } from "../../modules";
import { clockAccess } from "../clock";

export type CodeScreenData = {
  businessName: string;
  /** The business asks for the code; when it doesn't, the screen says so. */
  required: boolean;
  /** An owner needs no code; anyone else hears that their own code won't count for them. */
  owner: boolean;
  /** The ConceptApp team is looking: no code is made. */
  viewOnly: boolean;
  /** The business shows codes on its stations only. */
  stationsOnly: boolean;
};

/**
 * The code screen for whoever edits the clock (`editsClock`: clock.edit, the
 * roles plan's R4), on their own phone. Null unless the clock is on and the
 * person edits it: the screen then does not exist for them. The database
 * checks each code it makes again.
 */
export async function currentCodeScreen(): Promise<CodeScreenData | null> {
  const access = await clockAccess();
  if (!access || !editsClock(access)) return null;
  const settings = await currentModuleSettings("time_clock");
  return {
    businessName: access.businessName,
    required: settings.requirePunchCode,
    owner: access.role === "owner",
    viewOnly: access.viewOnly,
    stationsOnly: settings.codeDisplay === "station",
  };
}
