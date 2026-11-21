import { getOrderDetail, getOrderFloor } from "@db/orders";
import { isUuid } from "@domain/activity";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { baseWording, translator } from "../../../wording";
import { ordersAccess } from "../../orders-access";
import { readOf } from "../../reads";
import { TillScreen } from "../../screens";

export async function generateMetadata(): Promise<Metadata> {
  // Page titles stay in the app's own words.
  const t = translator(baseWording, "app.orders.till");
  return { title: t("metaTitle") };
}

// "לקופה" for an order (waiter mode P5), open or closed today: by item and by
// round, with no total. Where an order's rounds, "נסגרו היום" and a closed
// takeaway lead. Someone who only prepares goes to preparing (default 6).
export default async function OrderTillPage({
  params,
}: PageProps<"/orders/till/[order]">) {
  const [access, { order: orderId }] = await Promise.all([
    ordersAccess(),
    params,
  ]);
  if (!access) notFound();
  if (!access.reach.mode.takes) redirect("/orders/prep");
  if (!isUuid(orderId)) return <TillScreen order={null} floor={null} />;
  const floor = readOf(await getOrderFloor(access.businessId));
  // Read after the floor: at least as new as the floor's version.
  const read = await getOrderDetail(orderId.toLowerCase());
  return (
    <TillScreen
      order={read === "closed" ? null : readOf(read)}
      orderVersion={floor?.version ?? null}
      floor={floor}
    />
  );
}
