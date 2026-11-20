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

// A place's order (waiter mode P4): the picker, the draft and what was sent.
// A place removed since, with no open order, isn't one any more.
export default async function OrderPlacePage({
  params,
}: PageProps<"/orders/place/[place]">) {
  const [access, { place: placeId }] = await Promise.all([
    ordersAccess(),
    params,
  ]);
  if (!access) notFound();
  if (!access.reach.mode.takes) redirect("/orders/prep");
  if (!isUuid(placeId)) return <NoPlaceScreen />;
  const id = placeId.toLowerCase();
  const [floorRead, menuRead, favourites] = await Promise.all([
    getOrderFloor(access.businessId),
    getMenu(access.businessId),
    getOrderFavourites(access.businessId),
  ]);
  const floor = readOf(floorRead);
  const menu = readOf(menuRead);
  const open = floor?.orders.find((order) => order.place === id) ?? null;
  const place =
    menu?.places.find((p) => p.id === id) ??
    (open?.place && open.placeName !== null
      ? { id: open.place, name: open.placeName }
      : null);
  if (!place) return <NoPlaceScreen />;
  // Read after the floor: at least as new as the floor's version.
  const detail = open ? readOf(await getOrderDetail(open.id)) : null;
  return (
    <OrderScreen
      place={place}
      takeaway={null}
      order={detail}
      orderVersion={floor?.version ?? null}
      menu={menu}
      favourites={favouriteItems(favourites)}
      floor={floor}
    />
  );
}
