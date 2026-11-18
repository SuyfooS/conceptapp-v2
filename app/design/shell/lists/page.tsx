import { Suspense } from "react";
import { ListsView } from "../../../(app)/lists/lists-view";
import { baseWording } from "../../../(app)/wording";
import { demoListChange } from "./actions";
import { demoListsHome } from "./data";
import { demoListsPaths } from "./paths";

type Props = {
  searchParams: Promise<{
    sent?: string;
    department?: string;
    passed?: string;
  }>;
};

// The real Lists screen as Shiran, the shift manager, has it on the demo's
// Tuesday morning: her own lists, the bar's order waiting at the storeroom,
// and the business's day. `?sent=` shows a list she just sent, as after
// sending one; `?department=dep-bar` her lists of the bar alone (the filter,
// L5); `?passed=dep-storeroom` the word that a list went to the storeroom, as
// after passing on one she no longer reads. Noa's and an empty one are under
// /design/shell/lists/worker and /empty.
export default function ShellLists({ searchParams }: Props) {
  return (
    <Suspense>
      <Demo searchParams={searchParams} />
    </Suspense>
  );
}

async function Demo({ searchParams }: Props) {
  const { sent, department, passed } = await searchParams;
  return (
    <ListsView
      data={demoListsHome(sent, department, passed)}
      wording={baseWording}
      paths={demoListsPaths}
      cancel={demoListChange}
    />
  );
}
