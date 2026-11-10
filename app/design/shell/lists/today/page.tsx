import { Suspense } from "react";
import { ListsTodayView } from "../../../../(app)/lists/today/today-view";
import { baseWording } from "../../../../(app)/wording";
import { demoListsToday } from "../data";
import { demoListsPaths } from "../paths";

type Props = { searchParams: Promise<{ day?: string; state?: string }> };

// The manager's overview as Shiran has it on the demo's Tuesday morning:
// last night's kitchen closing late with a fridge out of range, the morning's
// lists, the cleaning closed, and the week's readings. `?day=2026-11-01` is
// Sunday's, with a list nobody did (the history); `?state=empty` a day with
// nothing; `?state=viewing` the team viewing as a manager, which only reads;
// `?state=shiftGone` the restaurant after its evening shift was removed from
// the settings, whose bar closing then opens nothing.
export default function ShellListsToday({ searchParams }: Props) {
  return (
    <Suspense>
      <Demo searchParams={searchParams} />
    </Suspense>
  );
}

async function Demo({ searchParams }: Props) {
  const { day, state } = await searchParams;
  return (
    <ListsTodayView
      data={demoListsToday(
        day,
        state === "empty" || state === "viewing" || state === "shiftGone"
          ? state
          : undefined,
      )}
      wording={baseWording}
      paths={{
        lists: demoListsPaths.lists,
        list: demoListsPaths.list,
        today: "/design/shell/lists/today",
        send: "/design/shell/lists/send",
        templates: "/design/shell/lists/templates",
        template: (id) => `/design/shell/lists/templates/${id}`,
      }}
    />
  );
}
