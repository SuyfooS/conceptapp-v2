import { invitableRoles } from "@domain/team";
import { TeamInviteView } from "../../../../(app)/team/invite/invite-view";
import { baseWording } from "../../../../(app)/wording";
import { demoInviteAction } from "../actions";

// The real invite form, as an owner sees it, with the demo's stand-in
// action: the same checks and a link that leads nowhere.
export default function ShellTeamInvite() {
  return (
    <TeamInviteView
      roles={invitableRoles("owner")}
      teamHref="/design/shell/team"
      invite={demoInviteAction}
      wording={baseWording}
    />
  );
}
