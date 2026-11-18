import { notFound } from "next/navigation";
import { currentWording } from "../current-wording";
import { moduleMetadata } from "../module-screen";
import { cancelListAction } from "./actions";
import { currentListsHome, listsPaths } from "./lists";
import { ListsView } from "./lists-view";

export const generateMetadata = () => moduleMetadata("lists");

// Lists: what is for the person now and what closed today. `?sent=` is a list
// they just sent, which they can still take back; `?department=` the
// department filter's choice, for someone in more than one; `?passed=` the
// department a list was just passed to, by someone who no longer reads it.
export default async function ListsPage({ searchParams }: PageProps<"/lists">) {
  const { sent, department, passed } = await searchParams;
  const [data, wording] = await Promise.all([
    currentListsHome(
      typeof sent === "string" ? sent : undefined,
      typeof department === "string" ? department : undefined,
      typeof passed === "string" ? passed : undefined,
    ),
    currentWording(),
  ]);
  if (!data) notFound();
  return (
    <ListsView
      data={data}
      wording={wording}
      paths={{
        lists: listsPaths.lists,
        home: listsPaths.home,
        list: listsPaths.list,
        base: "",
      }}
      cancel={cancelListAction}
    />
  );
}
