import { draftWeek } from "@domain/schedule";
import { buildTeam } from "@domain/team";
import { ScheduleBuildView } from "../../../../(app)/schedule/build/schedule-build-view";
import {
  demoPositions,
  demoShiftPatterns,
  teamAnswers,
  teamInvites,
  teamMembers,
  teamToday,
} from "../../data";
import { demoWeek } from "../availability/week";
import { demoSaveSchedule } from "./actions";

// Who is already on a shift in the demo, and in which position: Sunday
// morning has two of three, Sunday evening one of four; the rest of the
// week is still empty.
const placed: Record<string, [string, string | null][]> = {
  "2026-11-01/morning": [
    ["noa", "waiter"],
    ["itay", "cook"],
  ],
  "2026-11-01/evening": [["shiran", null]],
};

// The real "build the week" screen with the restaurant's shift pattern,
// the demo team and its answers, and a stand-in save.
export default function ShellScheduleBuild() {
  const { members } = buildTeam(teamMembers, teamInvites, teamToday);
  const shifts = draftWeek(demoWeek.start, demoShiftPatterns).map((s) => ({
    ...s,
    assignees: (placed[`${s.day}/${s.pattern}`] ?? []).map(
      ([user, position]) => ({ user, position }),
    ),
  }));
  return (
    <ScheduleBuildView
      data={{
        week: demoWeek,
        savedAt: null,
        shifts,
        team: members,
        answers: teamAnswers,
        positions: demoPositions,
      }}
      save={demoSaveSchedule}
    />
  );
}
