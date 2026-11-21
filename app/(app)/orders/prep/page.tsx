import { getOrderPrep } from "@db/orders";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { baseWording, translator } from "../../wording";
import { ordersAccess } from "../orders-access";
import { readOf } from "../reads";
import { PrepScreen } from "../screens";

export async function generateMetadata(): Promise<Metadata> {
  const t = translator(baseWording, "app.orders.prep");
  return { title: t("metaTitle") };
}

// Preparing on a phone (waiter mode P4): the tickets of the departments the
// person prepares for. Reading it marks what reached their departments as
// seen, so only this screen and the mode's sync read it, never Home.
export default async function PrepPage() {
  const access = await ordersAccess();
  if (!access?.reach.items.includes("prep")) notFound();
  return <PrepScreen prep={readOf(await getOrderPrep(access.businessId))} />;
}
