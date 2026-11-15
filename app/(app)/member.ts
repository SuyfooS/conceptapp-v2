import { getCurrentMember } from "@db/session";
import { permissions } from "@modules/registry";
import { cache } from "react";

/**
 * The signed-in member, read once per request however many parts ask, with
 * what they hold as the database says (today's rules from every permission
 * declared, while its function is missing on a project).
 */
export const currentMember = cache(() => getCurrentMember(permissions));
