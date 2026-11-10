import { connection } from "next/server";
import { Suspense } from "react";
import { PayMonthView } from "../../../../(app)/clock/pay/pay-view";
import { baseWording } from "../../../../(app)/wording";
import { demoNotePayView } from "./actions";
import { demoPayMonth, demoPayPaths } from "./data";

type Props = {
  searchParams: Promise<{ person?: string; show?: string; estimate?: string }>;
};

// The real hours for payroll with mock data: October at the demo restaurant,
// with a correction, hours waiting, a shift left open (in the hours, not yet in
// the rates), a raise in the month and someone who left with no hourly wage,
// run through the hours engine (payroll P7). ?person=
// chooses who a tablet shows beside the list; ?show=noWage lists only those
// whose shifts have no wage, ?show=noNumber those with no payroll number;
// ?estimate=off is a business whose amounts the team hasn't turned on.
export default function ShellClockPay({ searchParams }: Props) {
  return (
    <Suspense>
      <Demo searchParams={searchParams} />
    </Suspense>
  );
}

async function Demo({ searchParams }: Props) {
  await connection();
  const { person, show, estimate } = await searchParams;
  return (
    <PayMonthView
      data={demoPayMonth(person, show, estimate)}
      paths={demoPayPaths}
      note={demoNotePayView}
      wording={baseWording}
    />
  );
}
