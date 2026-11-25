import { invitesOpen } from "@db/invites";
import { seesFiles } from "@domain/file-holders";
import { canEditTeam, canSeeTeam } from "@domain/team";
import { canWrite } from "@domain/view-as";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentWording } from "../current-wording";
import { currentMember } from "../member";
import { currentModules } from "../modules";
import {
  currentFilesTeam,
  currentGivableNamedRoles,
  currentOwnerOnlyRoles,
  currentTeam,
} from "../team";
import { baseWording, translator } from "../wording";
import { cancelInviteAction, resendInviteAction } from "./actions";
import { currentTeamFiles } from "./file-status";
import { TeamFreshness } from "./team-freshness";
import { TeamView } from "./team-view";

export async function generateMetadata(): Promise<Metadata> {
  // Page titles stay in the app's own words.
  const t = translator(baseWording, "app.team");
  return { title: t("title") };
}

// The people in the business, for whoever sees the team (team.view, the
// roles plan's R6: owners and managers by default). Anyone else, a manager
// lowered to none included, gets the not-found screen, as for a module out
// of their reach. Someone who sees it without editing it reads it, and
// changes nothing. A business closed to invites (a demo one) offers no
// invite, no new link and no deleting one (#80). Someone other than an owner
// gets no new link for an invite to a role that holds pay, nor to a role the
// business named that they don't give (the roles plan's R11b). Each person
// and invite with a named role shows it by its name, with its base. Deleting
// is bound to this business: one held past a switch is refused. While the
// hiring file is on (profile H6a), each manager and worker shows how
// complete their file is, in a holder's words or as a count; someone who
// holds the files without seeing the team (the accountant) gets the files
// alone, each row leading to the file, with no numbers and no invites.
// The invites nobody got a link for yet (the console's wizard saves its
// staff so) come first, under "עוד לא קיבלו קישור": each one's link is made
// there, then sent on WhatsApp to that number or copied (inviting from a
// list, part 2). The app sends nothing.
export default async function TeamPage() {
  const [member, enabled] = await Promise.all([
    currentMember(),
    currentModules(),
  ]);
  const membership = member?.membership;
  if (!member || !membership) notFound();
  const seesTeam = canSeeTeam(membership);
  if (!seesTeam && !seesFiles(membership, enabled)) notFound();
  const [team, open, ownerOnly, named, files] = await Promise.all([
    seesTeam ? currentTeam() : currentFilesTeam(),
    seesTeam ? invitesOpen(membership.business.id) : Promise.resolve(false),
    seesTeam ? currentOwnerOnlyRoles() : Promise.resolve([]),
    seesTeam ? currentGivableNamedRoles() : Promise.resolve([]),
    currentTeamFiles(),
  ]);
  if (!team) notFound();
  return (
    <>
      {/* Read again when shown after someone was taken off the team. */}
      <TeamFreshness />
      <TeamView
        team={team}
        viewer={membership}
        inviteHref={open ? "/team/invite" : undefined}
        peopleHref="/team"
        resend={resendInviteAction}
        cancel={
          seesTeam && canWrite(member.viewing) && canEditTeam(membership)
            ? cancelInviteAction.bind(null, membership.business.id)
            : undefined
        }
        ownerOnly={ownerOnly}
        named={named}
        files={files}
        filesOnly={!seesTeam}
        businessName={membership.business.name}
        // Each link to the number it was made for: the real screen alone.
        whatsappToNumber
        wording={await currentWording()}
      />
    </>
  );
}
