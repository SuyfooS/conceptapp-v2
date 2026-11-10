import { connection } from "next/server";
import { Suspense } from "react";
import { PayMonthView } from "../../../../(app)/clock/pay/pay-view";
import { baseWording } from "../../../../(app)/wording";
import { demoNotePayView } from "./actions";
import { demoPayMonth, demoPayPaths } from "./data";

type Props = { searchParams: Promise<{ person?: string; show?: string }> };

// The real hours for payroll with mock data: October at the demo restaurant,
// with a correction, hours waiting, a raise in the month and someone who left
// with no hourly wage. ?person= chooses who a tablet shows beside the list;
// ?show=noWage lists only those whose shifts have no wage, ?show=noNumber
// those with no payroll number.
export default function ShellClockPay({ searchParams }: Props) {
  return (
    <Suspense>
      <Demo searchParams={searchParams} />
    </Suspense>
  );
}

async function Demo({ searchParams }: Props) {
  await connection();
  const { person, show } = await searchParams;
  return (
    <PayMonthView
      data={demoPayMonth(person, show)}
      paths={demoPayPaths}
      note={demoNotePayView}
      wording={baseWording}
    />
  );
}
