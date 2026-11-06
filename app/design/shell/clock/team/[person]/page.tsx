import { notFound } from "next/navigation";
import { PersonHoursView } from "../../../../../(app)/clock/team/person-view";
import { demoAddEntry, demoCorrectEntry } from "../actions";
import { demoPersonHours, demoTeamHours, demoTeamPaths } from "../data";

export const generateStaticParams = () =>
  demoTeamHours.people.map((person) => ({ person: person.userId }));

// One person's shifts with mock data, with a shift left open to fix.
export default async function ShellClockPerson({
  params,
}: {
  params: Promise<{ person: string }>;
}) {
  const { person } = await params;
  const known = demoTeamHours.people.find((row) => row.userId === person);
  if (!known) notFound();
  return (
    <PersonHoursView
      data={{
        ...demoPersonHours,
        person: { userId: known.userId, name: known.name },
      }}
      actions={{ correct: demoCorrectEntry, add: demoAddEntry }}
      paths={demoTeamPaths}
    />
  );
}
