import { ListsView } from "../../../../(app)/lists/lists-view";
import { baseWording } from "../../../../(app)/wording";
import { demoListChange } from "../actions";
import { demoWorkerLists } from "../data";
import { demoListsPaths } from "../paths";

// Lists as Noa, a worker in the kitchen, has it: the opening list due soon
// and this morning's cleaning, already closed.
export default function ShellWorkerLists() {
  return (
    <ListsView
      data={demoWorkerLists()}
      wording={baseWording}
      paths={demoListsPaths}
      cancel={demoListChange}
    />
  );
}
