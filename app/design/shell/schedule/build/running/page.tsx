import { gapsAhead } from "@domain/running-week";
import { ISRAEL_TIME_ZONE } from "@domain/shabbat";
import { Suspense } from "react";
import { ScheduleBuildView } from "../../../../../(app)/schedule/build/schedule-build-view";
import { baseWording } from "../../../../../(app)/wording";
import { demoSaveSchedule } from "../actions";
import { demoPublishRunning } from "./actions";
import {
  SHOP_NOW,
  SHOP_PUBLISHED_AT,
  shopNextShifts,
  shopNextWeek,
  shopPositions,
  shopRunningAnswers,
  shopRunningBasis,
  shopRunningShifts,
  shopSwaps,
  shopTeam,
  shopThisWeek,
} from "./shop";

type Props = { searchParams: Promise<{ week?: string }> };

const HREF = "/design/shell/schedule/build/running";

// The real builder on the week that is already running (the running-week
// plan's R3a), with the demo shop's people, positions and shifts, on Tuesday
// 17 November at 11:20 in Haifa: Sunday and Monday are over and dimmed, this
// morning is under way and only takes more people, and this evening is one
// short since Liya left the team (her past shifts keep her, as someone no
// longer on the team). Roni's request to give away Thursday evening waits.
// The switch above the days goes to next week (?week=next), drawn from the
// shop's pattern and not saved yet, through the question that unsaved work
// asks first. The stand-in publish refuses a shift that has begun, as the
// database does; nothing is stored. The demo's clock goes on from 11:20 once
// a minute, as the app's does from the server's moment. "פרסום השינויים"
// waits eight seconds for "ביטול" before the stand-in hears of it (R3b), as
// the app's does before the server: the held state, its toast with the way
// back, and "ביטול" letting it go unsent, are this twin's to look at.
export default function ShellScheduleBuildRunning(props: Props) {
  return (
    <Suspense>
      <Demo {...props} />
    </Suspense>
  );
}

async function Demo({ searchParams }: Props) {
  const { week } = await searchParams;
  const next = week === "next";
  const now = new Date(SHOP_NOW);
  const weeks = [
    {
      which: "this" as const,
      href: HREF,
      gaps: gapsAhead(shopRunningShifts, now, ISRAEL_TIME_ZONE).shifts.length,
    },
    {
      which: "next" as const,
      href: `${HREF}?week=next`,
      gaps: gapsAhead(shopNextShifts, now, ISRAEL_TIME_ZONE).shifts.length,
    },
  ];
  const common = {
    manageHref: "/design/shell/manage/scheduling",
    backHref: "/design/shell/schedule",
    wording: baseWording,
  };
  const running = {
    which: next ? ("next" as const) : ("this" as const),
    now: SHOP_NOW,
    clock: true,
    weeks,
  };
  if (next) {
    return (
      <ScheduleBuildView
        {...common}
        data={{
          week: shopNextWeek,
          savedAt: null,
          publishedAt: null,
          shifts: shopNextShifts,
          basis: null,
          team: shopTeam,
          people: shopTeam,
          hasPattern: true,
          answers: [],
          positions: shopPositions,
        }}
        swaps={[]}
        save={demoSaveSchedule}
        running={running}
      />
    );
  }
  return (
    <ScheduleBuildView
      {...common}
      data={{
        week: shopThisWeek,
        savedAt: SHOP_PUBLISHED_AT,
        publishedAt: SHOP_PUBLISHED_AT,
        shifts: shopRunningShifts,
        basis: shopRunningBasis,
        team: shopTeam,
        people: shopTeam,
        hasPattern: true,
        answers: shopRunningAnswers,
        positions: shopPositions,
      }}
      swaps={shopSwaps}
      save={demoPublishRunning}
      running={running}
    />
  );
}
