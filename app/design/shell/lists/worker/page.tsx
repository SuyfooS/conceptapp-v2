import { Suspense } from "react";
import { ListsView } from "../../../../(app)/lists/lists-view";
import { baseWording } from "../../../../(app)/wording";
import { demoListChange } from "../actions";
import {
  demoWorkerEditsLists,
  demoWorkerFixesLists,
  demoWorkerLists,
} from "../data";
import { demoListsPaths } from "../paths";

type Props = { searchParams: Promise<{ state?: string }> };

// Lists as Noa, a worker in the kitchen, has it: last night's closing, late,
// the opening list due soon, and this morning's cleaning, already closed.
// `?state=edits` is Noa once the owner gave workers lists edit without
// sending (the roles plan's R5): the business's day and its templates too,
// no way to send a list, and a line that says who sends. `?state=fixable`
// is Noa in "עובד בכיר", given "תיקון רשימות שנסגרו" (L6b-2): yesterday's
// opening, which she closed, under "עוד אפשר לתקן" for its day.
export default function ShellWorkerLists({ searchParams }: Props) {
  return (
    <Suspense>
      <Demo searchParams={searchParams} />
    </Suspense>
  );
}

async function Demo({ searchParams }: Props) {
  const { state } = await searchParams;
  return (
    <ListsView
      data={
        state === "edits"
          ? demoWorkerEditsLists()
          : state === "fixable"
            ? demoWorkerFixesLists()
            : demoWorkerLists()
      }
      wording={baseWording}
      paths={demoListsPaths}
      cancel={demoListChange}
    />
  );
}
