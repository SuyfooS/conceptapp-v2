import { scheduleWeekOf } from "@domain/share";
import { Suspense } from "react";
import { ScheduleView } from "../../../(app)/schedule/schedule-view";
import { baseWording } from "../../../(app)/wording";
import { demoShare } from "./build/demo";
import { demoSwap } from "./shifts/actions";
import {
  DEMO_ENDED,
  demoAway,
  demoManagerSchedule,
  demoRequest,
} from "./shifts/published";

type Props = { searchParams: Promise<{ week?: string; away?: string }> };

// The real schedule tab as Shiran, the shift manager, sees it on Tuesday
// 3 November at noon: this week published, with four of its shifts still to
// start lacking someone (its row leads "ניהול הסידור"), next week a draft,
// two requests waiting. Her morning shift is on, so it offers no giving away.
// The published week offers sharing it on WhatsApp, under "פורסם ב-…", and
// ?week=2026-11-08, as a shared link would, opens on next week. ?away=1:
// Noa is away on Tuesday and Wednesday (known issue 19), which her Tuesday
// evening says to Shiran, who builds the schedule.
export default function ShellSchedule(props: Props) {
  return (
    <Suspense>
      <Demo {...props} />
    </Suspense>
  );
}

async function Demo({ searchParams }: Props) {
  const { week, away } = await searchParams;
  const managed = demoManagerSchedule(
    [
      demoRequest("1", "2026-11-06/friday", "noa"),
      demoRequest("2", "2026-11-04/morning", "maya", "itay"),
      demoRequest("3", "2026-11-07/saturday-night", "yoav", "noa"),
    ],
    DEMO_ENDED,
  );
  const schedule =
    away === "1"
      ? { ...managed, data: { ...managed.data, away: demoAway } }
      : managed;
  return (
    <ScheduleView
      {...schedule}
      asked={scheduleWeekOf(week, {
        thisWeek: schedule.data.thisWeek.start,
        nextWeek: schedule.data.nextWeek.start,
      })}
      share={demoShare}
      swap={demoSwap}
      wording={baseWording}
    />
  );
}
