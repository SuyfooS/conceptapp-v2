import { Suspense } from "react";
import { ListsView } from "../../../(app)/lists/lists-view";
import { baseWording } from "../../../(app)/wording";
import { demoListChange } from "./actions";
import { demoListsHome } from "./data";
import { demoListsPaths } from "./paths";

type Props = { searchParams: Promise<{ sent?: string }> };

// The real Lists screen as Shiran, the shift manager, has it on the demo's
// Tuesday morning: her own lists and the business's day. `?sent=` shows a
// list she just sent, as after sending one. Noa's and an empty one are under
// /design/shell/lists/worker and /empty.
export default function ShellLists({ searchParams }: Props) {
  return (
    <Suspense>
      <Demo searchParams={searchParams} />
    </Suspense>
  );
}

async function Demo({ searchParams }: Props) {
  const { sent } = await searchParams;
  return (
    <ListsView
      data={demoListsHome(sent)}
      wording={baseWording}
      paths={demoListsPaths}
      cancel={demoListChange}
    />
  );
}
