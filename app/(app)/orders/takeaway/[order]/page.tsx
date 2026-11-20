import { getMenu } from "@db/order-taking";
import { getOrderDetail, getOrderFavourites, getOrderFloor } from "@db/orders";
import { isUuid } from "@domain/activity";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { baseWording, translator } from "../../../wording";
import { NoPlaceScreen } from "../../no-place";
import { ordersAccess } from "../../orders-access";
import { favouriteItems, readOf } from "../../reads";
import { OrderScreen } from "../../screens";

export async function generateMetadata(): Promise<Metadata> {
  const t = translator(baseWording, "app.orders.order");
  return { title: t("metaTitle") };
}

// An order by its id (waiter mode P4): a takeaway's own page, and where
// "ההזמנות שלי" and the ready toast lead, which name an order and not its
// place: one at a place goes on to the place's page.
export default async function OrderPage({
  params,
}: PageProps<"/orders/takeaway/[order]">) {
  const [access, { order: orderId }] = await Promise.all([
    ordersAccess(),
    params,
  ]);
  if (!access) notFound();
  if (!access.reach.mode.takes) redirect("/orders/prep");
  if (!isUuid(orderId)) return <NoPlaceScreen />;
  const id = orderId.toLowerCase();
  const read = await getOrderDetail(id);
  if (read === "closed") return <NoPlaceScreen />;
  const detail = readOf(read);
  if (detail?.place) redirect(`/orders/place/${detail.place.id}`);
  if (detail && detail.status !== "open") return <NoPlaceScreen />;
  const [floor, menu, favourites] = await Promise.all([
    getOrderFloor(access.businessId),
    getMenu(access.businessId),
    getOrderFavourites(access.businessId),
  ]);
  return (
    <OrderScreen
      place={null}
      takeaway={id}
      order={detail}
      menu={readOf(menu)}
      favourites={favouriteItems(favourites)}
      floor={readOf(floor)}
    />
  );
}
