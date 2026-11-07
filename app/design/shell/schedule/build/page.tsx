import { draftWeek } from "@domain/schedule";
import { buildTeam } from "@domain/team";
import { ScheduleBuildView } from "../../../../(app)/schedule/build/schedule-build-view";
import {
  demoExtraShift,
  demoPositions,
  demoShiftPatterns,
  teamAnswers,
  teamInvites,
  teamMembers,
  teamToday,
} from "../../data";
import { demoWeek } from "../availability/week";
import { demoSaveSchedule } from "./actions";

// Who is already on a shift in the demo, and in which position: a week
// halfway done, with some shifts full and some still short.
const placed: Record<string, [string, string | null][]> = {
  "2026-11-01/morning": [
    ["noa", "waiter"],
    ["itay", "cook"],
  ],
  "2026-11-01/evening": [
    ["maya", "waiter"],
    ["yoav", "bartender"],
    ["omer", "cook"],
  ],
  "2026-11-01/extra": [["shira", "host"]],
  "2026-11-02/morning": [
    ["shiran", null],
    ["itay", "cook"],
    ["shira", "host"],
  ],
  "2026-11-02/evening": [
    ["noa", "waiter"],
    ["yoav", "bartender"],
    ["omer", "cook"],
    ["maya", "waiter"],
  ],
  "2026-11-03/morning": [
    ["maya", "waiter"],
    ["itay", "cook"],
  ],
  "2026-11-03/evening": [
    ["noa", "waiter"],
    ["yoav", "bartender"],
    ["omer", "cook"],
    ["shira", "host"],
  ],
  "2026-11-04/morning": [
    ["noa", "waiter"],
    ["omer", "cook"],
    ["shira", "host"],
  ],
  "2026-11-04/evening": [
    ["maya", "waiter"],
    ["itay", "cook"],
  ],
  "2026-11-05/morning": [["itay", "cook"]],
  "2026-11-06/friday": [
    ["noa", "waiter"],
    ["maya", "waiter"],
    ["itay", "cook"],
    ["yoav", "bartender"],
  ],
  "2026-11-07/saturday-night": [
    ["omer", "cook"],
    ["shira", "host"],
  ],
};

// The real "build the week" screen with the restaurant's shift pattern, one
// shift added by hand, the demo team and its answers, and a stand-in save.
export default function ShellScheduleBuild() {
  const { members } = buildTeam(teamMembers, teamInvites, teamToday);
  const shifts = [
    ...draftWeek(demoWeek.start, demoShiftPatterns),
    { ...demoExtraShift, day: demoWeek.start },
  ]
    .sort(
      (a, b) => a.day.localeCompare(b.day) || a.start.localeCompare(b.start),
    )
    .map((s) => ({
      ...s,
      assignees: (placed[`${s.day}/${s.pattern ?? "extra"}`] ?? []).map(
        ([user, position]) => ({ user, position }),
      ),
    }));
  return (
    <ScheduleBuildView
      manageHref="/design/shell/manage/scheduling"
      data={{
        week: demoWeek,
        savedAt: null,
        publishedAt: null,
        shifts,
        team: members,
        answers: teamAnswers,
        positions: demoPositions,
      }}
      save={demoSaveSchedule}
      backHref="/design/shell/schedule"
    />
  );
}
