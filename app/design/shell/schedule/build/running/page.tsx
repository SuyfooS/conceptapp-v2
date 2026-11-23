import { gapsAhead } from "@domain/running-week";
import { ISRAEL_TIME_ZONE } from "@domain/shabbat";
import { Suspense } from "react";
import { ScheduleBuildView } from "../../../../../(app)/schedule/build/schedule-build-view";
import { baseWording } from "../../../../../(app)/wording";
import { demoSaveSchedule } from "../actions";
import { demoPublishRunning } from "./actions";
import {
  SHOP_NEXT_SAVED_AT,
  SHOP_NOW,
  SHOP_PUBLISHED_AT,
  shopLastWeek,
  shopNextAnswers,
  shopNextDraft,
  shopNextDraftBasis,
  shopNextShifts,
  shopNextWeek,
  shopPositions,
  shopRunningAnswers,
  shopRunningBasis,
  shopRunningShifts,
  shopShare,
  shopSwaps,
  shopTeam,
  shopThisWeek,
} from "./shop";

type Props = { searchParams: Promise<{ week?: string; state?: string }> };

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
// back, and "ביטול" letting it go unsent, are this twin's to look at. At rest
// and after a publish, the dock offers sharing the week on WhatsApp.
//
// Next week offers "העתקה מהשבוע שעבר", from the week under way: Liya, who
// left, is counted and not copied, and Tamar, who can only do mornings next
// week, isn't copied onto Thursday evening. Nothing is stored: the copy is on
// the screen until the stand-in saves or publishes it, and its toast's
// "ביטול" brings back the pattern's empty week, until the next change on the
// screen takes that way back away. &state=draft: next week saved as a draft
// with Tamar and Itai on Sunday morning, so Sunday stays as it is, unless the
// sheet's switch replaces it. The week under way is published, and offers no
// copy.
export default function ShellScheduleBuildRunning(props: Props) {
  return (
    <Suspense>
      <Demo {...props} />
    </Suspense>
  );
}

async function Demo({ searchParams }: Props) {
  const { week, state } = await searchParams;
  const next = week === "next";
  const draft = next && state === "draft";
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
      gaps: gapsAhead(
        draft ? shopNextDraft : shopNextShifts,
        now,
        ISRAEL_TIME_ZONE,
      ).shifts.length,
    },
  ];
  const common = {
    manageHref: "/design/shell/manage/scheduling",
    backHref: "/design/shell/schedule",
    share: shopShare,
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
        // Another state is another screen, as another reading is in the app.
        key={draft ? "draft" : "next"}
        data={{
          week: shopNextWeek,
          savedAt: draft ? SHOP_NEXT_SAVED_AT : null,
          publishedAt: null,
          shifts: draft ? shopNextDraft : shopNextShifts,
          basis: draft ? shopNextDraftBasis : null,
          team: shopTeam,
          people: shopTeam,
          hasPattern: true,
          answers: shopNextAnswers,
          positions: shopPositions,
        }}
        swaps={[]}
        lastWeek={shopLastWeek}
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
