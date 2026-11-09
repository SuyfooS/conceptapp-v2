import { notFound } from "next/navigation";
import { currentWording } from "../../current-wording";
import { moduleMetadata } from "../../module-screen";
import {
  finishListAction,
  reopenListAction,
  setListItemAction,
} from "../actions";
import { currentList, listsPaths } from "../lists";
import { ListView } from "./list-view";

export const generateMetadata = () => moduleMetadata("lists");

// One list: filling it, finishing it, or reading it when it is closed or for
// someone else. A list the person may not read does not exist for them.
export default async function ListPage({ params }: PageProps<"/lists/[id]">) {
  const { id } = await params;
  const [data, wording] = await Promise.all([
    currentList(id),
    currentWording(),
  ]);
  if (!data) notFound();
  return (
    <ListView
      data={data}
      actions={{
        setItem: setListItemAction,
        finish: finishListAction,
        reopen: reopenListAction,
      }}
      backHref={listsPaths.lists}
      wording={wording}
    />
  );
}
