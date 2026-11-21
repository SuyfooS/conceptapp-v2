"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState, useSyncExternalStore } from "react";
import { usePlaceWords } from "./orders/orders-parts";
import { appOrdersPaths, draftPath } from "./orders/orders-paths";
import { EMPTY_OWNER, ordersOutbox } from "./orders/outbox";
import { keepLostNotice, OutboxBannerView } from "./orders/outbox-notice";

/**
 * Waiter mode's outbox in the app's frame (P7), for someone who takes
 * orders here: it starts as the app opens, on whichever screen, so a round
 * that waited when the app was killed goes as soon as it opens again. Its
 * news comes here while the mode isn't on screen: never a toast (another
 * screen's "ביטול" may be on one), but a banner above the screen while an
 * order of theirs here hasn't gone, with "פתיחה", and each round that lands
 * meanwhile said to screen readers. Rounds taken off the phone keep their
 * notice for where the page lands; another person's cookie draws the frame
 * again. Under /orders the mode's own screens say it all.
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
  const rounds = Object.values(held.store.pending).filter(
    (round) =>
      held.asking.has(round.body.key) ||
      (held.kept.has(round.body.key) &&
        (!held.online || held.retrying.has(round.body.key))),
  );
  const refused = Object.entries(held.refusals).filter(
    ([, refusal]) => !refusal.seen,
  );
  const count = rounds.length + refused.length;
  const inMode = pathname === "/orders" || pathname.startsWith("/orders/");
  const drafts = new Set([
    ...rounds.map((round) => round.draft),
    ...refused.map(([draft]) => draft),
  ]);
  const places = [
    ...new Set([
      ...rounds.map((round) =>
        placeTitle(round.where ?? { placeName: null, takeaway: null }),
      ),
      ...refused.flatMap(([, refusal]) =>
        refusal.where ? [placeTitle(refusal.where)] : [],
      ),
    ]),
  ];
  const [only] = drafts;

  return (
    <>
      <p role="status" className="sr-only">
        {said.text ? <span key={said.stamp}>{said.text}</span> : null}
      </p>
      {count > 0 && !inMode && !viewing ? (
        <OutboxBannerView
          count={count}
          places={places}
          why={
            rounds.some((round) => held.asking.has(round.body.key))
              ? "asks"
              : rounds.length === 0
                ? "refused"
                : "waits"
          }
          href={
            drafts.size === 1 && only ? draftPath(only) : appOrdersPaths.floor
          }
        />
      ) : null}
    </>
  );
}
