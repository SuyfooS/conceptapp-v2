import { shiftMinutes } from "@domain/schedule";
import { PageBody, PageHeader } from "@ui/page";
import { getTranslations } from "next-intl/server";
import type { PublishedSchedule } from "../week";
import { MyShiftsBoard } from "./my-shifts-board";
import type { SwapAction } from "./shift-sheet";
import { upcomingShifts } from "./shift-text";

export { upcomingShifts };

/**
 * The person's own shifts from today on, and the shifts colleagues give away
 * for them to take. The team's week lives on the schedule tab. Phone: one
 * under the other. Tablet and desktop: side by side. `swap` is `swapAction`,
 * or the demo's stand-in. Also rendered with mock data on
 * /design/shell/schedule/shifts.
 */
export async function MyShiftsView({
  data,
  swap,
}: {
  data: PublishedSchedule;
  swap: SwapAction;
}) {
  const [t, tm] = await Promise.all([
    getTranslations("app"),
    getTranslations("modules.scheduling"),
  ]);
  const mine = upcomingShifts(data);
  const hours =
    Math.round((shiftMinutes(mine.map(({ shift }) => shift)) / 60) * 10) / 10;
  return (
    <PageBody>
      <PageHeader
        back={{ href: "/schedule", label: tm("name") }}
        title={t("shifts.title")}
        subtitle={
          mine.length > 0
            ? `${t("shifts.mine.count", { count: mine.length })} · ${t("shifts.mine.hours", { hours })}`
            : t("shifts.subtitle")
        }
      />
      <MyShiftsBoard
        mine={mine}
        anyPublished={
          data.thisWeek.publishedAt !== null ||
          data.nextWeek.publishedAt !== null
        }
        shifts={[...data.thisWeek.shifts, ...data.nextWeek.shifts]}
        data={{
          userId: data.userId,
          today: data.today,
          people: data.people,
          positions: data.positions,
          swaps: data.swaps,
        }}
        swap={swap}
      />
    </PageBody>
  );
}
