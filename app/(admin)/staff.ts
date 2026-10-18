import { getPlatformRole } from "@db/admin";
import { cache } from "react";

/** The signed-in person's ConceptApp team role, read once per request. */
export const currentPlatformRole = cache(getPlatformRole);
