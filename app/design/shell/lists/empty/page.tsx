import { Suspense } from "react";
import { ListsView } from "../../../../(app)/lists/lists-view";
import { baseWording } from "../../../../(app)/wording";
import { demoListChange } from "../actions";
import { demoEmptyBusinessLists, demoEmptyLists } from "../data";
import { demoListsPaths } from "../paths";

type Props = { searchParams: Promise<{ as?: string }> };

// Lists for a worker nothing was sent to yet: it says what comes next.
// `?as=business` is the team viewing the business as a manager on a day
// nothing was sent, which gets its own words rather than the worker's.
export default function ShellEmptyLists({ searchParams }: Props) {
  return (
    <Suspense>
      <Demo searchParams={searchParams} />
    </Suspense>
  );
}

async function Demo({ searchParams }: Props) {
  const { as } = await searchParams;
  return (
    <ListsView
      data={as === "business" ? demoEmptyBusinessLists() : demoEmptyLists()}
      wording={baseWording}
      paths={demoListsPaths}
      cancel={demoListChange}
    />
  );
}
