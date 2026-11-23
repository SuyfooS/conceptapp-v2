import { mayClearBio } from "@domain/profile";
import {
  canRemoveMember,
  invitableRoles,
  namedRoleShown,
  namedRolesBeyond,
  ownerOnlyRoles,
  type TeamActor,
} from "@domain/team";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { FormerView } from "../../../../(app)/team/[person]/former-view";
import { PersonView } from "../../../../(app)/team/[person]/person-view";
import { baseWording } from "../../../../(app)/wording";
import {
  business,
  demoNamedRole,
  shiftsAheadOf,
  teamFileStatusFor,
  teamMembers,
  teamProfiles,
} from "../../data";
import { demoAccess } from "../../manage/access/data";
import {
  demoClearBioAction,
  demoRemoveMemberAction,
  demoRenameMemberAction,
  demoSetMemberRoleAction,
} from "../actions";

export const generateStaticParams = () =>
  teamMembers.map((member) => ({ person: member.userId }));

type Props = {
  params: Promise<{ person: string }>;
  searchParams: Promise<{ state?: string; as?: string; file?: string }>;
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
// hold pay, whose role sheet shows "מנהל/ת" as the owner's to give. Yoav
// and Itay hold the demo's named role, shown by its name with its base, and
// the sheet offers it after workers to whoever gives it (the roles plan's
// R11b): the owner; the manager, who holds less than it, sees it there as
// the owner's to give. ?state=pay, as the owner: workers see pay too, so
// choosing the named role for Noa (built on workers, with no access of her
// own) says she would see it only by her own access (R11e). "שם" fixes the
// name the business shows for them with the demo's stand-in, shown at once
// with the fix back as its undo, the mock name back on reload;
// ?state=nameless: someone nobody named, whose title and row read "בלי שם";
// ?state=marked: a name the business keeps for her with a right-to-left
// mark nobody sees, which the sheet saves clean as it opens;
// ?state=ownMarked: her own name with that mark, and none of the
// business's, which the sheet never offers to save: their own name keeps
// no row, so only she cleans it, on /me.
// The hiring file (profile H6a): ?file=holder as the owner, who reads what
// is missing and opens the file from here; ?file=manager as someone who
// sees the team without the files, who reads how many; ?file=view as the
// ConceptApp team viewing as a role, who sends nothing. Yoav lacks his
// account and his pension, Maya her identity details with a new account
// to look at, the rest are complete. "שליחת קישור להשלמה" opens the share
// sheet, which sends nothing itself.
export default function ShellTeamPerson(props: Props) {
  return (
    <Suspense>
      <Demo {...props} />
    </Suspense>
  );
}

async function Demo({ params, searchParams }: Props) {
  const [{ person }, { state, as, file }] = await Promise.all([
    params,
    searchParams,
  ]);
  const member = teamMembers.find((m) => m.userId === person);
  if (!member) notFound();
  if (state === "former") {
    return (
      <FormerView
        former={{
          userId: member.userId,
          name: member.name,
          role: member.role,
          namedRole: member.namedRole ?? null,
        }}
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
  const reader = file === "holder" ? "holder" : "team";
  const status =
    file === "holder" || file === "manager" || file === "view"
      ? (teamFileStatusFor(reader)[person] ?? null)
      : null;
  return (
    <PersonView
      fileCard={
        status
          ? {
              status,
              reader,
              viewing: file === "view",
              fileHref:
                reader === "holder"
                  ? `/design/shell/team/${person}/file`
                  : null,
              share: file !== "view",
              businessName: business.name,
              form101: true,
            }
          : null
      }
      data={{
        ...member,
        name:
          state === "nameless"
            ? null
            : (state === "marked" || state === "ownMarked") && member.name
              ? `\u{200F}${member.name}`
              : member.name,
        // The business's own name for her only where the state says so.
        memberName:
          state === "marked" && member.name ? `\u{200F}${member.name}` : null,
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
        canRemoveMember(viewer, { userId: member.userId, role: member.role })
          ? {
              // The demo's named role after workers, for whoever gives it;
              // shown, not offered, to whoever gives workers and holds less.
              roles: invitableRoles(viewer, [demoNamedRole]),
              beyond: namedRolesBeyond(viewer, [demoNamedRole]),
              namedRoles: [demoNamedRole].map(namedRoleShown),
              ownerOnly: ownerOnlyRoles(
                viewer,
                state === "pay" ? ["manager"] : [],
              ),
              // Who sees pay, the owner's alone: managers, as on the access
              // demo, and workers too with ?state=pay.
              pay:
                viewer.role === "owner"
                  ? {
                      roles:
                        state === "pay"
                          ? ["manager", "worker"]
                          : demoAccess.roles,
                      personal: demoAccess.people.some(
                        (p) => p.userId === person && p.personal,
                      ),
                    }
                  : null,
              ahead: shiftsAheadOf(person),
              // A worker who edits the team doesn't read the team's hours.
              clockedIn: as === "editor" ? null : state === "clocked",
              clockHref: `/design/shell/clock/team/${person}`,
              scheduleHref: "/design/shell/schedule",
              actions: {
                remove: demoRemoveMemberAction,
                setRole: demoSetMemberRoleAction,
                rename: demoRenameMemberAction,
              },
            }
          : null
      }
      wording={baseWording}
    />
  );
}
