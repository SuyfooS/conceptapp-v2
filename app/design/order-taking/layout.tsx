import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { OrderDemo } from "./demo-store";
import { RestaurantWords } from "./restaurant-words";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("design.orderTaking");
  return {
    title: t("metaTitle"),
    robots: { index: false, follow: false },
  };
}

// Waiter mode with mock data (S0, issue #191): its screens clickable on a
// phone, with one store in memory above them all (OrderDemo), so what is
// sent reaches the prep screens and comes back ready. It reads `?state=`
// from the address, which is known only when the page is asked for, so it
// waits inside Suspense, as the other demos' states do. The real menu screens
// it draws (P2) read the restaurant template's words.
export default function OrderTakingDemoLayout({
  children,
}: LayoutProps<"/design/order-taking">) {
  return (
    <Suspense>
      <OrderDemo>
        <RestaurantWords>{children}</RestaurantWords>
      </OrderDemo>
    </Suspense>
  );
}
