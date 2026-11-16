import type { Viewer } from "@domain/modules";
import { invitableRoles, ownerOnlyRoles } from "@domain/team";
import { Suspense } from "react";
import { TeamInviteView } from "../../../../(app)/team/invite/invite-view";
import { baseWording } from "../../../../(app)/wording";
import { demoInviteAction } from "../actions";

type Props = { searchParams: Promise<{ as?: string }> };

// The real invite form, as an owner sees it, with the demo's stand-in
// action: the same checks and a link that leads nowhere. ?as=editor: a
// worker raised to edit the team (the roles plan's R6), who invites workers
// only; ?as=paid: a manager where managers and workers hold pay, which only
// an owner gives, so no role is left and the screen says so.
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
  return (
    <TeamInviteView
      roles={invitableRoles(viewer).filter((role) => !ownerOnly.includes(role))}
      teamHref="/design/shell/team"
      invite={demoInviteAction}
      wording={baseWording}
    />
  );
}
