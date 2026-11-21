"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState, useSyncExternalStore } from "react";
import { keepLostNotice } from "./orders/lost-notice";
import { usePlaceWords } from "./orders/orders-parts";
import { appOrdersPaths, draftPath } from "./orders/orders-paths";
import { EMPTY_OWNER, ordersOutbox } from "./orders/outbox";
import { outboxHeld } from "./orders/outbox-banner";
import { OutboxBannerView } from "./orders/outbox-notice";

/**
 * Waiter mode's outbox in the app's frame (P7), for someone who takes
 * orders here: it starts as the app opens, on whichever screen, so a round
 * that waited when the app was killed goes as soon as it opens again. Its
 * news comes here while the mode isn't on screen: never a toast (another
 * screen's "ביטול" may be on one), but a banner above the screen while an
 * order of theirs here hasn't gone, with "פתיחה", and each round that lands
 * meanwhile said to screen readers (a polite region, not a "status" one: the
 * screens' own toasts are those). Rounds taken off the phone keep their
 * notice for where the page lands; another person's cookie draws the frame
 * again. Under /orders the mode's own screens say it all. The region comes
 * first and the banner last: what follows the banner is the lost notice,
 * mounted after this, or the screen's `main`, which drops its glow under
 * a card right above it.
 */
export function OrdersOutbox({
  userId,
  business,
  viewing,
}: {
  userId: string;
  business: string;
  viewing: boolean;
}) {
  const t = useTranslations("app.orders.toast");
  const { placeTitle } = usePlaceWords();
  const router = useRouter();
  const pathname = usePathname();
  const outbox = ordersOutbox();
  const [said, setSaid] = useState({ text: "", stamp: 0 });

  useEffect(() => {
    outbox.start({ user: userId, business, viewing });
  }, [outbox, userId, business, viewing]);

  useEffect(
    () =>
      outbox.listen((event) => {
        if (event.kind === "lost") {
          keepLostNotice(event.rows, event.why, placeTitle);
          router.refresh();
        } else if (event.kind === "person") {
          router.refresh();
        } else if (event.kind === "sent") {
          const text = t("sent", { place: placeTitle(event.where) });
          setSaid((was) => ({ text, stamp: was.stamp + 1 }));
        }
      }),
    [outbox, placeTitle, router, t],
  );

  const held = useSyncExternalStore(
    outbox.subscribe,
    () => outbox.snapshot(userId, business),
    () => EMPTY_OWNER,
  );

  // What hasn't gone here: rounds waiting or asking, and refusals no screen
  // showed yet, oldest first.
  const unsent = outboxHeld(held);
  const count = unsent.waiting + unsent.asking + unsent.refused;
  const inMode = pathname === "/orders" || pathname.startsWith("/orders/");
  const places = [...new Set(unsent.wheres.map((where) => placeTitle(where)))];
  const [only] = unsent.drafts;

  return (
    <>
      <p aria-live="polite" className="sr-only">
        {said.text ? <span key={said.stamp}>{said.text}</span> : null}
      </p>
      {count > 0 && !inMode && !viewing ? (
        <OutboxBannerView
          places={places}
          waiting={unsent.waiting}
          asking={unsent.asking}
          refused={unsent.refused}
          href={
            unsent.drafts.length === 1 && only
              ? draftPath(only)
              : appOrdersPaths.floor
          }
        />
      ) : null}
    </>
  );
}
