import { getMyOrders } from "@db/orders";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { baseWording, translator } from "../../wording";
import { ordersAccess } from "../orders-access";
import { readOf } from "../reads";
import { MineScreen } from "../screens";

export async function generateMetadata(): Promise<Metadata> {
  const t = translator(baseWording, "app.orders.mine");
  return { title: t("metaTitle") };
}

// "ההזמנות שלי" (waiter mode P4): what the person sent today, ready first.
export default async function MyOrdersPage() {
  const access = await ordersAccess();
  if (!access?.reach.mode.takes) notFound();
  return <MineScreen mine={readOf(await getMyOrders(access.businessId))} />;
}
