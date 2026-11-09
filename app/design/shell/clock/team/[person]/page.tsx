import { notFound } from "next/navigation";
import { PersonHoursView } from "../../../../../(app)/clock/team/person-view";
import { demoAddEntry, demoCorrectEntry } from "../actions";
import { demoPersonHours, demoTeamHours, demoTeamPaths } from "../data";

export const generateStaticParams = () =>
  demoTeamHours.people.map((person) => ({ person: person.userId }));

// One person's shifts with mock data, the same as their row in the team list.
export default async function ShellClockPerson({
  params,
}: {
  params: Promise<{ person: string }>;
}) {
  const { person } = await params;
  const data = demoPersonHours(person);
  if (!data) notFound();
  return (
    <PersonHoursView
      data={data}
      actions={{ correct: demoCorrectEntry, add: demoAddEntry }}
      paths={demoTeamPaths}
    />
  );
}
