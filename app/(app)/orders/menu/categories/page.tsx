import { getDepartments } from "@db/departments";
import { getMenu } from "@db/order-taking";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { baseWording, translator } from "../../../wording";
import { saveCategoriesAction } from "../actions";
import { menuAccess, menuReach } from "../menu-access";
import { CategoriesView } from "./categories-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = translator(baseWording, "app.orders.categories");
  return { title: t("title") };
}

// The menu's categories (waiter mode P2), for whoever runs the menu, and the
// team viewing as a role that does, which reads them and changes nothing.
export default async function OrdersMenuCategoriesPage() {
  const access = await menuAccess();
  if (!access?.runsMenu) notFound();
  const [menu, departments] = await Promise.all([
    getMenu(access.businessId),
    getDepartments(access.businessId),
  ]);
  if (typeof menu !== "object") notFound();
  const all = departments === "notYet" ? [] : departments;
  return (
    <CategoriesView
      menu={menu}
      departments={all.map((d) => ({
        id: d.id,
        name: d.name,
        live: d.archivedAt === null,
      }))}
      reach={menuReach(access)}
      save={saveCategoriesAction.bind(null, access.businessId)}
      paths={{
        menu: "/orders/menu",
        // Departments are the management page's: a link only for whoever opens it.
        departments: access.seesManage ? "/manage/departments" : "",
      }}
    />
  );
}
