import { notFound } from "next/navigation";
import { PersonView } from "../../../../(app)/team/[person]/person-view";
import { baseWording } from "../../../../(app)/wording";
import { teamMembers, teamProfiles } from "../../data";
import { demoClearBioAction } from "../actions";

export const generateStaticParams = () =>
  teamMembers.map((member) => ({ person: member.userId }));

// A colleague's profile with mock data, as the owner reads it from the Team
// demo: Noa with her line and her cover, Yoav with his, the rest without one.
export default async function ShellTeamPerson({
  params,
}: {
  params: Promise<{ person: string }>;
}) {
  const { person } = await params;
  const member = teamMembers.find((m) => m.userId === person);
  if (!member) notFound();
  const profile = teamProfiles[person];
  return (
    <PersonView
      data={{
        ...member,
        bio: profile?.bio ?? null,
        cover: profile?.cover ?? "glow",
        since: profile?.since ?? "2026-09-01T08:00:00.000Z",
      }}
      timeZone="Asia/Jerusalem"
      canClear
      clearBio={demoClearBioAction}
      teamHref="/design/shell/team"
      wording={baseWording}
    />
  );
}
