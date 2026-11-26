import { buildTeam, namedRoleShown } from "@domain/team";
import { Suspense } from "react";
import { TeamView } from "../../../(app)/team/team-view";
import { ViewAsBanner } from "../../../(app)/view-as-banner";
import { baseWording } from "../../../(app)/wording";
import { demoEndView } from "../../screens/actions";
import {
  business,
  demoNamedRole,
  teamInvites,
  teamMembers,
  teamToday,
} from "../data";
import { demoResendAction } from "../team/actions";

type Props = { searchParams: Promise<{ as?: string }> };

// The banner the ConceptApp team sees while viewing a business as a role, over
// the real Team screen with mock people. ?as=named: viewing it as the demo's
// role the business named, "אחראי משמרת" on workers, which sees the team
// (the roles plan's R11c), so the banner names it.
export default function ShellViewAs(props: Props) {
  return (
    <Suspense>
      <Demo {...props} />
    </Suspense>
  );
}

async function Demo({ searchParams }: Props) {
  const { as } = await searchParams;
  const named = as === "named" ? namedRoleShown(demoNamedRole) : null;
  return (
    <>
      <ViewAsBanner
        viewing={{
          role: named ? named.base : "manager",
          namedRole: named,
          businessSlug: "demo-restaurant",
        }}
        businessName={business.name}
        wording={baseWording}
        end={demoEndView}
      />
      <TeamView
        team={buildTeam(teamMembers, teamInvites, teamToday)}
        // A manager, as the database answers by default; the named role sees
        // the team without changing it.
        viewer={
          named
            ? { role: named.base, perms: ["team.view"] }
            : { role: "manager", perms: ["team.view", "team.edit"] }
        }
        inviteHref="/design/shell/team/invite"
        peopleHref="/design/shell/team"
        resend={demoResendAction}
        businessName={business.name}
        wording={baseWording}
      />
    </>
  );
}
