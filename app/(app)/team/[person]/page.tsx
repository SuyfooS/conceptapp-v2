import { invitesOpen } from "@db/invites";
import { getTeamYouth } from "@db/payroll-details";
import {
  getFormerMember,
  getTeamPerson,
  isClockedIn,
  shiftsAhead,
} from "@db/team";
import { isUuid } from "@domain/activity";
import { holdsPermission, isStaff, type Viewer } from "@domain/modules";
import { mayClearBio } from "@domain/profile";
import {
  canRemoveMember,
  canSeeTeam,
  invitableRoles,
  namedRoleShown,
  namedRolesBeyond,
} from "@domain/team";
import { canWrite } from "@domain/view-as";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { chatAccess } from "../../chat/chat-access";
import { chatPaths } from "../../chat/chat-paths";
import { currentWording } from "../../current-wording";
import { currentAccess } from "../../manage/access/access";
import { currentMember } from "../../member";
import { currentGivableNamedRoles, currentOwnerOnlyRoles } from "../../team";
import { baseWording, translator } from "../../wording";
import {
  clearBioAction,
  removeMemberAction,
  setMemberRoleAction,
} from "../actions";
import { FormerView } from "./former-view";
import { type PersonChanges, PersonView } from "./person-view";

export async function generateMetadata(): Promise<Metadata> {
  // Page titles stay in the app's own words.
  const t = translator(baseWording, "app.team");
  return { title: t("title") };
}

// One colleague's profile, for whoever sees the team (team.view, the roles
// plan's R6), like the Team screen it is reached from: changes only for
// whoever edits it. Anyone else gets the not-found screen; the signed-in
// person's own profile is /me. Someone no longer on the team gets a page
// that says so.
export default async function TeamPersonPage({
  params,
}: {
  params: Promise<{ person: string }>;
}) {
  const [{ person }, member] = await Promise.all([params, currentMember()]);
  const membership = member?.membership;
  if (!member || !membership || !canSeeTeam(membership)) notFound();
  if (person === member.userId) redirect("/me");
  if (!isUuid(person)) notFound();
  const businessId = membership.business.id;
  const [data, youth, wording, chat, open] = await Promise.all([
    getTeamPerson(businessId, person),
    // Who is a minor, and until when: the schedule needs it (payroll P5),
    // and whoever sees the team reads it.
    getTeamYouth(businessId),
    currentWording(),
    chatAccess(),
    // A demo business keeps its people, as it takes no invites (#80).
    invitesOpen(businessId),
  ]);
  if (!data) {
    // Taken off the team: their place is kept, and the page says so.
    const former = await getFormerMember(businessId, person);
    if (!former) notFound();
    return <FormerView former={former} teamHref="/team" wording={wording} />;
  }
  // A message to someone on the staff, from someone in chat; never while
  // viewing as someone, who reads no chat.
  const messageHref =
    chat && !chat.viewing && isStaff(data.role)
      ? chatPaths.withPerson(data.userId)
      : null;
  // Whoever may invite to their role changes it and takes them off the team
  // (Orel, 14 November 2026): someone who edits the team, by the rank rule;
  // never while viewing, never in a demo.
  const mayChange =
    open &&
    canWrite(member.viewing) &&
    canRemoveMember(
      { userId: member.userId, role: membership.role, perms: membership.perms },
      {
        userId: data.userId,
        role: data.role,
        namedRole: data.namedRole?.id ?? null,
      },
    );
  const timeZone = membership.business.place.timeZone;
  let changes: PersonChanges | null = null;
  if (mayChange) {
    const [ahead, clockedIn, ownerOnly, named, access] = await Promise.all([
      shiftsAhead(businessId, data.userId, timeZone),
      // Whether they are on the clock is the clock's to show: asked only of
      // someone who reads the team's hours (clock.edit, or pay). For anyone
      // else who edits the team it is unknown (null): the page says a change
      // waits for clocking out, and the database refuses it while they are
      // clocked in (`clockedIn`), in words.
      readsTeamHours(membership)
        ? isClockedIn(businessId, data.userId)
        : Promise.resolve(null),
      // The roles that hold pay, for someone other than an owner: not
      // offered, and a change away from one held for its undo.
      currentOwnerOnlyRoles(),
      // The business's named roles: those the viewer gives are offered
      // after their base (the roles plan's R11b).
      currentGivableNamedRoles(),
      // Who sees pay, for an owner where pay access is in use (null for
      // anyone else): a named role never sees it by role (R11e), so the
      // sheet says so before a change to one on a role that does.
      currentAccess(),
    ]);
    changes = {
      roles: invitableRoles(membership, named),
      // Those on a role the viewer gives that hold what they don't: shown,
      // not offered, as an owner's to give.
      beyond: namedRolesBeyond(membership, named),
      // Their names, and the person's own named role's, which the viewer
      // may not give; what each holds stays here, for the giver's rule.
      namedRoles: [
        ...named,
        ...(data.namedRole && !named.some((n) => n.id === data.namedRole?.id)
          ? [data.namedRole]
          : []),
      ].map(namedRoleShown),
      ownerOnly,
      pay: access
        ? {
            roles: access.roles,
            personal: access.people.some(
              (p) => p.userId === data.userId && p.personal,
            ),
          }
        : null,
      ahead,
      clockedIn,
      clockHref: `/clock/team/${data.userId}`,
      scheduleHref: "/schedule",
      // For this business only: a write held past a switch is refused.
      actions: {
        remove: removeMemberAction.bind(null, businessId),
        setRole: setMemberRoleAction.bind(null, businessId),
      },
    };
  }
  return (
    <PersonView
      data={data}
      youthUntil={youth.get(data.userId) ?? null}
      timeZone={timeZone}
      canClear={canWrite(member.viewing) && mayClearBio(membership, data.role)}
      // For this business only: a delete held past a switch is refused.
      clearBio={clearBioAction.bind(null, businessId)}
      teamHref="/team"
      messageHref={messageHref}
      changes={changes}
      wording={wording}
    />
  );
}

/**
 * Whether the viewer reads the business's hours, someone else's open entry
 * among them, as the time clock's rules have it: whoever edits the clock or
 * sees pay (`time_entries`' policy).
 */
function readsTeamHours(viewer: Viewer): boolean {
  return (
    holdsPermission(viewer, "clock.edit") ||
    holdsPermission(viewer, "clock.payroll")
  );
}
