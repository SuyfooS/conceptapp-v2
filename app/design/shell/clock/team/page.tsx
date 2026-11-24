import { Suspense } from "react";
import { TeamHoursView } from "../../../../(app)/clock/team/team-view";
import { baseWording } from "../../../../(app)/wording";
import {
  demoConfirmEntry,
  demoRestartStation,
  demoStopStation,
} from "./actions";
import { demoAwayToday, demoTeamHours, demoTeamPaths } from "./data";

type Props = { searchParams: Promise<{ away?: string }> };

// The real team hours with mock data: two entries to approve, one shift to
// fix, two at work, the clock's code to show, and three clock stations.
// `?away=1` adds who is away today (known issue 19): Noa sick, and Yoav
// recorded away while at work.
export default function ShellClockTeam({ searchParams }: Props) {
  return (
    <Suspense>
      <Demo searchParams={searchParams} />
    </Suspense>
  );
}

async function Demo({ searchParams }: Props) {
  const { away } = await searchParams;
  return (
    <TeamHoursView
      data={
        away === "1"
          ? { ...demoTeamHours, awayToday: demoAwayToday }
          : demoTeamHours
      }
      actions={{
        confirm: demoConfirmEntry,
        stopStation: demoStopStation,
        restartStation: demoRestartStation,
      }}
      paths={demoTeamPaths}
      wording={baseWording}
    />
  );
}
