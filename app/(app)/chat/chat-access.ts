import { canOpenModule, holdsPermission, isStaff } from "@domain/modules";
import { isDemoBusiness } from "@domain/passive-sign-in";
import { canSeeTeam } from "@domain/team";
import { manifestFor } from "@modules/registry";
import { cache } from "react";
import { currentMember } from "../member";
import { currentModules } from "../modules";

/**
 * Who the chat screens and actions are for, once per request: someone on the
 * staff of a business with chat on (an accountant is in no chat), with what
 * they hold there. Null for anyone else. While the ConceptApp team views a
 * business as a role, `viewing` is true: the screens say chats aren't shown
 * then and the actions refuse, and the database reads such a session nothing
 * anyway.
 */
export const chatAccess = cache(async () => {
  const [member, enabled] = await Promise.all([
    currentMember(),
    currentModules(),
  ]);
  const membership = member?.membership;
  const manifest = manifestFor("chat");
  if (
    !member ||
    !membership ||
    !isStaff(membership.role) ||
    !canOpenModule(manifest, enabled, membership)
  ) {
    return null;
  }
  const { role, business } = membership;
  return {
    userId: member.userId,
    businessId: business.id,
    businessName: business.name,
    role,
    timeZone: business.place.timeZone,
    viewing: member.viewing !== null,
    /**
     * A demo business: anyone at the door may come in as anyone, so every
     * chat there, private ones too, is read by whoever comes next, and the
     * screens say so instead of "only the two of you".
     */
    demo: isDemoBusiness(business.slug),
    /**
     * Posts announcements in groups (C3): chat.announce, as the database
     * answered (`my_permissions`), which a role holds only while it
     * moderates too (the roles plan's R8).
     */
    canAnnounce: holdsPermission(membership, "chat.announce"),
    /**
     * Chat's edit (chat.moderate): in every department's group with all of
     * its history, removes others' messages in groups and pins announcements
     * (C3). Without it, someone keeps their own chats and groups.
     */
    canModerate: holdsPermission(membership, "chat.moderate"),
    /**
     * Opens a colleague's profile on the team screen from a chat: they see
     * the team (team.view, the roles plan's R6).
     */
    seesTeam: canSeeTeam(membership),
  };
});

export type ChatAccess = NonNullable<Awaited<ReturnType<typeof chatAccess>>>;
