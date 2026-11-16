import { Suspense } from "react";
import { ListsView } from "../../../../(app)/lists/lists-view";
import { baseWording } from "../../../../(app)/wording";
import { demoListChange } from "../actions";
import { demoWorkerEditsLists, demoWorkerLists } from "../data";
import { demoListsPaths } from "../paths";

type Props = { searchParams: Promise<{ state?: string }> };

// Lists as Noa, a worker in the kitchen, has it: last night's closing, late,
// the opening list due soon, and this morning's cleaning, already closed.
// `?state=edits` is Noa once the owner gave workers lists edit without
// sending (the roles plan's R5): the business's day and its templates too,
// no way to send a list, and a line that says who sends.
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
      data={state === "edits" ? demoWorkerEditsLists() : demoWorkerLists()}
      wording={baseWording}
      paths={demoListsPaths}
      cancel={demoListChange}
    />
  );
}
