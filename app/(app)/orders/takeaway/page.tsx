import { getMenu } from "@db/order-taking";
import { getOrderFavourites, getOrderFloor } from "@db/orders";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { baseWording, translator } from "../../wording";
import { ordersAccess } from "../orders-access";
import { favouriteItems, readOf } from "../reads";
import { OrderScreen } from "../screens";

export async function generateMetadata(): Promise<Metadata> {
  const t = translator(baseWording, "app.orders.order");
  return { title: t("metaTitle") };
}

// A new order with no place (waiter mode P4): its number comes with its
// first send, which then opens its own page.
export default async function NewTakeawayPage() {
  const access = await ordersAccess();
  if (!access) notFound();
  if (!access.reach.mode.takes) redirect("/orders/prep");
  const [floor, menu, favourites] = await Promise.all([
    getOrderFloor(access.businessId),
    getMenu(access.businessId),
    getOrderFavourites(access.businessId),
  ]);
  return (
    <OrderScreen
      place={null}
      takeaway={null}
      order={null}
      menu={readOf(menu)}
      favourites={favouriteItems(favourites)}
      floor={readOf(floor)}
    />
  );
}
