import { accentTokens } from "@domain/color";
import { accentProps } from "@ui/accent";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { Suspense } from "react";
import en from "@/messages/en.json";
import { PersonHoursView } from "../../../../../(app)/clock/team/person-view";
import { demoBusinessDetails } from "../../../data";
import {
  demoAddBreak,
  demoAddEntry,
  demoCancelEntry,
  demoChangeAbsence,
  demoChangeBreak,
  demoCorrectEntry,
  demoRecordAbsence,
  demoRemoveAbsence,
  demoRemoveBreak,
  demoRestoreAbsence,
  demoRestoreBreak,
  demoRestoreEntry,
} from "../actions";
import {
  demoAbsenceRefusal,
  demoPersonHours,
  demoPersonSheet,
  demoTeamHours,
  demoTeamPaths,
} from "../data";

export const generateStaticParams = () =>
  demoTeamHours.people.map((person) => ({ person: person.userId }));

type Props = {
  params: Promise<{ person: string }>;
  searchParams: Promise<{ state?: string; absences?: string; lang?: string }>;
};

// One person's shifts with mock data, the same as their row in the team list.
// `?state=edit` opens fixing their newest shift that ended, with its breaks
// and "ביטול המשמרת" under it; `?state=cancel` the step that cancels it,
// asking why; `?state=cancelled` their cancelled shift, with "החזרת המשמרת"
// (Yoav's can't come back over the copy left, and says so). `?state=break`
// the step that fixes a break of theirs, `?state=addBreak` the one that adds
// one, and `?state=openBreak` fixing the shift whose break still runs (Yoav's).
// `?absences=1` gives Noa's month its days away (known issue 19): a vacation
// and reserve duty into next month, with shifts on its days; `&state=`
// `absenceAdd` opens recording more, `absenceEdit` her vacation,
// `absenceOverlap` and `absenceClosed` recording with the overlap's and a
// closed month's refusal. `&lang=en` draws the page in English, left to
// right, with its sheets inside (the mock names and notes stay as they are).
export default function ShellClockPerson({ params, searchParams }: Props) {
  return (
    <Suspense>
      <Demo params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Demo({ params, searchParams }: Props) {
  const [{ person }, { state, absences, lang }] = await Promise.all([
    params,
    searchParams,
  ]);
  const data = demoPersonHours(person, absences === "1");
  if (!data) notFound();
  const view = (
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
      absenceActions={{
        record: demoRecordAbsence,
        change: demoChangeAbsence,
        remove: demoRemoveAbsence,
        restore: demoRestoreAbsence,
      }}
      paths={{ ...demoTeamPaths, build: "/design/shell/schedule/build" }}
      opens={demoPersonSheet(person, state)}
      opensFailed={demoAbsenceRefusal(state)}
    />
  );
  if (lang !== "en") return view;
  // A sheet opens inside the nearest business colour: this frame, so it is
  // in English and left to right too.
  return (
    <NextIntlClientProvider locale="en" messages={en}>
      <div
        dir="ltr"
        lang="en"
        {...accentProps(accentTokens(demoBusinessDetails.accent))}
      >
        {view}
      </div>
    </NextIntlClientProvider>
  );
}
