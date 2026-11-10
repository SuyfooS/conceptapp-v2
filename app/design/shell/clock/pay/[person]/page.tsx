import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PersonPayView } from "../../../../../(app)/clock/pay/person-pay-view";
import { baseWording } from "../../../../../(app)/wording";
import {
  demoNotePayView,
  demoSetDetails,
  demoSetPeriod,
  demoSetWage,
} from "../actions";
import { demoPayPaths, demoPayPeople, demoPayPerson } from "../data";

export const generateStaticParams = () =>
  demoPayPeople.map((person) => ({ person }));

type Props = {
  params: Promise<{ person: string }>;
  searchParams: Promise<{ estimate?: string }>;
};

// One person's month for payroll with mock data, the same as their row, with
// their hourly wage and its history: Noa's has a typo fixed and a raise set
// for December, Yoav's a raise in October, Maya has none. And their details
// for payroll: Maya is a minor without a number, Yoav rests on Friday, and
// Noa's start was copied from joining, for checking. From the hours engine
// (payroll P7): each one's month by rate, Yoav's election day paid and his
// night in his Friday rest, Maya's short breaks; ?estimate=off is a business
// whose amounts the team hasn't turned on.
export default function ShellClockPayPerson({ params, searchParams }: Props) {
  return (
    <Suspense>
      <Demo params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Demo({ params, searchParams }: Props) {
  const [{ person }, { estimate }] = await Promise.all([params, searchParams]);
  const data = demoPayPerson(person, estimate);
  if (!data) notFound();
  return (
    <PersonPayView
      data={data}
      paths={demoPayPaths}
      note={demoNotePayView}
      setWage={demoSetWage}
      setDetails={demoSetDetails}
      setPeriod={demoSetPeriod}
      wording={baseWording}
    />
  );
}
