import { notFound } from "next/navigation";
import { currentWording } from "../../current-wording";
import { moduleMetadata } from "../../module-screen";
import {
  finishListAction,
  passListAction,
  removeListPhotoAction,
  reopenListAction,
  setListItemAction,
  setListPhotoAction,
} from "../actions";
import { currentList, listsAccess, listsPaths } from "../lists";
import { ListView } from "./list-view";

export const generateMetadata = () => moduleMetadata("lists");

// One list: filling it, finishing it, passing it to another department, or
// reading it when it is closed or for someone else. A list the person may not
// read does not exist for them. Passing and photos are bound to the business
// the screen was drawn for.
export default async function ListPage({ params }: PageProps<"/lists/[id]">) {
  const { id } = await params;
  const [data, access, wording] = await Promise.all([
    currentList(id),
    listsAccess(),
    currentWording(),
  ]);
  if (!data || !access) notFound();
  return (
    <ListView
      data={data}
      actions={{
        setItem: setListItemAction,
        finish: finishListAction,
        reopen: reopenListAction,
        pass: passListAction.bind(null, access.businessId),
        setPhoto: setListPhotoAction.bind(null, access.businessId),
        removePhoto: removeListPhotoAction.bind(null, access.businessId),
      }}
      backHref={listsPaths.lists}
      wording={wording}
    />
  );
}
