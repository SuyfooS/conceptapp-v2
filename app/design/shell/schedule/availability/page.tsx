import { Suspense } from "react";
import { AvailabilityView } from "../../../../(app)/schedule/availability/availability-view";
import { demoSaveAvailability } from "./actions";
import { demoWeek } from "./week";

type Props = { searchParams: Promise<{ state?: string }> };

// The real availability form with a fixed week and the demo's stand-in
// action: the same checks, nothing stored. ?state=new shows a week nothing
// was sent for, ?state=late the same past its due moment, and ?state=invalid
// hours that break Friday's limit and overlap, as if sent before the business
// closed on Shabbat, to see a day that fails on sending.
export default function ShellAvailability({ searchParams }: Props) {
  return (
    <Suspense>
      <Demo searchParams={searchParams} />
    </Suspense>
  );
}

async function Demo({ searchParams }: Props) {
  const { state } = await searchParams;
  const unsent = state === "new" || state === "late";
  const week = unsent
    ? { ...demoWeek, mine: null }
    : state === "invalid" && demoWeek.mine
      ? {
          ...demoWeek,
          mine: {
            ...demoWeek.mine,
            ranges: [
              { day: "2026-11-02", start: "09:00", end: "13:00" },
              { day: "2026-11-02", start: "12:00", end: "17:00" },
              { day: "2026-11-06", start: "08:00", end: "23:00" },
            ],
          },
        }
      : demoWeek;
  return (
    <AvailabilityView
      week={week}
      late={state === "late"}
      save={demoSaveAvailability}
      backHref="/design/shell/schedule"
    />
  );
}
