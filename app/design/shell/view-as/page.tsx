import { buildTeam } from "@domain/team";
import { TeamView } from "../../../(app)/team/team-view";
import { ViewAsBanner } from "../../../(app)/view-as-banner";
import { baseWording } from "../../../(app)/wording";
import { demoSignOut } from "../../screens/actions";
import { business, teamInvites, teamMembers, teamToday } from "../data";
import { demoResendAction } from "../team/actions";

// The banner the ConceptApp team sees while viewing a business as a role, over
// the real Team screen with mock people.
export default function ShellViewAs() {
  return (
    <>
      <ViewAsBanner
        viewing={{ role: "manager", businessSlug: "demo-restaurant" }}
        businessName={business.name}
        wording={baseWording}
        end={demoSignOut}
      />
      <TeamView
        team={buildTeam(teamMembers, teamInvites, teamToday)}
        viewerRole="manager"
        inviteHref="/design/shell/team/invite"
        resend={demoResendAction}
        wording={baseWording}
      />
    </>
  );
}
