import { getCurrentMember } from "@db/session";
import { cache } from "react";

/** The signed-in member, read once per request however many parts ask. */
export const currentMember = cache(getCurrentMember);
