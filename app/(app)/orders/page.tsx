import { getMenu } from "@db/order-taking";
import { getOrderFloor } from "@db/orders";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { baseWording, translator } from "../wording";
import { ordersAccess } from "./orders-access";
import { readOf } from "./reads";
import { FloorScreen } from "./screens";

export async function generateMetadata(): Promise<Metadata> {
  // Page titles stay in the app's own words.
  const t = translator(baseWording, "app.orders.floor");
  return { title: t("metaTitle") };
}

// The floor (waiter mode P4): every place and open takeaway with its state,
// for whoever takes orders, runs them, or views as a role on the staff.
// Someone who only prepares goes to preparing (default 6).
export default async function OrdersFloorPage() {
  const access = await ordersAccess();
  if (!access) notFound();
  if (!access.reach.mode.takes) redirect("/orders/prep");
  const [floor, menu] = await Promise.all([
    getOrderFloor(access.businessId),
    getMenu(access.businessId),
  ]);
  return <FloorScreen floor={readOf(floor)} menu={readOf(menu)} />;
}
