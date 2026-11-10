import { getPlatformRole, getPlatformStaff } from "@db/admin";
import { cache } from "react";

/** The signed-in person's ConceptApp team role, read once per request. */
export const currentPlatformRole = cache(getPlatformRole);

/** The signed-in person on the ConceptApp team, with their id, once per request. */
export const currentPlatformStaff = cache(getPlatformStaff);
