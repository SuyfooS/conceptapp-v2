import { Suspense } from "react";
import { MyShiftsView } from "../../../../(app)/schedule/shifts/my-shifts-view";
import { baseWording } from "../../../../(app)/wording";
import { demoSwap } from "./actions";
import { DEMO_ENDED, demoPublished, demoRequest } from "./published";

type Props = { searchParams: Promise<{ at?: string }> };

/** Tuesday 3 November at 17:30 in Tel Aviv, an hour and a half into the evening. */
const EVENING = "2026-11-03T15:30:00.000Z";

// The real "my shifts" screen as Noa sees it on Tuesday 3 November at noon:
// this week published, next week not yet. Noa gives away Friday; she can
// take Maya's Wednesday morning, and she took Yoav's Saturday night, which
// waits for the manager. What became of her other requests (`DEMO_ENDED`):
// tonight's wasn't approved, so her hero says so and offers it again, and
// Thursday's was cancelled by the schedule; "מה קרה לבקשות שלך" lists five.
// ?at=evening: the same at 17:30, with her evening shift begun, so it can no
// longer be given away and the hero stands alone.
export default function ShellMyShifts(props: Props) {
  return (
    <Suspense>
      <Demo {...props} />
    </Suspense>
  );
}

async function Demo({ searchParams }: Props) {
  const { at } = await searchParams;
  const data = demoPublished(
    "noa",
    [
      demoRequest("1", "2026-11-06/friday", "noa"),
      demoRequest("2", "2026-11-04/morning", "maya"),
      demoRequest("3", "2026-11-07/saturday-night", "yoav", "noa"),
    ],
    at === "evening" ? EVENING : undefined,
    DEMO_ENDED,
  );
  return <MyShiftsView data={data} swap={demoSwap} wording={baseWording} />;
}
