import { connection } from "next/server";
import { Suspense } from "react";
import { PayMonthView } from "../../../../(app)/clock/pay/pay-view";
import { baseWording } from "../../../../(app)/wording";
import { demoCloseMonth, demoNotePayView, demoReopenMonth } from "./actions";
import { demoPayMonth, demoPayPathsFor } from "./data";

type Props = {
  searchParams: Promise<{
    person?: string;
    show?: string;
    estimate?: string;
    file?: string;
    close?: string;
  }>;
};

// The real hours for payroll with mock data: October at the demo restaurant,
// with a correction, hours waiting, a shift left open (in the hours, not yet in
// the rates), a raise in the month and someone who left with no hourly wage,
// run through the hours engine (payroll P7). ?person=
// chooses who a tablet shows beside the list; ?show=noWage lists only those
// whose shifts have no wage, ?show=noNumber those with no payroll number;
// ?estimate=off is a business whose amounts the team hasn't turned on;
// ?file=sent a month whose file went out, ?file=changed one whose hours
// changed since (payroll P8). The main action downloads the demo's own file.
// ?close= is where October stands for payroll (payroll P9): none, ended and
// not closed, for the owner to close; "closed" closed by Galit; "changed" a
// day corrected since; "manager" closed, as a manager reads it; "before"
// September closed and changed, which October's file holds (the demo's file
// too); "empty" the same with no hours in October, its file still there.
export default function ShellClockPay({ searchParams }: Props) {
  return (
    <Suspense>
      <Demo searchParams={searchParams} />
    </Suspense>
  );
}

async function Demo({ searchParams }: Props) {
  await connection();
  const { person, show, estimate, file, close } = await searchParams;
  return (
    <PayMonthView
      data={demoPayMonth(person, show, estimate, file, close)}
      paths={demoPayPathsFor(close)}
      note={demoNotePayView}
      close={demoCloseMonth}
      reopen={demoReopenMonth}
      wording={baseWording}
    />
  );
}
