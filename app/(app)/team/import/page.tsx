import { invitesOpen } from "@db/invites";
import { importRolesOf, listRoleOf, teamKnownOf } from "@domain/people-import";
import { invitableRoles, inviteChoices, namedRoleShown } from "@domain/team";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentWording } from "../../current-wording";
import { currentMember } from "../../member";
import {
  currentGivableNamedRoles,
  currentOwnerOnlyRoles,
  currentTeam,
} from "../../team";
import { baseWording, translator } from "../../wording";
import { firstLinkAction, resendInviteAction } from "../actions";
import { importPeopleAction, undoPeopleImportAction } from "./actions";
import { PeopleImportView } from "./import-view";

export async function generateMetadata(): Promise<Metadata> {
  // Page titles stay in the app's own words.
  const t = translator(baseWording, "app.team.import");
  return { title: t("title") };
}

// Inviting from a list on the Team screen ("הזמנה מרשימה", part 5; Orel, 25
// November 2026: owners and managers paste on /team): for whoever may invite
// one person (team.edit, exactly as /team/invite asks it, and a business
// that takes invites, so never a hosted demo, #80), to the staff roles they
// give as the invite form gives them, the business's named roles among
// them, those only an owner gives shown with why. Not found when every
// staff role is an owner's alone for them, nor for anyone else: owners and
// accountants are invited one at a time. The list is read on the device
// against the team this screen reads; the database decides last. Nobody
// gets anything: the done screen makes each person's link at the moment of
// sending, WhatsApp to their own number or a copy, and whoever isn't sent
// one stays on /team under "עוד לא קיבלו קישור". A session viewing as
// someone sees it all, and its presses are refused.
export default async function TeamImportPage() {
  const member = await currentMember();
  const membership = member?.membership;
  if (!member || !membership || invitableRoles(membership).length === 0) {
    notFound();
  }
  if (!(await invitesOpen(membership.business.id))) notFound();
  const [team, ownerOnly, named, wording] = await Promise.all([
    currentTeam(),
    currentOwnerOnlyRoles(),
    currentGivableNamedRoles(),
    currentWording(),
  ]);
  if (!team) notFound();
  const words = translator(wording, "app.roles");
  const roles = importRolesOf({
    choices: inviteChoices(membership, named, ownerOnly),
    named: named.map(namedRoleShown),
    labels: {
      owner: words("owner"),
      manager: words("manager"),
      worker: words("worker"),
      accountant: words("accountant"),
    },
  });
  if (!listRoleOf(roles)) notFound();
  const business = membership.business.id;
  const t = translator(wording, "app.team.import");
  return (
    <PeopleImportView
      // One person's screen of one business: when someone else signs in on
      // this browser, or the business changes, it starts afresh, so no list,
      // link made or undo waiting outlives them (cacheComponents keeps React
      // state across navigations).
      key={`${member.userId.toLowerCase()}:${business.toLowerCase()}`}
      roles={roles}
      known={teamKnownOf(team, membership, named, ownerOnly)}
      importPeople={importPeopleAction.bind(null, business)}
      undoImport={undoPeopleImportAction.bind(null, business)}
      paths={{
        back: { href: "/team", label: t("back") },
        done: { href: "/team", label: t("done.toTeam") },
      }}
      send={{
        firstLink: firstLinkAction,
        renew: resendInviteAction,
        business: membership.business.name,
        // Each link to the number it was made for: the real screen alone.
        toNumber: true,
      }}
    />
  );
}
