import { buildTeam } from "@domain/team";
import { TeamView } from "../../../(app)/team/team-view";
import { baseWording } from "../../../(app)/wording";
import { teamInvites, teamMembers, teamToday } from "../data";
import { demoResendAction } from "./actions";

// The real Team screen with mock people: three members' worth of the demo
// staff, one open invite and one expired, seen by an owner. Inviting and
// new links use the demo's stand-in actions (./actions).
export default function ShellTeam() {
  return (
    <TeamView
      team={buildTeam(teamMembers, teamInvites, teamToday)}
      viewerRole="owner"
      inviteHref="/design/shell/team/invite"
      resend={demoResendAction}
      wording={baseWording}
    />
  );
}
