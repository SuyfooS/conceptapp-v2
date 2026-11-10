import { notFound } from "next/navigation";
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

// One person's month for payroll with mock data, the same as their row, with
// their hourly wage and its history: Noa's has a typo fixed and a raise set
// for December, Yoav's a raise in October, Maya has none. And their details
// for payroll: Maya is a minor without a number, Yoav rests on Friday, and
// Noa's start was copied from joining, for checking.
export default async function ShellClockPayPerson({
  params,
}: {
  params: Promise<{ person: string }>;
}) {
  const { person } = await params;
  const data = demoPayPerson(person);
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
