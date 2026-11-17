import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PersonHoursView } from "../../../../../(app)/clock/team/person-view";
import {
  demoAddEntry,
  demoCancelEntry,
  demoCorrectEntry,
  demoRestoreEntry,
} from "../actions";
import {
  demoPersonHours,
  demoPersonSheet,
  demoTeamHours,
  demoTeamPaths,
} from "../data";

export const generateStaticParams = () =>
  demoTeamHours.people.map((person) => ({ person: person.userId }));

type Props = {
  params: Promise<{ person: string }>;
  searchParams: Promise<{ state?: string }>;
};

// One person's shifts with mock data, the same as their row in the team list.
// `?state=edit` opens fixing their newest shift that ended, with "ביטול
// המשמרת" under it; `?state=cancel` the step that cancels it, asking why;
// `?state=cancelled` their cancelled shift, with "החזרת המשמרת" (Yoav's can't
// come back over the copy left, and says so).
export default function ShellClockPerson({ params, searchParams }: Props) {
  return (
    <Suspense>
      <Demo params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Demo({ params, searchParams }: Props) {
  const [{ person }, { state }] = await Promise.all([params, searchParams]);
  const data = demoPersonHours(person);
  if (!data) notFound();
  return (
    <PersonHoursView
      data={data}
      actions={{
        correct: demoCorrectEntry,
        add: demoAddEntry,
        cancel: demoCancelEntry,
        restore: demoRestoreEntry,
      }}
      paths={demoTeamPaths}
      opens={demoPersonSheet(person, state)}
    />
  );
}
