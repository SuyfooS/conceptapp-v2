import type { Viewer } from "@domain/modules";
import { importsPeople } from "@domain/people-import";
import { inviteChoices, namedRoleShown, ownerOnlyRoles } from "@domain/team";
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
// and sees the named role, which holds more than they do, not offered, with
// why (Orel, 16 November 2026); ?as=paid: a manager where managers and
// workers hold pay, which only an owner gives, in a business with no named
// role, so no role is left and the screen says so; ?as=held: the same worker
// where workers hold pay, so neither workers nor the named role are left,
// for two reasons, and the screen says only an owner gives them. Above the
// form, "הזמנה מרשימה" for whoever may invite from a list, leading to the
// import's twin, the owner's (inviting from a list, part 5).
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
    as === "editor" || as === "held"
      ? { role: "worker", perms: ["team.view", "team.edit"] }
      : as === "paid"
        ? { role: "manager", perms: ["team.view", "team.edit"] }
        : { role: "owner", perms: [] };
  const ownerOnly = ownerOnlyRoles(
    viewer,
    as === "paid" ? ["manager", "worker"] : as === "held" ? ["worker"] : [],
  );
  const named = as === "paid" ? [] : [demoNamedRole];
  const roles = inviteChoices(viewer, named, ownerOnly);
  return (
    <TeamInviteView
      roles={roles}
      importHref={
        importsPeople(roles) ? "/design/shell/team/import" : undefined
      }
      namedRoles={named.map(namedRoleShown)}
      teamHref="/design/shell/team"
      invite={demoInviteAction}
      wording={baseWording}
    />
  );
}
