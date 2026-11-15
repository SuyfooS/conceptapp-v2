import type { Role } from "@domain/modules";
import { canRemoveMember, invitableRoles } from "@domain/team";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { FormerView } from "../../../../(app)/team/[person]/former-view";
import { PersonView } from "../../../../(app)/team/[person]/person-view";
import { baseWording } from "../../../../(app)/wording";
import { shiftsAheadOf, teamMembers, teamProfiles } from "../../data";
import {
  demoClearBioAction,
  demoRemoveMemberAction,
  demoSetMemberRoleAction,
} from "../actions";

export const generateStaticParams = () =>
  teamMembers.map((member) => ({ person: member.userId }));

type Props = {
  params: Promise<{ person: string }>;
  searchParams: Promise<{ state?: string; as?: string }>;
};

// A colleague's profile with mock data, as the owner reads it from the Team
// demo: Noa with her line and her cover, Yoav with his, the rest without one,
// and a minor with the day she turns 18. The owner changes their role and
// takes them off the team with the demo's stand-ins (held for "ביטול", then
// the card that says what came off them, the same counts the page said
// beforehand, `shiftsAheadOf`, and for Noa a swap request cancelled and one
// open again, `swapsLeftOf`). ?state=clocked: on the clock now, so not
// yet; ?state=former: the page opened again once they are off the team, as
// the owner (who holds pay, so reads their name) has it; ?as=manager: the
// demo's manager, who gets nothing on an owner or an accountant.
export default function ShellTeamPerson(props: Props) {
  return (
    <Suspense>
      <Demo {...props} />
    </Suspense>
  );
}

async function Demo({ params, searchParams }: Props) {
  const [{ person }, { state, as }] = await Promise.all([params, searchParams]);
  const member = teamMembers.find((m) => m.userId === person);
  if (!member) notFound();
  if (state === "former") {
    return (
      <FormerView
        former={{ userId: member.userId, name: member.name, role: member.role }}
        teamHref="/design/shell/team"
        wording={baseWording}
      />
    );
  }
  const viewer: { userId: string; role: Role } =
    as === "manager"
      ? { userId: "shiran", role: "manager" }
      : { userId: "demo-owner", role: "owner" };
  const profile = teamProfiles[person];
  return (
    <PersonView
      data={{
        ...member,
        bio: profile?.bio ?? null,
        cover: profile?.cover ?? "glow",
        since: profile?.since ?? "2026-09-01T08:00:00.000Z",
      }}
      youthUntil={profile?.youthUntil ?? null}
      timeZone="Asia/Jerusalem"
      canClear
      clearBio={demoClearBioAction}
      teamHref="/design/shell/team"
      changes={
        canRemoveMember(viewer, member)
          ? {
              roles: invitableRoles(viewer.role),
              ahead: shiftsAheadOf(person),
              clockedIn: state === "clocked",
              clockHref: `/design/shell/clock/team/${person}`,
              scheduleHref: "/design/shell/schedule",
              actions: {
                remove: demoRemoveMemberAction,
                setRole: demoSetMemberRoleAction,
              },
            }
          : null
      }
      wording={baseWording}
    />
  );
}
