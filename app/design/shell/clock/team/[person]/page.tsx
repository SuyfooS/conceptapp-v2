import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PersonHoursView } from "../../../../../(app)/clock/team/person-view";
import {
  demoAddBreak,
  demoAddEntry,
  demoCancelEntry,
  demoChangeBreak,
  demoCorrectEntry,
  demoRemoveBreak,
  demoRestoreBreak,
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
// `?state=edit` opens fixing their newest shift that ended, with its breaks
// and "ביטול המשמרת" under it; `?state=cancel` the step that cancels it,
// asking why; `?state=cancelled` their cancelled shift, with "החזרת המשמרת"
// (Yoav's can't come back over the copy left, and says so). `?state=break`
// the step that fixes a break of theirs, `?state=addBreak` the one that adds
// one, and `?state=openBreak` fixing the shift whose break still runs (Yoav's).
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
        addBreak: demoAddBreak,
        changeBreak: demoChangeBreak,
        removeBreak: demoRemoveBreak,
        restoreBreak: demoRestoreBreak,
      }}
      paths={demoTeamPaths}
      opens={demoPersonSheet(person, state)}
    />
  );
}
