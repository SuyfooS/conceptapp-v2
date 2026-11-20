import { getDepartments } from "@db/departments";
import { getMenu } from "@db/order-taking";
import { departmentsOf } from "@domain/departments";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentWording } from "../../current-wording";
import { baseWording, translator } from "../../wording";
import {
  archiveItemAction,
  restoreItemAction,
  saveItemAction,
  setAvailableAction,
} from "./actions";
import { menuAccess, menuReach } from "./menu-access";
import { MenuView } from "./menu-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = translator(baseWording, "app.orders.menu");
  return { title: t("title") };
}

// The menu (waiter mode P2), for the staff while taking orders is on: whoever
// runs it edits it, someone in a department marks sold out what it prepares,
// and the rest read it. Reached from the management page's row "התפריט" and
// from the mode's own item (P4), whose way out it has: back to the app
// (default 9).
export default async function OrdersMenuPage() {
  const access = await menuAccess();
  if (!access) notFound();
  const [menu, departments, wording] = await Promise.all([
    getMenu(access.businessId),
    getDepartments(access.businessId),
    currentWording(),
  ]);
  if (menu === "closed") notFound();
  const all = departments === "notYet" ? [] : departments;
  const tMode = translator(wording, "app.mode");
  const bound = access.businessId;
  return (
    <MenuView
      menu={typeof menu === "object" ? menu : null}
      departments={all.map((d) => ({
        id: d.id,
        name: d.name,
        live: d.archivedAt === null,
      }))}
      myDepartments={departmentsOf(all, access.userId, { live: true })}
      reach={menuReach(access)}
      actions={{
        saveItem: saveItemAction.bind(null, bound),
        archiveItem: archiveItemAction.bind(null, bound),
        restoreItem: restoreItemAction.bind(null, bound),
        setAvailable: setAvailableAction.bind(null, bound),
      }}
      paths={{
        back: { href: "/home", label: tMode("leave") },
        menu: "/orders/menu",
        categories: "/orders/menu/categories",
        places: "/orders/menu/places",
        import: "/orders/menu/import",
        departments: "/manage/departments",
      }}
    />
  );
}
