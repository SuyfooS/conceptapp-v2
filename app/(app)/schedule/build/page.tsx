import { manageReach } from "@domain/manage-access";
import { builderHref, builderWeekOf, gapsAhead } from "@domain/running-week";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentWording } from "../../current-wording";
import { currentMember } from "../../member";
import { baseWording, translator } from "../../wording";
import {
  currentBuildSwaps,
  currentBuildWeeks,
  currentScheduleBuild,
} from "../week";
import { saveScheduleAction } from "./actions";
import { EndedWeekView, ScheduleBuildView } from "./schedule-build-view";

type Props = { searchParams: Promise<{ week?: string | string[] }> };

/** The week `?week=` asks for: the running one, one over, or next week. */
async function askedWeek(props: Props) {
  const { week } = await props.searchParams;
  const weeks = await currentBuildWeeks();
  const asked = weeks
    ? builderWeekOf(typeof week === "string" ? week : null, weeks)
    : null;
  return { weeks, which: asked ?? "next" };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const t = translator(baseWording, "app.build");
  const { which } = await askedWeek(props);
  return {
    title: t(
      which === "this"
        ? "titleRunning"
        : which === "over"
          ? "ended.title"
          : "title",
    ),
  };
}

// Whoever builds the schedule builds it here (`buildsSchedule`: owners and
// managers by default, the roles plan's R3): next week, or with
// `?week=<its first day>` the week running now (the running-week plan's R3a).
// Any other week opens next week, and one already over says so. Someone who
// builds without publishing saves drafts and reads a published week. Anyone
// else gets the not-found screen, as on the team availability screen.
export default async function ScheduleBuildPage(props: Props) {
  const { weeks, which } = await askedWeek(props);
  if (!weeks) notFound();
  const wording = await currentWording();
  if (which === "over") {
    return (
      <EndedWeekView
        running={weeks.thisWeek}
        runningHref={builderHref(weeks.thisWeek)}
        wording={wording}
      />
    );
  }
  const start = which === "this" ? weeks.thisWeek : weeks.nextWeek;
  const [data, swaps, thisWeek, nextWeek, member] = await Promise.all([
    currentScheduleBuild(start),
    currentBuildSwaps(start),
    currentScheduleBuild(weeks.thisWeek),
    currentScheduleBuild(weeks.nextWeek),
    currentMember(),
  ]);
  if (!data) notFound();
  // The regular shifts are set on the management page, which opens to those
  // who hold manage.view (`manageAccess`, R7): anyone else who builds is told
  // only what they can do here.
  const membership = member?.membership;
  const manageHref =
    membership && manageReach(membership) !== null
      ? "/manage/scheduling"
      : null;
  const now = new Date(weeks.now);
  // Shifts still to start lacking someone, in each week.
  const gaps = (build: typeof data | null) =>
    build ? gapsAhead(build.shifts, now, weeks.timeZone).shifts.length : 0;
  return (
    <ScheduleBuildView
      data={data}
      swaps={swaps}
      save={saveScheduleAction}
      manageHref={manageHref}
      publishes={weeks.publishes}
      wording={wording}
      running={{
        which,
        now: weeks.now,
        clock: weeks.clock,
        weeks: [
          {
            which: "this",
            href: builderHref(weeks.thisWeek),
            gaps: gaps(thisWeek),
          },
          {
            which: "next",
            href: builderHref(weeks.nextWeek),
            gaps: gaps(nextWeek),
          },
        ],
      }}
    />
  );
}
