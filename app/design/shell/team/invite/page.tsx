import type { Viewer } from "@domain/modules";
import { invitableRoles, namedRoleShown, ownerOnlyRoles } from "@domain/team";
import { Suspense } from "react";
import { TeamInviteView } from "../../../../(app)/team/invite/invite-view";
import { baseWording } from "../../../../(app)/wording";
import { demoNamedRole } from "../../data";
import { demoInviteAction } from "../actions";

type Props = { searchParams: Promise<{ as?: string }> };

// The real invite form, as an owner sees it, with the demo's stand-in
// action: the same checks and a link that leads nowhere, and the demo's
// named role after workers (the roles plan's R11b). ?as=editor: a worker
// raised to edit the team (the roles plan's R6), who invites workers only,
// and not the named role, which holds more than they do; ?as=paid: a
// manager where managers and workers hold pay, which only an owner gives,
// in a business with no named role, so no role is left and the screen says
// so.
export default function ShellTeamInvite(props: Props) {
  return (
    <Suspense>
      <Demo {...props} />
    </Suspense>
  );
}

async function Demo({ searchParams }: Props) {
  const { as } = await searchParams;
  const viewer: Viewer =
    as === "editor"
      ? { role: "worker", perms: ["team.view", "team.edit"] }
      : as === "paid"
        ? { role: "manager", perms: ["team.view", "team.edit"] }
        : { role: "owner", perms: [] };
  const ownerOnly = ownerOnlyRoles(
    viewer,
    as === "paid" ? ["manager", "worker"] : [],
  );
  const named = as === "paid" ? [] : [demoNamedRole];
  return (
    <TeamInviteView
      roles={invitableRoles(viewer, named).filter(
        (choice) =>
          choice.namedRole !== null || !ownerOnly.includes(choice.role),
      )}
      namedRoles={named.map(namedRoleShown)}
      teamHref="/design/shell/team"
      invite={demoInviteAction}
      wording={baseWording}
    />
  );
}
