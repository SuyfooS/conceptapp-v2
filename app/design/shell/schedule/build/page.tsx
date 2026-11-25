import { gapsAhead } from "@domain/running-week";
import { scheduleGaps } from "@domain/schedule";
import { ISRAEL_TIME_ZONE } from "@domain/shabbat";
import { buildTeam } from "@domain/team";
import { Suspense } from "react";
import { ScheduleBuildView } from "../../../../(app)/schedule/build/schedule-build-view";
import { baseWording } from "../../../../(app)/wording";
import {
  demoPositions,
  teamAnswers,
  teamInvites,
  teamMembers,
  teamToday,
} from "../../data";
import { demoWeek } from "../availability/week";
import {
  DEMO_NOON,
  demoPublished,
  demoRunningBuild,
} from "../shifts/published";
import { demoPublishMeanwhile, demoSaveSchedule } from "./actions";
import {
  demoBuildShifts,
  demoShare,
  MEANWHILE_PUBLISHED_AT,
  meanwhileBasis,
  meanwhileShifts,
  meanwhileSwaps,
} from "./demo";

type Props = {
  searchParams: Promise<{ state?: string; week?: string; publishes?: string }>;
};

const HREF = "/design/shell/schedule/build";

// The real "build the week" screen with the restaurant's shift pattern, one
// shift added by hand, the demo team and its answers, and a stand-in save.
// ?state=meanwhile: the same week published, with two swap requests waiting
// (Omer gives his Sunday evening away; Maya took Noa's Sunday morning). A
// change that would end a request says so above "פרסום השינויים". Another
// manager approves Maya's while the screen is open, so publishing a change to
// that morning is refused: it comes back as it is now, marked, with the rest
// of the work kept, and publishing again goes out. Each "פרסום השינויים"
// waits eight seconds for "ביטול" first, as the app's does (R3b).
//
// This twin is older than the switch between this week and next (R3a), and
// stays without it. /schedule/build now always shows the switch, with its
// counts, on the business's own clock; that screen, next week included, is
// the running twin at /design/shell/schedule/build/running (?week=next for
// next week).
//
// ?week=2026-11-01: the restaurant's week under way, where the ways in on
// the Today twins lead (R4): published, as Shiran reads it on Tuesday at
// noon, with its four places still open in what is still to start (this
// evening, tomorrow morning, Friday and Saturday night). What is over and
// this morning, under way, lock as on the running twin. The switch's "השבוע
// הבא" goes back to the twin above.
//
// &publishes=no, with any of them: someone who builds the schedule without
// publishing it (the roles plan's R3). A draft saves, with no "פרסום" and the
// line that says who publishes it; a published week (?state=meanwhile) is
// only read, with the line that says why.
//
// Once a week is published with nothing new on the screen (after the
// stand-in's publish, and at rest on ?state=meanwhile and
// ?week=2026-11-01, &publishes=no included), the dock offers sharing it on
// WhatsApp, with a link to the schedule tab's twin.
//
// The restaurant has no week before this one to copy, as the demo
// restaurant's weeks start empty: "העתקה מהשבוע שעבר" is on the running
// twin's next week (?week=next), the shop's.
export default function ShellScheduleBuild(props: Props) {
  return (
    <Suspense>
      <Demo {...props} />
    </Suspense>
  );
}

async function Demo({ searchParams }: Props) {
  const { state, week, publishes: publishing } = await searchParams;
  const publishes = publishing !== "no";
  const { members } = buildTeam(teamMembers, teamInvites, teamToday);
  const running =
    week === demoWeek.start
      ? demoRunningBuild(demoPublished("shiran", []), members)
      : null;
  if (running) {
    return (
      <ScheduleBuildView
        // Another week is another screen, as in the app.
        key="this"
        manageHref="/design/shell/manage/scheduling"
        data={{
          ...running,
          // A stand-in for what the database digests of each shift read.
          basis: Object.fromEntries(
            running.shifts.map((shift, i) => [
              shift.id ?? `${i}`,
              `${i + 1}`.padStart(32, "0"),
            ]),
          ),
        }}
        swaps={[]}
        save={demoSaveSchedule}
        backHref="/design/shell/schedule"
        publishes={publishes}
        share={demoShare}
        wording={baseWording}
        running={{
          which: "this",
          now: DEMO_NOON,
          clock: true,
          weeks: [
            {
              which: "this",
              href: `${HREF}?week=${demoWeek.start}`,
              gaps: gapsAhead(
                running.shifts,
                new Date(DEMO_NOON),
                ISRAEL_TIME_ZONE,
              ).shifts.length,
            },
            {
              which: "next",
              href: HREF,
              gaps: scheduleGaps(demoBuildShifts()).shifts.length,
            },
          ],
        }}
      />
    );
  }
  const common = {
    week: demoWeek,
    team: members,
    // As the app reads them: names and photos only, so how the sheet says
    // who went on or off comes from the staff (`team`), as it does there.
    people: members.map(({ userId, name, photo }) => ({ userId, name, photo })),
    hasPattern: true,
    answers: teamAnswers,
    positions: demoPositions,
    away: [],
  };
  if (state === "meanwhile") {
    return (
      <ScheduleBuildView
        key="meanwhile"
        manageHref="/design/shell/manage/scheduling"
        data={{
          ...common,
          savedAt: MEANWHILE_PUBLISHED_AT,
          publishedAt: MEANWHILE_PUBLISHED_AT,
          shifts: meanwhileShifts,
          basis: meanwhileBasis,
        }}
        swaps={meanwhileSwaps}
        save={demoPublishMeanwhile}
        backHref="/design/shell/schedule"
        publishes={publishes}
        share={demoShare}
        wording={baseWording}
      />
    );
  }
  return (
    <ScheduleBuildView
      key="next"
      manageHref="/design/shell/manage/scheduling"
      data={{
        ...common,
        savedAt: null,
        publishedAt: null,
        shifts: demoBuildShifts(),
        // Drawn from the pattern: nothing was read, as for a week not saved.
        basis: null,
      }}
      swaps={[]}
      save={demoSaveSchedule}
      backHref="/design/shell/schedule"
      publishes={publishes}
      share={demoShare}
      wording={baseWording}
    />
  );
}
