import { buildTeam } from "@domain/team";
import { Suspense } from "react";
import { TeamView } from "../../../(app)/team/team-view";
import { baseWording } from "../../../(app)/wording";
import { teamInvites, teamMembers, teamToday } from "../data";
import { demoResendAction } from "./actions";

type Props = { searchParams: Promise<{ state?: string }> };

// The real Team screen with mock people: three members' worth of the demo
// staff, one open invite and one expired, seen by an owner. Inviting and
// new links use the demo's stand-in actions (./actions). ?state=demo is a
// demo business, closed to invites (#80): no invite, no new links, and the
// line that says why.
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
  return (
    <TeamView
      team={buildTeam(teamMembers, demo ? [] : teamInvites, teamToday)}
      viewerRole="owner"
      inviteHref={demo ? undefined : "/design/shell/team/invite"}
      peopleHref="/design/shell/team"
      resend={demoResendAction}
      wording={baseWording}
    />
  );
}
