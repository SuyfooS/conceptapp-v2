import { connection } from "next/server";
import { Suspense } from "react";
import { PayMonthView } from "../../../../(app)/clock/pay/pay-view";
import { baseWording } from "../../../../(app)/wording";
import { demoNotePayView } from "./actions";
import { demoPayMonth, demoPayPaths } from "./data";

type Props = { searchParams: Promise<{ person?: string }> };

// The real hours for payroll with mock data: October at the demo restaurant,
// with a correction, hours waiting and someone who left. ?person= chooses who
// a tablet shows beside the list.
export default function ShellClockPay({ searchParams }: Props) {
  return (
    <Suspense>
      <Demo searchParams={searchParams} />
    </Suspense>
  );
}

async function Demo({ searchParams }: Props) {
  await connection();
  const { person } = await searchParams;
  return (
    <PayMonthView
      data={demoPayMonth(person)}
      paths={demoPayPaths}
      note={demoNotePayView}
      wording={baseWording}
    />
  );
}
