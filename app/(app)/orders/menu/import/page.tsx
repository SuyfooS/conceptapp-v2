import { getDepartments } from "@db/departments";
import { getMenu } from "@db/order-taking";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentWording } from "../../../current-wording";
import { baseWording, translator } from "../../../wording";
import { importMenuAction } from "../actions";
import { menuAccess } from "../menu-access";
import { MenuImportView } from "./import-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = translator(baseWording, "app.orders.import");
  return { title: t("title") };
}

// Copying in a menu by pasting it (waiter mode P2), for whoever edits the
// menu: owners always, managers by default. A view as such a role sees the
// menu, not this.
export default async function OrdersMenuImportPage() {
  const access = await menuAccess();
  if (!access?.edits) notFound();
  const [menu, departments, wording] = await Promise.all([
    getMenu(access.businessId),
    getDepartments(access.businessId),
    currentWording(),
  ]);
  if (typeof menu !== "object") notFound();
  const t = translator(wording, "app.orders");
  return (
    <MenuImportView
      existing={menu}
      departments={(departments === "notYet" ? [] : departments).map((d) => ({
        id: d.id,
        name: d.name,
        live: d.archivedAt === null,
      }))}
      importMenu={importMenuAction.bind(null, access.businessId)}
      paths={{
        back: { href: "/orders/menu", label: t("menu.title") },
        done: { href: "/orders/menu", label: t("import.toMenu") },
        departments: access.seesManage ? "/manage/departments" : null,
      }}
    />
  );
}
