import { getMenu } from "@db/order-taking";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentWording } from "../../../current-wording";
import { baseWording, translator } from "../../../wording";
import { savePlacesAction } from "../actions";
import { menuAccess, menuReach } from "../menu-access";
import { PlacesView } from "./places-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = translator(baseWording, "app.orders.places");
  return { title: t("title") };
}

// The places orders are taken for (waiter mode P2), for whoever runs the
// menu, and the team viewing as a role that does, which reads them.
export default async function OrdersMenuPlacesPage() {
  const access = await menuAccess();
  if (!access?.runsMenu) notFound();
  const [menu, wording] = await Promise.all([
    getMenu(access.businessId),
    currentWording(),
  ]);
  if (typeof menu !== "object") notFound();
  const t = translator(wording, "app.orders.menu");
  return (
    <PlacesView
      menu={menu}
      reach={menuReach(access)}
      save={savePlacesAction.bind(null, access.businessId)}
      back={{ href: "/orders/menu", label: t("title") }}
    />
  );
}
