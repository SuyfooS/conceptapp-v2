import { notFound } from "next/navigation";
import { PersonPayView } from "../../../../../(app)/clock/pay/person-pay-view";
import { baseWording } from "../../../../../(app)/wording";
import { demoNotePayView } from "../actions";
import { demoPayPaths, demoPayPeople, demoPayPerson } from "../data";

export const generateStaticParams = () =>
  demoPayPeople.map((person) => ({ person }));

// One person's month for payroll with mock data, the same as their row.
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
      wording={baseWording}
    />
  );
}
