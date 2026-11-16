import type { Viewer } from "@domain/modules";
import { buildTeam } from "@domain/team";
import { Suspense } from "react";
import { TeamView } from "../../../(app)/team/team-view";
import { baseWording } from "../../../(app)/wording";
import { demoNamedRole, teamInvites, teamMembers, teamToday } from "../data";
import { demoCancelInviteAction, demoResendAction } from "./actions";

type Props = { searchParams: Promise<{ state?: string }> };

// The real Team screen with mock people: three members' worth of the demo
// staff, one open invite and one expired, seen by an owner. Two of the
// workers hold the demo's named role, and the open invite is to it, each
// shown by its name with its base (the roles plan's R11b). Inviting and
// new links use the demo's stand-in actions (./actions), and so does
// deleting an invite, held for its undo. ?state=demo is a
// demo business, closed to invites (#80): no invite, no new links, and the
// line that says why. ?state=view is a worker raised to see the team without
// editing it (the roles plan's R6): everything read, no invite, no new
// links, no deleting, and the line under the title that says so.
export default function ShellTeam({ searchParams }: Props) {
  return (
    <Suspense>
      <Demo searchParams={searchParams} />
    </Suspense>
  );
}

async function Demo({ searchParams }: Props) {
  const { state } = await searchParams;
  const demo = state === "demo";
  const viewer: Viewer =
    state === "view"
      ? { role: "worker", perms: ["team.view"] }
      : { role: "owner", perms: [] };
  return (
    <TeamView
      team={buildTeam(teamMembers, demo ? [] : teamInvites, teamToday)}
      viewer={viewer}
      inviteHref={demo ? undefined : "/design/shell/team/invite"}
      peopleHref="/design/shell/team"
      resend={demoResendAction}
      cancel={demoCancelInviteAction}
      named={[demoNamedRole]}
      wording={baseWording}
    />
  );
}
