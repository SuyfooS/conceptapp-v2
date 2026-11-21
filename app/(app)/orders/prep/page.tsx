import { getOrderPrep } from "@db/orders";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { baseWording, translator } from "../../wording";
import { ordersAccess } from "../orders-access";
import { readOf } from "../reads";
import { PrepScreen } from "../screens";
import {
  lockOrderDeviceAction,
  restartOrderStationAction,
  stopOrderStationAction,
} from "../stations/actions";
import { orderStationsOffer } from "../stations/stations";

export async function generateMetadata(): Promise<Metadata> {
  const t = translator(baseWording, "app.orders.prep");
  return { title: t("metaTitle") };
}

// Preparing on a phone (waiter mode P4): the tickets of the departments the
// person prepares for. Reading it marks what reached their departments as
// seen, so only this screen and the mode's sync read it, never Home. For
// whoever runs orders, a view as one too, the kitchen's and the till's
// screens follow (P8a): locking this device as one, and those running.
export default async function PrepPage() {
  const access = await ordersAccess();
  if (!access?.reach.items.includes("prep")) notFound();
  const [prep, stations] = await Promise.all([
    getOrderPrep(access.businessId),
    orderStationsOffer(access),
  ]);
  return (
    <PrepScreen
      prep={readOf(prep)}
      stations={
        stations
          ? {
              data: stations,
              actions: {
                lock: lockOrderDeviceAction,
                stop: stopOrderStationAction,
                restart: restartOrderStationAction,
                clearsDevice: true,
              },
            }
          : null
      }
    />
  );
}
