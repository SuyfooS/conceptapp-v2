import { mayClearBio } from "@domain/profile";
import {
  canRemoveMember,
  invitableRoles,
  ownerOnlyRoles,
  type TeamActor,
} from "@domain/team";
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
// demo's manager, who gets nothing on an owner or an accountant; ?as=viewer:
// a worker raised to see the team without editing it (the roles plan's R6),
// who reads the profile and changes nothing; ?as=editor: a worker raised to
// edit it, who doesn't read the team's hours, so the page says a removal
// waits for clocking out; ?as=manager&state=pay: the manager where managers
// hold pay, whose role sheet shows "מנהל/ת" as the owner's to give.
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
  // As the database answers them by default, and a worker raised to view.
  const viewer: TeamActor =
    as === "manager"
      ? { userId: "shiran", role: "manager", perms: ["team.view", "team.edit"] }
      : as === "viewer"
        ? { userId: "demo-worker", role: "worker", perms: ["team.view"] }
        : as === "editor"
          ? {
              userId: "demo-worker",
              role: "worker",
              perms: ["team.view", "team.edit"],
            }
          : { userId: "demo-owner", role: "owner", perms: [] };
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
      canClear={mayClearBio(viewer, member.role)}
      clearBio={demoClearBioAction}
      teamHref="/design/shell/team"
      changes={
        canRemoveMember(viewer, member)
          ? {
              roles: invitableRoles(viewer),
              ownerOnly: ownerOnlyRoles(
                viewer,
                state === "pay" ? ["manager"] : [],
              ),
              ahead: shiftsAheadOf(person),
              // A worker who edits the team doesn't read the team's hours.
              clockedIn: as === "editor" ? null : state === "clocked",
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
